# Como montar uma conquista completa para a demonstração (SCRUM-352)

A homologação sobe sem seed de demonstração, então a página de uma pauta conquistada só mostra
destaque da vitória, solução entregue, resposta, relatos e linha do tempo se esses dados forem
criados de verdade. Nada disto mexe no banco por script: é o caminho normal do produto.

## Caminho pelo bot e pelo painel

1. **Pauta:** crie a pauta pelo bot e aprove no painel (status `juntando_apoios`).
2. **Apoios:** apoie com contas de teste até bater a meta (`meta_batida`).
3. **Relatos:** mande 1 ou 2 relatos pelo bot, uma delas com foto, e aprove no painel (aparecem em
   "Relatos", com a foto pela rota `/fotos`, SCRUM-263).
4. **Caminho e resposta:** quem cuida da pauta abre um Fala.BR (status `cobrando`) e registra a
   resposta oficial com a promessa e a data de entrega.
5. **Solução da comunidade (opcional):** publique uma proposta de caminho, junte voluntários e
   marque como executada: é ela que vira "Solução entregue".
6. **Conferência:** depois da data prometida a conferência "Foi feito?" abre por sete dias; com
   maioria de "sim" e quórum a pauta vira `conquistada`.

A linha do tempo, o "De Cobrando para Conquistada" e os dias da criação à entrega saem sozinhos dos
eventos. Em desenvolvimento, o seed (`pnpm --filter @lumens/db seed`) já cria a conquista
`laboratorios-abertos-nas-engenharias` para ver a página localmente; ele não vai para a homologação.

## O que conferir na página

- selo "Conquistada", data da conquista, apoios e dias, sem botão de apoiar;
- "Solução entregue" (só se houve proposta executada);
- "Resposta oficial" sem "Aguardando resposta"; "Caminhos" sem "ainda vai escolher";
- linha do tempo com os marcos em destaque.
