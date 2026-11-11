# SCRUM-161 · Onde mora o tratamento das fotos

Decisão de arquitetura · 2026-11-10 · @sthefanyblima
**Situação:** decidido. O critério da subtarefa passa a ser o módulo `apps/backend/src/fotos/`.

## A pergunta

A subtarefa pedia a remoção de metadados "num pacote compartilhado". Vale criar um pacote em
`packages/` só para isso?

## O que existe hoje

Levantado na `main` em 2026-11-10:

| Quem                                   | Usa o tratamento de fotos?                                                  |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `apps/backend` (bot, pauta nova)       | Sim: `criarServicoDeFotos` em `main.ts`, chamado pelo passo da foto.        |
| `apps/site`                            | Não. Só monta a URL pública da foto já limpa (`componentes/pauta/foto.ts`). |
| `apps/painel`                          | Não. Não recebe upload.                                                     |
| `packages/dominio`, `db` e `contratos` | Não. O domínio guarda só a chave do arquivo (`fotoChave`), nunca os bytes.  |

O único consumidor é o back-end. A foto só entra no sistema por um caminho: a mídia que a pessoa
manda ao bot.

## Decisão

**Não criar pacote.** O módulo compartilhado é `apps/backend/src/fotos/`:

| Arquivo         | Responsabilidade                                                                       |
| --------------- | -------------------------------------------------------------------------------------- |
| `imagem.ts`     | `removerMetadados` e o limite de 5 MB (`TAMANHO_MAXIMO_FOTO`, `passaDoTamanhoMaximo`). |
| `meta-midia.ts` | Download da mídia na Meta; confere o tamanho com a função de `imagem.ts`.              |
| `servico.ts`    | Junta tudo: tipo, download, limpeza e gravação.                                        |
| `storage.ts`    | Gravação no bucket.                                                                    |

Qualquer fluxo novo do back-end que receba foto usa `criarServicoDeFotos`, ou `removerMetadados`
direto: ela mesma recusa arquivo acima de 5 MB, então o limite vale mesmo sem passar pelo download
da Meta.

## Por quê

- Um pacote com um consumidor só é custo sem retorno: `package.json`, `tsconfig`, entrada no
  workspace e no build, para o mesmo código.
- O `sharp` é dependência nativa e pesada. Num pacote de `packages/`, entraria na instalação de
  quem depende dele; no back-end, fica só onde roda.

## Quando reabrir

Quando existir um segundo consumidor de verdade fora do back-end — por exemplo, upload de foto pelo
painel da curadoria. Aí `imagem.ts` sobe para `packages/` sem mudar de interface: ele não depende
de nada do back-end.
