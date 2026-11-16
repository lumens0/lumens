# SCRUM-311 — Rotação da chave de cifra: conversas em andamento e filas

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-311](https://ic-team-pds.atlassian.net/browse/SCRUM-311) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `fix/SCRUM-311-rotacao-e-conversas`                             |
| **Ref**    | SCRUM-90 (rotação), SCRUM-307 (proposta que não decifra)        |

## O problema

A rotação da `CHAVE_CIFRA` (`cripto/rotacao.ts`) recifrava só três colunas. Duas outras coisas
guardam dado cifrado com a mesma chave e ficavam com a antiga:

- **`conversa.dados`**: título e descrição da pauta nova, relato, proposta, e-mail da verificação e
  o menu em texto. Depois da troca, quem estava no meio de um fluxo perdia o que tinha escrito, e o
  passo da proposta travava.
- **Os jobs do bot no pg-boss** já encerrados e nas filas de mortas: ninguém lia, mas continuavam no
  banco cifrados com a chave antiga.

## O que muda

Na mesma transação da rotação:

1. **Recusa com job pendente** do bot (`FilaComJobsPendentesError`, com quantos são), sem mudar
   nada. Era o passo 1 do roteiro; agora o script também confere (a proposta opcional 3 da task).
2. **Apaga os jobs encerrados e as filas de mortas** do bot (`incoming-message*`,
   `outgoing-replies*`). Os de outras filas (agendador, limpeza) não levam dado cifrado e ficam.
3. **Recifra as conversas em andamento**: todo valor de `conversa.dados` (inclusive dentro de objetos
   e listas) que decifra com a chave antiga é recifrado com a nova. O resto fica igual.

O script mostra quantas conversas foram recifradas e quantos jobs foram apagados. O roteiro
(`docs/operacao/chaves.md`) lista todos os campos cifrados de `conversa.dados`.

## Decisões

- **Recifrar as conversas em vez de apagá-las** (a proposta 1 da task permitia apagar). Apagar fazia
  quem estava no meio de uma pauta nova, de um relato ou de uma proposta perder o que escreveu; com a
  recifra, a pessoa continua de onde parou. O custo é o mesmo laço que já recifra estudantes.
- **Sem lista fixa de campos.** Um valor que decifra com a chave antiga é dado cifrado: o AES-GCM
  confere a autenticidade, e um texto comum nunca passa. Assim, o campo cifrado de um fluxo novo
  entra sem mudar o script. A lista no roteiro é para quem opera saber o que está ali.
- **As filas de mortas são apagadas pelo script.** O roteiro já mandava apagá-las se ninguém
  precisasse investigar; agora isso é garantido. Quem precisar investigar faz antes de rodar.
- **Pendente nas filas de mortas não conta como pendente**: nenhum consumidor lê essas filas, e os
  jobs delas ficam em `created` para sempre.

## Testes

`cripto/rotacao.test.ts`, bloco SCRUM-311:

- recifra os campos cifrados de `conversa.dados`, de qualquer nome, e deixa o resto igual;
- depois da rotação, nenhuma conversa guarda dado que decifre com a chave antiga;
- com job do bot pendente, recusa e não muda nada;
- apaga os jobs encerrados e os das filas de mortas; os de outras filas ficam.
