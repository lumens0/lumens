# Encaminhamento ao Fala.BR: WhatsApp × web (SCRUM-371)

**Decisão (reunião de 18/11/2026): seguir com o web.** O bot entrega o texto pronto e a pessoa
protocola em https://falabr.cgu.gov.br.

## Passos de cada caminho

| Passo                 | Pelo web (adotado)                                     | Pelo WhatsApp (descartado)                                                                                                  |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Texto da manifestação | Bot gera, confere a RN08 e entrega                     | Igual                                                                                                                       |
| Login                 | gov.br no navegador, uma vez                           | Sem API: o bot teria de operar o login da pessoa (não pode)                                                                 |
| Preencher e enviar    | Colar o texto no campo "Descrição" e enviar            | Automatizar o formulário (fere os termos do gov.br) ou fluxo manual em vários passos no chat (assunto, órgão, tipo, anexos) |
| Protocolo             | Pessoa informa o número ao bot (_Registrar protocolo_) | Igual, sem ganho                                                                                                            |
| Revisão da RN08       | A pessoa revisa antes de colar                         | Perdida se o envio fosse automático                                                                                         |

## Por que o web

- O Fala.BR não tem API pública; protocolar exige login gov.br.
- O protocolo é documento público: a revisão humana do texto é a última barreira da RN08.
- Pelo WhatsApp seriam mais passos que no web, sem eliminar a ida ao site.

## Se for retomado

Enviar o link da nova manifestação com o texto e um botão para marcar como protocolado, sem automatizar
o envio. Hoje o texto já é entregue e o protocolo, registrado no bot (`minhas-pautas.ts`).
