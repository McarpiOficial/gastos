// Backup automatico do app "Gastos" numa planilha do Google Sheets.
//
// COMO INSTALAR (uma vez so):
// 1. Abra a planilha de destino no Google Sheets.
// 2. Menu Extensoes -> Apps Script.
// 3. Apague o conteudo do editor e cole este arquivo inteiro.
// 4. Substitua o SHEET_ID abaixo pelo ID da SUA planilha - e o trecho da URL
//    dela entre "/d/" e "/edit". Nao deixe o ID de verdade neste arquivo se
//    for versiona-lo num repositorio publico (o ID sozinho nao da acesso de
//    escrita a ninguem, mas ajuda a achar a planilha caso o compartilhamento
//    dela esteja aberto para "qualquer pessoa com o link").
// 5. Implantar -> Nova implantacao -> tipo "App da Web".
//      Executar como: Eu (sua conta)
//      Quem tem acesso: Qualquer pessoa
//    Implantar. Na primeira vez o Google pede para autorizar - e voce
//    autorizando o seu proprio script, aceite mesmo com o aviso de
//    "app nao verificado".
// 6. Copie a "URL do app da Web" (termina em /exec) e cole no app, em
//    Configuracoes -> Backup automatico na planilha.
//
// CADA CHAMADA SOBRESCREVE AS ABAS: isto e proposital. O objetivo e uma
// FOTO da posicao atual do app, nunca um historico que acumula linha apos
// linha. Se algum dia quiser mudar o comportamento, e so no clearContents()
// abaixo que isso acontece.

var SHEET_ID = 'COLE_AQUI_O_ID_DA_SUA_PLANILHA';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SHEET_ID);

    var resumo = { 'Atualizado em': payload.geradoEm };
    for (var key in payload.resumo) resumo[key] = payload.resumo[key];

    writeKeyValue(ss, 'Resumo', resumo);
    writeTable(ss, 'Recebimentos ajustados', payload.recebimentosAjustados || []);
    writeTable(ss, 'Gastos', payload.gastos || []);
    writeTable(ss, 'Aplicações', payload.aplicacoes || []);
    writeJson(ss, 'JSON', payload.json || '');

    return respond({ ok: true, updatedAt: new Date().toISOString() });
  } catch (err) {
    return respond({ ok: false, error: String((err && err.message) || err) });
  }
}

// Visitar a URL do app pelo navegador cai aqui - serve so para confirmar
// que a implantacao esta no ar.
function doGet(e) {
  return ContentService.createTextOutput(
    'Endpoint de backup do app Gastos. Use POST com o corpo em JSON.'
  );
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  return sh;
}

// Tabela chave/valor simples - usada para o resumo geral.
function writeKeyValue(ss, name, obj) {
  var sh = getOrCreateSheet(ss, name);
  var rows = [['Campo', 'Valor']];
  for (var key in obj) rows.push([key, obj[key]]);
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
}

// Tabela com cabecalho tirado das chaves do primeiro item da lista - assim
// o script nao precisa saber de antemao quais colunas existem.
function writeTable(ss, name, list) {
  var sh = getOrCreateSheet(ss, name);
  if (!list || !list.length) {
    sh.getRange(1, 1).setValue('(vazio)');
    return;
  }
  var headers = Object.keys(list[0]);
  var rows = [headers];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var row = [];
    for (var c = 0; c < headers.length; c++) {
      var v = item[headers[c]];
      row.push(v == null ? '' : v);
    }
    rows.push(row);
  }
  sh.getRange(1, 1, rows.length, headers.length).setValues(rows);
}

// Aba com o mesmo texto do "Exportar agora" local - e o unico dos quatro
// que tem fidelidade total: colar esse texto em Importar, no app, restaura
// exatamente esta posicao (mais util se o celular for perdido ou trocado).
function writeJson(ss, name, jsonText) {
  var sh = getOrCreateSheet(ss, name);
  sh.getRange(1, 1).setValue('Cole este texto em Importar, no app, para restaurar exatamente esta posição:');
  sh.getRange(2, 1).setValue(jsonText);
}
