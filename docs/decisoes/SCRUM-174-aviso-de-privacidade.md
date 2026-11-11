# SCRUM-174 · Texto do aviso de privacidade e base legal

Decisão · Parte 5 · 2026-11-10 · @sthefanyblima
**Situação:** proposta. A equipe aprova (ou ajusta) na revisão da PR; aprovada, vira decidida.

> Não é parecer jurídico. É a leitura da equipe sobre o que a LGPD pede para um projeto acadêmico
> deste tamanho. Se a disciplina ou a UFAL indicar um encarregado de dados, ele tem a última
> palavra e este documento muda junto.

## A pergunta

O bot mostra um aviso no primeiro contato (SCRUM-175) e aceita `sair` (SCRUM-176). Falta fechar
**o que o aviso diz** e **em que base legal da LGPD o Lumens trata os dados**.

## O que o sistema trata (conferido na `main` em 2026-11-10)

| Dado                    | Quando                      | Como fica guardado                                    | Aparece no site?              |
| ----------------------- | --------------------------- | ----------------------------------------------------- | ----------------------------- |
| Telefone                | Toda mensagem               | Cifrado (AES-256-GCM) + HMAC para busca               | Nunca                         |
| Conteúdo da conversa    | Durante um fluxo            | Cifrado, apagado em 24 h pela limpeza diária          | Nunca                         |
| E-mail `@ufal.br`       | Só se a pessoa se verificar | Cifrado + HMAC; o código de verificação, só como hash | Nunca                         |
| Curso                   | Na verificação              | Em claro (é o que o site mostra)                      | Sim, nos owners e nos relatos |
| Apoios, relatos, pautas | Quando a pessoa participa   | Ligados ao cadastro                                   | Só totais e textos aprovados  |
| Foto da pauta           | Se a pessoa mandar          | Sem metadados (EXIF e GPS removidos antes de guardar) | Sim, na pauta                 |

Quem sai (`sair`) tem telefone, e-mail, conversa e código apagados; os apoios seguem contando
sem ligação com a pessoa (SCRUM-91).

## Decisão proposta

**Base legal: consentimento (LGPD, art. 7º, I), manifestado ao se verificar.**

1. **O aviso vem antes de qualquer cadastro.** Ele sai no primeiro contato, antes do menu, e diz o
   que é guardado, o que aparece no site e como sair.
2. **O ato de se verificar é a manifestação.** Digitar o e-mail institucional e depois o código é
   uma ação deliberada e posterior ao aviso — mais clara que "continuar a conversa". O aviso diz
   isso com todas as letras.
3. **Antes de se verificar, o mínimo.** Quem só conversa tem telefone e conversa guardados por até
   24 h, porque sem isso o bot não consegue responder a quem o procurou. Sem cadastro, `sair` apaga
   tudo na hora.
4. **Revogar é tão fácil quanto consentir** (art. 8º, § 5º): `sair`, no mesmo canal, a qualquer
   momento. Ver e corrigir dados continua por pedido manual à equipe (art. 18).

### Por que não legítimo interesse

Daria para sustentar legítimo interesse (art. 7º, IX), mas ele exige um teste de balanceamento
documentado e deixa a pessoa com menos controle. O consentimento casa com o que o Lumens já é —
participação voluntária, com saída em uma palavra — e é mais fácil de explicar numa mensagem de
WhatsApp.

## O texto

No bot (`PRIVACY_NOTICE_TEXT`, `apps/backend/src/bot/conversation/privacidade.ts`):

> 🔒 _Sua privacidade no Lumens_
> Guardamos seu telefone cifrado para continuar esta conversa. Se você se verificar, guardamos
> também seu e-mail @ufal.br (cifrado) e seu curso.
> No site aparecem as pautas, os relatos aprovados e o curso de quem participa — nunca nome,
> telefone ou e-mail. Quem apoia não aparece: só o total.
> Ao se verificar, você concorda com esse uso (LGPD, art. 7º, I). Para sair e apagar seu vínculo,
> envie _sair_ a qualquer momento.
> Política completa: https://lumens-ufal.vercel.app/privacidade

No site, a página `/privacidade` ganha a seção "Base legal" e deixa de dizer que a verificação e a
remoção de metadados não existem — as duas já estão no ar.

## O que a equipe precisa confirmar na PR

- [ ] Consentimento como base legal, manifestado na verificação.
- [ ] O texto do aviso, como está acima.
- [ ] Se há encarregado de dados indicado pela disciplina; se houver, o contato entra na página.
