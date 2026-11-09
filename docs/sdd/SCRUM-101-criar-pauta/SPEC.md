# SPEC — SCRUM-101

## Problema

A opção "2 Nova pauta" do bot e o "É outro problema" da 2.5 caíam em placeholders. Não havia como
uma pauta nascer pela conversa nem regra de domínio para criá-la.

## Comportamento

1. "2 Nova pauta" no menu, ou "É outro problema" / "sim" na 2.5, abre a pauta nova.
2. Quem não é estudante verificado (RN01: verificado e não saiu) vai para a verificação (2.4)
   antes de qualquer pergunta. O pedido fica guardado em `pendingCommand`.
3. Perguntas em sequência, cada uma repetida quando a resposta não serve:
   - **título**, até 80 caracteres;
   - **local**, numa lista de blocos ("Todo o campus / não sei" incluído); aceita o nome digitado;
   - **descrição**, até 2000 caracteres;
   - **foto** opcional, JPEG ou PNG até 5 MB, ou "pular".
4. Vinda da 2.5, a pauta pula local e descrição: usa o bloco e o relato já informados.
5. A foto é baixada da Meta, passa por `removerMetadados` (parte 5) e vai para o storage. Se não
   servir, a pessoa fica sabendo e continua no passo da foto.
6. A pauta é criada em `em_curadoria`, com a meta do bloco congelada (RN04), o criador como owner
   (RN06), o primeiro relato com a foto e os eventos `pauta_criada` e `owner_entrou`.
7. O bot confirma com um resumo (título, local, meta, foto) e explica que a curadoria confere a
   pauta antes de ela aparecer no site.
8. "cancelar" em qualquer passo volta ao menu sem criar nada.

## Critérios de aceitação

1. A pauta aparece com status `em_curadoria` (a fila da curadoria) e a foto guardada sem metadados.
2. O criador fica registrado como owner.
3. Título, descrição e relato não ficam em claro na tabela `conversa` (RNF01).
4. Nenhuma recusa (título, descrição, estudante, bloco) grava pauta pela metade.
5. `pnpm check` verde.

## Fora de escopo

- A verificação em si e a retomada do pedido depois dela (2.4).
- O prazo da curadoria no resumo (não definido).
- Enviar as mensagens pela Cloud API: o `logSender` continua sendo o sender.
