# PLAN — SCRUM-99

## SCRUM-134

- **Domínio** (`packages/dominio/src/verificacao.ts`): `emailInstitucional(mensagem)` é uma função
  pura que acha o endereço e devolve `{ valido: true, email }` ou o motivo da recusa. A regra do
  domínio da UFAL fica no domínio, não no bot, porque o vínculo telefone ↔ e-mail (RN01) e o
  painel podem precisar dela. `normalizarEmail` é a mesma normalização do painel (`acesso.ts`):
  minúsculas e sem espaços nas pontas, para o HMAC do e-mail bater.
- **Bot** (`apps/backend/src/bot/conversation/verificacao.ts`): `verifyAskEmail` troca o
  placeholder de `VERIFY_ASK_EMAIL`. `TRANSITIONS` ganhou `VERIFY_ASK_EMAIL → VERIFY_ASK_EMAIL`,
  para perguntar de novo.
- **Decisão:** com dois endereços na mensagem, o bot não escolhe e pede um só. Escolher o da UFAL
  em silêncio esconderia um erro de digitação no outro.
