# TESTS — SCRUM-99

| arquivo                                                | o quê                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/dominio/src/verificacao.test.ts`             | `@ufal.br` e subdomínios aceitos; domínios parecidos recusados; frase, pontuação e maiúsculas; formato; limite de 254; dois endereços                                                                                                               |
| `apps/backend/.../verificacao.test.ts`                 | opção 3 do menu; aceite e recusas no bot; e-mail cifrado e fora das respostas e da tabela `conversa`; pedido pendente da 2.6 mantido; `cancelar`                                                                                                    |
| `packages/dominio/src/verificacao.test.ts` (SCRUM-135) | código sempre com 6 dígitos e sem repetição suspeita; hash SHA-256 que não contém o código e muda com o telefone; `guardarCodigo` com validade de 10 min e o upsert que substitui o código e zera as tentativas                                     |
| `apps/backend/src/email/codigo.test.ts`                | texto simples, remetente, código e validade no corpo, sem HTML nem link, assunto sem o código; falha do SMTP vira `false` e o aviso não tem endereço nem código; `logEmail`                                                                         |
| `apps/backend/.../verificacao.test.ts` (SCRUM-135)     | código enviado ao e-mail normalizado; banco só com o hash; código fora das respostas e da conversa; pedido novo troca o código; falha e falta do serviço de e-mail                                                                                  |
| `packages/dominio/src/verificacao.test.ts` (SCRUM-136) | certo apaga e não vale de novo; 5 erros esgotam, e nem o certo vale; vencido não gasta tentativa; código de outro telefone não vale; espera de 60 s; código novo zera as tentativas; `apagarCodigo`                                                 |
| `apps/backend/.../verificacao.test.ts` (SCRUM-136)     | certo segue para o curso; espaço no meio; errado conta; quinto erro; texto e tamanho errado não contam; vencido; reenviar antes e depois de 60 s; reenvio depois de esgotar; falha no reenvio; e-mail de novo antes de 60 s; sem e-mail na conversa |

## Lacunas

- O e-mail não foi testado num SMTP de verdade nem em contas reais da UFAL (spam): os testes usam
  um transporte falso. Fica para quando houver o SMTP de produção.
