# SCRUM-298 — Segurança: limites acumulados na verificação de e-mail

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| **Ticket** | [SCRUM-298](https://ic-team-pds.atlassian.net/browse/SCRUM-298) |
| **Dev**    | @eumarcosmendonca                                               |
| **Branch** | `fix/SCRUM-298-limites-verificacao`                             |
| **Ref**    | história 2.4 (SCRUM-99), troca de canal (SCRUM-267)             |

## O problema

O único freio era esperar 60 s para pedir outro código, e cada "reenviar" zerava as 5 tentativas.
Uma identidade conseguia ~7.200 palpites por dia num e-mail (0,7% de chance por dia), mandar 1.440
e-mails por dia a qualquer @ufal.br e, desde a SCRUM-267, quem acerta o código de um e-mail com
cadastro numa identidade nova leva o cadastro do dono.

## O que muda

- **Tabela `registro_verificacao`** (migração `0018`): uma linha por código **enviado** e por código
  **errado**, com os HMACs do e-mail e da identidade e a hora. Nada em claro. O que tem mais de 24 h
  é apagado (de qualquer pessoa) a cada gravação e também na limpeza de hora em hora
  (`apagarRegistrosVencidos`, junto com a da SCRUM-332): a tabela não cresce sem limite nem guarda
  linhas velhas num dia sem verificações.
- **Limites em 24 h, contados separados por e-mail e por identidade** (basta um dos dois):
  - **5 códigos enviados** (`MAX_ENVIOS_POR_DIA`): o 6º pedido é recusado e **nenhum e-mail sai**.
    Vale para o "reenviar" e para quem volta e manda o e-mail de novo.
  - **20 códigos errados** (`MAX_ERROS_POR_DIA`): a conferência para, nem o código certo vale, e
    nenhum código novo sai.
  - O "reenviar" continua zerando as 5 tentativas do código atual, mas **não** os contadores do dia.
- **Mensagem clara**, com a hora em que libera (horário de Maceió). Ela não diz se o limite foi pelo
  e-mail ou pelo número, para não ajudar quem testa e-mails de outras pessoas.
- **Aviso de transferência**: quando o cadastro passa para outra identidade (troca de canal), sai
  um e-mail para o endereço do cadastro: "seu cadastro foi ligado a outro número ou chat; se não
  foi você, responda este e-mail". Falha nesse envio não desfaz a verificação.
- Código que falhou ao enviar não conta no limite (o código é apagado, como antes).

## Decisões

- **Números** (os da proposta): 5 envios e 20 erros por dia, por e-mail e por identidade. Com eles,
  o pior caso cai para 20 palpites por dia por e-mail, somando todas as identidades: ~0,002% de
  chance por dia, contra ~0,7% por identidade antes.
- **Limite por e-mail também bloqueia o dono legítimo** enquanto alguém ataca o e-mail dele (por até
  24 h). É o preço de não deixar adivinhar; a mensagem diz a hora de voltar.
- **Sem a CHAVE_HMAC no passo, o código não sai**: sem o HMAC do e-mail não há como contar o limite.
  O worker sempre passa; só testes antigos ficariam sem.
- **O aviso vai para o mesmo e-mail** que recebeu o código. Se o atacante tiver a caixa da vítima,
  o aviso não ajuda, mas aí ele já é "dono" do e-mail para o Lumens; o aviso serve contra o acerto
  por força bruta, que é o caso desta task.

## Migração

`packages/db/src/schema.ts` ganhou `registrosVerificacao`. O SQL e o snapshot são gerados com
`pnpm --filter @lumens/db exec drizzle-kit generate --name registro_verificacao` (veja
[docs/desenvolvimento/migracoes.md](../../desenvolvimento/migracoes.md)).

Na revisão, a primeira versão (`0016`) colidia com a `0016` da #143 (SCRUM-300). A branch foi
refeita em cima da #144 (SCRUM-295, que já traz a #143) e da #159 (SCRUM-332, limpeza de hora em
hora), e a migração gerada de novo como `0018`, com o snapshot contendo o enum da #143 e o `papel`
da #144. Por isso este PR entra depois da #143, da #144 e da #159.

## Testes

| arquivo                                    | o quê                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/dominio/.../verificacao.test.ts` | limite de envios por e-mail (somando identidades) e por identidade; libera ao sair da janela; "reenviar" não zera os 20 erros; erros por e-mail; registro só com HMAC e limpeza |
| `apps/backend/.../verificacao.test.ts`     | 6º código recusado sem e-mail; voltar ao e-mail não escapa; 20 erros bloqueiam o código certo e o reenvio; aviso de transferência                                               |
| `apps/backend/src/email/codigo.test.ts`    | e-mail de aviso: destinatário, data em Maceió, o que fazer, sem link; falha sem o endereço no log                                                                               |
| `packages/db/src/schema.test.ts`           | 20 tabelas; colunas de telefone/e-mail continuam só HMAC ou cifradas                                                                                                            |
