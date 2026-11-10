# SPEC — SCRUM-99

## SCRUM-134 · Pedir o e-mail institucional

1. "3 Verificar e-mail" no menu, ou a pauta nova (2.6) de quem não é verificado, leva ao passo
   `VERIFY_ASK_EMAIL`, que pergunta o e-mail da UFAL com um exemplo.
2. Vale o e-mail com domínio `ufal.br` ou um subdomínio (`ic.ufal.br`, `ctec.ufal.br`...).
   `ufal.br.com`, `xufal.br`, `ic-ufal.br` e outros parecidos são recusados.
3. A pessoa pode mandar a frase inteira ("meu e-mail é joao@ic.ufal.br."): o bot acha o endereço,
   desde que haja um só, e ignora a pontuação em volta. Maiúsculas não importam.
4. Cada recusa tem a sua resposta (sem e-mail, mais de um, formato, fora da UFAL), e o bot fica no
   mesmo passo para a pessoa tentar de novo.
5. Aceito, o e-mail é guardado normalizado e **cifrado** nos dados da conversa (`emailCifrado`) e
   o bot vai para `VERIFY_ASK_CODE`. Nenhuma resposta repete o e-mail: as respostas vão para a
   fila de saída e para o log.
6. O pedido pendente da pauta nova (`pendingCommand`) continua nos dados.

## SCRUM-135 · Código de 6 dígitos por e-mail

1. Aceito o e-mail, o bot gera um código de 6 dígitos com `crypto.randomInt` ("000000" a
   "999999").
2. O banco guarda só o hash SHA-256 do código (misturado ao telefone) na `codigo_verificacao`,
   válido por 10 minutos e com as tentativas zeradas. Um pedido novo do mesmo telefone substitui o
   anterior: só vale o último código enviado.
3. O código vai por e-mail com Nodemailer: texto simples, sem HTML nem links, do remetente da
   equipe (`EMAIL_REMETENTE`), com o código e a validade no corpo. O assunto não leva o código.
4. A pessoa recebe "Enviei um código de 6 dígitos para o seu e-mail da UFAL..." e o bot vai para
   `VERIFY_ASK_CODE`. Nem o código nem o e-mail aparecem nas respostas, nos dados da conversa ou
   no log.
5. Se o servidor de e-mail falhar (ou não estiver configurado), o bot avisa e pede o e-mail de
   novo, sem avançar.
6. No `pnpm dev`, o e-mail não sai: o código aparece no log, para testar pelo simulador.

## Fora de escopo (próximas subtasks)

- Conferir o código digitado; máximo de 5 tentativas; reenvio liberado após 60 s. Até lá,
  `VERIFY_ASK_CODE` responde "em construção".
- E-mail já usado por outro telefone (RN01) e o vínculo telefone ↔ e-mail.
- Curso, marcar verificado e retomar o pedido.
- E-mail testado em contas reais da UFAL (spam): depende do SMTP de produção.
