# SCRUM-251 · As fotos ficam sem storage até a T20

Dívida registrada · 2026-11-09 · @sthefanyblima
**Situação:** aceita. A demo vai sem foto; a escolha do storage fica para quando a T20 for feita.

## O que se descobriu ao investigar

O ticket descrevia o sintoma como "`S3_BUCKET_FOTOS` aponta para um bucket que não existe" e
oferecia duas saídas: um bucket S3-compatível de verdade (sem mexer em código) ou Azure Blob
Storage (mexendo). A investigação mostrou que **nenhuma das duas entrega foto hoje**:

- Não há `S3Client`, `@aws-sdk` nem nenhuma chamada de upload no repositório.
- O bot guarda apenas o `fotoMediaId` da Meta ([`handlers.ts`](../../apps/backend/src/bot/conversation/handlers.ts)).
  Ninguém baixa o arquivo da Meta nem o grava em lugar nenhum.
- O único código que menciona storage é a validação do ambiente
  ([`env.ts`](../../apps/backend/src/config/env.ts)), que exigia `AWS_REGION` e `S3_BUCKET_FOTOS`.

Ou seja: criar um bucket não destravaria a foto, porque falta quem faça o upload. O que existe de
verdade é uma exigência de configuração para uma funcionalidade que ainda não foi escrita — a T20.

## Decisão

1. **A demo vai sem foto.** Não é bloqueante para a apresentação.
2. **`AWS_REGION` e `S3_BUCKET_FOTOS` passam a ser opcionais** em `env.ts`. Quando a T20 entrar com
   o upload, voltam a ser obrigatórias junto com o código que as usa.
3. **A escolha entre S3-compatível e Azure Blob fica com a T20**, não com este ticket. Quem decidir
   terá o código do upload à frente e poderá medir o atrito de verdade; `S3_ENDPOINT` continua
   existindo e mantém a saída S3-compatível barata.

## Por quê

Variável obrigatória para funcionalidade inexistente obriga todo ambiente novo a inventar um valor
só para o processo subir. Foi assim que a homologação ficou com `lumens-fotos-pendente`, que **tem
cara de configuração e não é**. Valor de fachada é pior do que variável ausente: some o aviso e
fica o engano — quem abrir o `.env.producao` daqui a um mês vai ler um nome de bucket plausível e
concluir que o storage está configurado.

É o mesmo princípio aplicado na SCRUM-93, onde a homologação desligada virou aviso em vez de erro:
o sinal só serve enquanto significar alguma coisa.

## O que precisa ser feito fora do repositório

Na VM de homologação, apagar o valor de fachada do `.env.producao`:

```
AWS_REGION=
S3_BUCKET_FOTOS=
```

O back-end sobe com as duas vazias. Nenhum outro ajuste é necessário.

## Quando reabrir

Quando a T20 for priorizada. Aí a pergunta volta, com o código na frente: bucket S3-compatível
(sem mexer em código) ou Azure Blob (adaptando o que hoje não existe)?

## Nota sobre a conta

O entrave "quem mantém a conta e o servidor depois da disciplina", registrado na SCRUM-93, está
resolvido: a conta do Azure continua sendo da @sthefanyblima após o fim da disciplina.
