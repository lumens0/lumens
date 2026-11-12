# Spec: SCRUM-26 — Botões de ação pelo WhatsApp

> Ticket: SCRUM-26 — 4.3 · Helper wa.me (SCRUM-43) e botões (SCRUM-44)
> Contexto: o site é só leitura; toda ação (apoiar, relatar, ajudar) acontece no bot do WhatsApp.
> O site abre a conversa com o bot com o comando já digitado, e a pessoa só aperta enviar.

## Comportamento principal

- `linkWhatsApp(comando?)` devolve `https://wa.me/<número>?text=<comando codificado>`. O número vem
  de `NEXT_PUBLIC_WHATSAPP_BOT`, só com os dígitos. Sem comando, o link não tem `?text`. Sem número,
  devolve `null`, e nenhum botão aparece; isso só vale no `next dev` e nos testes, porque o build de
  produção falha sem número (SCRUM-43).
- O link wa.me abre o app no celular e o WhatsApp Web no computador.
- Comandos:

  | Botão               | Onde                                   | Comando         |
  | ------------------- | -------------------------------------- | --------------- |
  | Apoiar              | card da pauta (e página da pauta, 4.4) | `apoiar <slug>` |
  | Relatar um problema | home e lista vazia                     | `nova pauta`    |
  | Vou ajudar          | caminho da pauta (4.4), atrás de flag  | `ajudar <id>`   |

- **Acordo com o bot:** o identificador da pauta em `apoiar <slug>` é o **slug público** da pauta,
  o mesmo da URL `/p/<slug>`: é público, estável e não expõe id interno. Quem interpreta o comando
  é o bot, na 2.7 (SCRUM-102).
- "Apoiar" só aparece para status que recebem apoio: todos, menos `em_curadoria`, `recusada` e
  `conquistada` (a mesma regra de `registrarApoio` no domínio).
- "Apoiar" ficou atrás de `NEXT_PUBLIC_FLAG_APOIAR=1` até o bot interpretar `apoiar <slug>`. A
  flag saiu na 2.8 (SCRUM-103), quando o comando passou a valer em qualquer passo da conversa.
- "Relatar um problema" depende de `NEXT_PUBLIC_FLAG_RELATAR=1`, desligada por padrão até o bot
  salvar a pauta relatada (2.6, SCRUM-101): hoje as etapas de título, local e descrição descartam
  a resposta.
- "Vou ajudar" só aparece com `NEXT_PUBLIC_FLAG_VOU_AJUDAR=1`, até a 3.5 (SCRUM-197).

## Critérios de aceitação

- [x] Espaços e acentos do comando saem codificados no `text`.
- [x] Sem número configurado, nenhum botão aparece (`next dev` e testes).
- [x] Número ausente gera erro claro no build (`next build`), não um link quebrado (SCRUM-43).
- [x] `+`, espaços e hífens do número são descartados.
- [x] Cada botão tem `aria-label` com a ação e o alvo e abre em nova aba com
      `rel="noopener noreferrer"`.
- [x] O card mostra "Apoiar" só para status que aceitam apoio.
- [x] "Vou ajudar" fica escondido sem a flag.
- [x] O formato do comando de apoio está registrado (slug público).
- [ ] **PENDENTE:** O texto que chega no WhatsApp é exatamente o comando que o bot espera.
      Na `origin/main`, o bot só entende `nova pauta` como atalho do menu
      (`apps/backend/src/bot/conversation/handlers.ts:64`): numa conversa nova a pessoa recebe a
      saudação (GREETING), e no meio de um fluxo o texto é tomado como conteúdo. `apoiar <slug>` ainda
      não tem parser. Precisa ser alinhado com a 2.7 (SCRUM-102) e a 2.6 (SCRUM-101), para os
      comandos serem reconhecidos em qualquer passo, inclusive no GREETING.
      Questão aberta: "Relatar um problema" deveria mandar `nova pauta` (menu 2) ou `relatar`
      (menu 1)? Fica `nova pauta`, como pede a spec do Jira.

## Contextuais

- **Atores:** qualquer pessoa no site, sem login.
- **Casos de borda:** número vazio ou só com símbolos; comando com `&`, `=` ou acentos; pauta
  conquistada; flag com valor diferente de `1`.
- **Fora de escopo:** interpretação dos comandos no bot (SCRUM-102, SCRUM-197); a página da pauta
  (SCRUM-27).

## Padrões aplicáveis

- Nenhum catálogo `.agent/patterns/`. Segue os componentes de `apps/site/src/componentes/` e o CSS
  de `componentes.module.css`.
