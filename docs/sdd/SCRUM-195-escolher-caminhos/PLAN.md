# PLAN — SCRUM-195

## 1. Domínio (`packages/dominio/src/caminhos.ts`)

- `abrirCaminho` confere o status da pauta depois do owner e recusa com `pauta_fechada` fora de
  `STATUS_COM_CAMINHOS`. Não olha a meta nem os outros caminhos.
- `caminhosDaPauta(db, pautaId)`: os caminhos da pauta, do mais antigo ao mais novo.
- `pautasDoOwner(db, estudanteId)`: pautas com papel ativo (`ate` nulo) e status em
  `STATUS_COM_CAMINHOS`, da mais nova à mais antiga.

## 2. Bot (`apps/backend/src/bot/conversation/minhas-pautas.ts`)

| passo              | o que faz                                                        | próximo                                   |
| ------------------ | ---------------------------------------------------------------- | ----------------------------------------- |
| `MENU` (opção 4)   | `entrarEmMinhasPautas`: nenhuma, uma ou várias pautas            | `MENU`, `OWNER_PATHS`, `OWNER_PICK_PAUTA` |
| `OWNER_PICK_PAUTA` | escolhe pela linha (`pauta:<id>`), número ou título              | `OWNER_PATHS`, ele mesmo, `MENU`          |
| `OWNER_PATHS`      | abre o caminho do botão (`caminho:falabr`, `caminho:comunidade`) | ele mesmo, `MENU`                         |

- O `pautaId` escolhido fica nos dados da conversa (validado com zod) e sai ao voltar ao menu.
- `abrirCaminho` roda num savepoint da transação da mensagem, como `criarPauta` na 2.6.
- `estudanteVerificado` saiu de `nova-pauta.ts` para `estudante.ts`: os dois fluxos usam.

## 3. Mensagem com botões (`resposta.ts`)

`Resposta` ganhou `MensagemDeBotoes` e o construtor `botoes()`, com os limites da Meta (3 botões,
título até 20, id até 256, corpo até 1024). O toque volta como `interactive.button_reply`, e o
worker já entrega o `id` como texto (`inputOf`). O botão "Voltar ao menu" usa o id `menu`, o
comando global.

## Riscos

- **Mais de 10 pautas:** a lista mostra as 10 mais novas. Um owner com mais que isso é improvável;
  se acontecer, ele digita o título.
- **Corrida entre dois owners:** dois co-owners tocando "Abrir Fala.BR" ao mesmo tempo podem abrir
  dois caminhos. O domínio permite, e o estado mostra os dois.
