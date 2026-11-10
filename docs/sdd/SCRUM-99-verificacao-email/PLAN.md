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

## SCRUM-135

- **Domínio** (`verificacao.ts`): `gerarCodigo`, `hashDoCodigo` e `guardarCodigo` (upsert na
  `codigo_verificacao`, que já existia desde a T07). Constantes `DIGITOS_DO_CODIGO` e
  `CODIGO_EXPIRA_MS`, usadas também nos textos do bot e do e-mail.
- **E-mail** (`apps/backend/src/email/codigo.ts`): `ServicoDeEmail` com `criarEmailSmtp`
  (Nodemailer, porta 465 com TLS, as outras com STARTTLS, timeouts de 10 a 20 s) e `logEmail`
  (`pnpm dev`). Entra no bot como o serviço de fotos: `main.ts` → worker → router →
  `StepContext.email`.
- **Ordem:** guarda o hash e depois envia. Se gravar falhar, nenhum código sai; se o envio
  falhar, o hash fica sem ninguém ter recebido o código e é substituído no próximo pedido.
- **Decisão — SHA-256 com o telefone:** a história pede SHA-256. Misturar o `telefone_hmac` faz o
  mesmo código ter hashes diferentes em telefones diferentes. Um código de 6 dígitos tem só 1
  milhão de valores, então quem lesse o banco poderia testar todos; quem limita isso são a
  validade de 10 minutos e as 5 tentativas da próxima subtask, não o hash.
- **Decisão — envio dentro da transação da mensagem:** como o download da foto na 2.6, o envio
  acontece enquanto a transação da conversa está aberta (até ~20 s no pior caso). Se o worker cair
  depois de enviar e antes de confirmar, a reentrega gera e envia outro código, e só o último vale.
- **Dependência:** `nodemailer` e `@types/nodemailer` no back-end, nas mesmas versões do painel.
