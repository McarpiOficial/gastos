// Backup automatico numa planilha do Google Sheets, via um Apps Script Web
// App que o usuario publica na propria conta (ver tools/apps-script-backup.gs).
// Cada envio SOBRESCREVE as abas da planilha: e sempre uma foto da posicao
// atual, nunca um historico que acumula.

import { formatCents } from './money.js';
import { monthLabel, periodLabel } from './model.js';

export function isValidSheetsUrl(url) {
  return /^https:\/\/.+/.test(String(url || '').trim());
}

// Estrutura enviada ao Apps Script. As abas "legiveis" (resumo, gastos,
// aplicacoes) sao para o usuario abrir a planilha e entender de relance; a
// aba "json" carrega o mesmo texto do "Exportar agora" local, exatamente
// como o app precisa para restaurar via Importar - e o unico dos dois que
// tem fidelidade total.
export function buildSnapshotPayload(state, exportJsonText) {
  const overrides = Object.entries(state.income.overrides || {})
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, value]) => ({
      mes: monthLabel(month),
      [periodLabel(15)]: value.p15 != null ? formatCents(value.p15) : '',
      [periodLabel(30)]: value.p30 != null ? formatCents(value.p30) : '',
    }));

  const gastos = [...state.expenses]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e) => ({
      data: e.date,
      descricao: e.description,
      mes: monthLabel(e.month),
      periodo: periodLabel(e.period),
      valorTotal: formatCents(e.totalCents),
      parcelas: e.installments,
    }));

  const aplicacoes = [...(state.applications || [])]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((a) => ({
      data: a.date,
      descricao: a.description,
      mes: monthLabel(a.month),
      valor: formatCents(a.cents),
    }));

  const totalAplicado = (state.applications || []).reduce((acc, a) => acc + a.cents, 0);

  return {
    geradoEm: new Date().toISOString(),
    resumo: {
      mesInicialDoApp: monthLabel(state.config.startMonth),
      manterUltimosMeses: state.config.keepMonths,
      descontarAplicacoesDoSaldo: state.config.deductApplications ? 'sim' : 'não',
      [`recebimento ${periodLabel(15)} (padrão)`]: formatCents(state.income.default.p15),
      [`recebimento ${periodLabel(30)} (padrão)`]: formatCents(state.income.default.p30),
      totalDeComprasRegistradas: state.expenses.length,
      totalAplicadoAcumulado: formatCents(totalAplicado),
    },
    recebimentosAjustados: overrides,
    gastos,
    aplicacoes,
    json: exportJsonText,
  };
}

// O Apps Script nao responde com cabecalhos de CORS de forma confiavel, entao
// um fetch que rejeita nao prova que a gravacao falhou - so que o navegador
// nao deixou ler a resposta. Por isso so vira erro "de verdade" quando o
// proprio script responde de forma legivel dizendo que recusou.
export async function postSnapshot(url, payload) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      // text/plain evita o preflight OPTIONS, que o Apps Script nao trata bem.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch {
    const err = new Error('sem confirmação de leitura');
    err.unconfirmed = true;
    throw err;
  }

  let json = null;
  try {
    json = JSON.parse(await res.text());
  } catch {
    // resposta nao veio em json legivel
  }

  if (json?.ok) return json;
  if (json && json.ok === false) throw new Error(json.error || 'A planilha recusou os dados.');

  const err = new Error('sem confirmação de leitura');
  err.unconfirmed = true;
  throw err;
}
