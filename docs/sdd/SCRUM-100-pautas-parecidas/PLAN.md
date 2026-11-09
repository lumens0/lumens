# PLAN — SCRUM-100

## Banco (migração 0007)

- Extensões `unaccent` e `pg_trgm`. As duas são _trusted_ desde o PostgreSQL 13 e existem no RDS;
  no PGlite dos testes vêm por `@electric-sql/pglite/contrib`.
- Configuração de busca `public.portugues_sem_acento`: cópia de `portuguese` com `unaccent` antes
  do stemmer. Quase ninguém acentua no WhatsApp; com a `portuguese` pura, "iluminacao" não acha
  "Iluminação".
- `pauta.busca` recriada: título com peso A, descrição com peso B. A coluna é gerada, então o
  upgrade recalcula as pautas existentes sozinho. O índice GIN é recriado junto.
- `normalizar_busca(text)`: minúsculas, sem acento e sem hífen ("Wi-Fi" → "wifi"), `IMMUTABLE`,
  para a comparação por trigramas.

## Busca (`@lumens/dominio`, `pautas-parecidas.ts`)

O relato vira termos: sem acento, sem palavra comum (lista própria, sem acento, com a escrita de
WhatsApp e palavras de qualquer relato do campus como "sala" e "aula"), sem número, sem as palavras
do nome do bloco escolhido e no máximo 12. Cada termo dá pontos a cada pauta:

| onde aparece                                         | pontos |
| ---------------------------------------------------- | -----: |
| título (radical, `busca @@ 'termo:A'`)               |      2 |
| título com erro de digitação (`word_similarity` 0,6) |      2 |
| descrição (radical)                                  |      1 |
| descrição com erro de digitação                      |      1 |

Ordem: pontos, pauta do bloco antes da do campus, `ts_rank`, mais recente. Entra quem tem pelo
menos 1 ponto e pelo menos metade dos pontos da primeira.

Por que pontos e não `ts_rank` com limiar: o `ts_rank` de uma consulta com OU depende do tamanho do
relato e da pauta, e um limiar nele não se explica. Pontos por palavra se calibram olhando o caso
que falhou.

Por que a lista própria de palavras comuns: a do Snowball é acentuada ("não", "também"); com o
`unaccent` antes do stemmer, "nao" e "tambem" escapam dela e casam com toda pauta que tem "não".

## Conversa (`apps/backend`, `bot/conversation/relato.ts`)

- `StepContext` ganhou `db` (a transação da mensagem) e `segredo` (cifra com a `CHAVE_CIFRA`).
- O relato fica em `conversa.dados.relatoCifrado`, cifrado. Junto ficam `blocoId` e `parecidas`
  (id, título e descrição, dados públicos), para validar a escolha e reenviar a lista.
- As respostas passaram de `string[]` para `Resposta[]` (texto ou `MensagemDeLista`). `lista()`
  corta os textos nos limites da Meta, porque passar de um deles faz a Meta recusar a mensagem.
- Os três passos do relato podem voltar a si mesmos (`TRANSITIONS`), para repetir a pergunta.

## Riscos

- **Extensões em produção.** O papel que roda `db:migrate` precisa poder criar extensão (dono do
  banco ou `rds_superuser`). Vale conferir na T20.
- **Lista de palavras comuns.** Uma palavra útil na lista some da busca. Por isso a lista é curta e
  qualquer mudança passa pelos testes de calibração.
- **Limiares.** 0,6 de similaridade e "metade dos pontos" saíram de 23 relatos. Com relatos reais,
  podem precisar de ajuste.
