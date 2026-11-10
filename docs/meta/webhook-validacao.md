# Validação do webhook no painel da Meta

SCRUM-97 · Parte 2.

O código do webhook está coberto por testes (`apps/backend/src/bot/webhook/webhook.test.ts`). O que
os testes não provam é o critério externo da história: **a Meta verificar o endereço no painel e
receber o 200 em menos de 5 segundos**. Este roteiro é como provar isso e onde guardar a prova.

A história só fecha com a tabela de [evidências](#evidências) preenchida.

## O que já é conferido sem a Meta

| Critério                                                    | Onde                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /webhook` devolve o `hub.challenge` com o token certo  | `webhook.test.ts`                                              |
| Token errado ou `hub.challenge` repetido → 403              | `webhook.test.ts`                                              |
| `POST` sem assinatura ou com assinatura inválida → 401      | `webhook.test.ts`                                              |
| Mensagem repetida (mesmo `wamid`) é enfileirada uma vez só  | `webhook.test.ts`                                              |
| Telefone, `wamid` e token não aparecem em claro no log      | `webhook.test.ts`                                              |
| 20 mensagens seguidas respondem 200 dentro do prazo da Meta | `webhook.test.ts`, com `medirLatencia` (`bot/sim/latencia.ts`) |

## Antes de começar

Quem faz precisa de:

- acesso de administrador ao app da Meta usado pelo bot (developers.facebook.com);
- o `META_VERIFY_TOKEN` e o `META_APP_SECRET` do `.env.producao` da homologação;
- a homologação **ligada** (ela fica desligada por padrão: veja
  [Ligar e desligar](../homologacao.md#ligar-e-desligar)).

Confira que o back-end está no ar antes de abrir o painel:

```bash
curl -s https://<DOMINIO>/saude
```

## Roteiro

1. **Medir a latência daqui.** Na raiz do repositório, com o `META_APP_SECRET` da homologação no
   `.env` (ou em `--secret`):

   ```bash
   pnpm --filter @lumens/backend latencia --url https://<DOMINIO>/webhook
   ```

   O comando manda 20 pedidos assinados e sem mensagens (não enfileira nada) e mostra p50, p95 e
   máximo, já com a rede no meio. Tem que terminar com `OK` e código de saída 0. Guarde a saída.

2. **Verificar o endereço.** No painel: o app → **WhatsApp** → **Configuração** → **Webhook** →
   **Editar**. Preencha:
   - _URL de callback_: `https://<DOMINIO>/webhook`
   - _Token de verificação_: o `META_VERIFY_TOKEN`

   Clique em **Verificar e salvar**. A Meta faz o `GET /webhook` na hora; se o painel salvar sem
   erro, o endereço está verificado. Tire um print da tela com a URL salva.

3. **Assinar o campo `messages`.** Na mesma tela, em **Campos do webhook**, ative `messages`.

4. **Receber um evento de verdade.** Ainda em **Campos do webhook**, clique em **Testar** na linha
   `messages`, ou mande uma mensagem do seu WhatsApp para o número do bot. No servidor:

   ```bash
   cd /opt/lumens && docker compose -f docker-compose.prod.yml --env-file .env.producao logs --since 5m backend | grep -E 'incoming request|request completed'
   ```

   Cada pedido rende duas linhas com o mesmo `reqId`: `incoming request`, com `POST` e
   `/webhook`, e `request completed`, com `statusCode` 200 e o `responseTime` em milissegundos.
   Guarde as duas: é o tempo medido no servidor para um evento vindo da própria Meta.

5. **Registrar.** Preencha a tabela abaixo numa PR e cole o mesmo resumo no ticket.

## Se algo falhar

- **O painel recusa a verificação:** o token digitado não é o do `.env.producao`, ou o domínio não
  responde em HTTPS. O log do back-end mostra `verificação do webhook recusada` quando o pedido
  chega com token errado; se nada aparece, o pedido nem chegou (DNS, certificado ou VM desligada).
- **O evento de teste responde 401:** o `META_APP_SECRET` do servidor não é o do app do painel.
- **`latencia` termina com `FORA DO PRAZO`:** não feche a história. Anote os números e investigue
  o banco (`/saude`) antes de repetir.

## Evidências

Nenhuma validação no painel foi registrada até 2026-11-10. Preencha quando fizer:

| Item                                           | Valor |
| ---------------------------------------------- | ----- |
| Data e hora                                    |       |
| Quem validou                                   |       |
| Domínio usado                                  |       |
| Saída do `latencia` (p50 · p95 · máximo)       |       |
| Print do painel com o webhook verificado       |       |
| Linhas do log do `POST /webhook` vindo da Meta |       |
