# SCRUM-330 · Storage das fotos e dos PDFs num MinIO dentro da VM

Decisão · 2026-11-17 · @sthefanyblima
**Substitui:** [SCRUM-251](SCRUM-251-fotos-sem-storage.md), que deixava o bucket de fachada
`lumens-fotos-pendente` até existir um storage.

## Contexto

A homologação seguia com `S3_BUCKET_FOTOS=lumens-fotos-pendente` e `S3_ENDPOINT` vazio. Toda
foto de pauta nova ou de relato falhava no `PutObject`, e o PDF da resposta oficial (3.6) também.
Sem o PDF, o fluxo da resposta não fecha: a curadoria não tem o que ler e quem apoiou não recebe a
resposta. E o bot dizia "não consegui baixar a foto agora", então a pessoa mandava de novo, sem
fim.

## Decisão

**Um MinIO no `docker-compose.prod.yml`**, na mesma VM, em vez de um serviço S3 de fora (R2,
Supabase). O código não muda: o back-end e o painel já falam S3 e usam `forcePathStyle` quando
`S3_ENDPOINT` está preenchido.

- **Perfil próprio (`minio`)**, ligado pelo deploy quando o `.env.producao` tem
  `S3_ENDPOINT=http://minio:9000`. Sem porta publicada e com o console web desligado: só o
  back-end e o painel o alcançam, pela rede interna do compose.
- **Volume `lumens-arquivos`**, incluído no backup diário (espelho do bucket, em
  [backup](../operacao/backup.md)).
- **O bucket e o usuário são criados no deploy** pelo serviço `minio-preparar`
  (`scripts/minio/preparar-bucket.sh`), sempre, de forma idempotente.
- **Dois níveis de credencial, como no banco.** O root do MinIO fica num arquivo só dele, o
  `.env.producao.minio`, que só o `minio` e o `minio-preparar` recebem. O back-end e o painel usam
  um usuário do Lumens que só lê, grava, apaga e lista objetos no bucket das fotos: não cria
  bucket, não administra, não vê outro bucket. Bucket privado, sem leitura anônima. Listar entra
  porque, sem isso, a chave inexistente responde "Access Denied" e o painel daria 500 em vez de
  404 para a foto já apagada.

### A imagem

A MinIO parou de publicar as imagens oficiais (`minio/minio` e `minio/mc` não existem mais no
Docker Hub, e o `quay.io` pede login). Usamos `pgsty/minio`, build da comunidade (Pigsty) do mesmo
servidor de código AGPL, fixado por tag e digest (`RELEASE.2026-08-04T00-00-00Z`). A mesma imagem
traz o `mc`, então o `minio-preparar` não precisa de outra.

| Alternativa                      | Por que não                                                         |
| -------------------------------- | ------------------------------------------------------------------- |
| `bitnamilegacy/minio`            | Congelada, sem atualização de segurança                             |
| Garage, SeaweedFS                | Outro servidor, com configuração e comandos diferentes              |
| R2, Supabase                     | Mais uma conta e mais um segredo fora da VM, para um volume pequeno |
| Azure Blob Storage               | O código fala S3: exigiria outro cliente no back-end e no painel    |
| `cgr.dev/chainguard/minio` livre | Só a tag `latest`, sem fixar versão                                 |

Ao atualizar a imagem, troque tag e digest juntos, nos dois serviços.

## O que a pessoa vê quando o storage falha

A falha do storage ganhou motivo próprio (`armazenamento`), separado do download
(`indisponivel`). Na foto, o bot diz que o envio de fotos está fora do ar e sugere `pular`, sem
pedir outra foto, que falharia igual. No PDF, diz que não conseguiu guardar o arquivo e sugere
tentar mais tarde. O texto do download continua igual.

## Fora daqui

- **Cópia fora da VM.** O espelho do bucket fica no mesmo disco, como o dump do banco. Vale a
  mesma limitação registrada em [backup](../operacao/backup.md).
- **Os critérios de aceite na homologação** (foto gravada e visível na moderação, PDF aberto no
  painel) só se conferem na VM, depois do deploy.
