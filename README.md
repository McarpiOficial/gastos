# Gastos — dia 5 e dia 20

App de controle financeiro pessoal. Cada mês tem dois agrupamentos ("bolsos"),
um para o recebimento do **dia 5** e um para o **dia 20**, cada qual com seu
valor a receber, seus gastos e seu saldo.

PWA sem build e sem dependências: HTML, CSS e JavaScript puro, dados no próprio
aparelho (`localStorage`), sem servidor e sem login.

## Como usar

1. Toque no valor a receber de cada bolso e informe quanto entra.
   Escolha **"Este e os próximos"** para o valor valer também nos meses
   seguintes, ou **"Só este mês"** para um ajuste pontual.
2. Toque em **Digitar** ou **Falar** *dentro do bolso* onde o gasto deve entrar.
   É o bolso clicado que define se a compra cai no dia 5 ou no dia 20.
3. Informe data, descrição, valor **total** da compra e o número de parcelas.
   O valor é sempre o total: `100,00` em `3x` vira 33,33 / 33,33 / 33,34.
4. As parcelas seguintes aparecem sozinhas nos próximos meses, no mesmo bolso.
   A última parcela fica **em vermelho** para avisar que o débito encerra ali.
5. Toque numa linha para editar ou excluir a compra — muda em todos os meses.

### Falando o gasto

O botão **Falar** aceita frases inteiras e preenche os campos para você
conferir antes de salvar. Nada é salvo automaticamente. Exemplos que funcionam:

- "vinte e sete de agosto sapato loja Bennys cem reais em três vezes"
- "hoje mercado extra quatrocentos e cinquenta reais"
- "ontem uber 32,90"
- "comprei uma geladeira parcelado em 12 dois mil e quinhentos reais"

Reconhece `hoje`, `ontem`, `anteontem`, `27/08`, `dia 5`, `15 de setembro`;
valores em dígitos ou escritos ("mil e duzentos", "cinco reais e cinquenta
centavos"); e parcelas como `3x`, `em três vezes`, `parcelado em 12`.

No iPhone o Safari é irregular com reconhecimento de fala. Nesse caso o app
abre um campo de texto: use o **microfone do próprio teclado** e toque em
"Preencher campos" — a interpretação da frase é exatamente a mesma.

## Rodar no computador

```bash
npx --yes serve C:\Projetos\Gastos -l 5199
```

Abra `http://localhost:5199`. A suíte de testes fica em
`http://localhost:5199/tests.html` (94 asserções, sem instalar nada).

## Instalar no celular

A voz e a instalação do PWA exigem **HTTPS** fora de `localhost` — testar pelo
IP da rede local (`192.168.x.x`) faz o navegador bloquear o microfone.

Publique a pasta em qualquer host estático com HTTPS:

- **Netlify Drop** — arraste a pasta em <https://app.netlify.com/drop>.
- **GitHub Pages** — suba a pasta num repositório e ative Pages.

Depois abra o endereço no celular e use "Adicionar à tela de início".
O app passa a abrir em tela cheia e funciona offline.

## Configurações (ícone de engrenagem)

O ícone de engrenagem no topo abre:

- **Aplicações** — liga/desliga se o valor aplicado (ver abaixo) desconta do
  saldo do mês.
- **Gastos antigos** — limpa o aparelho do que já passou.
- **Backup local** — exportar, importar e o lembrete automático (ver abaixo).
- **Backup automático na planilha** — envia uma foto dos dados para o Google
  Sheets a cada N dias (ver abaixo).

Não existe um botão de "apagar tudo": é um risco desnecessário para um app que
guarda dados só no aparelho, sem conta e sem recuperação. Se algum dia precisar
zerar, basta limpar os dados do site nas configurações do navegador.

## Aplicações (poupança e afins)

Cada mês tem um terceiro cartão, abaixo dos dois bolsos, para registrar valor
guardado — poupança, CDB, o que for. Ele **não entra na conta de nenhum
bolso**: é só para acompanhar quanto você está aplicando, apartado dos gastos.

Por padrão o saldo do mês também ignora esse valor. Em Configurações →
Aplicações dá para ligar **"Descontar aplicações do saldo do mês"**, e aí o
saldo do mês (só ele, os bolsos continuam intactos) passa a descontar o que
foi aplicado.

## Limpar gastos antigos

Nada é removido sozinho — a limpeza só acontece com dois toques seus. Em
Configurações → Gastos antigos, escolha quantos meses manter (padrão 4) e
toque em **"Limpar gastos antigos"**. O app mostra a lista do que seria
removido; só depois de você tocar em **"Limpar"** de novo, na tela seguinte,
é que os registros somem de fato. Uma compra parcelada com parcela ainda em
aberto **nunca é removida**, mesmo que tenha começado há muito tempo — senão
o mês atual perderia o débito. O corte é sempre contado a partir do mês real
de hoje, não do mês que você está olhando na tela.

## Backup local

Em Configurações → Backup local: **"Exportar agora"** baixa um `.json` com
tudo, **"Importar"** substitui os dados atuais por um backup.

Como o app não tem servidor, o navegador não deixa nenhuma página gravar um
arquivo sozinha em segundo plano — só libera a escrita em resposta a um
toque. Por isso, em vez de um backup silencioso, existe um **lembrete**:
ligue "Lembrar de exportar" e escolha de quantos em quantos dias (padrão 10).
Quando estiver atrasado, um aviso aparece ao abrir o app — toque nele e o
backup é exportado na hora.

Os dados vivem só neste aparelho: limpar os dados do navegador apaga tudo,
então vale manter o lembrete ligado ou o backup na planilha (abaixo) ativo.

## Backup automático na planilha (Google Sheets)

Além do arquivo local, o app pode enviar uma **foto** dos dados para uma
planilha do Google Sheets a cada N dias (padrão 5), sobrescrevendo o envio
anterior — a planilha nunca acumula histórico, sempre mostra a posição atual.

Como o app não tem servidor próprio, o envio usa um **Google Apps Script**
publicado na sua própria conta Google como "Web App": é gratuito, fica
associado só à sua planilha, e o app só precisa do endereço publicado — sem
login do Google dentro do app, sem chave de API exposta em lugar nenhum.

### Configurar (uma vez só)

1. Abra a planilha de destino e vá em **Extensões → Apps Script**.
2. Apague o conteúdo do editor e cole o código de
   [`tools/apps-script-backup.gs`](tools/apps-script-backup.gs).
3. Nesse arquivo, confirme que `SHEET_ID` é o ID da sua planilha (o trecho
   entre `/d/` e `/edit` na URL dela).
4. Clique em **Implantar → Nova implantação** → tipo **App da Web**.
   Em "Quem pode acessar", escolha **Qualquer pessoa**. Implantar.
5. Na primeira vez, o Google pede para autorizar o script — é a sua própria
   conta autorizando o seu próprio script a editar essa planilha, então
   aceite mesmo com o aviso de "app não verificado".
6. Copie a **URL do app da Web** (termina em `/exec`) e cole em
   Configurações → Backup automático na planilha → "Endereço da planilha".
7. Toque em **"Enviar agora"** para testar. Se a planilha ganhar as abas
   `Resumo`, `Gastos`, `Aplicações` e `JSON`, está funcionando.
8. Ligue **"Enviar automaticamente"** e escolha o intervalo.

Esse endereço funciona como uma chave de escrita só daquela planilha — não dá
acesso a mais nada da conta Google. Ainda assim, não compartilhe a URL: quem
tiver esse endereço consegue sobrescrever os dados da planilha. Para revogar,
basta apagar a implantação em Apps Script.

### Como funciona o envio

O app só consegue rodar em segundo plano **quando está aberto**: não existe
como o navegador acordar sozinho a cada 5 dias sem o app rodando. Por isso o
envio automático acontece **na próxima vez que o app for aberto** depois do
intervalo configurado vencer — não é um relógio rodando o tempo todo, é uma
checagem feita na abertura.

O Apps Script normalmente não deixa o navegador **confirmar a leitura** da
resposta (uma limitação de CORS do próprio Google), mesmo quando a gravação
funcionou. Por isso um envio pode aparecer como "sem confirmação de leitura"
mesmo tendo dado certo — vale abrir a planilha de vez em quando para
conferir. Um erro **explícito** (por exemplo "planilha recusou os dados")
indica que o script realmente recusou, e aí vale revisar os passos acima.

## Estrutura

| Arquivo | Papel |
|---|---|
| `js/money.js` | centavos ↔ texto, divisão de parcelas |
| `js/model.js` | meses, parcelas, saldos, aplicações, limpeza — o núcleo |
| `js/store.js` | localStorage, schema versionado, exportar/importar |
| `js/ui.js` | renderização das telas |
| `js/voice.js` | reconhecimento de fala e interpretação da frase |
| `js/sheets.js` | monta a foto dos dados e envia para o Apps Script |
| `js/app.js` | navegação e delegação de eventos |
| `tools/apps-script-backup.gs` | código a colar no Apps Script da planilha |
| `tests.html` | asserções de parcelas, valores, meses, fala, aplicações, limpeza e planilha |

Parcelas **não são armazenadas**: guarda-se uma compra e o mês/bolso de cada
parcela é calculado na hora. Por isso editar a compra corrige todos os meses de
uma vez, sem risco de mês dessincronizado.
