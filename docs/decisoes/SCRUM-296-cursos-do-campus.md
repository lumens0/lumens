# SCRUM-296 · Lista de cursos e nome exato digitado na verificação

Bug · 2026-11-17
**Situação:** aprovada (decisão tomada por delegação da Sthefany ao fechar as pendências dos PRs).

## Nome exato é aceito sem confirmação

Na verificação, quem digita o nome oficial completo de um curso ("Física", "Química") tem o curso
gravado direto, sem lista de confirmação. Isso vale mesmo quando o mesmo texto também é parte do
nome de outro curso ("Educação Física", "Engenharia Química").

Por quê:

- O nome oficial completo é a resposta mais precisa que a pessoa pode dar. Quem cursa Educação
  Física e digita só "física" digitou o nome de outro curso.
- Mostrar a lista nesse caso prende quem digita "Física" de novo na mesma pergunta: a busca devolve
  a lista outra vez, e só o toque na linha (ou o número, na Evolution) sai dela.
- Começo de palavra ("fis", "quim") e siglas continuam mostrando a lista quando servem para mais
  de um curso.

Fica de fora: trocar o curso depois da verificação. Quem gravou o curso errado pede à curadoria.

## A lista dos 43 cursos

Conferida em 2026-11-17 contra a oferta pública do Campus A. C. Simões no SiSU
(sisusimulator.com.br/ufal/campus-a-c-simoes). Os 41 cursos que entram pelo SiSU estão na lista,
com o mesmo nome (o SiSU escreve "Comunicação Social - Jornalismo" e "Comunicação Social - Relações
Públicas", que aqui ficam "Jornalismo" e "Relações Públicas"). Os dois que não aparecem no SiSU,
**Letras - Libras** e **Música**, têm ingresso por prova específica e continuam na lista.

Se a UFAL abrir ou fechar curso, a lista muda em `packages/db/src/cursos.ts` e o teste de contagem
em `packages/dominio/src/cursos.test.ts` acompanha.

## Como a lista e a busca foram montadas

Vieram da SDD da task, que saiu do repositório com a SCRUM-339.

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
