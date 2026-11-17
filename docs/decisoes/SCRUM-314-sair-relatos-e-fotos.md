# SCRUM-314 · O que o `sair` apaga dos relatos, fotos e PDFs

## Contexto

O `sairDoLumens` apagava telefone, e-mail, conversa e código e encerrava os papéis de owner. Os
relatos, as fotos deles e os PDFs de resposta oficial ficavam, ligados a uma linha de `estudante`
que, depois da saída, não diz mais de quem é (só o curso). O `Storage` só sabia guardar.

Nenhum texto prometia apagar relatos ou fotos, mas nenhum dizia que eles ficavam, e o aviso do bot
falava em "apagar seu vínculo". A política não estava decidida (SCRUM-174 não trata disso).

## Decisão: meio-termo

| O quê                                         | No `sair`          | Por quê                                                                                |
| --------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| Relato pendente (na curadoria) e foto dele    | **Apagado**        | Só existe para a curadoria decidir; sem a pessoa, não tem por que ficar.               |
| Relato recusado e foto dele                   | **Apagado**        | Nunca vai ao site. Era a foto órfã de relato recusado que a task aponta.               |
| Relato aprovado (no site, sem nome) e foto    | Fica               | Já é público e dá contexto à pauta; a pessoa não aparece nele.                         |
| PDF da resposta oficial                       | Fica               | É o registro da cobrança da pauta (o que a ouvidoria respondeu), usado pela curadoria. |
| Apoios, voluntariado, respostas à conferência | Ficam (como antes) | Contam para a pauta, sem ligação com a pessoa.                                         |

Quem quer tirar um relato publicado ou um PDF pede à equipe pelo mesmo canal, de preferência antes
de sair: depois da saída, não há como saber de quem era.

## Como funciona

- `sairDoLumens` (domínio) apaga os relatos `pendente` e `recusado` da pessoa, na mesma transação, e
  devolve as chaves das fotos (`fotosParaApagar`).
- O bot (`privacidade.ts`) remove essas fotos do bucket com `ServicoDeFotos.removerFotos`
  (`Storage.remover`, `DeleteObjectCommand`). Melhor esforço: uma remoção que falha é avisada no log
  e não impede a saída. A remoção acontece antes do commit da mensagem; se a transação desfizer, o
  pg-boss reentrega o "sim" e o `sair` roda de novo (os relatos ainda estão lá, e as fotos que já
  saíram não fazem falta a um relato que vai sair também).
- Textos: o aviso de privacidade deixa de dizer "apagar seu vínculo"; a confirmação do `sair`, a
  mensagem final e a página `/privacidade` dizem o que sai e o que fica.

## O que fica de fora

- **Fotos órfãs de outras origens** (foto subida de novo num retry, PDF que não chegou a ser
  registrado): continuam sem limpeza. Precisam de uma varredura do bucket contra o banco, que é outra
  task.
- **Anonimizar o texto dos relatos aprovados**: o texto é da pessoa, mas está no site sem nome. Se a
  equipe decidir apagar também os aprovados, é trocar o filtro do `delete` em `sairDoLumens` e os
  textos.
