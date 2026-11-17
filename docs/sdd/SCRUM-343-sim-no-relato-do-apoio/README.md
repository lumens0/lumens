# SCRUM-343 — Bot: "sim" na pergunta do relato do apoio virava o relato

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-343](https://ic-team-pds.atlassian.net/browse/SCRUM-343) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `fix/SCRUM-343-sim-no-relato-do-apoio`                          |
| **Ref**    | 2.7 (apoiar e mandar foto)                                      |

## O problema

Depois do apoio, o passo `SUPPORT_ASK_REPORT` pergunta "Quer contar o que você viu?". Qualquer
texto que não fosse de pular virava o relato, inclusive o "sim". O relato de verdade, mandado logo
depois, caía no passo da foto e se perdia; a curadoria recebia "sim" para moderar.

## O que muda

- **"sim" pede o texto**: "sim", "s", "quero", "pode", "claro", "sim quero", "quero contar" e
  "quero escrever" respondem "Pode escrever: conte numa mensagem o que você viu e onde..." e ficam
  no mesmo passo, sem gravar nada. "não", "n" e "pular" continuam encerrando sem relato.
- **A pergunta pede o texto direto**: "Escreva numa mensagem o que aconteceu e onde, ou responda
  'pular'."
- **Relato curto demais**: menos de 3 palavras pede mais detalhe ("Conte um pouco mais: o que
  aconteceu e onde?..."), no mesmo passo.

## Decisões

- **As duas propostas da task juntas**: a pergunta reescrita evita o "sim", e quem responder "sim"
  mesmo assim é atendido.
- **Mínimo de 3 palavras** (letras ou números): "quebrado" e "ar quebrado" não dizem onde nem o
  quê. O fluxo de relatar (2.5) usa outra regra (termos para a busca de parecidas), que aqui não
  serve: "ar quebrado" teria termos.
- **O relato que veio da 2.5** (já escrito, com a pergunta "Quer juntar?") não muda: ali "sim" é a
  resposta certa.
- **Conflito com a SCRUM-301**: ela mexe no fim do mesmo passo (grava o relato antes da foto). As
  mudanças daqui ficam em linhas que ela não toca, e o teste novo aceita as duas versões das
  respostas.

## Testes

`relato-do-apoio.test.ts` (novo): "sim" não grava e o texto seguinte vira o relato; as outras
formas de "sim"; "não", "n" e "pular"; relato de uma e de duas palavras pede mais detalhe e o
seguinte grava; o texto da pergunta.
