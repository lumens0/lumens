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

## SCRUM-136 · Conferir o código, 5 tentativas e reenvio

1. No passo `VERIFY_ASK_CODE`, o bot confere o código digitado. Espaço ou hífen no meio valem
   ("123 456").
2. **Certo:** responde "Código certo ✅", apaga o código (vale uma vez só) e vai para
   `VERIFY_ASK_COURSE`, que ainda responde "em construção".
3. **Errado:** gasta uma tentativa e diz quantas restam. No quinto erro, o código deixa de valer,
   mesmo que a pessoa acerte depois.
4. Texto que não é código, ou código com tamanho diferente de 6, não gasta tentativa: o bot
   explica o que espera.
5. **Vencido** (10 minutos): não vale, mesmo certo, e não gasta tentativa.
6. **"reenviar"** (também "não chegou", "outro código"...) manda um código novo para o mesmo
   e-mail, se já passaram 60 s do último envio; senão, diz quantos segundos faltam. O código novo
   zera as tentativas e o anterior deixa de valer.
7. Voltar ao menu e mandar o e-mail de novo também é um pedido de código: vale o mesmo intervalo de
   60 s. Assim o bot não serve para encher a caixa de e-mail de alguém.
8. Se o reenvio falhar, o código que não saiu é apagado e a pessoa pode tentar de novo na hora.
   O mesmo vale para o primeiro envio.
9. Sem o e-mail nos dados da conversa, o reenvio pede o e-mail de novo.

## SCRUM-137 · Vincular telefone ↔ e-mail (RN01)

1. Com o código certo, o telefone fica ligado ao e-mail no cadastro do estudante (`estudante`):
   telefone e e-mail cifrados, com o HMAC de cada um para busca. Telefone novo cria o cadastro.
2. O cadastro nasce **sem** `verificado_em`: quem marca é o fim da 2.4, depois do curso.
3. **E-mail já ligado a outro número:** o bot explica que cada e-mail vale para um número só (é o
   que garante um apoio por estudante), sugere falar com a equipe se o número antigo era da
   pessoa e pede outro e-mail. O cadastro do outro número não muda.
4. O aviso de e-mail em uso só vem **depois** do código certo. No passo do e-mail o bot não diz
   nada: senão, qualquer um digitaria o e-mail de um colega para saber se ele usa o Lumens.
5. **Mesmo número, outro e-mail** (quem refaz a verificação): o e-mail do cadastro é trocado e o
   antigo fica livre. `verificado_em` e `saiu_em` não mudam aqui.
6. Depois do vínculo, o e-mail sai dos dados da conversa: ele já está no cadastro.
7. Sem o e-mail na conversa, o código não é conferido (não é gasto) e o bot pede o e-mail de novo.

## SCRUM-138 · Curso, verificado e pedido pendente

1. Depois do código certo e do vínculo, o bot pergunta o curso numa mensagem de lista. A lista é
   `CURSOS` (`packages/db/src/cursos.ts`), a mesma do seed. Com mais de 10 cursos, mostra 9 e
   aceita o nome digitado dos outros.
2. Vale a linha da lista ou o nome digitado, sem diferença de acento e maiúscula. O curso gravado é
   sempre o nome da lista.
3. **Só curso da lista:** o curso de quem cuida da pauta aparece no site (`cursos_responsaveis` em
   `v_pauta_publica`). Texto livre poderia levar um nome de pessoa para a página pública. Fora da
   lista, o bot pergunta de novo.
4. Com o curso, o estudante é marcado como verificado (`verificado_em`). Quem já era verificado
   mantém a data da primeira verificação. Quem tinha saído (`saiu_em`) volta a valer.
5. **Retomar o pedido:** quem veio da pauta nova (2.6), pelo menu ou pelo "É outro problema" da
   2.5, segue direto para o título, com o relato guardado. O pedido de apoio (`apoiar`) fica nos
   dados da conversa para a 2.7 retomar; por ora, o bot volta ao menu.
6. **Verificado uma vez só:** quem já é verificado e escolhe "3" no menu recebe "Você já é
   estudante verificado" e fica no menu.
7. Sem o vínculo do e-mail (cadastro perdido), o bot refaz a parte do e-mail.

## Fora de escopo

- Os cursos reais da UFAL: trocar a lista em `packages/db/src/cursos.ts`.
- Retomar o apoio (2.7).
- Testar o e-mail num SMTP de verdade e em contas reais da UFAL.
