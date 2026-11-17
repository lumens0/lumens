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
