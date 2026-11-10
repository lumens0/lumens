// Mede o tempo de resposta do webhook e compara com o prazo de 5 s da Meta (SCRUM-97).
// Uso: pnpm --filter @lumens/backend latencia [--url <url>] [--vezes <n>] [--secret <s>]
// Veja docs/meta/webhook-validacao.md. O .env da raiz é carregado pelo script `latencia`.
import { PRAZO_META_MS, medirLatencia } from '../src/bot/sim/latencia';
import { sendSigned, urlPadrao } from '../src/bot/sim/send';

const URL_PADRAO = urlPadrao(process.env.PORT);

const USAGE = `Uso: pnpm --filter @lumens/backend latencia [opções]

Envia pedidos assinados ao webhook, um depois do outro, e mostra p50, p95 e máximo.
O corpo é um evento sem mensagens: passa pela assinatura e pelo processamento, mas não
enfileira nada, então pode rodar contra a homologação sem efeito colateral.

Opções:
  --url <url>      destino (padrão ${URL_PADRAO})
  --vezes <n>      quantos pedidos (padrão 20)
  --secret <s>     segredo da assinatura (padrão: META_APP_SECRET do .env)

Sai com código 1 se algum pedido não responder 200 ou passar de ${String(PRAZO_META_MS)} ms.`;

function sair(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}

const opcoes = { url: URL_PADRAO, vezes: 20, secret: process.env.META_APP_SECRET ?? '' };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i] ?? '';
  const valor = () => args[++i] ?? sair(`${arg} precisa de um valor\n\n${USAGE}`);
  if (arg === '--url') opcoes.url = valor();
  else if (arg === '--vezes') opcoes.vezes = Number(valor());
  else if (arg === '--secret') opcoes.secret = valor();
  else if (arg === '--help' || arg === '-h') sair(USAGE);
  else sair(`opção desconhecida: ${arg}\n\n${USAGE}`);
}
if (opcoes.secret === '') sair('META_APP_SECRET não está no ambiente; passe --secret');

const { url, secret } = opcoes;
const ms = (n: number) => `${n.toFixed(0)} ms`;

try {
  const r = await medirLatencia(
    async () => (await sendSigned({ object: 'whatsapp_business_account' }, { url, secret })).status,
    opcoes.vezes,
  );
  console.log(`${url} · ${String(r.amostras.length)} pedidos · ${new Date().toISOString()}`);
  console.log(
    `p50 ${ms(r.p50)} · p95 ${ms(r.p95)} · máximo ${ms(r.max)} · falhas ${String(r.falhas)}`,
  );
  console.log(
    r.dentroDoPrazo
      ? `OK: todos responderam 200 em menos de ${ms(PRAZO_META_MS)}`
      : `FORA DO PRAZO: houve resposta diferente de 200 ou acima de ${ms(PRAZO_META_MS)}`,
  );
  process.exit(r.dentroDoPrazo ? 0 : 1);
} catch (erro) {
  sair(`não consegui falar com ${url}: ${erro instanceof Error ? erro.message : String(erro)}`);
}
