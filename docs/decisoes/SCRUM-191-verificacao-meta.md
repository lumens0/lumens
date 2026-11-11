# SCRUM-191 · Verificação da empresa na Meta

Spike · Parte 3 · 2026-11-02 · @JGSEIXAS
**Situação:** decidido. O Lumens é um projeto acadêmico e **opera sem verificação empresarial**, no
limite que a Meta dá a um portfólio não verificado. O caminho do DCE/CNPJ foi descartado.
Formalizado neste documento em 2026-11-10.

## A pergunta

Tem CNPJ? Quem submete? A urgência parecia alta porque a verificação demora a sair, e enquanto não
sai o bot fica no limite de 250 da RNF06.

## O que a Meta diz

Lido na documentação oficial em 2026-11-02 (links no fim). Três pontos mudaram o que a equipe vinha
assumindo:

1. **O limite não é "250 conversas por dia".** É o número de **pessoas diferentes** que o bot alcança
   **fora da janela de atendimento**, numa **janela móvel de 24 horas**. Não zera à meia-noite, em
   fuso nenhum. Mensagem para quem escreveu ao bot nas últimas 24h não conta. Duas mensagens para a
   mesma pessoa dentro das 24h contam uma vez.
2. **O limite é do portfólio de negócios**, não do número. Todos os números do portfólio dividem os
   mesmos 250.
3. **Verificar a empresa não é o único jeito de sair dos 250.** A Meta oferece três caminhos para ir
   a 2.000: verificar a empresa, verificação pelo parceiro (se o número tiver sido cadastrado por
   um provedor), ou **entregar 2.000 mensagens fora da janela de atendimento em 30 dias**, com
   modelos de boa qualidade. Depois de 2.000, o limite sobe sozinho (10 mil, 100 mil, ilimitado)
   quando o bot usa metade dele por sete dias com qualidade alta.

Para o Brasil, a verificação pede documento da pessoa jurídica. O documento central é o
**cartão CNPJ**, normalmente acompanhado de comprovante como extrato bancário da empresa. Pessoa
física não verifica.

Desde 1º de outubro de 2026 a Meta também cobra mensagens utilitárias, inclusive dentro da janela de
atendimento. O portfólio precisa de um meio de pagamento cadastrado, e quem é dono do portfólio paga.

## Decisão

**O Lumens não faz verificação empresarial.** O projeto é acadêmico, não tem CNPJ e não vai usar o
de ninguém. O bot opera com o limite de um portfólio não verificado (hoje, 250 pessoas distintas por
24h móveis) enquanto não houver necessidade real de mais.

O que isso significa na prática:

- **Nenhum documento é submetido à Meta**, por ninguém da equipe nem por terceiros.
- **O limite de 250 é uma restrição aceita**, não um problema a resolver. A fila (SCRUM-202) existe
  para isso: quando o limite acaba, o aviso espera e sai depois, por prioridade.
- **Ninguém persegue as 2.000 entregas em 30 dias.** Se o uso normal do bot levar a Meta a subir o
  limite sozinha, basta mudar `META_LIMITE_PESSOAS` — sem deploy de código e sem documento.

### Caminhos avaliados

| Opção                                     | Resultado                                                                                                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Não verificar**                         | **Escolhida.** O bot funciona com 250, e o volume de um projeto acadêmico cabe nisso com a fila.                                                                                                                         |
| **CNPJ do DCE ou de um centro acadêmico** | **Descartada.** Era a reserva na proposta original. Dependeria de uma entidade de fora assumir o portfólio, os documentos e a conta da Meta de um projeto de disciplina. Ninguém da equipe abre essa conversa com o DCE. |
| **CNPJ da UFAL**                          | Descartada. O Lumens existe para estudantes cobrarem a universidade. Se o canal for da UFAL, quem é cobrado passa a ser dono do número, do portfólio e do histórico de mensagens.                                        |
| **MEI de alguém da equipe**               | Descartada. Amarra o canal a uma pessoa física que vai se formar, e põe a conta da Meta no CPF dela.                                                                                                                     |

## Como o código reflete a decisão

Conferido na `main` em 2026-11-10:

| O quê                                         | Onde                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Limite em pessoas distintas, não em mensagens | `planejarEnvio` em `packages/dominio/src/avisos/envio.ts`: quem já foi alcançado não ocupa vaga nova. |
| Janela móvel de 24 horas, não dia civil       | `JANELA_META_MS` em `packages/dominio/src/avisos/fila.ts`: conta reserva ou envio das últimas 24h.    |
| Limite padrão de portfólio não verificado     | `ORCAMENTO_SEM_VERIFICACAO = 250` em `envio.ts`; padrão de `META_LIMITE_PESSOAS` em `config/env.ts`.  |
| Limite muda sem deploy                        | `META_LIMITE_PESSOAS` no `.env`.                                                                      |

O parâmetro `jaIniciadasHoje` e o comentário "250 conversas por dia", que a proposta original
apontava, não existem mais: a correção entrou com a fila persistida.

## Quando reabrir

Só se o limite passar a impedir o uso de verdade: avisos ficando mais de três dias na fila, de forma
recorrente (o mesmo gatilho da SCRUM-192). Nesse caso a primeira saída continua sendo a que não
pede documento — o limite que sobe pelo volume entregue —, e não a verificação.

## O que esta decisão não resolve

- **Meio de pagamento no portfólio.** A cobrança das mensagens utilitárias independe de verificação.
  Cadastrar ou não um meio de pagamento, e em nome de quem, é decisão de quem é dono do portfólio e
  não foi tomada aqui. Ela precisa estar resolvida antes da submissão das mensagens modelo: veja o
  checklist em [`docs/meta/mensagens-modelo.md`](../meta/mensagens-modelo.md).

## Fontes

- [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
- [Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- Lista de documentos por país: [WATI](https://support.wati.io/en/articles/11463208-meta-business-verification-required-documents-by-country)
  e [Woztell](https://support.woztell.com/portal/en/kb/articles/meta-business-verification).
  São provedores, não a Meta.
