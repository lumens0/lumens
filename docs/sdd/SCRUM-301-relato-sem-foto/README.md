# SCRUM-301 — Bug: relato se perde se a pessoa não termina o passo da foto

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-301](https://ic-team-pds.atlassian.net/browse/SCRUM-301) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `fix/SCRUM-301-relato-sem-foto`                                 |
| **Ref**    | história 2.7 (SCRUM-102, `apoio.ts`)                            |

## O problema

No apoio, o bot pedia o relato e depois a foto, mas só gravava o relato no fim do passo da foto
(foto ou "pular"). Se a pessoa mandasse outro comando ("menu", "cancelar", "apoiar outra-pauta"),
ou parasse de responder até a conversa expirar, o relato já escrito sumia sem aviso. O mesmo
acontecia com o relato da 2.5 juntado à pauta parecida ("sim").

## O que muda

```
SUPPORT_ASK_REPORT ──sim / relato escrito──▶ adicionarRelato (pendente, sem foto) ──▶ SUPPORT_ASK_PHOTO
                                                                   foto ──▶ anexarFotoAoRelato
                                                                'pular' ──▶ fica sem foto
```

- **O relato é gravado assim que a pessoa o confirma** ("sim") **ou escreve**, pendente e sem
  foto. A resposta já diz "Relato enviado para a moderação…" e só então pede a foto.
- **A foto vem depois e é juntada ao mesmo relato** (`anexarFotoAoRelato`, no domínio). A conversa
  guarda só o `relatoId`; o texto cifrado sai dela.
- **Sair do passo da foto de qualquer jeito** (pular, outro comando, "cancelar", "sair", conversa
  expirada) deixa o relato gravado sem foto. Não há nada a fazer na saída: o relato já está no
  banco.
- Relato recusado (pauta recusada, estudante saiu) não pede foto: avisa já e volta ao menu.

## Decisões

- **Gravar já, em vez de gravar ao sair.** "Ao sair" exigiria tratar cada saída (comandos globais,
  comandos do site, expiração da conversa, que é só uma linha apagada pela limpeza) e ainda
  perderia o relato se o job falhasse no meio. Gravando já, todas as saídas ficam cobertas sem
  código novo nelas.
- **"cancelar" não descarta o relato.** A pessoa já recebeu "Relato enviado para a moderação"
  antes do pedido da foto, então o "cancelar" ali cancela só a foto. Descartar exigiria apagar uma
  linha que a curadoria pode já estar vendo. O relato continua pendente, sem nome no site, e a
  curadoria pode recusá-lo. (A proposta da task permitia as duas coisas; ficamos com a mais
  simples e que não perde conteúdo.)
- **Foto só entra em relato ainda pendente.** A curadoria aprova o relato com o que ele tem; uma
  foto que chegasse depois da aprovação iria para o site sem ninguém ver. Se o relato já foi
  moderado, a foto não entra e a pessoa recebe "Não consegui juntar a foto: a curadoria já analisou
  o seu relato…". A condição vai no próprio `UPDATE`, então não corre com a moderação. Nesse caso
  raro, o arquivo da foto fica no storage sem relato.
- **Foto só de quem escreveu, e uma vez**: o `UPDATE` filtra por `estudante_id` e por
  `foto_chave IS NULL`.
- **Conversas em andamento no deploy**: quem já estava no passo da foto com o relato nos dados
  (formato antigo) segue como antes: o relato é gravado com a foto (ou sem, no "pular").
- No "pular" a resposta passa a ser "Tudo certo, o seu apoio já está contado.", porque o "Relato
  enviado" já foi dito.

## Testes

- `packages/dominio/src/pauta/relato.test.ts` (`anexarFotoAoRelato`): junta a foto e o relato
  continua pendente; relato moderado não recebe foto; não troca foto existente; só o autor junta.
- `apps/backend/src/bot/conversation/apoio.test.ts` (bloco SCRUM-301): relato gravado quando a
  foto é pedida e texto fora da conversa; "menu", "cancelar", "sair", "apoiar outra-pauta" e
  conversa expirada no passo da foto deixam o relato gravado sem foto; foto depois é juntada ao
  mesmo relato; relato moderado antes da foto; conversa no formato antigo.
