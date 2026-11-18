# SCRUM-139 · O e-mail sai pelo SMTP do Google, não pela Brevo

Decisão · testada em 2026-11-11, registrada em 2026-11-17 a partir da SDD da SCRUM-99, removida na
limpeza do repositório · @sthefanyblima
**Situação:** em vigor até a troca para a conta própria do Lumens (SCRUM-320).

## Contexto

O código de verificação dos estudantes (e, depois, o link de login do painel) sai por SMTP, com
remetente `@ic.ufal.br`. Os dois caminhos foram testados à mão com o envio da produção
(`criarEmailSmtp`):

- **Brevo** (`smtp-relay.brevo.com`): o e-mail chegou, mas o Gmail mostrou o alerta de
  falsificação ("Cuidado com esta mensagem", enviado "por ...brevosend.com"). O SPF do `ic.ufal.br`
  só autoriza o Google, e não há DKIM da Brevo no domínio. Sem acesso ao DNS da UFAL, não há como
  corrigir.
- **SMTP do Google** (`smtp.gmail.com:587`, senha de app da própria conta `@ic.ufal.br`): chegou
  na caixa de entrada, sem alerta.

## O que foi escolhido

O SMTP do Google, com senha de app (`.env.example` e `.env.producao.example`, variáveis
`EMAIL_*`). Remetente de terceiro com endereço `@ic.ufal.br` volta a cair no alerta.

## Risco aceito

O envio depende de uma conta pessoal de estudante. Se ela for desativada (formatura) ou a senha de
app for revogada, o código deixa de sair e ninguém consegue se verificar nem entrar no painel. O
limite do Google é de cerca de 2.000 e-mails por dia.

A troca para uma conta Gmail própria do Lumens, enviando como ela mesma, está prevista na
SCRUM-320 e resolve o risco sem mudar código: tudo vem das variáveis `EMAIL_*`.

## O que ficou por conferir

O teste foi feito da conta para ela mesma. Faltava testar numa segunda conta da UFAL e confirmar
que o `.env.producao` da VM usa o SMTP do Google, e não a Brevo: com a Brevo, o código chega com o
alerta de falsificação.
