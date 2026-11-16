# SCRUM-304 — Segurança: dependências e e-mail

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-304](https://ic-team-pds.atlassian.net/browse/SCRUM-304) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `fix/SCRUM-304-dependencias-email`                              |

## O que muda

1. **Nodemailer 8.0.5 → 10.x** no backend e no painel (`pnpm audit --prod` apontava 4 altas e 14
   moderadas). As mudanças que quebram compatibilidade não nos afetam: a 9.0 passou a conferir o
   certificado TLS ao baixar anexos por URL e no OAuth2 (não usamos nenhum dos dois), e a 10.0 exige
   Node 20 ou mais novo (o projeto usa Node 24).
2. **STARTTLS obrigatório fora da 465.** `secure: porta === 465` continua, e agora
   `requireTLS: porta !== 465`, no backend (`opcoesDoTransporte`, em `email/codigo.ts`) e no painel
   (`opcoesSmtp`, em `src/smtp.ts`). Antes, um intermediário que apagasse o STARTTLS da resposta do
   servidor fazia o Nodemailer autenticar e enviar em claro: vazavam a senha do SMTP, os códigos de
   verificação e os links de login do painel. Agora o envio falha. O painel também não tinha o
   `secure` da 465.
3. **Limite de 40 MP nas fotos** (`LIMITE_DE_PIXELS`, `fotos/imagem.ts`), em todo `sharp()` que abre
   uma foto recebida (`ENTRADA_DA_FOTO`). O padrão do sharp é ~268 MP: um PNG de 16383×16383 com
   poucos KB prendia a CPU e a memória do worker. O sharp recusa já ao ler o cabeçalho, antes de
   decodificar, e a pessoa recebe a mensagem de foto inválida.

## Decisões

- **40 MP** (como a task propõe): as fotos que chegam pelo WhatsApp e pelo Telegram são
  recomprimidas (uns 4096 px de lado, no máximo ~17 MP). Uma foto original de câmera de 48 MP ou
  mais, mandada como arquivo, também passaria dos 5 MB, então já era recusada.
- **Mensagem de foto inválida, não "foto grande demais"**: "grande demais" fala em MB, e a pessoa
  não teria como entender o limite de pixels. O caso real é de ataque, não de uso normal.
- **Aviso de dependência do next-auth**: o next-auth 5 beta declara `nodemailer ^7 || ^8` como
  dependência par. Ele só usa o `createTransport` no envio padrão do link, que o painel substitui
  pelo próprio (`sendVerificationRequest`), então a versão 10 não muda nada para ele.
  `pnpm-workspace.yaml` registra a versão permitida (`peerDependencyRules`) para o aviso não
  aparecer a cada instalação.

## Testes

- `email/codigo.test.ts`: servidor SMTP falso, sem STARTTLS. O envio do código falha antes do
  `AUTH`, e nenhum `MAIL` chega ao servidor. Para provar que a falha é pelo TLS, o mesmo servidor
  aceita o envio quando o STARTTLS não é exigido.
- `painel/src/smtp.test.ts`: 587 e outras portas exigem o STARTTLS; a 465 usa TLS desde o início.
- `fotos/imagem.test.ts` e `fotos/servico.test.ts`: PNG de 8000×8000 com poucos KB
  (`teste/png-gigante.ts`) é recusado como inválido e nada é guardado; 6000×6000 (36 MP) passa.
- `pnpm audit --prod` sem achados altos no nodemailer.
