# Revisão geral da interface do site (SCRUM-361)

Levantamento feito em 18/11/2026, a 375 px de largura (celular), nas telas home, pauta, mapa,
conquistas, atividade e privacidade, com uma API de teste local (dados fictícios). Para cada tela
mediram-se alvos de toque, rolagem horizontal e texto; as capturas foram conferidas na hora e não
ficam no repositório. Não houve revisão em desktop nem do painel.

## Resultado

Nenhuma tela tem rolagem horizontal a 375 px. Conquistas e atividade não tinham pendência.

## Lista priorizada

| Prioridade | Tela         | Achado                                                                                             | Situação                                                             |
| ---------- | ------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Alta       | Todas        | Alvos de toque abaixo de 44 px: rodapé (21 px), título do card (24 px), abas (36 px), logo (26 px) | Corrigido (SCRUM-381)                                                |
| Alta       | Pauta        | "Voltar" com 36 px e "Baixar card" com 40 px                                                       | Corrigido                                                            |
| Alta       | Mapa         | Botão de fechar a ajuda e o do painel do prédio com 36 px, zoom e "Ver campus" com 40 px           | Corrigido                                                            |
| Alta       | Privacidade  | Link "Voltar para as pautas" com 24 px                                                             | Corrigido                                                            |
| Média      | Home         | Sem visão de conjunto por categoria e bloco                                                        | Corrigido (SCRUM-360)                                                |
| Média      | Todas        | Fundo bege quente destoando do azul da noite                                                       | Corrigido (SCRUM-364)                                                |
| Baixa      | Mapa         | Pontos dos prédios (13 a 23 px) são pequenos para toque; a lista de prédios é a alternativa        | Aberto: avaliar área de toque invisível nos marcadores               |
| Baixa      | Mapa e pauta | Link de crédito do OpenStreetMap e link "CSV" no texto têm menos de 44 px                          | Mantido: atribuição e link dentro de frase são exceção da WCAG 2.5.8 |
| Baixa      | Painel       | Não revisado aqui                                                                                  | Aberto: revisar junto da curadoria                                   |
