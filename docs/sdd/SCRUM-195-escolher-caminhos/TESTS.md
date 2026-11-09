# TESTS — SCRUM-195

| arquivo                                       | o quê                                                                                                                                                                                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/dominio/src/caminhos-owner.test.ts` | `pauta_fechada` em curadoria, recusada e conquistada; abre nos outros status; `caminhosDaPauta` em ordem e com protocolo e prazo; um caminho não impede o outro (RN07); `pautasDoOwner` (papel ativo, status)                                               |
| `apps/backend/.../minhas-pautas.test.ts`      | opção 4 no menu, sem verificação ou sem pauta, uma pauta direto, lista e escolha, abrir pelos botões e digitando, os dois em qualquer ordem, status inalterado, duplicado, owner que sai e pauta que fecha no meio, protocolo e prazo no estado, `botoes()` |
| `caminhos.test.ts` (dos colegas)              | continua verde: dois Fala.BR na mesma pauta continuam permitidos pelo domínio                                                                                                                                                                               |

## Lacunas conhecidas

- A mensagem com botões não foi enviada pela Cloud API de verdade: o sender da Meta ainda não
  existe.
- No Windows, cada teste da conversa leva 4 a 11 s por causa do banco em memória.
