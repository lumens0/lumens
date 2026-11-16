# SCRUM-296 — Bug: só 8 cursos aceitos na verificação

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-296](https://ic-team-pds.atlassian.net/browse/SCRUM-296) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `fix/SCRUM-296-cursos-ufal`                                     |
| **Ref**    | história 2.4 (SCRUM-99), passo do curso (SCRUM-138)             |

## O bug

`CURSOS` ainda era a lista do seed (8 cursos). No passo do curso, "Medicina" (ou qualquer curso
fora dos 8) recebia "Não achei esse curso" para sempre: estudantes da maioria dos cursos não
conseguiam se verificar, então não apoiavam nem criavam pauta.

## Fonte da lista

SIGAA da UFAL, "Consulta de Cursos — Graduação"
(<https://sigaa.sig.ufal.br/sigaa/public/curso/lista.jsf?nivel=G&aba=p-graduacao>), consultada em
16/11/2026: cursos **presenciais com sede em Maceió** (Campus A. C. Simões). Ficaram **43 cursos**
em `packages/db/src/cursos.ts`, em ordem alfabética.

## Decisões

- **Um nome por curso.** O SIGAA repete o curso por turno e por grau (bacharelado, licenciatura).
  O site mostra só o nome do curso de quem cuida da pauta, então "Física" vale para todos.
- **Nomes antigos juntados ao atual:** "Comunicação Social (Jornalismo)" → "Jornalismo",
  "Comunicação Social (Relações Públicas)" → "Relações Públicas", "Música (Canto)" → "Música".
- **"Letras" por habilitação** (Espanhol, Francês, Inglês, Libras, Português), como o SIGAA separa.
  Quem digita só "letras" recebe a lista das 5.
- **De fora:** cursos EAD (são de polos, não do campus) e os de Rio Largo (CECA, outro campus).
  Se o Lumens for aberto a eles, basta acrescentar à lista.
- **Busca do nome digitado** (`buscarCurso`, em `packages/dominio/src/cursos.ts`): nome completo
  sem acento/maiúscula/pontuação; siglas e apelidos (`APELIDOS`: "CC", "IA", "RP", "QTI"...);
  começo de palavra com 3 letras ou mais ("odonto", "eng civil"). Texto que serve para mais de um
  curso ("computação", "engenharia") mostra só esses numa lista. O cadastro guarda sempre o nome
  da lista, nunca o texto digitado (o curso aparece no site).
- **A lista do bot mostra os 9 primeiros em ordem alfabética** (Administração a Dança) e pede para
  digitar os outros. É a regra que já existia; outra ordem (por número de estudantes, por exemplo)
  pode ser decidida depois.
- **Seed inalterado:** os estudantes do seed continuam com os mesmos 8 cursos (`CURSOS_DO_SEED`,
  que o TypeScript confere contra `CURSOS`). Assim os dados e os testes do seed e das views não
  mudam.
- **Site:** não há filtro nem texto com a lista de cursos; ele só mostra o curso gravado
  (`cursos_responsaveis` e o curso do relato). Nada a mudar.

## Testes

| arquivo                                        | o quê                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/dominio/src/cursos.test.ts`          | 43 cursos sem repetição, em ordem; apelidos válidos; nome com e sem acento; siglas; vários; não acha       |
| `apps/backend/.../verificacao.test.ts`         | curso fora dos 9 aceito digitado, com e sem acento; Medicina; lista de candidatos; nome longo na descrição |
| `apps/backend/src/bot/telegram/sender.test.ts` | o `id` de todos os 43 cursos cabe no `callback_data` do Telegram (64 bytes)                                |
