# Spec: SCRUM-26 — Botões de ação pelo WhatsApp

> Ticket: SCRUM-26 — 4.3 · Helper wa.me (SCRUM-43) e botões (SCRUM-44)
> Contexto: o site é só leitura; toda ação (apoiar, relatar, ajudar) acontece no bot do WhatsApp.
> O site abre a conversa com o bot com o comando já digitado, e a pessoa só aperta enviar.

## Comportamento principal

- `linkWhatsApp(comando?)` devolve `https://wa.me/<número>?text=<comando codificado>`. O número vem
  de `NEXT_PUBLIC_WHATSAPP_BOT`, só com os dígitos. Sem comando, o link não tem `?text`. Sem número,
  devolve `null`, e nenhum botão aparece.
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
- "Vou ajudar" só aparece com `NEXT_PUBLIC_FLAG_VOU_AJUDAR=1`, até a 3.5 (SCRUM-197).

## Critérios de aceitação

- [x] Espaços e acentos do comando saem codificados no `text`.
- [x] Sem número configurado, nenhum botão aparece.
- [x] `+`, espaços e hífens do número são descartados.
- [x] Cada botão tem `aria-label` com a ação e o alvo e abre em nova aba com
      `rel="noopener noreferrer"`.
- [x] O card mostra "Apoiar" só para status que aceitam apoio.
- [x] "Vou ajudar" fica escondido sem a flag.
- [x] O formato do comando de apoio está registrado (slug público).

## Contextuais

- **Atores:** qualquer pessoa no site, sem login.
- **Casos de borda:** número vazio ou só com símbolos; comando com `&`, `=` ou acentos; pauta
  conquistada; flag com valor diferente de `1`.
- **Fora de escopo:** interpretação dos comandos no bot (SCRUM-102, SCRUM-197); a página da pauta
  (SCRUM-27).

## Padrões aplicáveis

- Nenhum catálogo `.agent/patterns/`. Segue os componentes de `apps/site/src/componentes/` e o CSS
  de `componentes.module.css`.
