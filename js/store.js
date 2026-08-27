// Estado em localStorage. Schema versionado, com migracao e backup em arquivo.

import { currentMonthKey, periodKey, monthKeyOf, todayIso } from './model.js';

const STORAGE_KEY = 'gastos.state';
const SCHEMA_VERSION = 2;

// null = lembrete de backup desligado. Numero = a cada quantos dias avisar.
const DEFAULT_BACKUP_REMINDER_DAYS = 10;
const DEFAULT_KEEP_MONTHS = 4;

let state = null;
const listeners = new Set();

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    config: {
      startMonth: currentMonthKey(),
      deductApplications: false,
      keepMonths: DEFAULT_KEEP_MONTHS,
      backupReminderDays: DEFAULT_BACKUP_REMINDER_DAYS,
      lastBackupAt: null,
      lastPurgeAt: null,
    },
    income: { default: { p15: 0, p30: 0 }, overrides: {} },
    expenses: [],
    applications: [],
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
      deductApplications: !!raw.config?.deductApplications,
      keepMonths: Math.max(1, Math.trunc(Number(raw.config?.keepMonths)) || DEFAULT_KEEP_MONTHS),
      backupReminderDays: raw.config?.backupReminderDays === null
        ? null
        : Math.max(1, Math.trunc(Number(raw.config?.backupReminderDays)) || DEFAULT_BACKUP_REMINDER_DAYS),
      lastBackupAt: /^\d{4}-\d{2}-\d{2}$/.test(raw.config?.lastBackupAt || '') ? raw.config.lastBackupAt : null,
      lastPurgeAt: /^\d{4}-\d{2}$/.test(raw.config?.lastPurgeAt || '') ? raw.config.lastPurgeAt : null,
    },
    income: {
      default: {
        p15: Number(raw.income?.default?.p15) || 0,
        p30: Number(raw.income?.default?.p30) || 0,
      },
      overrides: {},
    },
    expenses: [],
    applications: [],
    seq: Number(raw.seq) || 0,
  };
  const overrides = raw.income?.overrides || {};
  for (const [month, value] of Object.entries(overrides)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !value) continue;
    const clean = {};
    for (const k of ['p15', 'p30']) {
      if (Number.isFinite(Number(value[k]))) clean[k] = Math.trunc(Number(value[k]));
    }
    if (Object.keys(clean).length) next.income.overrides[month] = clean;
  }
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
  for (const a of Array.isArray(raw.applications) ? raw.applications : []) {
    if (!a || !a.description || !a.date || !(Number(a.cents) > 0)) continue;
    next.applications.push({
      id: String(a.id || `a_${++next.seq}`),
      description: String(a.description).trim(),
      date: String(a.date),
      month: /^\d{4}-\d{2}$/.test(a.month || '') ? a.month : monthKeyOf(a.date),
      cents: Math.trunc(Number(a.cents)),
    });
  }
  const maxSeq = [...next.expenses, ...next.applications].reduce((acc, e) => {
    const m = /^[ea]_(\d+)$/.exec(e.id);
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

// ---------- valores a receber

export const INCOME_SCOPE = { MONTH: 'month', FORWARD: 'forward' };

export function setIncome(monthKey, period, cents, scope) {
  const key = periodKey(period);
  const value = Math.max(0, Math.trunc(cents || 0));
  if (scope === INCOME_SCOPE.FORWARD) {
    state.income.default[key] = value;
    // O padrao passa a valer daqui pra frente: overrides futuros do mesmo
    // bolso deixariam o valor antigo grudado, entao saem.
    for (const month of Object.keys(state.income.overrides)) {
      if (month >= monthKey) {
        delete state.income.overrides[month][key];
        if (!Object.keys(state.income.overrides[month]).length) {
          delete state.income.overrides[month];
        }
      }
    }
  } else {
    state.income.overrides[monthKey] = state.income.overrides[monthKey] || {};
    state.income.overrides[monthKey][key] = value;
  }
  persist();
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

// ---------- valor aplicado (poupanca e afins)
// Fica num array apartado dos gastos: nunca entra na soma de nenhum bolso.

export function addApplication({ description, date, month, cents }) {
  const application = {
    id: `a_${++state.seq}`,
    description: String(description).trim(),
    date,
    month: month || monthKeyOf(date),
    cents: Math.trunc(cents),
  };
  state.applications.push(application);
  persist();
  return application;
}

export function updateApplication(id, patch) {
  const application = state.applications.find((a) => a.id === id);
  if (!application) return null;
  if (patch.description != null) application.description = String(patch.description).trim();
  if (patch.date != null) application.date = patch.date;
  if (patch.month != null) application.month = patch.month;
  if (patch.cents != null) application.cents = Math.trunc(patch.cents);
  persist();
  return application;
}

export function removeApplication(id) {
  const i = state.applications.findIndex((a) => a.id === id);
  if (i < 0) return false;
  state.applications.splice(i, 1);
  persist();
  return true;
}

export function findApplication(id) {
  return state.applications.find((a) => a.id === id) || null;
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
  const before = { expenses: state.expenses.length, applications: state.applications.length };
  state.expenses = state.expenses.filter((e) => {
    const runsUntil = addMonthsLocal(e.month, Math.max(1, e.installments) - 1);
    return !(e.month <= cutoffMonth && runsUntil <= cutoffMonth);
  });
  state.applications = state.applications.filter((a) => a.month > cutoffMonth);
  for (const month of Object.keys(state.income.overrides)) {
    if (month <= cutoffMonth) delete state.income.overrides[month];
  }
  if (state.config.startMonth <= cutoffMonth) {
    // A navegacao para tras nao pode ir alem do que ainda existe.
    state.config.startMonth = addMonthsLocal(cutoffMonth, 1);
  }
  state.config.lastPurgeAt = cutoffMonth;
  const removed = {
    expenses: before.expenses - state.expenses.length,
    applications: before.applications - state.applications.length,
  };
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

export function importJson(text) {
  const parsed = JSON.parse(text);
  const migrated = migrate(parsed);
  if (!migrated.expenses && !migrated.income) throw new Error('Arquivo invalido');
  state = migrated;
  persist();
  return state;
}

export function resetAll() {
  state = defaultState();
  persist();
  return state;
}
