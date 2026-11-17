# SCRUM-333 — Bot: quem volta depois de 24 h perde a primeira mensagem

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-333](https://ic-team-pds.atlassian.net/browse/SCRUM-333) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `fix/SCRUM-333-retorno-depois-de-24h`                           |
| **Ref**    | 5.7 (aviso de privacidade no primeiro contato, SCRUM-175)       |

## O problema

A conversa expira em 24 h. Sem conversa guardada, o passo é `GREETING`, que respondia sempre
saudação, aviso de privacidade inteiro e menu, sem olhar o texto. Quem voltava mandando "2" (ou
"relatar", "minhas pautas") não era atendido e recebia três mensagens longas, inclusive owners
respondendo a um aviso.

## O que muda

- **`GREETING` atende a opção do menu**: "1" a "4" e os nomes ("relatar", "nova pauta",
  "minhas pautas"...) vão direto para o fluxo, como no `MENU`. A tabela de transições ganhou os
  mesmos destinos do `MENU` a partir do `GREETING`.
- **Aviso completo só para quem não tem cadastro**: `temCadastro` (estudante com este telefone, que
  não saiu). Para quem tem, a saudação é curta ("Oi de novo! Que bom ter você de volta ao Lumens.") e
  vem o menu. O router também deixa de pôr o aviso na frente da resposta para quem tem cadastro.
- **O primeiro contato de verdade não muda**: sem cadastro, "oi" recebe saudação, aviso e menu; uma
  opção do menu é atendida com o aviso antes. Quem saiu do Lumens não é achado pelo telefone (lápide)
  e volta a ser primeiro contato.

## Decisões

- **"Cadastro" = qualquer linha de estudante com este telefone, verificada ou não.** Ela só existe
  depois do código de verificação, e quem chegou até ali já recebeu o aviso no primeiro contato.
- **Quem conversou sem se verificar e voltou depois de 24 h ainda recebe o aviso de novo**: o bot não
  guarda nada dessa pessoa além da conversa, que expirou, e não tem como saber que ela já o viu.

## Testes

`retorno.test.ts` (novo):

- verificado que volta depois de 24 h: "2" entra na pauta nova; "1", "relatar" e "Nova pauta" são
  atendidos; "oi" recebe a saudação curta e o menu, sem o aviso;
- cadastro ainda sem verificação também não recebe o aviso de novo;
- sem cadastro: "oi" recebe saudação, aviso e menu; "1" é atendido com o aviso antes;
- quem saiu volta a ser primeiro contato.
