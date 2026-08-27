// Bootstrap, navegacao entre meses e delegacao de eventos.

import { formatCents, parseValueInput } from './money.js';
import {
  currentMonthKey, todayIso, addMonths, monthLabel, periodLabel,
  periodSummary, hasIncomeOverride, incomeFor, installmentAt,
  purgeCutoff, purgePlan,
} from './model.js';
import * as store from './store.js';
import * as ui from './ui.js';
import { parseFala, speechSupported, createRecognizer } from './voice.js';

const screen = document.getElementById('screen');
const overlay = document.getElementById('overlay');
const sheet = document.getElementById('sheet');
const monthLabelEl = document.getElementById('month-label');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnSettings = document.getElementById('btn-settings');
const toastEl = document.getElementById('toast');
const fileInput = document.getElementById('file-input');

let state = store.load();
let currentMonth = currentMonthKey();
let recognizer = null;
// Contexto da folha aberta: qual bolso e, na edicao, qual compra.
let sheetContext = null;

// ---------- render

function render() {
  monthLabelEl.textContent = monthLabel(currentMonth);
  btnPrev.disabled = currentMonth <= state.config.startMonth;
  screen.innerHTML = ui.renderMonth(state, currentMonth);
}

function goToMonth(monthKey) {
  if (monthKey < state.config.startMonth) return;
  currentMonth = monthKey;
  render();
}

function toast(message, { action = null, duration = 2600 } = {}) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.style.cursor = action ? 'pointer' : '';
  toast.action = action;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastEl.hidden = true; toast.action = null; }, duration);
}

toastEl.addEventListener('click', () => {
  if (!toast.action) return;
  const run = toast.action;
  toast.action = null;
  toastEl.hidden = true;
  run();
});

// ---------- folha modal

function openSheet(html, context = null) {
  sheetContext = context;
  sheet.innerHTML = html;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  const focusable = sheet.querySelector('input:not([type=hidden]), textarea, button');
  if (focusable && focusable.tagName !== 'BUTTON') focusable.focus({ preventScroll: true });
}

function closeSheet() {
  if (recognizer) { recognizer.abort(); recognizer = null; }
  overlay.hidden = true;
  sheet.innerHTML = '';
  sheetContext = null;
  document.body.style.overflow = '';
}

overlay.addEventListener('click', (event) => {
  if (event.target === overlay) closeSheet();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !overlay.hidden) closeSheet();
});

// ---------- data sugerida
// A data sugere hoje quando o mes na tela e o mes corrente; nos outros meses,
// sugerir "hoje" seria uma data fora do mes que se esta olhando.
function suggestedDate() {
  return currentMonth === currentMonthKey() ? todayIso() : `${currentMonth}-01`;
}

// ---------- folha de gasto

function openExpenseSheet({ period, voice = false, expense = null }) {
  const speech = voice && speechSupported();
  const values = expense
    ? {
      date: expense.date,
      description: expense.description,
      valueText: formatCents(expense.totalCents),
      installments: expense.installments,
    }
    : { date: suggestedDate(), description: '', valueText: '', installments: 1 };

  openSheet(
    ui.renderExpenseSheet({
      mode: expense ? 'edit' : 'create',
      monthKey: expense ? expense.month : currentMonth,
      period,
      values,
      voice,
      speech,
    }),
    { kind: 'expense', period, expenseId: expense?.id || null, month: expense ? expense.month : currentMonth },
  );

  updatePreview();
  if (speech) startListening();
}

function formValues() {
  return {
    date: document.getElementById('f-date').value,
    description: document.getElementById('f-desc').value.trim(),
    totalCents: parseValueInput(document.getElementById('f-value').value),
    installments: Number(document.getElementById('f-parcels').value) || 0,
  };
}

function updatePreview() {
  const box = document.getElementById('f-preview');
  if (!box || !sheetContext) return;
  const v = formValues();
  box.innerHTML = ui.renderPreview({
    totalCents: v.totalCents,
    installments: v.installments,
    month: sheetContext.month,
  });
}

function showFormError(message) {
  const el = document.getElementById('f-error');
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

function saveExpense() {
  const v = formValues();
  if (!v.date) return showFormError('Informe a data.');
  if (!v.description) return showFormError('Informe a descrição do gasto.');
  if (v.totalCents == null || v.totalCents <= 0) return showFormError('Informe um valor maior que zero.');
  if (!(v.installments >= 1 && v.installments <= 60)) return showFormError('As parcelas devem ficar entre 1 e 60.');
  showFormError('');

  if (sheetContext.expenseId) {
    store.updateExpense(sheetContext.expenseId, v);
    toast('Compra atualizada');
  } else {
    // O bolso vem do agrupamento clicado, nao da data digitada.
    store.addExpense({ ...v, month: sheetContext.month, period: sheetContext.period });
    toast('Gasto lançado');
  }
  closeSheet();
  render();
  return undefined;
}

// ---------- voz

function setVoiceStatus(text, { error = false } = {}) {
  const panel = document.getElementById('voice-panel');
  const status = document.getElementById('voice-status');
  if (status) status.textContent = text;
  if (panel) panel.classList.toggle('is-error', error);
  const pulse = panel?.querySelector('.pulse');
  if (pulse && error) pulse.classList.remove('pulse');
}

function applyParsed(text) {
  const parsed = parseFala(text, suggestedDate());
  if (parsed.description) document.getElementById('f-desc').value = parsed.description;
  if (parsed.dateFromSpeech) document.getElementById('f-date').value = parsed.date;
  if (parsed.totalCents != null && parsed.totalCents > 0) {
    document.getElementById('f-value').value = formatCents(parsed.totalCents);
  }
  document.getElementById('f-parcels').value = String(parsed.installments);
  updatePreview();

  const missing = [];
  if (!parsed.description) missing.push('descrição');
  if (!parsed.totalCents) missing.push('valor');
  setVoiceStatus(missing.length
    ? `Não entendi a ${missing.join(' e a ')}. Complete abaixo.`
    : 'Campos preenchidos — confira e salve.');
}

function startListening() {
  recognizer = createRecognizer({
    onInterim(text) {
      const el = document.getElementById('voice-transcript');
      if (el) el.textContent = text;
    },
    onFinal(text) {
      const el = document.getElementById('voice-transcript');
      if (el) el.textContent = text;
      applyParsed(text);
    },
    onError(code) {
      const messages = {
        'not-allowed': 'Sem permissão para o microfone. Libere nas configurações do navegador.',
        'service-not-allowed': 'O navegador bloqueou o microfone. É necessário acesso por HTTPS.',
        'no-speech': 'Não ouvi nada. Toque em Falar novamente ou digite abaixo.',
        network: 'O reconhecimento de fala precisa de internet.',
      };
      setVoiceStatus(messages[code] || `Falha no reconhecimento (${code}). Digite abaixo.`, { error: true });
    },
    onEnd() {
      const pulse = document.querySelector('#voice-panel .pulse');
      if (pulse) pulse.classList.remove('pulse');
    },
  });
  recognizer?.start();
}

// ---------- folha de aplicacao (poupanca e afins)
// Fica apartada dos gastos por design: nunca soma no gasto de nenhum bolso.

function openApplicationSheet({ application = null } = {}) {
  const values = application
    ? {
      date: application.date,
      description: application.description,
      valueText: formatCents(application.cents),
    }
    : { date: suggestedDate(), description: '', valueText: '' };

  openSheet(
    ui.renderApplicationSheet({
      mode: application ? 'edit' : 'create',
      monthKey: application ? application.month : currentMonth,
      values,
    }),
    { kind: 'application', applicationId: application?.id || null, month: application ? application.month : currentMonth },
  );
}

function applicationFormValues() {
  return {
    date: document.getElementById('a-date').value,
    description: document.getElementById('a-desc').value.trim(),
    cents: parseValueInput(document.getElementById('a-value').value),
  };
}

function showApplicationError(message) {
  const el = document.getElementById('a-error');
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

function saveApplication() {
  const v = applicationFormValues();
  if (!v.date) return showApplicationError('Informe a data.');
  if (!v.description) return showApplicationError('Informe a descrição.');
  if (v.cents == null || v.cents <= 0) return showApplicationError('Informe um valor maior que zero.');
  showApplicationError('');

  if (sheetContext.applicationId) {
    store.updateApplication(sheetContext.applicationId, v);
    toast('Aplicação atualizada');
  } else {
    store.addApplication({ ...v, month: sheetContext.month });
    toast('Aplicação registrada');
  }
  closeSheet();
  render();
  return undefined;
}

// ---------- folha de valor a receber

function openIncomeSheet(period) {
  openSheet(
    ui.renderIncomeSheet({
      monthKey: currentMonth,
      period,
      income: incomeFor(state, currentMonth, period),
      overridden: hasIncomeOverride(state, currentMonth, period),
    }),
    { kind: 'income', period },
  );
}

function saveIncome(scope) {
  const input = document.getElementById('income-value');
  const error = document.getElementById('income-error');
  const cents = parseValueInput(input.value);
  if (cents == null || cents < 0) {
    error.textContent = 'Informe um valor válido, por exemplo 2.600,00.';
    error.hidden = false;
    return;
  }
  store.setIncome(currentMonth, sheetContext.period, cents,
    scope === 'forward' ? store.INCOME_SCOPE.FORWARD : store.INCOME_SCOPE.MONTH);
  closeSheet();
  render();
  toast(scope === 'forward'
    ? `${periodLabel(sheetContext?.period || 15)}: replicado para os próximos meses`
    : 'Valor ajustado só neste mês');
}

// ---------- configuracoes

function openSettingsSheet() {
  openSheet(ui.renderSettingsSheet(state), { kind: 'settings' });
}

function refreshSettingsSheet() {
  if (sheetContext?.kind === 'settings') sheet.innerHTML = ui.renderSettingsSheet(state);
}

// ---------- limpeza de meses passados
// O corte usa o mes real de hoje, nao o mes que esta na tela: limpar espaco
// no aparelho nao deveria depender de qual mes o usuario esta olhando.

function openPurgePreview() {
  const monthsInput = document.getElementById('cfg-keep-months');
  const keepMonths = Math.max(1, Math.min(36, Math.trunc(Number(monthsInput?.value)) || state.config.keepMonths));
  store.setConfig({ keepMonths });
  const cutoff = purgeCutoff(keepMonths, currentMonthKey());
  const plan = purgePlan(state, cutoff);
  openSheet(ui.renderPurgePreviewSheet(plan), { kind: 'purge-preview' });
}

function confirmPurge(cutoffMonth) {
  const removed = store.purgeBefore(cutoffMonth);
  if (currentMonth < state.config.startMonth) currentMonth = state.config.startMonth;
  closeSheet();
  render();
  const total = removed.expenses + removed.applications;
  toast(total ? `${total} registro${total === 1 ? '' : 's'} antigo${total === 1 ? '' : 's'} removido${total === 1 ? '' : 's'}` : 'Nada para remover');
}

// ---------- backup

function exportBackup() {
  const blob = new Blob([store.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gastos-backup-${todayIso()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  store.markBackupDone();
  refreshSettingsSheet();
  toast('Backup exportado');
}

// Sem servidor, nao existe como escrever o arquivo sozinho em segundo plano:
// o navegador so libera a gravacao em resposta a um toque do usuario. O que
// da para fazer e avisar quando o backup estiver atrasado.
function checkBackupReminder() {
  const days = state.config.backupReminderDays;
  if (days == null) return;
  const last = state.config.lastBackupAt;
  const dueSince = last
    ? Math.floor((Date.parse(`${todayIso()}T00:00:00`) - Date.parse(`${last}T00:00:00`)) / 86400000)
    : Infinity;
  if (dueSince < days) return;
  toast(
    last ? `Backup atrasado (${dueSince} dias) — toque para exportar` : 'Você ainda não fez backup — toque para exportar',
    { action: exportBackup, duration: 7000 },
  );
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    state = store.importJson(await file.text());
    currentMonth = currentMonthKey() < state.config.startMonth ? state.config.startMonth : currentMonthKey();
    closeSheet();
    render();
    toast('Backup importado');
  } catch (err) {
    console.error(err);
    toast('Arquivo inválido');
  }
});

// ---------- delegacao de eventos

screen.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const period = Number(target.dataset.period);

  switch (target.dataset.action) {
    case 'income':
      openIncomeSheet(period);
      break;
    case 'add':
      openExpenseSheet({ period });
      break;
    case 'speak':
      openExpenseSheet({ period, voice: true });
      break;
    case 'entry': {
      const expense = store.findExpense(target.dataset.id);
      if (!expense) break;
      const entry = installmentAt(expense, currentMonth, expense.period);
      if (!entry) break;
      openSheet(ui.renderEntrySheet({ entry, expense }), { kind: 'entry' });
      break;
    }
    case 'apply':
      openApplicationSheet({});
      break;
    case 'application': {
      const application = store.findApplication(target.dataset.id);
      if (application) openSheet(ui.renderApplicationEntrySheet(application), { kind: 'application-entry' });
      break;
    }
    default:
      break;
  }
});

sheet.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  switch (target.dataset.action) {
    case 'close':
      closeSheet();
      break;
    case 'income-save':
      saveIncome(target.dataset.scope);
      break;
    case 'expense-save':
      saveExpense();
      break;
    case 'voice-parse': {
      const text = document.getElementById('voice-text')?.value || '';
      if (text.trim()) applyParsed(text);
      break;
    }
    case 'expense-edit': {
      const expense = store.findExpense(target.dataset.id);
      if (expense) openExpenseSheet({ period: expense.period, expense });
      break;
    }
    case 'expense-delete':
      openSheet(ui.renderConfirmSheet({
        title: 'Excluir compra',
        message: 'A compra sai de todos os meses, incluindo as parcelas futuras.',
        confirmLabel: 'Excluir',
        action: 'expense-delete-confirm',
        payload: target.dataset.id,
      }));
      break;
    case 'expense-delete-confirm':
      store.removeExpense(target.dataset.payload);
      closeSheet();
      render();
      toast('Compra excluída');
      break;
    case 'go-today':
      closeSheet();
      goToMonth(currentMonthKey());
      break;
    case 'export':
      exportBackup();
      break;
    case 'import':
      fileInput.click();
      break;
    case 'reset':
      openSheet(ui.renderConfirmSheet({
        title: 'Apagar todos os dados',
        message: 'Valores a receber e todas as compras serão apagados deste aparelho. Não há como desfazer.',
        confirmLabel: 'Apagar tudo',
        action: 'reset-confirm',
      }));
      break;
    case 'reset-confirm':
      state = store.resetAll();
      currentMonth = currentMonthKey();
      closeSheet();
      render();
      toast('Dados apagados');
      break;
    case 'application-save':
      saveApplication();
      break;
    case 'application-edit': {
      const application = store.findApplication(target.dataset.id);
      if (application) openApplicationSheet({ application });
      break;
    }
    case 'application-delete':
      openSheet(ui.renderConfirmSheet({
        title: 'Excluir aplicação',
        message: 'O registro será removido. Não há como desfazer.',
        confirmLabel: 'Excluir',
        action: 'application-delete-confirm',
        payload: target.dataset.id,
      }));
      break;
    case 'application-delete-confirm':
      store.removeApplication(target.dataset.payload);
      closeSheet();
      render();
      toast('Aplicação excluída');
      break;
    case 'purge-preview':
      openPurgePreview();
      break;
    case 'purge-confirm':
      confirmPurge(target.dataset.payload);
      break;
    default:
      break;
  }
});

sheet.addEventListener('input', (event) => {
  if (['f-value', 'f-parcels'].includes(event.target.id)) updatePreview();
  if (event.target.id === 'f-error') return;
  showFormError('');
  if (event.target.id === 'a-error') return;
  showApplicationError('');
});

// Reformata o valor ao sair do campo: "1500" vira "1.500,00".
sheet.addEventListener('focusout', (event) => {
  if (event.target.id === 'a-value') {
    const cents = parseValueInput(event.target.value);
    if (cents != null && cents > 0) event.target.value = formatCents(cents);
    return;
  }
  if (!['f-value', 'income-value'].includes(event.target.id)) return;
  const cents = parseValueInput(event.target.value);
  if (cents != null && cents > 0) event.target.value = formatCents(cents);
});

// Configuracoes: cada controle persiste sozinho, sem botao "salvar" a parte.
sheet.addEventListener('change', (event) => {
  const { id } = event.target;
  if (id === 'cfg-deduct') {
    store.setConfig({ deductApplications: event.target.checked });
    render();
  } else if (id === 'cfg-keep-months') {
    const v = Math.max(1, Math.min(36, Math.trunc(Number(event.target.value)) || 1));
    event.target.value = String(v);
    store.setConfig({ keepMonths: v });
  } else if (id === 'cfg-backup-on') {
    const field = document.getElementById('cfg-backup-days-field');
    if (event.target.checked) {
      field.hidden = false;
      const days = Math.max(1, Math.trunc(Number(document.getElementById('cfg-backup-days')?.value)) || 10);
      store.setConfig({ backupReminderDays: days });
    } else {
      field.hidden = true;
      store.setConfig({ backupReminderDays: null });
    }
  } else if (id === 'cfg-backup-days') {
    const v = Math.max(1, Math.min(90, Math.trunc(Number(event.target.value)) || 10));
    event.target.value = String(v);
    store.setConfig({ backupReminderDays: v });
  }
});

btnPrev.addEventListener('click', () => goToMonth(addMonths(currentMonth, -1)));
btnNext.addEventListener('click', () => goToMonth(addMonths(currentMonth, 1)));
btnSettings.addEventListener('click', openSettingsSheet);

store.subscribe((next) => { state = next; });

// ---------- primeiro uso e service worker

render();

if (!state.expenses.length && !state.income.default.p15 && !state.income.default.p30) {
  toast('Comece informando quanto recebe no dia 15 e no dia 30');
} else {
  checkBackupReminder();
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW:', err));
  });
}

// Exposto para a suite de testes em tests.html.
window.__gastos = { periodSummary, parseFala, state: () => state };
