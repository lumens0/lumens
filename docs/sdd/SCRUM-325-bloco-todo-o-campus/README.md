# SCRUM-325 — Bug: digitar "Todo o campus / não sei" dá "Não achei esse bloco"

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-325](https://ic-team-pds.atlassian.net/browse/SCRUM-325) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `fix/SCRUM-325-bloco-todo-o-campus`                             |

## O problema

`blocoEscolhido` (`bot/conversation/blocos.ts`) normaliza o texto com `palavrasDe`. Digitar o rótulo
da linha do campus, "Todo o campus / não sei", vira "todo o campus nao sei", que não estava na lista
do que vale como campus. Quem digitava o que via, em vez de tocar no botão, ficava preso no passo do
bloco, no relato (2.5) e na pauta nova (2.6).

O mesmo valia para os blocos com parênteses no nome: "Bloco 18 (fictício)" digitado como está vira
"bloco 18 ficticio", e a comparação tirava os parênteses só do lado do bloco.

## O que muda

- O rótulo da linha do campus virou a constante `CAMPUS_ROW_TITLE`, usada na lista e, normalizada,
  no conjunto do que vale como campus. Se o rótulo mudar, o que se digita acompanha.
- O nome do bloco com os parênteses também vale (`palavrasDe(nome)`), além do nome sem eles e do
  slug.

## Decisões

- **Os blocos com parênteses entraram junto**: é o mesmo bug (digitar o rótulo da lista e não ser
  entendido), e o teste novo confere todas as linhas da lista, não só a do campus.

## Testes

`blocos.test.ts` (novo):

- "Todo o campus / não sei", com e sem acento, maiúsculas e pontuação → `{ blocoId: null }`;
- cada rótulo da lista, digitado como está, escolhe a própria linha;
- os casos de antes (nome inteiro, pedaço único, slug, id da linha) continuam.

Os casos que já estavam em `relato.test.ts` continuam lá, sem mudança.
