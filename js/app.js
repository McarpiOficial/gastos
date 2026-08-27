// Bootstrap, navegacao entre meses e delegacao de eventos.

import { formatCents, parseValueInput } from './money.js';
import {
  currentMonthKey, todayIso, addMonths, monthLabel, periodLabel,
  periodSummary, hasIncomeOverride, incomeFor, installmentAt,
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
const btnMenu = document.getElementById('btn-menu');
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

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

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
  closeSheet();
  toast('Backup exportado');
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
    default:
      break;
  }
});

sheet.addEventListener('input', (event) => {
  if (['f-value', 'f-parcels'].includes(event.target.id)) updatePreview();
  if (event.target.id === 'f-error') return;
  showFormError('');
});

// Reformata o valor ao sair do campo: "1500" vira "1.500,00".
sheet.addEventListener('focusout', (event) => {
  if (!['f-value', 'income-value'].includes(event.target.id)) return;
  const cents = parseValueInput(event.target.value);
  if (cents != null && cents > 0) event.target.value = formatCents(cents);
});

btnPrev.addEventListener('click', () => goToMonth(addMonths(currentMonth, -1)));
btnNext.addEventListener('click', () => goToMonth(addMonths(currentMonth, 1)));
btnMenu.addEventListener('click', () => openSheet(ui.renderMenuSheet(state), { kind: 'menu' }));

store.subscribe((next) => { state = next; });

// ---------- primeiro uso e service worker

render();

if (!state.expenses.length && !state.income.default.p15 && !state.income.default.p30) {
  toast('Comece informando quanto recebe no dia 15 e no dia 30');
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW:', err));
  });
}

// Exposto para a suite de testes em tests.html.
window.__gastos = { periodSummary, parseFala, state: () => state };
