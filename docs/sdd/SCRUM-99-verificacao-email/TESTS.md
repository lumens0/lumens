# TESTS — SCRUM-99

| arquivo                                    | o quê                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/dominio/src/verificacao.test.ts` | `@ufal.br` e subdomínios aceitos; domínios parecidos recusados; frase, pontuação e maiúsculas; formato; limite de 254; dois endereços            |
| `apps/backend/.../verificacao.test.ts`     | opção 3 do menu; aceite e recusas no bot; e-mail cifrado e fora das respostas e da tabela `conversa`; pedido pendente da 2.6 mantido; `cancelar` |

## Lacunas

- O e-mail ainda não é testado em contas reais da UFAL: isso vem com o envio do código.
