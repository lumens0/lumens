# TESTS — SCRUM-99

| arquivo                                                | o quê                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/dominio/src/verificacao.test.ts`             | `@ufal.br` e subdomínios aceitos; domínios parecidos recusados; frase, pontuação e maiúsculas; formato; limite de 254; dois endereços                                                                                                               |
| `apps/backend/.../verificacao.test.ts`                 | opção 3 do menu; aceite e recusas no bot; e-mail cifrado e fora das respostas e da tabela `conversa`; pedido pendente da 2.6 mantido; `cancelar`                                                                                                    |
| `packages/dominio/src/verificacao.test.ts` (SCRUM-135) | código sempre com 6 dígitos e sem repetição suspeita; hash SHA-256 que não contém o código e muda com o telefone; `guardarCodigo` com validade de 10 min e o upsert que substitui o código e zera as tentativas                                     |
| `apps/backend/src/email/codigo.test.ts`                | texto simples, remetente, código e validade no corpo, sem HTML nem link, assunto sem o código; falha do SMTP vira `false` e o aviso não tem endereço nem código; `logEmail`                                                                         |
| `apps/backend/.../verificacao.test.ts` (SCRUM-135)     | código enviado ao e-mail normalizado; banco só com o hash; código fora das respostas e da conversa; pedido novo troca o código; falha e falta do serviço de e-mail                                                                                  |
| `packages/dominio/src/verificacao.test.ts` (SCRUM-136) | certo apaga e não vale de novo; 5 erros esgotam, e nem o certo vale; vencido não gasta tentativa; código de outro telefone não vale; espera de 60 s; código novo zera as tentativas; `apagarCodigo`                                                 |
| `apps/backend/.../verificacao.test.ts` (SCRUM-136)     | certo segue para o curso; espaço no meio; errado conta; quinto erro; texto e tamanho errado não contam; vencido; reenviar antes e depois de 60 s; reenvio depois de esgotar; falha no reenvio; e-mail de novo antes de 60 s; sem e-mail na conversa |
| `packages/dominio/src/verificacao.test.ts` (SCRUM-137) | telefone novo cria sem `verificado_em`; repetir não duplica; e-mail de outro telefone recusa sem mexer em nada; troca de e-mail mantém verificação e libera o antigo; quem saiu continua o mesmo cadastro                                           |
| `apps/backend/.../verificacao.test.ts` (SCRUM-137)     | código certo cria o cadastro (HMAC e cifras conferidos); e-mail em uso explica e pede outro; nada revelado antes do código; sem telefone cifrado ou HMAC não gasta o código; sem e-mail na conversa                                                 |
| `packages/dominio/src/verificacao.test.ts` (SCRUM-138) | `cursoValido`; grava curso e `verificado_em`; curso fora da lista não grava; sem cadastro ou sem e-mail não verifica; primeira data mantida; quem saiu volta a valer                                                                                |
| `apps/backend/.../verificacao.test.ts` (SCRUM-138)     | lista de cursos; escolha pela lista e pelo nome digitado; curso fora da lista; retomada da pauta nova; apoio guardado para a 2.7; "3" de quem já é verificado; quem saiu se verifica de novo; sem vínculo                                           |

## Lacunas

- Os testes automatizados usam um transporte falso. O envio real foi testado à mão (SCRUM-139,
  11/11/2026), com o caminho da produção (`criarEmailSmtp`), para a conta `sbl2@ic.ufal.br`:
  - **Brevo** (`smtp-relay.brevo.com`) com remetente `@ic.ufal.br`: chegou na caixa de entrada,
    mas com o alerta de falsificação do Gmail ("Cuidado com esta mensagem") e "por
    ...brevosend.com". O SPF do `ic.ufal.br` só autoriza o Google e não há DKIM da Brevo no
    domínio; sem acesso ao DNS da UFAL, não há como corrigir.
  - **SMTP do Google** (`smtp.gmail.com:587`, senha de app da conta `@ic.ufal.br`): chegou na
    caixa de entrada sem alerta. É a configuração adotada.
- Ainda falta: testar numa segunda conta da UFAL (o teste foi da conta para ela mesma) e trocar
  o `.env.producao` da VM.
- Risco: o envio depende de uma conta pessoal de estudante. Se ela for desativada (formatura) ou
  a senha de app for revogada, o código deixa de sair; o limite do Google é de cerca de 2.000
  e-mails por dia.
