# SCRUM-323 · Rótulos do Telegram e textos sem "este número"

**Situação:** aprovada (17/11/2026). Veio da SDD da task, que saiu do repositório com a SCRUM-339.

## Decisões

- **Quem chama `dentroDosLimitesDaMeta`**: ainda ninguém em produção. As respostas da conversa pela
  Cloud API ainda saem pelo `logSender` (o envio interativo pela Meta não existe), e o WhatsApp da
  demonstração é a Evolution, que manda os menus como texto e não tem esses limites. O envio pela
  Meta, quando existir, chama a função antes de montar o payload, e o teste garante que o corte é o
  mesmo de antes.
- **Os textos de privacidade** ("Guardamos seu telefone cifrado", "Seu telefone e seu e-mail serão
  apagados") ficam para a SCRUM-283, que trata justamente deles no Telegram. O teste novo os deixa
  de fora.
- **Termo neutro**: "conversa", que vale nos dois canais.
