// Estado em localStorage. Schema versionado, com migracao e backup em arquivo.

import { currentMonthKey, periodKey, monthKeyOf } from './model.js';

const STORAGE_KEY = 'gastos.state';
const SCHEMA_VERSION = 1;

let state = null;
const listeners = new Set();

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    config: { startMonth: currentMonthKey() },
    income: { default: { p15: 0, p30: 0 }, overrides: {} },
    expenses: [],
    seq: 0,
  };
}

function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const next = {
    version: SCHEMA_VERSION,
    config: { startMonth: raw.config?.startMonth || base.config.startMonth },
    income: {
      default: {
        p15: Number(raw.income?.default?.p15) || 0,
        p30: Number(raw.income?.default?.p30) || 0,
      },
      overrides: {},
    },
    expenses: [],
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

// ---------- backup

export function exportJson() {
  return JSON.stringify(state, null, 2);
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
