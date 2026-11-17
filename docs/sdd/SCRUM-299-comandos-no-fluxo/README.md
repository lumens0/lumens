# SCRUM-299 — Bug: "ajudar <palavra>" e botões de aviso no meio de um fluxo

|            |                                                                  |
| ---------- | ---------------------------------------------------------------- |
| **Ticket** | [SCRUM-299](https://ic-team-pds.atlassian.net/browse/SCRUM-299)  |
| **Dev**    | @eumarcosmendonca                                                |
| **Branch** | `fix/SCRUM-299-comandos-no-fluxo`                                |
| **Ref**    | comandos do site (2.8, 3.5), resposta da conferência (SCRUM-288) |

## O problema

1. **"ajudar <palavra>" apagava a conversa.** Os comandos do site valem em qualquer passo e largam o
   fluxo atual. O "apoiar" já só agia no meio de um fluxo quando o alvo era uma pauta que existe,
   mas o "ajudar" agia sempre. Quem escrevia "Ajudar calouros" como título de pauta nova (ou numa
   proposta, num relato) perdia o que tinha escrito e recebia "essa pauta não tem proposta aberta".
2. **Botão de aviso virava texto.** No WhatsApp, o toque num botão de aviso chega como texto
   (`tipo:aviso:índice`) e virava a resposta ao passo em aberto.

## O que muda

- **"ajudar"** (`comandos-do-site.ts`): o alvo só vale como comando se for um id (UUID) ou o
  endereço de uma pauta que existe. Fora disso, no meio de um fluxo, o texto segue para o passo
  como a resposta da pessoa. No começo da conversa e no menu, nada muda.
- **Botões de aviso**: resolvido pela SCRUM-288 (PR #154), que intercepta no router qualquer
  payload de aviso antes do passo: o da conferência é gravado, os outros recebem
  `AVISO_SEM_RESPOSTA_TEXT` (`conferencia.ts`). Esta task só acrescenta os testes de regressão
  em cada passo de texto livre.

## Decisões

- **Mesma regra do "apoiar"**: alvo que não é pauta, no meio de um fluxo, é texto da pessoa. Um
  endereço de pauta de verdade continua largando o fluxo, como o botão do site espera.
- **Sem segunda barreira para os botões**: a primeira versão deste PR criava uma barreira própria
  no router e no Telegram, que conflitava com a #154 (revisão da Sthefany). Ficou só a da #154.
  Esta branch é montada em cima da #154.

## Testes

`comandos-do-site.test.ts`, bloco SCRUM-299:

- em cada passo de texto livre (relato, título, descrição, proposta, relato do apoio), "Ajudar
  calouros" chega ao passo e os dados já escritos ficam;
- nos mesmos passos, `lembrete:<uuid>:1` não chega ao passo, recebe o aviso e passo e dados
  ficam como estavam;
- "ajudar <endereço de pauta>" no meio de um fluxo continua sendo o comando;
- o caso do bug de ponta a ponta: "Ajudar calouros" vira o título da pauta nova; o botão de aviso
  no título não vira título;
- botão do lembrete ao owner, no menu, recebe o aviso em vez de "Não entendi".
