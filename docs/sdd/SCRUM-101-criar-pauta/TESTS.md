# TESTS — SCRUM-101

Nenhum teste chama a Meta nem o storage de verdade: a rede fica atrás de `fetch` e de um cliente
S3 falsos, e o bot recebe um `ServicoDeFotos` falso.

| arquivo                                         | o quê                                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/dominio/src/pauta/pauta.test.ts`      | pauta em curadoria com meta congelada (bloco e campus), owner, primeiro relato com foto, eventos, cada recusa sem gravar nada, 80 caracteres com acento e emoji, slugs                            |
| `apps/backend/.../nova-pauta.test.ts`           | porta de verificação (menu e 2.5), fluxo completo, cada validação, bloco digitado, foto guardada no relato, cada motivo de recusa da foto, cifra na conversa, estudante e bloco que somem no meio |
| `apps/backend/src/fotos/meta-midia.test.ts`     | as duas chamadas com o token, limite de 5 MB antes e depois do download, falhas sem o token na mensagem, id codificado na URL                                                                     |
| `apps/backend/src/fotos/servico.test.ts`        | fotos geradas com GPS e dados do aparelho saem sem EXIF; GIF recusado sem baixar; WebP disfarçado de JPEG; arquivo que não é imagem; Meta e storage fora do ar                                    |
| `apps/backend/src/fotos/storage.test.ts`        | bucket, chave, corpo e tipo do `PutObjectCommand`                                                                                                                                                 |
| `conversation`, `relato` e `worker` (ajustados) | os testes que mandavam "2" no menu passam a ter um estudante verificado                                                                                                                           |

## Lacunas conhecidas

- O download da Meta e o envio ao storage não foram exercitados contra os serviços reais: falta um
  token de app e o bucket (T20).
- A retomada do pedido depois da verificação é testada em `verificacao.test.ts` (SCRUM-138).
- Os testes do relato e da pauta nova têm 60 s de preparação: no Windows, com os testes em
  paralelo, o banco em memória passou de 20 s.
