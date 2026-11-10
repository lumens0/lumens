# SCRUM-251 · O envio de foto está quebrado até existir um bucket

Dívida registrada · 2026-11-09 · @sthefanyblima
**Situação:** aceita se a demo for sem foto. Precisa de decisão se a demo tiver foto.

## Estado real

A T20 está pronta e funcionando: `apps/backend/src/fotos/` baixa a mídia da Meta, confere o tipo,
remove os metadados (EXIF, GPS) e grava no bucket; `main.ts` monta o serviço com
`criarStorageS3`. O que falta é só o bucket.

A SCRUM-93 saiu da AWS — a conta gratuita bloqueia EC2 por service control policy e a homologação
foi para uma VM no Azure —, então o bucket previsto deixou de existir. Como `AWS_REGION` e
`S3_BUCKET_FOTOS` são obrigatórias em `env.ts`, o `.env.producao` da homologação está com o valor
de fachada `lumens-fotos-pendente`, só para o back-end iniciar.

## O que a pessoa vê hoje, na homologação

O `PutObject` falha, `criarServicoDeFotos` devolve `indisponivel` e o bot responde:

> Não consegui usar essa foto: não consegui baixar a foto agora. Envie outra foto ou responda 'pular'.

Duas coisas a notar:

1. **Não quebra o fluxo.** A pessoa continua no passo da foto e segue com `pular`. A pauta é criada
   sem foto; nada mais é afetado.
2. **A mensagem culpa o download, e o que falhou foi o storage.** Quem mandar outra foto vai ver o
   mesmo texto de novo, para sempre. Numa demonstração ao vivo isso parece bot quebrado, não
   funcionalidade desligada.

## Decisão

**A demo vai sem foto.** O envio de foto não é demonstrado; quem testar deve responder `pular`.

`AWS_REGION` e `S3_BUCKET_FOTOS` **continuam obrigatórias**. O `env.ts` existe justamente para
falhar na inicialização, com o nome do que falta, em vez de a variável vazia aparecer no meio de
uma conversa do bot — e, com a T20 pronta, esse raciocínio vale inteiro. O valor de fachada
`lumens-fotos-pendente` fica, e esta página é o registro de que ele é fachada.

## As saídas, quando a foto for necessária

| Saída                                                  | Mexe em código? | Observação                                                                   |
| ------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------- |
| Bucket em provedor S3-compatível (R2, Supabase, MinIO) | Não             | `S3_ENDPOINT` já existe e o `criarStorageS3` já usa `forcePathStyle` com ele |
| Bucket S3 de verdade na AWS                            | Não             | Depende de a conta permitir                                                  |
| Azure Blob Storage                                     | Sim             | Aproveita a conta que já usamos; o código hoje fala S3                       |

A primeira é a de menor atrito e é a única que vale considerar antes da apresentação: preencher
`AWS_REGION`, `S3_BUCKET_FOTOS` e `S3_ENDPOINT` no `.env.producao` e reiniciar o back-end.

## Dívida menor, anotada de passagem

Se a decisão mudar e a foto entrar na demo, vale corrigir o texto de `indisponivel` em
`nova-pauta.ts`: ele atribui ao download uma falha que também acontece no storage. Fora do escopo
deste ticket.

## Nota sobre a conta

O entrave "quem mantém a conta e o servidor depois da disciplina", registrado na SCRUM-93, está
resolvido: a conta do Azure continua sendo da @sthefanyblima após o fim da disciplina.
