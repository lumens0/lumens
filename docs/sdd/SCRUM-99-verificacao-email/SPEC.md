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

### Fora de escopo (próximas subtasks)

- Gerar e enviar o código; tentativas e reenvio. Até lá, `VERIFY_ASK_CODE` responde "em
  construção".
- E-mail já usado por outro telefone (RN01) e o vínculo telefone ↔ e-mail.
- Curso, marcar verificado e retomar o pedido.
