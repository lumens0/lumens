# SCRUM-102 — [2.7] Apoiar e mandar foto

|              |                                                                   |
| ------------ | ----------------------------------------------------------------- |
| **Ticket**   | [SCRUM-102](https://ic-team-pds.atlassian.net/browse/SCRUM-102)   |
| **Branch**   | `feat/SCRUM-102-apoiar-e-foto`                                    |
| **Ref**      | RF-B06, RF-B07, RN01, RN02, RN05, RN12 · história 2.7 · tamanho M |
| **Subtasks** | SCRUM-149, SCRUM-150, SCRUM-151, SCRUM-152                        |

## Fluxo

```
2.5 "É essa" ─┐
2.4 'apoiar' ─┴─▶ verificado? ──não──▶ VERIFY_ASK_EMAIL (pendingCommand: apoiar + id)
                      │ sim
                      ▼
               registrarApoio ──▶ placar "Agora são X de Y apoios" (+ aviso de meta batida)
                      ▼
SUPPORT_ASK_REPORT ──sim / relato escrito──▶ SUPPORT_ASK_PHOTO ──foto ou 'pular'──▶ relato pendente
      └──não / pular──▶ menu (apoio já contado)
```

Código: `apps/backend/src/bot/conversation/apoio.ts` (bot) e `packages/dominio/src/pauta/relato.ts`
(`adicionarRelato`).

## Critérios de aceite e onde estão cobertos

| Critério                          | Como                                                                                             | Teste                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Um apoio por estudante por pauta  | `registrarApoio` (PK `pauta_id, estudante_id`); duplicado → "Você já apoia esta pauta"           | `apoio.test.ts` · apoio duplicado                |
| Nada público antes da moderação   | `adicionarRelato` grava sempre `moderacao = pendente`                                            | `apoio.test.ts` · view pública; `relato.test.ts` |
| Meta batida dispara o aviso       | `registrarApoio` grava `meta_batida`; o bot chama `enfileirarAvisoMetaBatida` na mesma transação | `apoio.test.ts` · bate a meta                    |
| Responde com apoios atuais / meta | `supportedText` / `alreadySupportsText`                                                          | `apoio.test.ts` · placar                         |

## Decisões que vale a revisão olhar

- **Evento na linha do tempo.** O catálogo de eventos (`docs/arquitetura/esquema-e-contratos.md`) não tem um tipo para
  apoio, e um evento por apoio encheria a linha pública. O que vai para a linha é o que já está no
  catálogo: `meta_batida` e `status_alterado`, gravados por `registrarApoio` quando o apoio bate a
  meta. O relato aprovado gera `relato_aprovado` na moderação (5.3).
- **Relato "anônimo".** `relato.estudante_id` é obrigatório no esquema e o `sair` (5.7) depende
  dele. O anonimato é o do site: as views públicas não expõem quem relatou, só o curso.
- **Relato da 2.5 reaproveitado.** Quem chega pela lista de parecidas já escreveu o relato; o bot
  só pergunta se quer juntá-lo (sim/não). Quem chega pelo pedido guardado pode escrever agora ou
  pular. A foto só é pedida com relato, porque `relato.texto` é obrigatório.
- **Aviso de meta na mesma transação.** O agendador (3.2) também acharia a pauta, mas enfileirar
  junto com o apoio faz o aviso sair sem esperar o próximo ciclo. A fila não aceita o aviso
  duplicado, então o agendador não repete.
- **Já apoiava, pode relatar.** O apoio duplicado não conta de novo, mas a pessoa ainda pode juntar
  um relato novo: é informação útil para a curadoria e passa pela moderação.

## Fora do escopo

- Comando `apoiar <id>` vindo do site: é a 2.8 (SCRUM-103). O `pendingCommand: apoiar` que ela
  vai guardar já é retomado aqui depois da verificação.
- Card da pauta depois do apoio: é a 2.9 (SCRUM-104).
