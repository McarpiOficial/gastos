// Renderizacao por template string. Nenhum estado vive aqui.

import { formatCents } from './money.js';
import {
  PERIODS, periodLabel, monthSummary, monthLabel, monthShort,
  formatIsoDate, installmentPreview, todayIso, applicationsIn,
} from './model.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

// ---------- tela do mes

function renderEntry(entry, monthKey) {
  const inherited = entry.origin !== monthKey;
  const classes = ['entry'];
  if (entry.isFinalWarning) classes.push('entry--final');
  else if (inherited) classes.push('entry--inherited');

  const badge = entry.isParceled ? `${entry.index}/${entry.of}` : '';
  const meta = [];
  if (badge) meta.push(`parcela ${badge}`);
  if (entry.isFinalWarning) meta.push('última');
  else if (inherited) meta.push(`de ${monthShort(entry.origin)}`);

  return `
    <li>
      <button type="button" class="${classes.join(' ')}" data-action="entry"
              data-id="${esc(entry.expenseId)}" data-index="${entry.index}">
        <span class="entry-date">${formatIsoDate(entry.date, { short: true })}</span>
        <span class="entry-main">
          <span class="entry-desc">${esc(entry.description)}</span>
          ${meta.length ? `<span class="entry-meta">${esc(meta.join(' · '))}</span>` : ''}
        </span>
        <span class="entry-value">${formatCents(entry.cents)}</span>
      </button>
    </li>`;
}

function renderPocket(summary, monthKey) {
  const { period, entries, income, spent, balance, overridden } = summary;
  const incomeText = income > 0 ? formatCents(income) : 'informar';
  const list = entries.length
    ? `<ul class="entries">${entries.map((e) => renderEntry(e, monthKey)).join('')}</ul>`
    : '<p class="pocket-empty">Nenhum gasto neste período.</p>';

  return `
    <section class="pocket" data-period="${period}">
      <div class="pocket-head">
        <h2>${periodLabel(period)}</h2>
        <button type="button" class="income-btn${income > 0 ? '' : ' is-empty'}"
                data-action="income" data-period="${period}"
                aria-label="Valor a receber no ${periodLabel(period).toLowerCase()}">
          ${esc(incomeText)}
          ${overridden ? icon('pencil', 'icon icon--sm') : icon('repeat', 'icon icon--sm')}
        </button>
      </div>
      <div class="pocket-bar">
        <span>Gastos <b>${formatCents(spent)}</b></span>
        <span>Saldo <b class="${balance < 0 ? 'neg' : ''}">${formatCents(balance)}</b></span>
      </div>
      ${list}
      <div class="pocket-actions">
        <button type="button" class="btn" data-action="add" data-period="${period}">
          ${icon('plus')} Digitar
        </button>
        <button type="button" class="btn btn--accent" data-action="speak" data-period="${period}">
          ${icon('mic')} Falar
        </button>
      </div>
    </section>`;
}

function renderApplicationRow(app) {
  return `
    <li>
      <button type="button" class="entry" data-action="application" data-id="${esc(app.id)}">
        <span class="entry-date">${formatIsoDate(app.date, { short: true })}</span>
        <span class="entry-main">
          <span class="entry-desc">${esc(app.description)}</span>
        </span>
        <span class="entry-value">${formatCents(app.cents)}</span>
      </button>
    </li>`;
}

function renderApplicationsCard(state, monthKey, appliedAccumulated) {
  const apps = applicationsIn(state, monthKey);
  const total = apps.reduce((a, x) => a + x.cents, 0);
  const list = apps.length
    ? `<ul class="entries">${apps.map(renderApplicationRow).join('')}</ul>`
    : '<p class="pocket-empty">Nenhum valor aplicado neste mês.</p>';
  return `
    <section class="pocket pocket--apps">
      <div class="pocket-head">
        <h2>${icon('safe', 'icon icon--sm')} Aplicações</h2>
        <span class="pocket-total">acumulado ${formatCents(appliedAccumulated)}</span>
      </div>
      <div class="pocket-bar">
        <span>Aplicado no mês <b>${formatCents(total)}</b></span>
      </div>
      ${list}
      <div class="pocket-actions">
        <button type="button" class="btn" data-action="apply">
          ${icon('plus')} Registrar aplicação
        </button>
      </div>
    </section>`;
}

export function renderMonth(state, monthKey) {
  const s = monthSummary(state, monthKey);
  const balanceClass = s.balance < 0 ? 'metric metric--bad' : 'metric metric--good';
  const deductNote = s.applied > 0
    ? `<p class="hint" style="margin:-6px 0 12px">${s.deductApplications
      ? `Saldo já descontando ${formatCents(s.applied)} aplicado este mês.`
      : `Saldo não desconta os ${formatCents(s.applied)} aplicados este mês — ajuste em Configurações.`}</p>`
    : '';
  return `
    <div class="summary">
      <div class="metric">
        <span>A receber no mês</span>
        <strong>${formatCents(s.income)}</strong>
      </div>
      <div class="${balanceClass}">
        <span>Saldo do mês</span>
        <strong>${formatCents(s.balance)}</strong>
      </div>
    </div>
    ${deductNote}
    ${s.periods.map((p) => renderPocket(p, monthKey)).join('')}
    ${renderApplicationsCard(state, monthKey, s.appliedAccumulated)}`;
}

// ---------- folha: aplicacao (poupanca e afins)

export function renderApplicationSheet({ mode, monthKey, values }) {
  const v = values || {};
  const isEdit = mode === 'edit';
  return `
    <div class="sheet-head">
      <div>
        <h2 id="sheet-title">${isEdit ? 'Editar aplicação' : 'Registrar aplicação'}</h2>
        <p>${esc(monthLabel(monthKey))} · fica à parte, não entra nos gastos</p>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body">
      <div class="field">
        <label for="a-date">Data</label>
        <input type="date" id="a-date" value="${esc(v.date || todayIso())}">
      </div>
      <div class="field">
        <label for="a-desc">Descrição</label>
        <input type="text" id="a-desc" autocomplete="off"
               placeholder="Poupança, CDB, Tesouro..." value="${esc(v.description || '')}">
      </div>
      <div class="field">
        <label for="a-value">Valor aplicado</label>
        <input type="text" id="a-value" inputmode="decimal" autocomplete="off"
               placeholder="0,00" value="${esc(v.valueText || '')}">
      </div>
      <p class="error" id="a-error" hidden></p>
      <div class="sheet-foot" style="padding-left:0;padding-right:0">
        <button type="button" class="btn" data-action="close">Cancelar</button>
        <button type="button" class="btn btn--solid btn--grow" data-action="application-save">
          ${icon('check')} Salvar
        </button>
      </div>
    </div>`;
}

export function renderApplicationEntrySheet(app) {
  return `
    <div class="sheet-head">
      <div>
        <h2 id="sheet-title">${esc(app.description)}</h2>
        <p>${formatIsoDate(app.date)} · ${formatCents(app.cents)}</p>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body" style="padding-bottom:0">
      <ul class="options">
        <li><button type="button" data-action="application-edit" data-id="${esc(app.id)}">
          ${icon('pencil')} Editar
        </button></li>
        <li><button type="button" class="is-danger" data-action="application-delete" data-id="${esc(app.id)}">
          ${icon('trash')} Excluir
        </button></li>
      </ul>
    </div>`;
}

// ---------- preview de parcelas

export function renderPreview({ totalCents, installments, month }) {
  if (!totalCents || totalCents <= 0) {
    return '<span>Informe o valor total da compra para ver as parcelas.</span>';
  }
  const n = Math.max(1, Math.trunc(installments) || 1);
  if (n === 1) {
    return `<b>${formatCents(totalCents)}</b> à vista em ${monthShort(month)}`;
  }
  const parts = installmentPreview({ totalCents, installments: n, month });
  const equal = parts.every((p) => p.cents === parts[0].cents);
  const head = equal
    ? `<b>${n}x de ${formatCents(parts[0].cents)}</b>`
    : `<b>${n}x</b> (última de ${formatCents(parts[n - 1].cents)})`;
  const chips = parts
    .map((p) => `<span class="${p.isFinalWarning ? 'last' : ''}">${esc(p.label)} · ${formatCents(p.cents)}${p.isFinalWarning ? ' (última)' : ''}</span>`)
    .join('');
  return `${head} — total ${formatCents(totalCents)}<span class="chips">${chips}</span>`;
}

// ---------- folha: valor a receber

export function renderIncomeSheet({ monthKey, period, income, overridden }) {
  return `
    <div class="sheet-head">
      <div>
        <h2 id="sheet-title">A receber · ${periodLabel(period)}</h2>
        <p>${esc(monthLabel(monthKey))}${overridden ? ' · ajustado só neste mês' : ''}</p>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body">
      <div class="field">
        <label for="income-value">Valor a receber</label>
        <input type="text" id="income-value" inputmode="decimal" autocomplete="off"
               placeholder="0,00" value="${income > 0 ? formatCents(income) : ''}">
      </div>
      <p class="error" id="income-error" hidden></p>
      <p class="hint">"Este e os próximos" replica o valor para todos os meses seguintes.
      "Só este mês" ajusta apenas ${esc(monthLabel(monthKey))}.</p>
      <div class="sheet-foot" style="padding-left:0;padding-right:0">
        <button type="button" class="btn" data-action="income-save" data-scope="month">Só este mês</button>
        <button type="button" class="btn btn--solid btn--grow" data-action="income-save" data-scope="forward">Este e os próximos</button>
      </div>
    </div>`;
}

// ---------- folha: gasto

export function renderExpenseSheet({ mode, monthKey, period, values, voice, speech }) {
  const v = values || {};
  const isEdit = mode === 'edit';
  const voicePanel = voice
    ? `<div class="voice" id="voice-panel">
         <div class="voice-status">
           ${icon('mic', 'icon icon--sm pulse')}
           <span id="voice-status">${speech ? 'Ouvindo…' : 'Use o microfone do teclado'}</span>
         </div>
         ${speech
    ? '<p class="voice-transcript" id="voice-transcript">Fale a data, a descrição, o valor e as parcelas.</p>'
    : `<div class="field" style="margin:8px 0 0">
                <textarea id="voice-text" placeholder="Toque no microfone do teclado e fale: 27 de agosto sapato loja Bennys cem reais em três vezes"></textarea>
              </div>
              <button type="button" class="btn" data-action="voice-parse" style="width:100%">${icon('check')} Preencher campos</button>`}
       </div>`
    : '';

  return `
    <div class="sheet-head">
      <div>
        <h2 id="sheet-title">${isEdit ? 'Editar compra' : 'Novo gasto'}</h2>
        <p>${esc(monthLabel(monthKey))} · ${periodLabel(period)}</p>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body">
      ${voicePanel}
      <div class="field">
        <label for="f-date">Data</label>
        <input type="date" id="f-date" value="${esc(v.date || todayIso())}">
      </div>
      <div class="field">
        <label for="f-desc">Descrição</label>
        <input type="text" id="f-desc" autocomplete="off" enterkeyhint="next"
               placeholder="Sapato loja Bennys" value="${esc(v.description || '')}">
      </div>
      <div class="field field-row">
        <div>
          <label for="f-value">Valor total</label>
          <input type="text" id="f-value" inputmode="decimal" autocomplete="off"
                 placeholder="0,00" value="${esc(v.valueText || '')}">
        </div>
        <div>
          <label for="f-parcels">Parcelas</label>
          <input type="number" id="f-parcels" inputmode="numeric" min="1" max="60" step="1"
                 value="${esc(String(v.installments || 1))}">
        </div>
      </div>
      <p class="error" id="f-error" hidden></p>
      <div class="preview" id="f-preview"></div>
      <div class="sheet-foot" style="padding-left:0;padding-right:0">
        <button type="button" class="btn" data-action="close">Cancelar</button>
        <button type="button" class="btn btn--solid btn--grow" data-action="expense-save">
          ${icon('check')} Salvar
        </button>
      </div>
    </div>`;
}

// ---------- folha: acoes de um lancamento

export function renderEntrySheet({ entry, expense }) {
  const spread = expense.installments > 1
    ? `<p class="hint">Compra parcelada em ${expense.installments}x a partir de ${monthShort(expense.month)}.
       Editar ou excluir afeta todas as parcelas.</p>`
    : '';
  return `
    <div class="sheet-head">
      <div>
        <h2 id="sheet-title">${esc(expense.description)}</h2>
        <p>${formatIsoDate(expense.date)} · ${formatCents(expense.totalCents)}${expense.installments > 1 ? ` · ${expense.installments}x` : ''}</p>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body" style="padding-bottom:0">
      ${entry.isFinalWarning ? `<div class="voice is-error" style="margin-bottom:12px"><div class="voice-status">${icon('alert', 'icon icon--sm')}<span>Última parcela — o débito encerra aqui.</span></div></div>` : ''}
      ${spread}
      <ul class="options">
        <li><button type="button" data-action="expense-edit" data-id="${esc(expense.id)}">
          ${icon('pencil')} Editar compra
        </button></li>
        <li><button type="button" class="is-danger" data-action="expense-delete" data-id="${esc(expense.id)}">
          ${icon('trash')} Excluir compra
        </button></li>
      </ul>
    </div>`;
}

// ---------- folha: menu

function toggle(id, checked, label, desc) {
  return `
    <div class="setting-row">
      <div>
        <p class="setting-title">${esc(label)}</p>
        ${desc ? `<p class="setting-desc">${esc(desc)}</p>` : ''}
      </div>
      <label class="switch">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
        <span class="switch-track"></span>
      </label>
    </div>`;
}

function formatBackupDate(iso) {
  if (!iso) return 'nunca';
  return formatIsoDate(iso);
}

export function renderSettingsSheet(state) {
  const count = state.expenses.length;
  const backupOn = state.config.backupReminderDays != null;
  return `
    <div class="sheet-head">
      <div>
        <h2 id="sheet-title">Configurações</h2>
        <p>${count} compra${count === 1 ? '' : 's'} registrada${count === 1 ? '' : 's'}</p>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body">
      <ul class="options" style="margin-bottom:16px">
        <li><button type="button" data-action="go-today">
          ${icon('repeat')} Ir para o mês atual
        </button></li>
      </ul>

      <h3 class="settings-section">${icon('safe', 'icon icon--sm')} Aplicações</h3>
      ${toggle('cfg-deduct', state.config.deductApplications,
    'Descontar aplicações do saldo do mês',
    'Por padrão o valor aplicado fica à parte, só para acompanhar. Ligue para ele reduzir o saldo do mês.')}

      <h3 class="settings-section">${icon('broom', 'icon icon--sm')} Gastos antigos</h3>
      <p class="hint">Remove do aparelho as compras já encerradas antes do mês escolhido, para não
      acumular espaço com o que já passou. Compras com parcela ainda em aberto não são removidas.</p>
      <div class="field">
        <label for="cfg-keep-months">Manter os últimos quantos meses</label>
        <input type="number" id="cfg-keep-months" inputmode="numeric" min="1" max="36" step="1"
               value="${esc(String(state.config.keepMonths))}">
      </div>
      <button type="button" class="btn" style="width:100%" data-action="purge-preview">
        ${icon('broom')} Ver o que seria removido
      </button>

      <h3 class="settings-section" style="margin-top:20px">${icon('download', 'icon icon--sm')} Backup</h3>
      <p class="hint">Último backup: ${esc(formatBackupDate(state.config.lastBackupAt))}.
      Os dados vivem só neste aparelho — sem backup, limpar o navegador apaga tudo.</p>
      <div class="sheet-foot" style="padding:0 0 14px">
        <button type="button" class="btn" data-action="export">${icon('download')} Exportar agora</button>
        <button type="button" class="btn" data-action="import">${icon('upload')} Importar</button>
      </div>
      ${toggle('cfg-backup-on', backupOn, 'Lembrar de exportar', 'Um aviso aparece ao abrir o app quando o backup estiver atrasado.')}
      <div class="field" id="cfg-backup-days-field" ${backupOn ? '' : 'hidden'}>
        <label for="cfg-backup-days">A cada quantos dias</label>
        <input type="number" id="cfg-backup-days" inputmode="numeric" min="1" max="90" step="1"
               value="${esc(String(state.config.backupReminderDays || 10))}">
      </div>

      <h3 class="settings-section" style="margin-top:20px">Dados</h3>
      <ul class="options">
        <li><button type="button" class="is-danger" data-action="reset">
          ${icon('trash')} Apagar todos os dados
        </button></li>
      </ul>
    </div>`;
}

export function renderPurgePreviewSheet(plan) {
  if (plan.nothingToDo) {
    return `
      <div class="sheet-head">
        <div><h2 id="sheet-title">Nada para limpar</h2></div>
        <button type="button" class="icon-btn" data-action="close" aria-label="Fechar">${icon('x')}</button>
      </div>
      <div class="sheet-body">
        <p class="hint">Não há registros encerrados antes de ${esc(plan.cutoffLabel)}.</p>
      </div>`;
  }
  const items = [
    ...plan.expenses.map((e) => `${esc(e.description)} · ${formatCents(e.totalCents)}${e.installments > 1 ? ` (${e.installments}x)` : ''}`),
    ...plan.applications.map((a) => `${esc(a.description)} · ${formatCents(a.cents)} (aplicação)`),
  ];
  const keptNote = plan.keepRunning.length
    ? `<p class="hint">${plan.keepRunning.length} compra${plan.keepRunning.length === 1 ? '' : 's'} começada${plan.keepRunning.length === 1 ? '' : 's'} antes disso fica${plan.keepRunning.length === 1 ? '' : 'm'}, porque ainda ${plan.keepRunning.length === 1 ? 'tem parcela' : 'têm parcelas'} em aberto.</p>`
    : '';
  return `
    <div class="sheet-head">
      <div>
        <h2 id="sheet-title">Limpar antes de ${esc(plan.cutoffLabel)}</h2>
        <p>${items.length} registro${items.length === 1 ? '' : 's'} ${items.length === 1 ? 'será' : 'serão'} removido${items.length === 1 ? '' : 's'}</p>
      </div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body">
      <ul class="list-plain">
        ${items.map((t) => `<li>${t}</li>`).join('')}
      </ul>
      ${keptNote}
      <p class="hint">Exporte um backup antes, caso queira guardar esse histórico em outro lugar.</p>
      <div class="sheet-foot" style="padding-left:0;padding-right:0">
        <button type="button" class="btn" data-action="close">Cancelar</button>
        <button type="button" class="btn btn--danger btn--grow" data-action="purge-confirm"
                data-payload="${esc(plan.cutoffMonth)}">${icon('broom')} Limpar</button>
      </div>
    </div>`;
}

export function renderConfirmSheet({ title, message, confirmLabel, action, payload }) {
  return `
    <div class="sheet-head">
      <div><h2 id="sheet-title">${esc(title)}</h2></div>
      <button type="button" class="icon-btn" data-action="close" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body">
      <p class="hint">${esc(message)}</p>
      <div class="sheet-foot" style="padding-left:0;padding-right:0">
        <button type="button" class="btn" data-action="close">Cancelar</button>
        <button type="button" class="btn btn--danger btn--grow" data-action="${esc(action)}"
                data-payload="${esc(payload || '')}" data-confirmed="1">${esc(confirmLabel)}</button>
      </div>
    </div>`;
}

export { PERIODS, monthLabel };
