# SPEC — SCRUM-100

## Problema

Hoje a opção "1 Relatar problema" do bot é um placeholder. Sem ela, quem tem um problema só pode
abrir pauta nova, e o mesmo bebedouro quebrado vira três pautas com o apoio dividido entre elas.

## Comportamento

1. No menu, "1" pede o relato. Texto digitado ou mensagem encaminhada valem igual.
2. Relato sem nada que dê para buscar ("oi", "tá aqui") pede mais detalhe.
3. Se o relato cita um bloco pelo nome ("bebedouro do **bloco 18**"), o bot não pergunta. Senão,
   mostra uma lista com os blocos e "Todo o campus / não sei". O nome digitado também vale.
4. O bot busca até 3 pautas abertas (`juntando_apoios`, `meta_batida`, `cobrando`, `prometido`)
   do bloco escolhido ou do campus inteiro, e mostra numa mensagem de lista: uma linha por pauta
   (título até 24 caracteres, descrição até 72) e "É outro problema".
5. "É essa" encerra o relato; o apoio é da 2.7. "É outro problema" leva à pauta nova (2.6), com o
   relato e o bloco guardados para ela.
6. Sem pauta parecida, o bot oferece criar pauta nova: "sim" leva à 2.6, "não" volta ao menu.

## Critérios de aceitação

1. Relato parecido encontra a pauta certa nos testes de calibração (23 relatos, 18 com pauta e 5
   sem).
2. Sem resultado, o bot oferece criar pauta.
3. Pauta em curadoria, recusada ou encerrada nunca aparece; pauta de outro bloco também não.
4. A lista respeita os limites da Meta (10 linhas, título 24, descrição 72, botão 20).
5. O relato não fica em claro na tabela `conversa` (RNF01).
6. `pnpm check` verde.

## Fora de escopo

- Registrar o apoio (2.7) e criar a pauta (2.6).
- Enviar a lista pela Cloud API: o sender real ainda não existe; o `logSender` mostra a lista
  como texto no `pnpm dev`.
- Legenda de foto encaminhada como relato: imagem continua fora dos passos de texto.
