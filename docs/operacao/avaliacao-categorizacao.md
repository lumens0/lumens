# Avaliação da categorização automática (SCRUM-369)

Relacionadas: SCRUM-365 (sugestão com confirmação) e SCRUM-357 (escolha pelo WhatsApp).

## Método

24 frases representativas (títulos das pautas do seed e relatos típicos de estudantes) rodadas em
`sugerirCategoria`. O conjunto fica no teste
[`categoria-sugerida.test.ts`](../../packages/dominio/src/pauta/categoria-sugerida.test.ts)
("avaliação com frases representativas"), que falha se aparecer categoria errada ou se os acertos
caírem abaixo de 22 de 24 (as 2 que faltam são empates).

## Resultado

| Frase                                                                 | Resultado                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| 22 das 24                                                             | Categoria certa ou, onde o certo é ambíguo, sem sugestão     |
| "Iluminação no entorno do Bloco de Artes"                             | Empate Infraestrutura × Segurança: lista completa (esperado) |
| "Internet estável na residência universitária" (esperado: Tecnologia) | Empate Tecnologia × Permanência: lista completa              |
| "Roubaram celulares no estacionamento à noite" (esperado: Segurança)  | Empate Segurança × Infraestrutura: lista completa            |
| "Estudantes sem lugar para estudar à noite"                           | Sem palavra reconhecida: lista completa (esperado)           |

Antes dos ajustes eram 17 de 22; as falhas eram frases sem a palavra ("árvore", "sombra",
"descanso", "informática"), todas adicionadas. **Nenhuma frase recebeu categoria errada.** O pior caso
é não sugerir, e o estudante escolhe na lista.

## Recomendação: manter para a apresentação

- Mantém: a sugestão nunca classifica sozinha (o estudante confirma) e o erro vira lista completa.
- Limite: é por palavras-chave, sem IA. Vocabulário novo simplesmente não sugere. Ajustar é editar
  `PALAVRAS_DA_CATEGORIA`.
- Não desligar: a lista completa continua disponível em um toque (_Escolher outra_).
