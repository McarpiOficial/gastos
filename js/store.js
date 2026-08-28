// Estado em localStorage. Schema versionado, com migracao e backup em arquivo.

import { currentMonthKey, monthKeyOf, todayIso } from './model.js';

const STORAGE_KEY = 'gastos.state';
const SCHEMA_VERSION = 4;

// null = lembrete de backup desligado. Numero = a cada quantos dias avisar.
const DEFAULT_BACKUP_REMINDER_DAYS = 10;
const DEFAULT_KEEP_MONTHS = 4;
const DEFAULT_SHEETS_AUTO_DAYS = 5;

let state = null;
const listeners = new Set();

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    config: {
      startMonth: currentMonthKey(),
      keepMonths: DEFAULT_KEEP_MONTHS,
      backupReminderDays: DEFAULT_BACKUP_REMINDER_DAYS,
      lastBackupAt: null,
      lastPurgeAt: null,
      sheetsUrl: null,
      sheetsAutoDays: null,
      lastSheetsSyncAt: null,
      lastSheetsSyncStatus: null,
      lastSheetsSyncError: null,
    },
    expenses: [],
    seq: 0,
  };
}

function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const next = {
    version: SCHEMA_VERSION,
    config: {
      startMonth: raw.config?.startMonth || base.config.startMonth,
      keepMonths: Math.max(1, Math.trunc(Number(raw.config?.keepMonths)) || DEFAULT_KEEP_MONTHS),
      backupReminderDays: raw.config?.backupReminderDays === null
        ? null
        : Math.max(1, Math.trunc(Number(raw.config?.backupReminderDays)) || DEFAULT_BACKUP_REMINDER_DAYS),
      lastBackupAt: /^\d{4}-\d{2}-\d{2}$/.test(raw.config?.lastBackupAt || '') ? raw.config.lastBackupAt : null,
      lastPurgeAt: /^\d{4}-\d{2}$/.test(raw.config?.lastPurgeAt || '') ? raw.config.lastPurgeAt : null,
      sheetsUrl: /^https:\/\/.+/.test(raw.config?.sheetsUrl || '') ? raw.config.sheetsUrl.trim() : null,
      sheetsAutoDays: raw.config?.sheetsAutoDays == null
        ? null
        : Math.max(1, Math.min(90, Math.trunc(Number(raw.config.sheetsAutoDays)) || DEFAULT_SHEETS_AUTO_DAYS)),
      lastSheetsSyncAt: /^\d{4}-\d{2}-\d{2}$/.test(raw.config?.lastSheetsSyncAt || '') ? raw.config.lastSheetsSyncAt : null,
      lastSheetsSyncStatus: ['ok', 'unconfirmed', 'error'].includes(raw.config?.lastSheetsSyncStatus)
        ? raw.config.lastSheetsSyncStatus
        : null,
      lastSheetsSyncError: raw.config?.lastSheetsSyncError
        ? String(raw.config.lastSheetsSyncError).slice(0, 200)
        : null,
    },
    expenses: [],
    seq: Number(raw.seq) || 0,
  };
  for (const e of Array.isArray(raw.expenses) ? raw.expenses : []) {
    if (!e || !e.description || !e.date) continue;
    const period = Number(e.period) === 15 ? 15 : 30;
    next.expenses.push({
      id: String(e.id || `e_${++next.seq}`),
      description: String(e.description),
      date: String(e.date),
      month: /^\d{4}-\d{2}$/.test(e.month || '') ? e.month : monthKeyOf(e.date),
      period,
      totalCents: Math.trunc(Number(e.totalCents) || 0),
      installments: Math.min(60, Math.max(1, Math.trunc(Number(e.installments) || 1))),
    });
  }
  const maxSeq = next.expenses.reduce((acc, e) => {
    const m = /^e_(\d+)$/.exec(e.id);
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, next.seq);
  next.seq = maxSeq;
  return next;
}

export function load() {
  let raw = null;
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) raw = JSON.parse(text);
  } catch (err) {
    console.warn('Estado ilegivel, comecando do zero.', err);
  }
  state = raw ? migrate(raw) : defaultState();
  return state;
}

export function getState() {
  if (!state) load();
  return state;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Nao foi possivel salvar.', err);
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- gastos

export function addExpense({ description, date, month, period, totalCents, installments }) {
  const expense = {
    id: `e_${++state.seq}`,
    description: String(description).trim(),
    date,
    month: month || monthKeyOf(date),
    period: Number(period) === 15 ? 15 : 30,
    totalCents: Math.trunc(totalCents),
    installments: Math.min(60, Math.max(1, Math.trunc(installments) || 1)),
  };
  state.expenses.push(expense);
  persist();
  return expense;
}

export function updateExpense(id, patch) {
  const expense = state.expenses.find((e) => e.id === id);
  if (!expense) return null;
  if (patch.description != null) expense.description = String(patch.description).trim();
  if (patch.date != null) expense.date = patch.date;
  if (patch.month != null) expense.month = patch.month;
  if (patch.period != null) expense.period = Number(patch.period) === 15 ? 15 : 30;
  if (patch.totalCents != null) expense.totalCents = Math.trunc(patch.totalCents);
  if (patch.installments != null) {
    expense.installments = Math.min(60, Math.max(1, Math.trunc(patch.installments) || 1));
  }
  persist();
  return expense;
}

export function removeExpense(id) {
  const i = state.expenses.findIndex((e) => e.id === id);
  if (i < 0) return false;
  state.expenses.splice(i, 1);
  persist();
  return true;
}

export function findExpense(id) {
  return state.expenses.find((e) => e.id === id) || null;
}

export function setStartMonth(monthKey) {
  state.config.startMonth = monthKey;
  persist();
}

// ---------- configuracao

export function setConfig(patch) {
  Object.assign(state.config, patch);
  persist();
}

// ---------- limpeza de meses passados
// So remove o que ja fechou de vez: uma compra parcelada com parcela ainda
// em aberto no mes atual fica, senao o mes corrente perderia o debito.

export function purgeBefore(cutoffMonth) {
  const before = state.expenses.length;
  state.expenses = state.expenses.filter((e) => {
    const runsUntil = addMonthsLocal(e.month, Math.max(1, e.installments) - 1);
    return !(e.month <= cutoffMonth && runsUntil <= cutoffMonth);
  });
  if (state.config.startMonth <= cutoffMonth) {
    // A navegacao para tras nao pode ir alem do que ainda existe.
    state.config.startMonth = addMonthsLocal(cutoffMonth, 1);
  }
  state.config.lastPurgeAt = cutoffMonth;
  const removed = before - state.expenses.length;
  persist();
  return removed;
}

function addMonthsLocal(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = total % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// ---------- backup

export function exportJson() {
  return JSON.stringify(state, null, 2);
}

export function markBackupDone(dateIso = todayIso()) {
  state.config.lastBackupAt = dateIso;
  persist();
}

// status: 'ok' (confirmado), 'unconfirmed' (enviado, sem leitura da resposta
// — o Apps Script costuma bloquear o CORS da resposta mesmo tendo gravado)
// ou 'error' (o proprio script recusou os dados).
export function markSheetsSync(status, error = null) {
  state.config.lastSheetsSyncAt = todayIso();
  state.config.lastSheetsSyncStatus = status;
  state.config.lastSheetsSyncError = status === 'error' ? String(error || '').slice(0, 200) : null;
  persist();
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.expenses)) {
    throw new Error('Arquivo inválido');
  }
  state = migrate(parsed);
  persist();
  return state;
}
