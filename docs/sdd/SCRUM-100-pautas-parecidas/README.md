# SCRUM-100 — [2.5] Relatar e ver se já existe pauta parecida

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-100](https://ic-team-pds.atlassian.net/browse/SCRUM-100) |
| **Branch** | `feat/SCRUM-100-pautas-parecidas`                               |
| **Ref**    | RF-B01, RF-B02 · história 2.5 · tamanho G                       |

## Documentos

| Arquivo                | O que contém                                                     |
| ---------------------- | ---------------------------------------------------------------- |
| [`SPEC.md`](SPEC.md)   | Comportamento, critérios de aceitação e o que ficou fora.        |
| [`PLAN.md`](PLAN.md)   | Busca (pontuação, limiares), conversa, decisões e riscos.        |
| [`TESTS.md`](TESTS.md) | O que os testes exercitam, a calibração e as lacunas conhecidas. |

## Desvios da descrição da task

- **Índice do `pg_trgm`.** A task fala em `pg_trgm` para erro de digitação; o índice GIN ficou só
  no `tsvector`. A comparação por trigramas usa `word_similarity()` por palavra do relato, que não
  usa índice, e a busca já roda só sobre as pautas abertas de um bloco (dezenas de linhas). Um
  índice de trigramas que o planejador nunca escolhe seria custo de escrita sem ganho.
- **Ordenação.** "Top 3 por ts_rank + similaridade" virou pontos por palavra (título vale 2,
  descrição 1, erro de digitação conta igual) com `ts_rank` só no desempate. Somar `ts_rank` com
  similaridade dava um número sem unidade, difícil de calibrar e de explicar para quem revisa.

## Dívida técnica aceita

- O apoio ao escolher "É essa" é da 2.7: o handler responde um placeholder e tem um `TODO(2.7)`
  no lugar exato onde `registrarApoio` deve entrar, na mesma transação da conversa.
- A calibração usa 28 relatos escritos para imitar o WhatsApp, não relatos reais
  coletados. Ver [TESTS.md](TESTS.md#calibração).
