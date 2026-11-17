# SCRUM-334 — Bot: ajustes de texto e de comandos

|            |                                                                     |
| ---------- | ------------------------------------------------------------------- |
| **Ticket** | [SCRUM-334](https://ic-team-pds.atlassian.net/browse/SCRUM-334)     |
| **Dev**    | @eumarcosmendonca                                                   |
| **Branch** | `fix/SCRUM-334-textos-e-comandos`                                   |
| **Base**   | `fix/SCRUM-333-retorno-depois-de-24h` (o menu mexe no mesmo trecho) |

## O que muda

1. **Sem "owner" para estudante.** "Você não é mais responsável por esta pauta". No site, a linha do
   tempo diz "Novo responsável" / "Responsável saiu", e a pauta sem caminhos diz "Quem cuida da
   pauta ainda vai escolher os caminhos". O painel (equipe) continua com o termo interno.
2. **Forma neutra.** Os textos falam da verificação, não da pessoa: "Pronto, sua verificação está
   feita ✅", "Sua verificação já está feita ✅", "Para apoiar/criar/cuidar de uma pauta, você
   precisa verificar o seu e-mail institucional" e "falta verificar o seu e-mail institucional".
3. **Contato da equipe: bloqueado** (veja "Bloqueio").
4. **Saída.** "s" sozinho não confirma mais. Confirmam "sim", "sair", "sim, sair", "quero sair" e
   "confirmar". O router entrega o "sair" mandado na confirmação ao passo `LEAVE_CONFIRM`, em vez de
   pedir a saída de novo.
5. **Menu.** "oi", "olá", "voltar", "início" e "começar" mostram o menu. "ajuda" (e "help",
   "socorro", "comandos") explica _menu_, _cancelar_ e _sair_ e mostra o menu. O "Não entendi"
   passou a citar 1 a 5 e a _ajuda_.
6. **Mensagem sem texto.** Áudio: "Não consigo ouvir áudio. Escreva em texto ou mande _menu_."
   Vídeo e figurinha têm a sua; o resto (localização, contato) recebe "Ainda não entendo esse tipo
   de mensagem. Escreva em texto ou mande _menu_." No Telegram, o update passa a dizer se era áudio,
   vídeo ou figurinha (o `type` da Meta), como a Meta e a Evolution já faziam.
7. **"5 Ver pautas abertas".** Manda o link do site e explica que o _Apoiar_ da pauta traz a
   pessoa de volta para cá. Fica no menu.

## Decisões

- **"ajuda" vale só no menu**, como pede a task. No meio de um fluxo, _menu_ e _cancelar_ já tiram
  a pessoa dali, e um "ajuda" global viraria resposta em passos de texto livre.
- **O texto da confirmação não mudou** ("Responda _sim_ para sair..."): a SCRUM-314 mexe na linha
  de cima, e mudar esta daria conflito. O "sair" funciona sem estar escrito.
- **A opção 5 só manda o link**: as pautas, o filtro por bloco e o botão de apoiar já estão no site.
  Listar pautas no bot pediria paginação e outra tela para cada canal.
- **`VERIFIED_TEXT` e a SCRUM-323**: a 323 troca "este número" por "esta conversa" na mesma linha.
  O texto novo já usa "esta conversa"; quem fizer o merge depois fica com a versão desta task.

## Bloqueio

- **Item 3 (canal de contato).** Não há canal de contato da equipe definido no projeto (e-mail, @
  ou página). A `/privacidade` diz só "peça pelo mesmo canal", e o bot não repassa mensagens. O
  `EMAIL_IN_USE_TEXT` continua com "fale com a equipe do Lumens" até a equipe definir o canal.

## Testes

`textos-e-comandos.test.ts` (novo): nenhum `*_TEXT` dos módulos do bot usa "owner" nem "estudante
verificado"; "s" não confirma a saída e "sim"/"sair" confirmam; "oi", "olá", "voltar", "início" e
"começar" mostram o menu; "ajuda" explica os comandos; "5" e "ver pautas abertas" mandam o link;
cada tipo sem texto diz o que fazer. `update.test.ts`: áudio, voz, vídeo, vídeo redondo e figurinha
do Telegram chegam com o tipo certo. Ajustados: `worker.test.ts` (tipo genérico) e o teste do site
que procurava "O owner".
