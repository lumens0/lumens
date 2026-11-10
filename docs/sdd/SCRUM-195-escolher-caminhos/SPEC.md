# SPEC — SCRUM-195

## Problema

`abrirCaminho` existia no domínio, mas nada no bot chamava. O owner não tinha como ver os caminhos
da pauta nem abrir o Fala.BR ou a comunidade, e o domínio aceitava abrir caminho até em pauta que
ainda estava em curadoria.

## Comportamento

1. O menu ganha "4 Minhas pautas" (também "minhas pautas" ou "caminhos").
2. Só aparecem as pautas em que a pessoa é owner ou co-owner ativo e que aceitam caminho:
   `juntando_apoios`, `meta_batida`, `cobrando`, `prometido`, `entregue_em_parte`, `descumprida`.
   Quem não é verificado ou não tem pauta recebe um aviso e fica no menu.
3. Com uma pauta, o bot mostra os caminhos dela direto. Com várias, mostra uma lista (as 10 mais
   novas) e aceita a linha, o número ou o título digitado.
4. O estado mostra cada caminho: "não aberto", ou a data em que abriu, o protocolo e o prazo
   (horário de Maceió).
5. Cada caminho ainda não aberto tem um botão ("Abrir Fala.BR", "Abrir comunidade"), além de
   "Voltar ao menu". Também vale digitar o nome ("fala br", "comunidade").
6. Abrir um caminho confirma, mostra o estado de novo e mantém o botão do outro (RN07). Com os
   dois abertos, o bot volta ao menu.
7. Os caminhos ficam disponíveis a qualquer momento depois da aprovação, inclusive antes da meta.
8. A cada mensagem o bot relê a pauta e o papel: pauta que fechou ou owner que saiu não abre
   caminho.

## Critérios de aceitação

1. Fala.BR e comunidade disponíveis a qualquer momento; um não bloqueia o outro (Jira).
2. Abrir caminho não muda o status da pauta e registra `caminho_aberto`.
3. Toque repetido não cria caminho duplicado.
4. Pauta em curadoria, recusada ou conquistada não aceita caminho, nem pelo domínio.
5. `pnpm check` verde.

## Fora de escopo

- Registrar o protocolo e o prazo pelo bot.
- O caminho do representante.
- Enviar as mensagens pela Cloud API: o `logSender` continua sendo o sender.
