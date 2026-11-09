# PLAN — SCRUM-101

## 1. Domínio: `criarPauta` (`packages/dominio/src/pauta.ts`)

Uma transação, quatro gravações: a pauta (`em_curadoria`, meta de `calcularMeta`, categoria
`a_classificar`), o papel `owner` do criador, o primeiro relato (texto da 2.5 ou a descrição, com a
`foto_chave`) e os eventos `pauta_criada` e `owner_entrou`. Os eventos não aparecem no site
enquanto a pauta está em curadoria: as views públicas só mostram pautas aprovadas.

Recusas voltam como resultado, como em `registrarApoio`: `titulo_vazio`, `titulo_longo`,
`descricao_vazia`, `descricao_longa`, `bloco_inexistente`, `estudante_nao_verificado`.

O slug vem do título sem acento, com os 8 primeiros caracteres do id da pauta no fim: dois títulos
iguais nunca colidem.

## 2. Bot: perguntas (`apps/backend/src/bot/conversation/nova-pauta.ts`)

- `entrarNaPautaNova`: a porta usada pelo menu e pela 2.5. Procura o estudante pelo `telefone_hmac`
  (o mesmo `hashPhone` da conversa). Sem estudante verificado → `VERIFY_ASK_EMAIL` com
  `pendingCommand: { kind: 'nova-pauta' }`.
- `newAskTitle`, `newAskPlace`, `newAskDescription`, `newAskPhoto`. Cada uma pode voltar a si
  mesma (novas transições em `steps.ts`).
- Título e descrição ficam cifrados nos dados da conversa (`segredoCom`, a mesma cifra do relato).
- No fim, o estudante é conferido de novo e `criarPauta` roda num savepoint da transação da
  conversa.
- As funções de blocos (lista, escolha, bloco citado) saíram de `relato.ts` para `blocos.ts`,
  usadas pela 2.5 e pela 2.6. `relato.ts` reexporta, sem mudança de comportamento.
- `StepContext` ganhou `phoneHmac` e `fotos` (opcional).

## 3. Foto (`apps/backend/src/fotos/`)

| arquivo         | papel                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| `meta-midia.ts` | `GET /{media-id}` → URL (5 min) → bytes; limite de 5 MB antes e depois  |
| `storage.ts`    | `PutObjectCommand` no `S3_BUCKET_FOTOS`; `S3_ENDPOINT` para R2/Supabase |
| `servico.ts`    | tipo → baixar → conferir o conteúdo → `removerMetadados` → guardar      |

`ServicoDeFotos` nunca lança: devolve `formato`, `tamanho`, `invalida` ou `indisponivel`, e o bot
transforma cada motivo numa mensagem. A chave é `fotos/AAAA/MM/<uuid>.jpg|png`, sem nada da pessoa.
Os erros registrados no log não levam o token nem a URL assinada.

Por que na hora e não numa fila: a pessoa ainda está na conversa e pode mandar outra foto. Numa
fila, a foto inválida seria descartada sem ninguém saber. O custo são alguns segundos a mais nesse
passo; o heartbeat do job (30 s) e o timeout de 10 s por chamada cobrem.

Nova dependência: `@aws-sdk/client-s3`, em commit próprio.

## Riscos

- **Foto sem dono.** A foto é guardada antes de a pauta ser criada. Se a criação for recusada logo
  depois (estudante saiu, bloco apagado), o arquivo fica no storage sem relato. É raro e o arquivo
  já está sem metadados; uma limpeza periódica do bucket resolve, se for preciso.
- **Retomada depois da verificação.** Até a 2.4 existir, quem não é verificado não cria pauta
  pela conversa. É o comportamento certo (RN01), mas bloqueia testes manuais no `pnpm dev`.
