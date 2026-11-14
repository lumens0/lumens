# Documentação do Lumens

Cada pasta responde a uma pergunta. Comece pelo [README da raiz](../README.md) para a visão geral.

| Pasta                                 | Pergunta que responde                           |
| ------------------------------------- | ----------------------------------------------- |
| [`desenvolvimento/`](desenvolvimento) | Como trabalho no código na minha máquina?       |
| [`arquitetura/`](arquitetura)         | Quais são os contratos entre as partes?         |
| [`operacao/`](operacao)               | Como a homologação roda, e o que fazer se cair? |
| [`meta/`](meta)                       | Como o Lumens se liga ao WhatsApp da Meta?      |
| [`decisoes/`](decisoes)               | Por que escolhemos assim?                       |
| [`sdd/`](sdd)                         | Especificação, plano e testes de cada história  |

## Desenvolvimento

- [Como rodar o Lumens local](desenvolvimento/rodar-local.md): do clone ao servidor respondendo.
- [Como criar uma migração](desenvolvimento/migracoes.md): mudar o banco sem quebrar o de ninguém.
- [Simulador do bot](../apps/backend/SIMULADOR.md): testar o webhook sem celular nem conta Meta.

## Arquitetura

- [API de leitura pública](arquitetura/api.md): rotas, campos e exemplos que o site consome.
- [Contrato do banco](arquitetura/banco.md): diagrama ER, campos e status.
- [Esquema e contratos](arquitetura/esquema-e-contratos.md): catálogo de eventos (T7) e transições.
- [`@lumens/db`](../packages/db/README.md): papéis, views públicas e seed.
- [`@lumens/dominio`](../packages/dominio/README.md): as regras de negócio e como criar uma nova.

## Operação

- [Homologação](operacao/homologacao.md): a VM, o Caddy, os secrets e o deploy.
- [Backup do banco](operacao/backup.md): backup diário, teste de restauração e incidentes.
- [Chaves de criptografia](operacao/chaves.md): gerar, rotacionar e o que fazer se vazar.
- [Canal da Evolution](operacao/evolution.md): WhatsApp não oficial, pareamento e troca de chip.

## Meta (WhatsApp)

- [Mensagens modelo](meta/mensagens-modelo.md): os modelos submetidos e a situação de cada um.
- [Validação do webhook](meta/webhook-validacao.md): o roteiro e as evidências da SCRUM-97.

## Decisões

Registro das decisões, uma por arquivo com a chave do Jira: veja o [índice](decisoes/README.md).

## SDD

Uma pasta por história, `SCRUM-<n>-descricao`, com `SPEC.md`, `PLAN.md`, `TESTS.md` e um
`README.md` de entrada. São o registro do que foi combinado na época: o código e as páginas acima
mandam quando os dois divergem.
