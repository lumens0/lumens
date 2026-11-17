# SCRUM-331 · Quem sai e volta com o mesmo e-mail é o mesmo estudante

## Contexto

A RN02 (um apoio por estudante por pauta) depende da chave `(pauta_id, estudante_id)` de `apoio`.
O `sair` apagava o telefone e o e-mail (cifrado e HMAC) e mantinha os apoios na linha antiga, sem
identidade. Na volta, `vincularEmail` não achava dono para o e-mail e criava outro estudante, que
podia apoiar de novo. Repetindo, uma pessoa sozinha batia a meta de uma pauta (mínimo 30), disparava
o aviso coletivo e deixava falso o número público. O mesmo valia para `voluntario` e
`resposta_conferencia`, que usam a mesma chave por estudante: a apuração da conferência também podia
ser manipulada.

## Decisão

**Ao sair, o HMAC do e-mail (`estudante.email_hmac`) fica.** Saem o telefone (lápide), o e-mail
cifrado, a conversa e o código, como antes.

Na volta, `vincularEmail` acha a linha antiga pelo HMAC do e-mail e a reativa: é o mesmo caminho da
troca de canal (SCRUM-267), que move o cadastro para a identidade nova e agora também regrava o
e-mail cifrado. `concluirVerificacao` limpa o `saiu_em`. Apoios, voluntariado e respostas de
conferência continuam ligados ao mesmo `estudante_id`, então repetir não soma.

## Por que esta, e não a alternativa

A alternativa da task era bloquear, na hora de apoiar, um e-mail que já participou daquela pauta.
Para isso, o mesmo HMAC teria de ficar guardado junto de cada apoio, voluntariado e resposta, ou num
registro à parte por pauta: mais dado guardado, em mais lugares, para chegar ao mesmo lugar. Manter
o HMAC na própria linha do estudante guarda uma coisa só e reaproveita a regra que já existe.

## LGPD

- O HMAC é feito com a `CHAVE_HMAC`: sem a chave, não dá para chegar ao e-mail, e nem com ela dá
  para recuperá-lo; só para conferir se um e-mail que alguém digitou é aquele.
- Finalidade única: reconhecer quem volta, para não contar a participação duas vezes (prevenção de
  fraude na contagem pública). Não é usado para contato nem aparece em lugar nenhum.
- Os textos dizem isso: o aviso de privacidade do bot e a seção "Seus direitos" de `/privacidade`.

## Efeitos

- Quem saiu e tenta se verificar com o mesmo e-mail a partir de uma identidade que **já tem outro
  cadastro** recebe "e-mail em uso", como na troca de canal.
- A volta reaproveita `curso` e `verificado_em` da linha antiga até o fim da verificação, que grava
  o curso escolhido agora e marca `verificado_em` de novo.
- Os papéis de owner/co-owner encerrados na saída continuam encerrados: voltar não devolve a pauta.

## Aprovação

Decisão tomada em 17/11/2026, a pedido da responsável pelo repositório (Sthefany Lima), que
autorizou decidir o ponto que a revisão deixou para a equipe: **o HMAC do e-mail fica no `sair`.**

- Apagá-lo reabriria a fraude que o PR fecha (uma pessoa refazendo o cadastro para apoiar de novo e
  bater a meta sozinha), e o aviso coletivo e o número público ficariam falsos.
- A escolha é a de menor dado entre as que fecham a brecha: um valor só, na linha do estudante, sem
  o e-mail e sem como recuperá-lo, só para reconhecer quem volta (ver a seção LGPD).
- Os textos que prometem isso (aviso de privacidade do bot e "Seus direitos" em `/privacidade`)
  descrevem a marca, e não dizem que tudo é apagado.
- Se a UFAL ou a disciplina exigir apagar também o HMAC, a saída é trocar a prevenção por outra
  (por exemplo, um bloqueio por pauta com prazo), e essa mudança volta a ser decidida aqui.

