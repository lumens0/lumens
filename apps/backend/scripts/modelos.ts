// Submete as mensagens modelo da Parte 3 à Meta (SCRUM-193).
// Uso: pnpm --filter @lumens/backend modelos --site <https://origem> [--so <nome>] [--imagem <png>] [--enviar]
//      pnpm --filter @lumens/backend modelos --situacao
// Sem --enviar, só imprime os pedidos. Veja docs/meta/mensagens-modelo.md.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { MODELOS, paraSubmissao, type NomeModelo } from '../src/bot/whatsapp/modelos';
import { listarModelosNaMeta } from '../src/bot/whatsapp/situacao-modelos';

const VERSAO_GRAPH = 'v23.0';

const USAGE = `Uso: pnpm --filter @lumens/backend modelos --site <https://origem> [opções]
     pnpm --filter @lumens/backend modelos --situacao

Opções:
  --site <url>      origem pública do site, usada no botão "Ver a pauta" (obrigatória para submeter)
  --so <nome>       submete só este modelo (padrão: todos)
  --imagem <png>    imagem de exemplo do cabeçalho (o card de uma pauta, 1080 × 1920), exigida
                    pela Meta nos modelos com imagem (lumens_conquista); só com --enviar
  --enviar          envia à Meta; sem isto, só imprime os pedidos
  --situacao        só consulta: lista id, situação e categoria de cada modelo na Meta
  --versao <v>      versão da Graph API (padrão ${VERSAO_GRAPH})

Para --enviar e --situacao: META_TOKEN e META_WABA_ID no ambiente (o .env da raiz é carregado).
Para --imagem: também META_APP_ID (o id do app da Meta, que recebe o upload).

Modelos: ${Object.keys(MODELOS).join(', ')}`;

function sair(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}

function lerOpcoes(args: string[]) {
  const opcoes = {
    site: '',
    so: undefined as string | undefined,
    imagem: undefined as string | undefined,
    enviar: false,
    situacao: false,
    versao: VERSAO_GRAPH,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    const valor = () => args[++i] ?? sair(`${arg} precisa de um valor\n\n${USAGE}`);
    if (arg === '--site') opcoes.site = valor();
    else if (arg === '--so') opcoes.so = valor();
    else if (arg === '--imagem') opcoes.imagem = valor();
    else if (arg === '--versao') opcoes.versao = valor();
    else if (arg === '--enviar') opcoes.enviar = true;
    else if (arg === '--situacao') opcoes.situacao = true;
    else if (arg === '--help' || arg === '-h') sair(USAGE);
    else sair(`opção desconhecida: ${arg}\n\n${USAGE}`);
  }
  if (opcoes.situacao && opcoes.enviar) sair(`--situacao não combina com --enviar\n\n${USAGE}`);
  if (opcoes.site === '' && !opcoes.situacao) sair(`--site é obrigatória\n\n${USAGE}`);
  return opcoes;
}

const opcoes = lerOpcoes(process.argv.slice(2));

// Só leitura: o que a Meta tem hoje de cada modelo. É daqui que sai a tabela de andamento.
if (opcoes.situacao) {
  const token = process.env.META_TOKEN;
  const waba = process.env.META_WABA_ID;
  if (!token || !waba) sair('META_TOKEN e META_WABA_ID precisam estar no ambiente para --situacao');

  let data;
  try {
    data = await listarModelosNaMeta({ waba, token, versao: opcoes.versao });
  } catch (erro) {
    sair(erro instanceof Error ? erro.message : String(erro));
  }
  for (const nome of Object.keys(MODELOS)) {
    const naMeta = data.filter((m) => m.name === nome);
    if (naMeta.length === 0) console.log(`${nome}: não está na Meta`);
    for (const m of naMeta) {
      console.log(`${nome}: id ${m.id} · ${m.status} · ${m.category} · ${m.language}`);
    }
  }
  process.exit(0);
}

if (opcoes.so !== undefined && !(opcoes.so in MODELOS)) {
  sair(`modelo desconhecido: ${opcoes.so}\n\n${USAGE}`);
}
const escolhidos =
  opcoes.so === undefined ? Object.values(MODELOS) : [MODELOS[opcoes.so as NomeModelo]];

const comImagem = escolhidos.filter((m) => m.cabecalho !== undefined);
if (opcoes.enviar && comImagem.length > 0 && opcoes.imagem === undefined) {
  sair(
    `${comImagem.map((m) => m.nome).join(', ')} leva imagem no cabeçalho: passe --imagem <png> ` +
      `com um card de exemplo (ou use --so para submeter os outros)`,
  );
}

/**
 * Sobe a imagem de exemplo pela Resumable Upload API e devolve o handle que vai no
 * `header_handle`. A Meta guarda o arquivo só para a revisão do modelo; não é o que a pessoa recebe.
 */
async function subirImagemDeExemplo(arquivo: string): Promise<string> {
  const token = process.env.META_TOKEN;
  const app = process.env.META_APP_ID;
  if (!token || !app) sair('META_TOKEN e META_APP_ID precisam estar no ambiente para --imagem');
  const bytes = await readFile(arquivo);
  const base = `https://graph.facebook.com/${opcoes.versao}`;
  const sessao = await fetch(
    `${base}/${app}/uploads?${new URLSearchParams({
      file_name: basename(arquivo),
      file_length: String(bytes.length),
      file_type: 'image/png',
    }).toString()}`,
    { method: 'POST', headers: { authorization: `Bearer ${token}` } },
  );
  const { id } = (await sessao.json()) as { id?: string };
  if (!sessao.ok || !id) sair(`upload da imagem: HTTP ${String(sessao.status)} sem id de sessão`);
  const envio = await fetch(`${base}/${id}`, {
    method: 'POST',
    headers: { authorization: `OAuth ${token}`, file_offset: '0' },
    body: bytes,
  });
  const { h } = (await envio.json()) as { h?: string };
  if (!envio.ok || !h) sair(`upload da imagem: HTTP ${String(envio.status)} sem handle`);
  return h;
}

// No dry-run não sobe nada: o pedido mostra onde o handle vai entrar.
const imagemDeExemplo =
  comImagem.length === 0
    ? undefined
    : opcoes.enviar && opcoes.imagem !== undefined
      ? await subirImagemDeExemplo(opcoes.imagem)
      : '<handle da imagem de exemplo>';

let pedidos;
try {
  pedidos = escolhidos.map((modelo) =>
    paraSubmissao(modelo, opcoes.site, imagemDeExemplo ? { imagemDeExemplo } : {}),
  );
} catch (erro) {
  sair(erro instanceof Error ? erro.message : String(erro));
}

if (!opcoes.enviar) {
  console.log(JSON.stringify(pedidos, null, 2));
  console.log(`\n(dry-run: ${String(pedidos.length)} modelo(s); use --enviar para submeter)`);
  process.exit(0);
}

const token = process.env.META_TOKEN;
const waba = process.env.META_WABA_ID;
if (!token || !waba) sair('META_TOKEN e META_WABA_ID precisam estar no ambiente para --enviar');

let falhas = 0;
for (const pedido of pedidos) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${opcoes.versao}/${waba}/message_templates`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(pedido),
      },
    );
    const corpo = await res.text();
    if (res.ok) {
      // A Meta devolve { id, status, category }. A categoria pode vir diferente
      // da pedida: é o primeiro sinal de que o texto foi lido como marketing.
      console.log(`${pedido.name}: ${corpo}`);
    } else {
      falhas++;
      console.error(`${pedido.name}: HTTP ${String(res.status)} ${corpo}`);
    }
  } catch (erro) {
    falhas++;
    console.error(`${pedido.name}: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}
process.exit(falhas > 0 ? 1 : 0);
