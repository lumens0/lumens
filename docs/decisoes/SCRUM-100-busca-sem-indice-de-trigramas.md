# SCRUM-100 · Busca de pautas parecidas por pontos, sem índice de trigramas

Decisão · registrada em 2026-11-17 a partir da SDD da SCRUM-100, removida na limpeza do
repositório · @sthefanyblima
**Situação:** em vigor.

## O que foi escolhido

A busca de pautas parecidas (`packages/dominio/src/pauta/pautas-parecidas.ts`) desviou de duas
coisas que a task pedia:

- **Sem índice de trigramas.** A task falava em `pg_trgm` para erro de digitação, e ele é usado,
  mas o índice GIN fica só no `tsvector` (`pautas.busca`). A comparação por trigramas usa
  `word_similarity()` por palavra do relato, que não usa índice, e a busca já roda só sobre as
  pautas abertas de um bloco (dezenas de linhas). Um índice `gin_trgm_ops` que o planejador nunca
  escolhe seria custo de escrita sem ganho. Não crie esse índice como se faltasse.
- **Pontos por palavra, não `ts_rank` somado com similaridade.** Cada termo do relato que bate no
  título vale 2, e na descrição vale 1; erro de digitação conta igual. O `ts_rank` só desempata.
  Somar `ts_rank` com similaridade dava um número sem unidade, difícil de calibrar e de explicar a
  quem revisa.

## Quando rever

Se a busca passar a rodar sobre muito mais pautas (todas as do campus, ou um histórico grande),
vale medir de novo antes de mexer: o índice só ajuda se a consulta mudar para um operador que o
use.
