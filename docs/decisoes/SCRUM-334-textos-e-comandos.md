# SCRUM-334 · Textos e comandos do bot

**Situação:** aprovada (17/11/2026). Veio da SDD da task, que saiu do repositório com a SCRUM-339.

## Decisões

- **"ajuda" vale só no menu**, como pede a task. No meio de um fluxo, _menu_ e _cancelar_ já tiram
  a pessoa dali, e um "ajuda" global viraria resposta em passos de texto livre.
- **O texto da confirmação não mudou** ("Responda _sim_ para sair..."): a SCRUM-314 mexe na linha
  de cima, e mudar esta daria conflito. O "sair" funciona sem estar escrito.
- **A opção 5 só manda o link**: as pautas, o filtro por bloco e o botão de apoiar já estão no site.
  Listar pautas no bot pediria paginação e outra tela para cada canal.
- **`VERIFIED_TEXT` e a SCRUM-323**: a 323 troca "este número" por "esta conversa" na mesma linha.
  O texto novo já usa "esta conversa"; quem fizer o merge depois fica com a versão desta task.
