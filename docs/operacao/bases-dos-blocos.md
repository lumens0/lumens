# Bases de estudantes dos blocos

A `base_estudantes` de cada bloco define a meta das pautas dele (`calcularMeta`, RN04): a meta
congela na criação da pauta. Este documento diz de onde vêm os números do catálogo
(`packages/db/seed/blocos-ufal.ts`), o que ficou de fora e como atualizar.

## Fonte

**UFAL · Núcleo de Tecnologia de Informação (NTI), "Quantitativo de alunos ativos por campus, curso e
período"**, gerado pelo SIE Web em **10/06/2020**, publicado no Acesso à Informação da UFAL:
<https://acessoainformacao.ufal.br/perguntas-frequentes/alunosativosquantitativoporcampuscursoperiodo.pdf>.

- Critério do relatório: alunos sem evasão (matriculados ou não) no período, de cursos semestrais,
  sem matrícula isolada e sem mobilidade acadêmica temporária.
- Usei o **período 2020.1** (o último do relatório), só **graduação presencial do campus de Maceió**
  (bacharelado e licenciatura). Pós-graduação, cursos técnicos, EAD e especializações ficam de fora.
- É o dado oficial por curso mais recente que a UFAL publica nesse formato. Fica a ressalva: tem mais
  de cinco anos. A UFAL informou 19,6 mil alunos ativos em 2025.1 (todos os campi), então a matrícula
  de hoje é parecida ou um pouco maior.

## Como cada bloco foi somado (alunos ativos em 2020.1)

| Bloco    | Cursos somados                                                                                          | Total |
| -------- | ------------------------------------------------------------------------------------------------------- | ----: |
| `ic`     | Ciência da Computação 321 · Engenharia de Computação 264                                                |   585 |
| `im`     | Matemática: bacharelado 60 · licenciatura diurno 121 · licenciatura noturno 276                         |   457 |
| `if`     | Física: bacharelado 93 · licenciatura 135                                                               |   228 |
| `iqb`    | Química: bacharelado 114 · licenciatura diurno 143 · noturno 261 · Química Tecnológica e Industrial 180 |   698 |
| `icbs`   | Ciências Biológicas: bacharelado 256 · licenciatura diurno 118 · noturno 261                            |   635 |
| `famed`  | Medicina                                                                                                |   537 |
| `fanut`  | Nutrição                                                                                                |   300 |
| `eenf`   | Enfermagem                                                                                              |   285 |
| `foufal` | Odontologia                                                                                             |   282 |
| `icf`    | Farmácia                                                                                                |   276 |
| `ctec`   | Engenharia Civil 373 · Química 341 · Petróleo 168 · Ambiental e Sanitária 137                           | 1.019 |
| `fau`    | Arquitetura e Urbanismo 426 · Design 310                                                                |   736 |
| `fda`    | Direito: diurno 533 · noturno 290                                                                       |   823 |
| `feac`   | Administração 245+492 · Ciências Contábeis 217+532 · Ciências Econômicas 163+210                        | 1.859 |
| `fale`   | Letras: Espanhol, Francês, Inglês, Português e Libras                                                   |   883 |
| `fsso`   | Serviço Social: diurno 262 · noturno 321                                                                |   583 |
| `ics`    | Ciências Sociais: bacharelado 147 · licenciatura 229                                                    |   376 |
| `ichca`  | História, Filosofia, Jornalismo, Relações Públicas, Biblioteconomia, Dança, Teatro e Música             | 2.046 |
| `icat`   | Meteorologia                                                                                            |   178 |
| `igdema` | Geografia: bacharelado 131+143 · licenciatura 177+184                                                   |   635 |
| `ip`     | Psicologia                                                                                              |   390 |
| `cedu`   | Pedagogia: diurno 701 · noturno 438                                                                     | 1.139 |
| `iefe`   | Educação Física: bacharelado 74+237 · licenciatura 327                                                  |   638 |

A soma dos cursos acima é de **15.588** estudantes de graduação presencial no campus.

## O que não vem desse relatório (continua estimativa ou número informado)

| Bloco                                                                     |                                     Base | Origem                                                                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `residencia-universitaria`                                                |                                      135 | "Atualmente a RUA tem capacidade para atender até 135 estudantes" (site da UFAL, página da Residência Universitária)                                 |
| `edge-academy`                                                            |                                      100 | informado pela equipe                                                                                                                                |
| `nees`                                                                    |                                      100 | sem número oficial: o mesmo da EDGE Academy                                                                                                          |
| `crad`                                                                    |                                       50 | não é bloco estudantil: estimativa baixa                                                                                                             |
| `cepetec`                                                                 |                                      100 | extensão do IC, atrás dele: estimativa da equipe, sem número oficial                                                                                 |
| `cos`                                                                     |                                      400 | Comunicação Social, ao lado do IC: estimativa da equipe (Jornalismo e Relações Públicas já entram na conta do `ichca`)                               |
| `csau`                                                                    |                                    1.500 | estimativa mantida: é o prédio que abriga cursos de várias unidades (FANUT, FOUFAL e outros), e o relatório não diz quantos estudantes usam o prédio |
| `biblioteca-central`, `ru`, `bloco-18`, `bloco-07`, `bloco-13`, `ginasio` | 7.000, 6.000, 2.000, 2.000, 1.500, 1.000 | estimativa mantida: espaços compartilhados, uma fração dos ~15 mil estudantes do campus                                                              |

## Dúvidas de enquadramento

**Conferido em 24/11/2026** na lista oficial "Consulta de Cursos — Graduação" do SIGAA da UFAL
(<https://sigaa.sig.ufal.br/sigaa/public/curso/lista.jsf?nivel=G&aba=p-graduacao>), que agrupa cada
curso pela unidade que o coordena. Os 43 cursos de `CURSOS` caem na unidade em que aparecem aqui e em
`packages/db/src/cursos-dos-blocos.ts`, sem divergência:

- **Artes (Dança, Teatro e Música)**, **Biblioteconomia**, **Jornalismo** e **Relações Públicas**
  são do `ichca`; **Design** é da `fau`; **Engenharia Química** é do `ctec`; **Inteligência
  Artificial** é do `ic`; **Letras - Libras** é da `fale`.
- **Ficaram de fora**, por serem de outro campus: Agronomia, Agroecologia, Zootecnia, Medicina
  Veterinária, Engenharia Florestal, Engenharia Elétrica, **Engenharia de Energia** e **Engenharia
  de Agrimensura** são do CECA (Rio Largo), não do CTEC. A hipótese antiga de somar Energia e
  Agrimensura ao `ctec` não procede.
- **O que o SIGAA não diz**, e continua decisão da equipe: o `cepetec` (extensão do IC), o `cos` (o
  prédio da Comunicação Social, cujos cursos são do ICHCA), o `csau` (aberto) e os espaços
  compartilhados. O SIGAA agrupa por unidade acadêmica, não pelo prédio onde as aulas acontecem.
- A lista também traz cursos de Arapiraca, Sertão e Rio Largo com o mesmo nome de cursos de Maceió
  (por exemplo, Ciência da Computação em Arapiraca). A verificação não pergunta o campus, então
  quem é de outro campus e escolhe o mesmo curso conta como do bloco de Maceió.
- Em **Inteligência Artificial** (curso novo) falta o número de alunos para a base do `ic`.

## Quem apoia e abre pauta em cada bloco (SCRUM-399)

A meta é 10% da base do bloco, e a base é a soma dos cursos da unidade. Para essa conta valer, **só
estudante de um dos cursos do bloco apoia a pauta dele e abre pauta nele**. O vínculo está na tabela
`bloco_curso` (mesma divisão da tabela de bases acima), escrita em
`packages/db/src/cursos-dos-blocos.ts` e levada ao banco pela migração `0033_bloco_curso` e pelo
`db:blocos-ufal`.

- **Bloco com cursos** (IC, IM, IF, IQB, ICBS, FAMED, FANUT, EENF, FOUFAL, ICF, CTEC, FAU, FDA, FEAC,
  FALE, FSSO, ICS, ICHCA, ICAT, IGDEMA, IP, CEDU, IEFE, CEPETEC e COS): o apoio de quem é de outro
  curso volta como `fora_do_bloco`, e o bot avisa. Quem não tem curso cadastrado também não apoia.
- **Bloco sem cursos** (Biblioteca Central, RU, Blocos 07, 13 e 18, Ginásio, Residência
  Universitária, CRAD e **CSAU**, que abriga cursos de várias unidades): qualquer
  estudante verificado, como antes. **Todo o campus** também continua aberto.
- Apoio que já existia antes da trava continua valendo; pauta já criada não muda.
- O bot avisa cedo, na escolha do bloco da pauta nova. Quem escolheu outro bloco ou _Todo o campus_
  segue normalmente.

- **Subblocos do IC:** o CEPETEC é o subbloco de pesquisa do IC; o EDGE Academy e o NEES (RIEH) são
  laboratórios fechados cuja base de alunos são os do IC (Ciência da Computação, Engenharia de
  Computação e Inteligência Artificial). Em `SUBBLOCOS` (`packages/db/src/cursos-dos-blocos.ts`),
  aceitam tudo o que o IC aceita. A base de cada um (100, 100 e 100, estimativas da equipe) não
  acompanha a do IC; é uma decisão à parte.
- **Cursos com aula em outro bloco:** quem tem aula num bloco de outra unidade pode apoiar nele. A
  regra é direcional e está em `AULAS_EM_OUTROS_BLOCOS` (`packages/db/src/cursos-dos-blocos.ts`):
  hoje, Ciência da Computação, Engenharia de Computação e Inteligência Artificial têm aula no **IM**
  (o antigo Bloco 12, ligado ao IC), então o IM os aceita; o IC não passa a aceitar Matemática. Fonte:
  um aluno de Ciência da Computação (a lista pública de turmas do SIGAA não foi consultada por
  completo). Para acrescentar um caso, escreva o bloco e os cursos e crie uma migração como a
  `0036_blocos_coligados`. A meta de cada bloco segue a base da própria unidade.

Para mudar quem entra em um bloco: edite `CURSOS_DOS_BLOCOS` e crie uma migração que ajuste
`bloco_curso`, como a 0033. Bloco sem linha nessa tabela fica aberto.

## Como as bases chegam ao banco

- Banco novo: `pnpm db:blocos-ufal` cadastra o catálogo com estes números.
- Banco já semeado: a migração `0030_bases_reais_dos_blocos` troca a base antiga pela nova **só onde
  ela ainda tem a estimativa antiga** do catálogo. Base ajustada à mão não é tocada. Pauta já criada
  não muda (a meta congela na criação); só as pautas novas usam a base nova.

## Como atualizar

Quando houver relatório mais recente (peça ao NTI/PROGRAD o mesmo "alunos ativos por campus, curso e
período"), some de novo por unidade, atualize o catálogo e crie uma migração que troque a base antiga
pela nova, como a 0030.
