# SCRUM-275 · WhatsApp pela Evolution API para a demonstração

Decisão · Demonstração · 2026-11-12 · @sthefanyblima
**Situação:** proposta. A equipe aprova (ou ajusta) na revisão da PR. O spike com o chip real
(seção "Spike") ainda falta e pode mudar a decisão.

## A pergunta

A demonstração em aula é por volta de **2026-11-25**, e o bot precisa conversar com celulares do
Brasil. A Cloud API oficial da Meta não alcança o Brasil com nenhum número que o Lumens consegue
ter. Por onde o bot conversa na demo?

### Por que a Meta não serve agora

Nada disto deve ser tentado de novo:

| Caminho                                              | O que aconteceu                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Número de teste da Meta (+1)                         | Recebe do Brasil, mas não envia nada: toda resposta e todo modelo voltam `failed` com o erro `130497` (restrição de país).               |
| Número de produção no portfólio "Lumens"             | Erro `#2494067` (limite de contas WABA): a Test Messaging Account ocupa a vaga. Adicionar o número na conta que já existe também falhou. |
| Portfólio novo, de uma conta do Facebook mais antiga | Recusado: "your business does not meet WhatsApp policy requirements".                                                                    |
| Suporte da Meta                                      | Casos `29308305175448516` (limite de contas e `130497`) e `1133000896185606` (chat: restrição regional, só um +55 de produção resolve).  |
| Verificação empresarial                              | Descartada na [SCRUM-191](SCRUM-191-verificacao-meta.md): não há CNPJ.                                                                   |
| Provedores oficiais (Twilio, 360dialog, Gupshup)     | Cadastram o número num portfólio da Meta e batem nos mesmos bloqueios.                                                                   |

## Opções avaliadas

| Opção                       | A favor                                                                                                             | Contra                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evolution API (Baileys)** | WhatsApp de verdade, no número de um chip comum; sobe em Docker na VM que já existe; tem webhook e API HTTP prontos | Fora dos termos do WhatsApp: o número pode ser banido. Sem botões nem listas confiáveis. Depende de uma biblioteca que acompanha o WhatsApp Web por engenharia reversa |
| Telegram                    | API oficial, gratuita, com botões                                                                                   | Não é o canal que o público do Lumens usa; o site e o discurso do projeto falam em WhatsApp                                                                            |
| Esperar a Meta              | Nenhum código novo                                                                                                  | Sem prazo nenhum; os casos de suporte não andaram                                                                                                                      |
| Só o simulador na demo      | Já funciona (`pnpm sim`)                                                                                            | Não mostra o bot num celular, que é o ponto da demonstração                                                                                                            |

## Decisão

**A demonstração usa o WhatsApp pela Evolution API: `CANAL_BOT=whatsapp` e
`CANAL_WHATSAPP=evolution`. O Telegram (SCRUM-267) é a reserva, com `CANAL_BOT=telegram`. O código
da Meta continua e volta a ser o padrão assim que um número de produção funcionar.**

1. **Um canal por implantação.** Segue a decisão do time na revisão do Telegram (PR #132):
   `CANAL_BOT` escolhe o aplicativo, e a Evolution é um provedor do WhatsApp, no lugar da Cloud
   API. Só o canal ativo sobe (webhook, respostas, avisos), e os segredos dos outros ficam vazios.
   Um ban do chip não alcança o Telegram: trocar é mudar a variável e fazer deploy. Conversa,
   filas, dedup, cifra, fotos e avisos são os mesmos; só mudam a entrada (webhook), a saída
   (envio) e o download da mídia.
2. **Menus numerados.** A Baileys não manda botões e listas de forma confiável para contas comuns.
   Cada lista ou conjunto de botões sai como texto numerado; o bot guarda o último menu de cada
   conversa (cifrado) e traduz "2", ou o título digitado, para o `id` da opção. A conversa recebe o
   mesmo input que receberia do toque no botão.
3. **Avisos só para quem escreveu nas últimas 24h.** Sem mensagem modelo aprovada, escrever
   primeiro para quem nunca falou com o número é o padrão de spam. Os outros avisos esperam na fila
   até a pessoa escrever, ou expiram em 7 dias como já acontece.
4. **Ritmo baixo:** 30 pessoas por 24h, 2 avisos por minuto, 20 a 45 segundos sorteados entre um e
   outro, "digitando…" antes de cada mensagem, abertura variada e sem prévia de link. Tudo
   configurável por variável de ambiente.
5. **Versão fixada** (v2.3.7, Baileys 7.0.0-rc.9), por tag e digest, sem atualização perto da demo.
6. **Nada exposto.** A Evolution não tem porta pública; o webhook dela chega ao back-end pela rede
   interna, e o Caddy fecha a rota para a internet.
7. **Privacidade.** O banco da Evolution guarda só a sessão do chip; o log do contêiner é
   desligado, porque a v2.3.7 escreve cada mensagem no stdout.

## Como o código reflete a decisão

- `apps/backend/src/config/env.ts`: `CANAL_WHATSAPP` e as `EVOLUTION_*`; `canalDoEnv` devolve o
  canal `whatsapp-evolution`, e as `META_*` deixam de ser exigidas.
- `apps/backend/src/bot/canais/evolution/`: o provedor em si. Os avisos implementam o
  `AvisoSender` do Telegram, com o mesmo `AvisoRenderizado`, e os erros estendem o mesmo
  `ErroDeEnvio`.
- `apps/backend/src/bot/canais/menu-em-texto.ts`: menu numerado e a tradução de volta para o `id`.
  O Telegram não precisa, porque tem teclado inline.
- `packages/dominio/src/avisos/fila.ts`: `reservarLote` ganhou `maximo` e
  `somenteQuemEscreveuDesde`, ao lado do `canal`. A Meta e o Telegram não usam.
- `estudante.ultima_mensagem_em` (migração `0015`): o worker grava em toda mensagem recebida,
  entendida ou não, e é por ela que a fila sabe quem escreveu nas últimas 24h. O `sair` apaga.
- Operação: [canal da Evolution](../operacao/evolution.md).

## Spike

O ponto que mais pesa é se a mensagem 1:1 chega com o **número** de quem escreveu, ou só com um
identificador `@lid`. O bot acha o estudante pelo telefone (`telefone_hmac`); sem o número, ele não
reconhece ninguém.

**Conferido no código da v2.3.7** (`whatsapp.baileys.service.ts`), em 2026-11-12:

- Quando a mensagem chega com `remoteJid` em `@lid` e a Baileys conhece o número, a Evolution troca
  o `remoteJid` pelo `remoteJidAlt` (o número) antes de mandar o webhook.
- O webhook aceita cabeçalhos próprios (o segredo vai no `Authorization`) e repete o envio com
  backoff quando o back-end responde 5xx, mas não quando responde 401.
- O download da mídia aceita a mensagem inteira, sem que a Evolution a tenha gravado.

**Conferido com a Evolution rodando localmente** (Docker, sem chip), em 2026-11-12: a imagem fixada
sobe, cria a instância com o webhook e manda o `Authorization` configurado.

**Com o chip pareado, em 2026-11-14** (Evolution local, bot da branch em `pnpm dev`, chip
"Lumens" pareado por código de 8 letras; a equipe decidiu que bastava para a homologação):

- [x] **O número vem.** As 6 mensagens 1:1 recebidas chegaram com `addressingMode: lid` e, mesmo
      assim, com o número de quem escreveu em `remoteJid` e `remoteJidAlt`. O bot achou a
      pessoa pelo telefone; nenhuma caiu em "mensagem 1:1 sem número".
- [x] **Conversa de verdade:** saudação, aviso de privacidade, menu numerado ("1" escolheu a
      opção) e pedido de verificação de e-mail, com as respostas entregues (`DELIVERY_ACK`).
- [x] **Formato de `messages.upsert`** bate com os construtores do simulador para texto
      (`conversation`). **`messages.update`** vem com `keyId`, `fromMe`, `status` (`SERVER_ACK`,
      `DELIVERY_ACK`) e o `remoteJid` só em LID, sem número; a entrega casa pelo id, então não
      atrapalha.
- [x] **Instância desconectada:** a Evolution não responde ao `sendText`; o bot desiste em 30 s
      ("sem resposta"), a resposta volta pelo retry e, num lote de avisos, o lote para.
- [x] **Mensagem temporária** (`ephemeralMessage`) e de visualização única: apontadas na
      revisão do PR e tratadas no webhook, com teste.
- [ ] **Não conferido com mensagens reais:** foto (download pela mensagem inteira), mensagem
      encaminhada, áudio, grupo, uma segunda pessoa (só um número escreveu), "Aguardando
      mensagem" sem as mensagens gravadas na Evolution e o que chega quando a VM religa. Ficam
      para a primeira semana na homologação; se a foto falhar, a pessoa recebe o aviso de foto
      indisponível e o relato segue sem ela.

## O risco que esta decisão aceita

- **Banimento do número.** O uso é fora dos termos do WhatsApp. Mitigações: as regras de ritmo
  acima, chip aquecido, chip reserva e troca rápida (só parear de novo; os dados do Lumens não
  dependem do número do bot). A troca exige um deploy novo do site, porque o número do bot é
  fixado no build (`NEXT_PUBLIC_WHATSAPP_BOT`).
- **Mudança no WhatsApp quebrar a Baileys** perto da demo. Mitigação: versão fixada; o simulador
  e o Telegram como reserva.
- **Os dados passam por um canal fora dos termos do WhatsApp.** O conteúdo é o mesmo que passaria
  pela Meta, e o Lumens guarda o mesmo. A diferença é quem opera a conexão: a equipe, num aparelho
  conectado. Veja a revisão do aviso de privacidade abaixo.

## Aviso de privacidade (SCRUM-174)

O texto do aviso não precisa mudar: ele fala do que o Lumens guarda, e isso não muda com o canal.
Duas coisas entram na política completa (`/privacidade`) e na tabela da SCRUM-174, se a equipe
aprovar:

- Durante a demonstração, o bot conversa por um número comum conectado à Evolution API, operado
  pela equipe, e não pela plataforma oficial do WhatsApp para empresas.
- A conexão guarda só a sessão do número; mensagens e contatos não são gravados nela.

O aviso tem um link para a política e sai no primeiro contato. No canal da Evolution ele vai sem
prévia de link. É uma resposta a quem escreveu primeiro, o que pesa menos do que um link numa
mensagem que o bot inicia.

## Quando reabrir

- Um número +55 de produção funcionar na Cloud API da Meta: `CANAL_WHATSAPP=meta` volta a ser o
  caminho, e este canal sai do ar.
- O spike mostrar mensagem 1:1 sem número.
- O chip for banido duas vezes: o ritmo não está protegendo, e a reserva (Telegram) assume.
- A demonstração passar: este canal foi feito para ela, não para operar com estudantes de verdade.

## Fontes

- Evolution API v2.3.7: `CHANGELOG.md` e `src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`
  no repositório `EvolutionAPI/evolution-api`, tag `2.3.7`.
- Imagem `evoapicloud/evolution-api:v2.3.7`, digest
  `sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339` (Docker Hub).
- [SCRUM-191](SCRUM-191-verificacao-meta.md), [SCRUM-192](SCRUM-192-canal-avisos.md),
  [SCRUM-174](SCRUM-174-aviso-de-privacidade.md).
