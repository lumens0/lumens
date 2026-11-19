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
| `csau`                                                                    |                                    1.500 | estimativa mantida: é o prédio que abriga cursos de várias unidades (FANUT, FOUFAL e outros), e o relatório não diz quantos estudantes usam o prédio |
| `biblioteca-central`, `ru`, `bloco-18`, `bloco-07`, `bloco-13`, `ginasio` | 7.000, 6.000, 2.000, 2.000, 1.500, 1.000 | estimativa mantida: espaços compartilhados, uma fração dos ~15 mil estudantes do campus                                                              |

## Dúvidas de enquadramento

A divisão dos cursos entre unidades segue o que a equipe conhece do campus, e alguns casos merecem
conferência de quem é da unidade:

- **Artes (Dança, Teatro e Música)** foram para o `ichca` (Instituto de Ciências Humanas,
  Comunicação e Artes). Se algum deles for de outra unidade, o `ichca` cai (até 362 estudantes) e a
  outra sobe.
- **Design** foi para a `fau`; **Biblioteconomia** para o `ichca`.
- **Ficaram de fora**, por serem do CECA (Rio Largo) ou terem unidade incerta: Agronomia,
  Agroecologia, Zootecnia, Medicina Veterinária, Engenharia Florestal, Engenharia de Energia e
  Engenharia de Agrimensura. Se Energia ou Agrimensura forem do CTEC, some 207 e 117 ao `ctec`.
- **Inteligência Artificial** (curso novo, depois de 2020) não está no relatório; entra no `ic`
  quando houver número.

## Como as bases chegam ao banco

- Banco novo: `pnpm db:blocos-ufal` cadastra o catálogo com estes números.
- Banco já semeado: a migração `0030_bases_reais_dos_blocos` troca a base antiga pela nova **só onde
  ela ainda tem a estimativa antiga** do catálogo. Base ajustada à mão não é tocada. Pauta já criada
  não muda (a meta congela na criação); só as pautas novas usam a base nova.

## Como atualizar

Quando houver relatório mais recente (peça ao NTI/PROGRAD o mesmo "alunos ativos por campus, curso e
período"), some de novo por unidade, atualize o catálogo e crie uma migração que troque a base antiga
pela nova, como a 0030.
