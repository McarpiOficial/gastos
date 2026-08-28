// Nucleo do app: matematica de meses, expansao de parcelas e saldos.
// Parcelas NAO sao armazenadas - sao derivadas de um unico registro por compra.

import { splitInstallments } from './money.js';

export const PERIODS = [15, 30];
export const periodKey = (p) => (p === 15 ? 'p15' : 'p30');
// So o rotulo mudou de dia 15/30 para dia 5/20 — o numero do periodo em si
// continua 15/30 por baixo, porque e ele que rege toda a matematica de mes
// (chave de armazenamento p15/p30, "dia 30" caindo no ultimo dia de fevereiro
// etc). Trocar aqui e so trocar o texto mostrado.
const PERIOD_LABELS = { 15: 'Dia 5', 30: 'Dia 20' };
export const periodLabel = (p) => PERIOD_LABELS[p] || `Dia ${p}`;

const MESES = ['janeiro','fevereiro','marco','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'];
const MESES_LABEL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_CURTO = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

export const MONTH_NAMES = MESES;

// ---------- meses como string "YYYY-MM", sem Date, para nao pegar bug de fuso

export function monthKeyOf(isoDate) {
  return String(isoDate).slice(0, 7);
}

export function currentMonthKey(today = new Date()) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

export function todayIso(today = new Date()) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const month = total % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function monthDiff(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty * 12 + tm) - (fy * 12 + fm);
}

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MESES_LABEL[m - 1]} ${y}`;
}

export function monthShort(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MESES_CURTO[m - 1]}/${String(y).slice(2)}`;
}

export function lastDayOfMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Data efetiva do periodo. "Dia 30" em fevereiro cai no ultimo dia do mes.
export function periodDate(monthKey, period) {
  const day = Math.min(period, lastDayOfMonth(monthKey));
  return `${monthKey}-${String(day).padStart(2, '0')}`;
}

export function formatIsoDate(iso, { short = false } = {}) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

// ---------- parcelas

// Uma entrada por parcela da compra.
export function installmentsOf(expense) {
  const n = Math.max(1, Math.trunc(expense.installments) || 1);
  const values = splitInstallments(expense.totalCents, n);
  return values.map((cents, i) => ({
    expenseId: expense.id,
    description: expense.description,
    date: expense.date,
    origin: expense.month,
    month: addMonths(expense.month, i),
    period: expense.period,
    index: i + 1,
    of: n,
    cents,
    isFirst: i === 0,
    isLast: i + 1 === n,
    isParceled: n > 1,
    // Vermelho apenas quando e a ultima de uma compra realmente parcelada.
    isFinalWarning: n > 1 && i + 1 === n,
  }));
}

// Parcela unica que cai num mes/bolso, ou null.
export function installmentAt(expense, monthKey, period) {
  if (expense.period !== period) return null;
  const offset = monthDiff(expense.month, monthKey);
  const n = Math.max(1, Math.trunc(expense.installments) || 1);
  if (offset < 0 || offset >= n) return null;
  return installmentsOf(expense)[offset];
}

// Todas as parcelas que caem num mes/bolso, ordenadas por data.
export function entriesFor(state, monthKey, period) {
  const out = [];
  for (const expense of state.expenses) {
    const entry = installmentAt(expense, monthKey, period);
    if (entry) out.push(entry);
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.expenseId < b.expenseId ? -1 : 1));
  return out;
}

export function sumCents(entries) {
  return entries.reduce((acc, e) => acc + e.cents, 0);
}

// ---------- valores a receber e saldos

// A replicacao para os meses futuros acontece aqui e somente aqui:
// nao existindo override para o mes, vale o valor padrao.
export function incomeFor(state, monthKey, period) {
  const key = periodKey(period);
  const override = state.income.overrides?.[monthKey];
  if (override && Number.isFinite(override[key])) return override[key];
  return state.income.default[key] || 0;
}

export function hasIncomeOverride(state, monthKey, period) {
  const override = state.income.overrides?.[monthKey];
  return !!(override && Number.isFinite(override[periodKey(period)]));
}

export function periodSummary(state, monthKey, period) {
  const entries = entriesFor(state, monthKey, period);
  const income = incomeFor(state, monthKey, period);
  const spent = sumCents(entries);
  return {
    period,
    entries,
    income,
    spent,
    balance: income - spent,
    overridden: hasIncomeOverride(state, monthKey, period),
  };
}

export function monthSummary(state, monthKey) {
  const periods = PERIODS.map((p) => periodSummary(state, monthKey, p));
  const balance = periods.reduce((a, p) => a + p.balance, 0);
  const applied = appliedInMonth(state, monthKey);
  const deduct = !!state.config?.deductApplications;
  return {
    monthKey,
    label: monthLabel(monthKey),
    periods,
    income: periods.reduce((a, p) => a + p.income, 0),
    spent: periods.reduce((a, p) => a + p.spent, 0),
    // O saldo dos bolsos nunca e afetado pelas aplicacoes; quem opta por
    // descontar ve o desconto so no saldo do mes, que e onde ele cabe.
    balance: deduct ? balance - applied : balance,
    balanceBeforeApplications: balance,
    applied,
    appliedAccumulated: appliedUpTo(state, monthKey),
    deductApplications: deduct,
  };
}

// ---------- valor aplicado (poupanca e afins), apartado dos gastos

export function applicationsIn(state, monthKey) {
  return (state.applications || [])
    .filter((a) => a.month === monthKey)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}

export function appliedInMonth(state, monthKey) {
  return applicationsIn(state, monthKey).reduce((acc, a) => acc + a.cents, 0);
}

// Total guardado desde o inicio ate o mes exibido - o numero que interessa
// para quem esta acompanhando a poupanca crescer.
export function appliedUpTo(state, monthKey) {
  return (state.applications || [])
    .filter((a) => a.month <= monthKey)
    .reduce((acc, a) => acc + a.cents, 0);
}

// ---------- limpeza de meses passados

export function lastInstallmentMonth(expense) {
  const n = Math.max(1, Math.trunc(expense.installments) || 1);
  return addMonths(expense.month, n - 1);
}

// Mes de corte: em agosto, guardando 4 meses, corta em abril (inclusive),
// deixando maio, junho, julho e agosto.
export function purgeCutoff(keepMonths, referenceMonth = currentMonthKey()) {
  return addMonths(referenceMonth, -Math.max(1, Math.trunc(keepMonths) || 1));
}

// O que a limpeza faria, sem executar nada. Uma compra antiga com parcela
// ainda em aberto precisa ficar, senao o mes atual perderia o debito.
export function purgePlan(state, cutoffMonth) {
  const remove = [];
  const keepRunning = [];
  for (const expense of state.expenses) {
    if (expense.month > cutoffMonth) continue;
    if (lastInstallmentMonth(expense) > cutoffMonth) keepRunning.push(expense);
    else remove.push(expense);
  }
  const applications = (state.applications || []).filter((a) => a.month <= cutoffMonth);
  const overrides = Object.keys(state.income.overrides || {}).filter((m) => m <= cutoffMonth);
  return {
    cutoffMonth,
    cutoffLabel: monthLabel(cutoffMonth),
    expenses: remove,
    keepRunning,
    applications,
    overrides,
    nothingToDo: !remove.length && !applications.length && !overrides.length,
  };
}

// Preview textual de como a compra se espalha pelos meses.
export function installmentPreview(expense) {
  return installmentsOf(expense).map((p) => ({
    label: `${monthShort(p.month)} · ${p.index}/${p.of}`,
    cents: p.cents,
    isFinalWarning: p.isFinalWarning,
  }));
}
