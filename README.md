# Gastos — dia 15 e dia 30

App de controle financeiro pessoal. Cada mês tem dois agrupamentos ("bolsos"),
um para o recebimento do **dia 15** e um para o **dia 30**, cada qual com seu
valor a receber, seus gastos e seu saldo.

PWA sem build e sem dependências: HTML, CSS e JavaScript puro, dados no próprio
aparelho (`localStorage`), sem servidor e sem login.

## Como usar

1. Toque no valor a receber de cada bolso e informe quanto entra.
   Escolha **"Este e os próximos"** para o valor valer também nos meses
   seguintes, ou **"Só este mês"** para um ajuste pontual.
2. Toque em **Digitar** ou **Falar** *dentro do bolso* onde o gasto deve entrar.
   É o bolso clicado que define se a compra cai no dia 15 ou no dia 30.
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
`http://localhost:5199/tests.html` (65 asserções, sem instalar nada).

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
- **Backup** — exportar, importar e o lembrete automático (ver abaixo).
- **Dados** — apagar tudo.

## Aplicações (poupança e afins)

Cada mês tem um terceiro cartão, abaixo dos dois bolsos, para registrar valor
guardado — poupança, CDB, o que for. Ele **não entra na conta de nenhum
bolso**: é só para acompanhar quanto você está aplicando, apartado dos gastos.

Por padrão o saldo do mês também ignora esse valor. Em Configurações →
Aplicações dá para ligar **"Descontar aplicações do saldo do mês"**, e aí o
saldo do mês (só ele, os bolsos continuam intactos) passa a descontar o que
foi aplicado.

## Limpar gastos antigos

Em Configurações → Gastos antigos, escolha quantos meses manter (padrão 4) e
toque em **"Ver o que seria removido"**. O app mostra a lista antes de apagar
qualquer coisa. Uma compra parcelada com parcela ainda em aberto **nunca é
removida**, mesmo que tenha começado há muito tempo — senão o mês atual
perderia o débito. O corte é sempre contado a partir do mês real de hoje, não
do mês que você está olhando na tela.

## Backup

Em Configurações → Backup: **"Exportar agora"** baixa um `.json` com tudo,
**"Importar"** substitui os dados atuais por um backup.

**Sobre o backup automático:** como o app não tem servidor, o navegador não
deixa nenhuma página gravar um arquivo sozinha em segundo plano — só libera a
escrita em resposta a um toque. Por isso, em vez de um backup silencioso,
existe um **lembrete**: ligue "Lembrar de exportar" e escolha de quantos em
quantos dias (padrão 10). Quando estiver atrasado, um aviso aparece ao abrir o
app — toque nele e o backup é exportado na hora.

Os dados vivem só neste aparelho: limpar os dados do navegador apaga tudo,
então vale manter o lembrete ligado.

## Estrutura

| Arquivo | Papel |
|---|---|
| `js/money.js` | centavos ↔ texto, divisão de parcelas |
| `js/model.js` | meses, parcelas, saldos, aplicações, limpeza — o núcleo |
| `js/store.js` | localStorage, schema versionado, exportar/importar |
| `js/ui.js` | renderização das telas |
| `js/voice.js` | reconhecimento de fala e interpretação da frase |
| `js/app.js` | navegação e delegação de eventos |
| `tests.html` | asserções de parcelas, valores, meses, fala, aplicações e limpeza |

Parcelas **não são armazenadas**: guarda-se uma compra e o mês/bolso de cada
parcela é calculado na hora. Por isso editar a compra corrige todos os meses de
uma vez, sem risco de mês dessincronizado.
