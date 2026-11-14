# Canal do WhatsApp pela Evolution API

Como ligar, parear, trocar o chip e desligar o canal não oficial do bot (SCRUM-275). Por que ele
existe e quando deixa de valer: [decisão SCRUM-275](../decisoes/SCRUM-275-canal-evolution.md).

O bot continua o mesmo; muda só por onde as mensagens entram e saem. A Evolution API (v2.3.7, com a
Baileys 7.0.0-rc.9) se conecta ao WhatsApp como um **aparelho conectado** do chip, igual ao
WhatsApp Web.

```text
celular ──WhatsApp──▶ chip ◀──aparelho conectado── evolution ──webhook──▶ backend
                                                     ▲                       │
                                                     └─────── envio ─────────┘
```

| Peça                 | Onde                                             | Porta pública?                         |
| -------------------- | ------------------------------------------------ | -------------------------------------- |
| `evolution`          | `docker-compose.prod.yml`, perfil `evolution`    | Não. Só `127.0.0.1:8081`, para o túnel |
| `evolution-postgres` | idem; guarda só a sessão do WhatsApp             | Não                                    |
| Webhook              | `http://backend:3000/webhook/evolution`, interno | Não: o Caddy responde 404 para a rota  |

## Antes de ligar

- **Chip aquecido.** Um número novo que começa mandando mensagem para muita gente é banido rápido.
  Use o chip como um WhatsApp normal por alguns dias antes: conversas com conhecidos, grupos, foto
  de perfil e nome.
- **Chip reserva**, também aquecido, para a troca rápida (veja abaixo).
- **Celular do chip ligado e com internet** de vez em quando. O WhatsApp desconecta os aparelhos
  conectados quando o celular principal passa uns 14 dias sem se conectar.

## Ligar na VM

1. No `.env.producao` da VM (veja `.env.producao.example`):

   ```bash
   CANAL_BOT=whatsapp
   CANAL_WHATSAPP=evolution
   EVOLUTION_URL=http://evolution:8080
   EVOLUTION_INSTANCIA=lumens
   ```

   E três segredos, cada um gerado na própria VM com `openssl rand -hex 32`:
   `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SEGREDO` e `EVOLUTION_PG_SENHA`.

   Um canal por implantação: deixe vazias as `META_*` e as `TELEGRAM_*`. Com a Evolution, o
   webhook da Meta não sobe, e o token do Telegram fica guardado fora da VM até ser usado.

2. Deploy normal:

   ```bash
   cd /opt/lumens && ./scripts/deploy-homologacao.sh origin/main
   ```

   Com `CANAL_WHATSAPP=evolution`, o script confere os três segredos e sobe também `evolution` e
   `evolution-postgres`.

3. Crie a instância, já com o webhook do back-end (uma vez só; ela fica no volume):

   ```bash
   cd /opt/lumens && ./scripts/evolution.sh criar
   ```

## Parear o chip

Há dois jeitos. O código é mais simples, porque não precisa de túnel.

**Pelo código de 8 letras.** Na VM:

```bash
cd /opt/lumens && ./scripts/evolution.sh parear 5582XXXXXXXXX
```

No celular do chip: WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** →
**Conectar com número de telefone**, e digite o `pairingCode` que o script mostrou.

**Pelo QR code.** No seu computador, abra um túnel até a VM:

```bash
ssh -i ~/Downloads/lumens-homolog-key.pem -L 8081:127.0.0.1:8081 azureuser@<IP>
```

Com o túnel aberto, entre em `http://localhost:8081/manager` com a `EVOLUTION_API_KEY`, abra a
instância `lumens` e leia o QR no celular do chip (Aparelhos conectados → Conectar um aparelho).

Confira:

```bash
cd /opt/lumens && ./scripts/evolution.sh estado
```

Esperado: `"state":"open"`. Mande "oi" de outro celular para o chip: o bot responde com o aviso de
privacidade e o menu.

## O site

Os botões do site abrem o WhatsApp do bot pelo `NEXT_PUBLIC_WHATSAPP_BOT`, que é fixado no build.
Com o chip pareado, troque essa variável na Vercel pelo número do chip e faça um deploy novo do
site. Sem isso, "Apoiar" e "Relatar um problema" abrem a conversa com o número antigo.

## Trocar de chip

Para o chip banido ou com problema. Os dados dos estudantes não se perdem: o bot os acha pelo
telefone **deles** (`telefone_hmac`), não pelo número do bot.

1. Tire o chip atual (se ele ainda estiver conectado):

   ```bash
   cd /opt/lumens && ./scripts/evolution.sh desvincular
   ```

2. Pareie o chip reserva (seção acima).
3. Troque o `NEXT_PUBLIC_WHATSAPP_BOT` na Vercel e faça um deploy novo do site.
4. Avise quem já conversava com o bot de que o número mudou: o bot novo não tem o histórico do
   WhatsApp, só os dados do Lumens.

Os avisos que estavam na fila saem pelo chip novo, para quem escrever a ele.

## Regras para não ser banido

O código já aplica estas regras. Não as afrouxe perto da demo:

- **Avisos só para quem escreveu ao bot nas últimas 24h.** Os outros esperam na fila até escrever,
  ou o aviso expira em 7 dias. O WhatsApp não tem mensagem modelo aprovada aqui: escrever primeiro
  para quem nunca falou com o número é o comportamento de spam.
- **Pouco volume:** até `EVOLUTION_LIMITE_PESSOAS` pessoas por 24h (padrão 30) e
  `EVOLUTION_AVISOS_POR_LOTE` por minuto (padrão 2).
- **Espaçado:** de `EVOLUTION_INTERVALO_MIN_S` a `EVOLUTION_INTERVALO_MAX_S` segundos sorteados
  entre dois avisos (padrão 20 a 45), com "digitando…" antes de cada mensagem.
- **Texto variado:** a abertura do aviso é sorteada; o corpo é o texto da mensagem modelo.
- **Sem prévia de link** em nenhuma mensagem.
- **Ninguém mais usa o chip** para mandar mensagem em massa, entrar em grupos grandes ou
  divulgar o bot.

## Versão fixada

A imagem está fixada por tag e digest em `docker-compose.prod.yml`. Cada versão nova da Evolution
traz uma Baileys nova, que muda o comportamento do WhatsApp Web. **Não atualize perto da demo.**
Para atualizar depois, troque tag e digest juntos e repita o roteiro de "Parear o chip" num chip
de teste antes.

## Privacidade

- O banco da Evolution guarda só a sessão do chip: `DATABASE_SAVE_DATA_*` desliga mensagens,
  contatos, conversas e histórico.
- A v2.3.7 escreve cada mensagem recebida no stdout. O serviço roda com `logging: driver: none`,
  então isso não fica na VM. Para investigar algo, troque por `driver: local` por pouco tempo e
  volte.
- O bot guarda o mesmo que guarda pela Meta: telefone cifrado e HMAC, conteúdo cifrado nas filas.
- Os volumes da Evolution ficam **fora do backup** de propósito ([backup](backup.md)): não há dado
  do Lumens neles, e a sessão do chip não deve sair da VM. Perdê-los só obriga a parear de novo.

## Trocar de canal (ban do chip, ou volta para a Meta)

Um canal por implantação: trocar é mudar a variável e fazer deploy. No `.env.producao`:

- **Para o Telegram** (a reserva, SCRUM-267): `CANAL_BOT=telegram`, com `TELEGRAM_BOT_TOKEN` e
  `TELEGRAM_WEBHOOK_SECRET` preenchidos (veja o `.env.producao.example`). Troque também o canal do
  site na Vercel (`NEXT_PUBLIC_CANAL_BOT`) e avise a turma.
- **Para a Meta:** `CANAL_WHATSAPP=meta`, com as `META_*` preenchidas.

Apague os segredos da Evolution do `.env.producao` e faça o deploy:

```bash
cd /opt/lumens && ./scripts/deploy-homologacao.sh origin/main
```

O `up` sem o perfil não para o que já está rodando. Pare a Evolution à mão:

```bash
cd /opt/lumens && docker compose -f docker-compose.prod.yml --env-file .env.producao --profile evolution stop evolution evolution-postgres
```

## VM desligada

A homologação fica desligada por padrão. Ao ligar, a Evolution reconecta sozinha com a sessão do
volume; confira com `./scripts/evolution.sh estado`. Se voltar `close`, pareie de novo.

O que acontece com as mensagens mandadas enquanto a VM estava desligada ainda precisa ser
conferido no spike (veja a decisão).

## Testar sem celular

O simulador fala o formato da Evolution, sem a Evolution rodando:

```bash
pnpm sim texto 'oi' --canal evolution
```

Veja [SIMULADOR.md](../../apps/backend/SIMULADOR.md).
