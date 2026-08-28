// Backup automatico numa planilha do Google Sheets, via um Apps Script Web
// App que o usuario publica na propria conta (ver tools/apps-script-backup.gs).
// Cada envio SOBRESCREVE as abas da planilha: e sempre uma foto da posicao
// atual, nunca um historico que acumula.

import { formatCents } from './money.js';
import { monthLabel, periodLabel } from './model.js';

export function isValidSheetsUrl(url) {
  return /^https:\/\/.+/.test(String(url || '').trim());
}

// Estrutura enviada ao Apps Script. A aba "gastos" e para o usuario abrir a
// planilha e entender de relance; a aba "json" carrega o mesmo texto do
// "Exportar agora" local, exatamente como o app precisa para restaurar via
// Importar - e a unica das duas que tem fidelidade total.
export function buildSnapshotPayload(state, exportJsonText) {
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

  return {
    geradoEm: new Date().toISOString(),
    resumo: {
      mesInicialDoApp: monthLabel(state.config.startMonth),
      manterUltimosMeses: state.config.keepMonths,
      totalDeComprasRegistradas: state.expenses.length,
    },
    gastos,
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
