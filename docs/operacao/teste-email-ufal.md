# Teste do código de verificação em contas da UFAL (SCRUM-259)

Continuação da SCRUM-139. O código sai pelo SMTP do Google da conta `@ic.ufal.br` da equipe
(`smtp.gmail.com:587`, senha de app; veja `.env.producao.example`). Na SCRUM-139 ele chegou na
caixa de entrada, mas só foi testado da conta para ela mesma
([TESTS.md da SCRUM-99](../sdd/SCRUM-99-verificacao-email/TESTS.md)). Aqui o teste é com contas
de outras pessoas.

## O que o DNS diz (consultado em 2026-11-16)

| Registro                            | Valor                                         | Leitura                                                       |
| ----------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| SPF de `ic.ufal.br`                 | `v=spf1 include:_spf.google.com ~all`         | O Google pode enviar por `ic.ufal.br`: o SMTP do Gmail passa. |
| SPF de `ufal.br`                    | `v=spf1 include:_spf.google.com ~all`         | Igual.                                                        |
| DKIM `google._domainkey.ic.ufal.br` | não existe                                    | Sem DKIM próprio no seletor padrão. Confirmar no cabeçalho.   |
| DMARC de `ic.ufal.br`               | não existe; vale o de `ufal.br`               | Herda o do domínio organizacional.                            |
| DMARC de `ufal.br`                  | `v=DMARC1; p=none; pct=100; sp=none; aspf=r;` | Só monitora: nada é rejeitado. O SPF alinhado já faz passar.  |
| MX de `ufal.br` e `ic.ufal.br`      | Google (`ASPMX.L.GOOGLE.COM`...)              | As caixas da UFAL são Gmail: o filtro de spam é o do Google.  |

Para repetir:

```bash
nslookup -type=TXT ic.ufal.br 8.8.8.8
nslookup -type=TXT _dmarc.ufal.br 8.8.8.8
nslookup -type=TXT google._domainkey.ic.ufal.br 8.8.8.8
```

Sem DKIM do domínio, o Google assina com o domínio dele (`*.gappssmtp.com`). O DMARC continua
passando pelo SPF, que é do mesmo domínio do remetente. O risco é pequeno, mas é o primeiro lugar
para olhar se algum e-mail cair no spam.

## Roteiro

Precisa de **três contas**: duas `@ufal.br` e uma de subdomínio (`@ic.ufal.br`, `@ctec.ufal.br`...),
de pessoas diferentes da conta remetente. Use o bot da homologação, com o `.env.producao` já no SMTP
do Google.

Para cada conta:

1. No bot, peça a verificação (menu → **3 Verificar e-mail**) e mande o endereço.
2. Na caixa da conta, espere até 2 minutos. Anote se chegou na **Caixa de entrada**, em
   **Promoções/Atualizações** ou no **Spam**, e se há alerta ("Cuidado com esta mensagem").
3. Abra o e-mail → ⋮ → **Mostrar original**. Anote o remetente e as linhas `SPF`, `DKIM` e `DMARC`
   do topo (PASS/FAIL), e o `d=` da assinatura DKIM.
4. Digite o código no bot e confira que a verificação conclui.
5. Se caiu no spam: marque "Não é spam" só **depois** de anotar. Marcar antes muda o resultado
   das próximas contas.

Não cole o cabeçalho inteiro em lugar público: ele tem os endereços.

## Resultado

| Conta (só o domínio) | Chegou em | Alerta | Remetente | SPF | DKIM (`d=`) | DMARC | Código funcionou |
| -------------------- | --------- | ------ | --------- | --- | ----------- | ----- | ---------------- |
| `@ufal.br`           |           |        |           |     |             |       |                  |
| `@ufal.br`           |           |        |           |     |             |       |                  |
| `@*.ufal.br`         |           |        |           |     |             |       |                  |

## Se algo cair no spam

O aceite da task admite isso: abra uma task com o ajuste no envio e cite esta página. Os caminhos,
do mais simples ao que depende da UFAL:

1. Conferir se o `EMAIL_REMETENTE` é exatamente a conta da senha de app. Um remetente diferente
   é reescrito pelo Gmail e perde o alinhamento.
2. Pedir ao NTI da UFAL o DKIM do Google Workspace para `ic.ufal.br` (Admin → Gmail → Autenticar
   e-mail). É o único item do DNS que falta.
3. Remetente institucional da UFAL, em vez da conta de um estudante. Também resolve o risco já
   registrado na SCRUM-99: a conta se desativa na formatura.
