# SCRUM-307 — Bot: casos menores de robustez

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-307](https://ic-team-pds.atlassian.net/browse/SCRUM-307) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `fix/SCRUM-307-robustez-do-bot`                                 |

| Item                                              | Situação                    | Teste de regressão                             |
| ------------------------------------------------- | --------------------------- | ---------------------------------------------- |
| 1. Código de verificação duas vezes no retry      | **aceito por ora** (abaixo) | —                                              |
| 2. Respostas fora de ordem                        | resolvido                   | `worker.test.ts` (chave, fila, desbloqueio)    |
| 3. Proposta que não decifra deixa a conversa muda | resolvido                   | `minhas-pautas.test.ts`                        |
| 4. Mídia no passo errado                          | resolvido                   | `resposta-oficial.test.ts`, `robustez.test.ts` |
| 5. "apoiar <endereço que não existe>" no fluxo    | resolvido                   | `robustez.test.ts`                             |

## 1. Código de verificação duas vezes no retry — aceito por ora

O envio do código acontece dentro da transação da mensagem. Se algo falha depois do envio e antes do
commit, o retry manda outro código, e o primeiro passa a dar "Código errado".

A correção proposta (job de e-mail enfileirado na mesma transação) muda três coisas, e por isso não
entrou aqui:

- **A resposta deixa de saber se o e-mail saiu.** Hoje, se o SMTP recusa, a pessoa recebe na hora
  "Não consegui enviar o código" e pode tentar de novo. Com o envio num job, o bot diria "enviei" antes
  de saber, e a falha só apareceria como e-mail que não chega.
- **O código precisaria ir no job**, guardado na fila (cifrado), além do hash na tabela.
- **É a mesma função que a SCRUM-298 (#155) reescreve** (`enviarCodigoNovo`, limites de 24 h). Mexer
  agora geraria conflito com um PR que ainda espera a #144 e a #159.

O caso é raro (queda entre o envio e o commit) e tem saída: o "reenviar" manda outro código, e o
último sempre vale. Proposta: fazer depois que a #155 entrar, numa task própria, decidindo antes o
que a pessoa vê quando o envio assíncrono falha.

## 2. Respostas em ordem por conversa

A fila de respostas passa a ser `key_strict_fifo` com a chave = `phoneHmac`, como a de entrada: uma
resposta que falha de forma passageira segura as seguintes da mesma conversa até o retry, mesmo com
várias instâncias.

- **Nome novo da fila** (`outgoing-replies-ordered`): a política de uma fila do pg-boss não muda
  depois de criada, e recriar a antiga exigiria que ela estivesse vazia no deploy. Com o servidor
  parado, nada a esvaziaria, e o servidor não subiria. A fila antiga (`outgoing-replies`) continua
  sendo consumida, só para entregar o que sobrou nela; nada novo entra. Pode ser apagada depois de
  vazia em produção.
- **Desbloqueio**: numa fila `key_strict_fifo`, um job que falhou de vez (a pessoa bloqueou o
  número, por exemplo) seguraria as próximas respostas daquela conversa para sempre.
  `desbloquearConversas` agora também olha a fila de respostas.

## 3. Proposta que não decifra

`PROPOSAL_ASK_PEOPLE` decifrava a proposta sem proteção: com a chave trocada ou o dado corrompido, o
job ia para a fila de mortas e o owner ficava sem resposta. Agora responde `PROPOSAL_LOST_TEXT` e
volta ao menu, como os outros passos.

## 4. Mídia no passo errado

- Foto no passo do PDF da resposta oficial: "Recebi uma foto, mas aqui preciso do arquivo PDF da
  resposta (não uma foto da tela ou do papel)…" (antes: "preciso de uma resposta em texto").
- Arquivo nos passos da foto (pauta nova e relato do apoio): "Recebi um arquivo, mas aqui preciso de
  uma foto. Mande a imagem como foto (não como documento), ou responda 'pular'." A conversa fica
  como estava.

## 5. Endereço de pauta que não existe no meio de um fluxo

Quando o alvo de "apoiar" ou "cuidar" tem a **forma de endereço do site** (minúsculas, números e
hífens, com pelo menos um hífen, como todo slug gerado) e a pauta não existe, o bot avisa
("Não encontrei essa pauta… Enquanto isso, a conversa continua de onde parou…") e a conversa fica
no passo, com os dados. Sem essa forma ("apoiar estudantes"), o texto segue para o passo como
resposta, como antes.

- **Não repete a pergunta do passo**: o bot não guarda o texto da pergunta de cada passo, e montar
  isso só para este caso seria grande. O aviso diz para responder à última pergunta.
- **"ajudar"**: a SCRUM-299 (#163) muda o "ajudar" no meio de um fluxo para seguir a regra do
  "apoiar". Quando as duas estiverem na `main`, o "ajudar" com endereço que não existe pode usar o
  mesmo aviso (uma linha).
