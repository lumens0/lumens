# Guia de escrita do bot

Guia curto para os textos do bot (SCRUM-340). O bot fala em dois canais, WhatsApp (Evolution) e
Telegram, com o mesmo texto: escreva sempre para os dois.

## Tom e pessoa

- Segunda pessoa do singular ("você"), tom direto e gentil, frases curtas.
- Linguagem neutra em gênero: prefira "quem cuida da pauta" a "o responsável", "pessoas" a "usuários".
- Sem jargão interno: "responsável" e "corresponsável", nunca "owner"; "caminho", não "path".

## Não nomeie o canal nem o dado do canal

- Nada de "WhatsApp", "Telegram", "telefone" ou "número" como identidade, nem no aviso de
  privacidade do bot. Use "pelo bot", "na conversa com o Lumens", "o identificador desta conversa,
  cifrado".
- Só cite o canal onde o texto já varia por canal (ex.: a política de privacidade do site).
- `textos-do-canal.test.ts` barra as expressões mais comuns.

## Comandos e opções

- Palavra de comando sempre em negrito: responda `*sim*`, `*pular*`, `*menu*`, `*cancelar*`, `*sair*`.
- Nunca cite o número de uma opção do menu ("Escolha 2 no menu"): se a ordem mudar, o texto mente.
  Cite o nome: "mande `*menu*` e escolha `*Nova pauta*`".
- O menu principal é uma lista (`MENU_PRINCIPAL`, em `handlers.ts`), como as outras: cada canal a
  desenha do seu jeito (lista da Meta, teclado do Telegram, linhas numeradas em texto na Evolution).
- Fim de fluxo: o menu volta inteiro; se a última resposta já for longa (mais de 280 caracteres),
  vai só "Mande `*menu*` para ver as opções.".

## Emoji

- ✅ só para confirmar uma ação que gravou algo (verificado, caminho aberto, proposta publicada,
  apoio contado, relato enviado). Mensagem que não grava nada ("já está feita") fica sem emoji.
- 🎉 só quando a pauta bate a meta.
- 🔒 só no aviso de privacidade.
- Sem emoji em erro, pedido ou explicação.

## Tamanho

- Uma ideia por mensagem; até cerca de 4 linhas curtas. O que for mais longo vira link para o site.
- Evite mensagens seguidas: junte quando der e não repita o menu inteiro se a última resposta já for
  longa.

## Números

- Evite concordância que dependa do número: "Agora temos 1 de 120 apoios", não "Agora são 1 de 120".
- Caminho sem protocolo não menciona protocolo: protocolo só existe no Fala.BR.
