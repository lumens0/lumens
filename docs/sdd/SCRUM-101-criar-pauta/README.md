# SCRUM-101 — [2.6] Criar pauta nova pela conversa

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-101](https://ic-team-pds.atlassian.net/browse/SCRUM-101) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `feature/SCRUM-101-criar-pauta`                                 |
| **Ref**    | RF-B03, RN06, RNF10 · história 2.6 · tamanho M                  |

## Documentos

| Arquivo                | O que contém                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| [`SPEC.md`](SPEC.md)   | Comportamento, critérios de aceitação e o que ficou fora.           |
| [`PLAN.md`](PLAN.md)   | `criarPauta`, perguntas do bot, porta de verificação, foto, riscos. |
| [`TESTS.md`](TESTS.md) | O que os testes exercitam e as lacunas conhecidas.                  |

## Decisões que vale a revisão olhar

- **Foto no primeiro relato.** A tabela `pauta` não tem coluna de foto; a `relato` tem
  (`foto_chave`). A pauta nasce com um relato: o texto original da 2.5, ou a descrição. É por ele
  que a curadoria vê a foto.
- **Verificação na entrada, não no fim.** Quem não é estudante verificado vai para a 2.4 antes da
  primeira pergunta, com `pendingCommand: nova-pauta` guardado. Falta a 2.4 retomar esse pedido
  (`TODO(2.4)` em `nova-pauta.ts`).
- **Foto tratada na hora.** Baixar, limpar e guardar acontece no passo da foto, antes de criar a
  pauta, para a pessoa saber na hora se a foto não serviu e poder mandar outra ou pular.
- **Categoria `a_classificar`.** O bot não pergunta a categoria; a curadoria classifica.

## Pendências

- **Prazo da curadoria:** ainda não definido pela equipe. O resumo sai sem ele até alguém
  preencher `CURADORIA.prazo` em `apps/backend/src/bot/conversation/nova-pauta.ts`.
- **Retomar a pauta depois da verificação:** depende da 2.4.
- **Emulador de S3 no `docker-compose`:** é da T20. Até lá, no `pnpm dev` a foto é recusada com
  aviso ("não consegui baixar a foto agora") e o "pular" funciona.
