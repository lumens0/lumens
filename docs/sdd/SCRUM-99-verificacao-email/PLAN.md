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
  falhar, o código é apagado (desde a SCRUM-136).
- **Decisão — SHA-256 com o telefone:** a história pede SHA-256. Misturar o `telefone_hmac` faz o
  mesmo código ter hashes diferentes em telefones diferentes. Um código de 6 dígitos tem só 1
  milhão de valores, então quem lesse o banco poderia testar todos; quem limita isso são a
  validade de 10 minutos e as 5 tentativas da próxima subtask, não o hash.
- **Decisão — envio dentro da transação da mensagem:** como o download da foto na 2.6, o envio
  acontece enquanto a transação da conversa está aberta (até ~20 s no pior caso). Se o worker cair
  depois de enviar e antes de confirmar, a reentrega gera e envia outro código, e só o último vale.
- **Dependência:** `nodemailer` e `@types/nodemailer` no back-end, nas mesmas versões do painel.

## SCRUM-136

- **Domínio** (`verificacao.ts`): `conferirCodigo` trava a linha (`FOR UPDATE`), recusa código
  inexistente, sem tentativas ou vencido, compara o hash em tempo constante (`timingSafeEqual`),
  apaga o código certo e conta o errado. `esperaParaReenviar` calcula o último envio como
  `expira_em − 10 min`: a tabela não precisou de coluna nova. `apagarCodigo` serve ao código usado
  e ao que não chegou a sair.
- **Bot** (`verificacao.ts`): `verifyAskCode` troca o placeholder de `VERIFY_ASK_CODE`.
  `enviarCodigoNovo` é o envio único usado pelo primeiro envio e pelo reenvio.
  `TRANSITIONS` ganhou `VERIFY_ASK_CODE → VERIFY_ASK_EMAIL`, para quando o e-mail some da conversa.
- **Decisão — tentativas por código, não por telefone:** esgotadas as 5, um código novo (depois de
  60 s) zera a contagem. Na pior hipótese, são 5 palpites por minuto num universo de 1 milhão:
  centenas de horas, em média, para acertar no chute.
- **Decisão — o que não gasta tentativa:** texto que não é número e número com tamanho errado. São
  enganos de digitação, não palpites.

## SCRUM-137

- **Domínio** (`verificacao.ts`): `vincularEmail` trava a linha do dono do e-mail e a do telefone
  (`FOR UPDATE`). E-mail de outro telefone devolve `email_em_uso`; telefone com cadastro troca o
  e-mail; telefone novo insere com `ON CONFLICT DO NOTHING`, para dois telefones novos com o
  mesmo e-mail ao mesmo tempo não derrubarem a transação (o segundo recebe `email_em_uso`).
- **O que o passo recebe:** o telefone cifrado (`phoneCifrado`, que já vinha no job do webhook) e
  o HMAC com a `CHAVE_HMAC` (`hmac`), os dois passados pelo worker ao router e ao `StepContext`,
  como o serviço de e-mail. Sem eles, o passo não confere o código (não o gasta) e pede para tentar
  depois.
- **Ordem no passo do código:** tudo o que o vínculo precisa é conferido antes de `conferirCodigo`,
  porque o código certo é apagado. O vínculo roda na mesma transação: se ele lançar erro, o código
  volta a valer.
- **Decisão — aviso só depois do código:** evita descobrir quem usa o Lumens digitando o e-mail
  de outra pessoa.
- **Decisão — sem `verificado_em` aqui:** a história marca o estudante como verificado no fim,
  depois do curso. Até lá, `estudanteVerificado` (2.6) continua dizendo que não é verificado.
