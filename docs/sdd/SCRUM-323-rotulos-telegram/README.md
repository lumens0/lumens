# SCRUM-323 — Telegram: rótulos cortados no limite da Meta e textos que falam de "este número"

|            |                                                                    |
| ---------- | ------------------------------------------------------------------ |
| **Ticket** | [SCRUM-323](https://ic-team-pds.atlassian.net/browse/SCRUM-323)    |
| **Dev**    | @eumarcosmendonca                                                  |
| **Branch** | `fix/SCRUM-323-rotulos-telegram`                                   |
| **Ref**    | SCRUM-267 (canal do Telegram), SCRUM-283 (privacidade no Telegram) |

## O problema

`lista()` e `botoes()` (`bot/conversation/resposta.ts`) cortavam títulos, descrições, o botão da
lista e o corpo nos limites da Meta ao montar a resposta, antes de saber o canal. No Telegram, a
lista de blocos mostrava "Bloco da Saúde (fictíci…" e a pauta parecida "Bebedouros funcionando…".
E a mensagem do fim da verificação dizia que ela "vale para este número", o que não faz sentido
para quem fala pelo Telegram.

## O que muda

- **`lista()` e `botoes()` guardam o texto inteiro.** Continuam conferindo o que vale em todo canal:
  quantidade de linhas e de botões e o tamanho do id.
- **`dentroDosLimitesDaMeta(resposta)`** faz o corte de antes (título da linha 24, descrição 72,
  botão 20, corpo 4096; título do botão 20, corpo 1024). É para quem envia pela Cloud API da Meta.
- **Telegram** (`paraTelegram`): títulos inteiros nos botões. A descrição das linhas, que vai no
  corpo, é encurtada em 200 caracteres (`LIMITE_DA_DESCRICAO`): a descrição da pauta pode ser longa
  e três delas encheriam a tela.
- **Textos**: "A verificação vale para esta conversa", e o e-mail em uso fala de "outra conversa"
  em vez de "outro número de WhatsApp". O PDF da resposta oficial avisa que a resposta chega "por
  aqui", não "pelo WhatsApp".

## Decisões

- **Quem chama `dentroDosLimitesDaMeta`**: ainda ninguém em produção. As respostas da conversa pela
  Cloud API ainda saem pelo `logSender` (o envio interativo pela Meta não existe), e o WhatsApp da
  demonstração é a Evolution, que manda os menus como texto e não tem esses limites. O envio pela
  Meta, quando existir, chama a função antes de montar o payload, e o teste garante que o corte é o
  mesmo de antes.
- **Os textos de privacidade** ("Guardamos seu telefone cifrado", "Seu telefone e seu e-mail serão
  apagados") ficam para a SCRUM-283, que trata justamente deles no Telegram. O teste novo os deixa
  de fora.
- **Termo neutro**: "conversa", que vale nos dois canais.

## Testes

- `relato.test.ts` e `minhas-pautas.test.ts`: `lista()`/`botoes()` guardam o texto inteiro;
  `dentroDosLimitesDaMeta` corta igual a antes (o título da pauta parecida continua
  "Bebedouros funcionando…" no WhatsApp).
- `telegram/sender.test.ts`: nomes de bloco e título de pauta inteiros nos botões e no corpo;
  descrição longa encurtada no corpo.
- `menu-em-texto.test.ts`: o título cortado pela Meta ainda casa sem as reticências.
- `textos-do-canal.test.ts` (novo): nenhum texto exportado pela conversa (fora a privacidade) fala
  em "este/esse/seu/outro número", "número de WhatsApp", "número antigo" ou "pelo WhatsApp".
