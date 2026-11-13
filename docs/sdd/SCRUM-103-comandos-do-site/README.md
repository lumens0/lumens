# SCRUM-103 — [2.8] Comandos do site e virar co-owner

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Ticket**   | [SCRUM-103](https://ic-team-pds.atlassian.net/browse/SCRUM-103) |
| **Branch**   | `feat/SCRUM-103-comandos-do-site`                               |
| **Ref**      | RF-B09, RF-B10, RN06 · história 2.8 · tamanho P                 |
| **Subtasks** | SCRUM-153, SCRUM-154, SCRUM-155, SCRUM-156                      |

## Fluxo

```
site (wa.me ?text= / t.me ?start=)
  "apoiar <slug>" ──▶ pauta existe? ──não──▶ aviso (no menu) ou resposta ao passo atual (no fluxo)
                          │ sim, recebe apoio? ──não──▶ "não está recebendo apoios"
                          ▼
                     entrarNoApoio (2.7) ──não verificado──▶ VERIFY_ASK_EMAIL, pendingCommand: apoiar
  "ajudar <slug>" ──▶ vouAjudar (3.5): sem proposta aberta, avisa antes de pedir verificação
  "nova pauta"    ──▶ entrarNaPautaNova (2.6) ──não verificado──▶ pendingCommand: nova-pauta
  "cuidar <pauta>"──▶ cuidarDaPauta ──não verificado──▶ pendingCommand: cuidar
                          ▼
                     adicionarCoOwner: apoia? já cuida? 3 owners ativos? (RN06)

fim do apoio (2.7), com vaga ──▶ botão "Quero cuidar" (id `cuidar <pautaId>`)
2.4 terminou ──▶ verifyAskCourse retoma o pendingCommand (apoiar, ajudar, nova-pauta, cuidar)
```

Código: `apps/backend/src/bot/conversation/comandos-do-site.ts` (leitura e despacho),
`co-owner.ts` (convite e pedido), `router.ts` (comandos valem em qualquer passo) e
`packages/dominio/src/pauta/owners.ts` (`podeVirarCoOwner`, ao lado de `adicionarCoOwner`).

## Critérios de aceite e onde estão cobertos

| Critério                                            | Teste (`comandos-do-site.test.ts`, salvo indicado)                     |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Regex de `apoiar <id>`, `ajudar <id>`, `nova pauta` | `parseComandoDoSite`                                                   |
| Pauta/proposta inexistente ou fechada → erro        | pauta que não existe; pauta fechada; `ajudar` sem proposta aberta      |
| Não verificado: guarda, verifica (2.4) e retoma     | primeiro contato com `apoiar`, `nova pauta` e `cuidar`, pela 2.4 real  |
| `ajudar` chama o fluxo de proposta da parte 3       | `minhas-pautas.test.ts` (3.5), agora despachado por `comandos-do-site` |
| Co-owner checa o limite de 3 no serviço de regras   | pauta com 3 owners; `owners.test.ts` · `podeVirarCoOwner`              |

## Decisões que vale a revisão olhar

- **Comandos valem em qualquer passo.** Quem toca no botão do site quer fazer aquilo agora, como
  já era com o `ajudar` da 3.5. O fluxo largado não leva dados para o novo.
- **Alvo que não existe no meio de um fluxo segue para o passo.** "apoiar estudantes" pode ser o
  título de uma pauta nova ou um relato. Só no menu e no primeiro contato o alvo desconhecido vira
  aviso. Os slugs do site sempre existem (pauta não é apagada), então o botão nunca cai nesse caso.
- **Erro antes da verificação.** Pauta que não existe, pauta fechada para apoio ou sem proposta
  aberta avisam na hora, sem mandar a pessoa verificar o e-mail para nada.
- **Como se vira co-owner.** O site não tem botão de co-owner. O convite aparece ao fim do apoio,
  só para quem apoia, ainda não cuida e encontra vaga (`podeVirarCoOwner`, só leitura). O pedido
  passa por `adicionarCoOwner`, que trava a pauta e decide de verdade: o convite pode ter ficado
  velho. Quem pede sem apoiar recebe o botão "Apoiar" com o id da pauta.
- **Co-owner em pauta fechada.** Pauta em curadoria, recusada ou conquistada não recebe novas
  pessoas para cuidar dela (a mesma lista `SEM_APOIO` do apoio, agora exportada pelo domínio).
- **Flag do site.** `NEXT_PUBLIC_FLAG_APOIAR` saiu: o botão "Apoiar" esperava o bot entender
  `apoiar <slug>`, e agora entende.

## Fora do escopo

- Oferecer a vaga aberta por owner removido (RF-A03) a todos os apoiadores: é aviso em massa, da
  parte 3. Aqui o convite aparece só para quem acabou de apoiar.
