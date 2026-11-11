# Homologação

Ambiente público do Lumens para a demo (SCRUM-93): uma máquina virtual rodando Postgres,
back-end, painel de curadoria e Caddy em `docker compose`. O site continua na Vercel.

O painel roda aqui, e não na Vercel, porque precisa do banco e o banco não tem porta publicada.
Ele responde em `https://painel.<DOMINIO>`: com DuckDNS o nome já resolve para o mesmo IP; com
outro DNS, crie o registro antes do deploy. Precisa do `AUTH_SECRET` no `.env.producao`
(`openssl rand -base64 32`); o deploy recusa publicar sem ele.

## Onde roda, e por que não é a AWS

A decisão original era AWS. Ela não se sustentou, e o motivo fica aqui para ninguém repetir
o caminho:

| Nuvem                  | O que impediu                                                                                                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AWS Free plan**      | Uma _service control policy_ da organização nega `ec2:CreateKeyPair`, `ec2:CreateSecurityGroup` e até `ec2:DescribeKeyPairs`. SCP fica acima do IAM, então `AdministratorAccess` e o root da conta não contornam — e a conta gerenciadora é da própria AWS. O único caminho seria o Paid plan, com cartão |
| **Oracle Always Free** | O cadastro brasileiro exige CNPJ e cartão de crédito                                                                                                                                                                                                                                                      |
| **Azure for Students** | Nenhuma das duas barreiras: $100 por 365 dias, sem cartão, verificado pelo e-mail acadêmico                                                                                                                                                                                                               |

Usamos **Azure for Students**. A verificação funcionou com `@ic.ufal.br`; `@edge.ufal.br` não
foi reconhecido como domínio acadêmico.

Como a conta não tem cartão vinculado, **ela não gera fatura**: se o crédito acabar, os
recursos param. O risco aqui é o ambiente sumir, não uma cobrança.

> Tudo abaixo descreve uma VM Linux comum. Nada é específico do Azure além das telas de
> criação — a mesma pilha sobe em qualquer provedor que entregue uma máquina com Docker.

## 1. Criar a máquina

Portal do Azure → **Virtual machines** → **Create** → _Azure virtual machine_.

| Campo                 | Valor                                                        |
| --------------------- | ------------------------------------------------------------ |
| Resource group        | `lumens-homologacao` (criar novo)                            |
| Virtual machine name  | `lumens-homolog`                                             |
| Region                | `(South America) Brazil South`                               |
| Image                 | **Ubuntu Server 24.04 LTS - x64 Gen2**                       |
| Size                  | **B2s** (2 vcpus, 4 GiB)                                     |
| Authentication type   | SSH public key                                               |
| Username              | `azureuser`                                                  |
| SSH public key source | Generate new key pair                                        |
| Key pair name         | `lumens-homolog-key`                                         |
| Public inbound ports  | Allow selected: **SSH (22)**, **HTTP (80)**, **HTTPS (443)** |

A porta 22 fica aberta para qualquer origem, e isso é deliberado: o job `deploy-backend` roda
num runner `ubuntu-latest` do GitHub, cujo IP muda a cada execução — restringir a origem faria
o deploy automático terminar em timeout. Quem protege o acesso é a chave: autenticação por
senha não é habilitada. Não "endureça" essa regra sem antes dar ao CI outra rota até a máquina.
| OS disk size | **30 GiB** ou mais |

Sobre o tamanho: a imagem do back-end tem ~1,1 GB e o `pnpm install` do build é guloso de
memória. Com 1 GiB (B1s) o build precisa de swap e fica no limite; com 4 GiB, não. O B2s
consome mais crédito, e com $100 e algumas semanas até a demo isso cabe com folga — confira
o preço que o portal mostra antes de criar, não a estimativa deste documento.

Ao criar, o navegador baixa `lumens-homolog-key.pem`. **É a única cópia.** No Windows:

```powershell
icacls $HOME\Downloads\lumens-homolog-key.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

## 2. Endereço fixo

Por padrão o IP público do Azure é dinâmico e muda quando a VM é desalocada — o que quebraria
o DNS e o certificado.

Portal → a VM → **Networking** → clique no **Public IP address** → **Configuration** →
**Assignment: Static** → **Save**.

Anote o IP.

## 3. Domínio

O Caddy precisa de um domínio real apontando para esse IP: é por ele que o Let's Encrypt
valida, e é a URL do webhook da Meta.

**Não use o nome que o Azure oferece** (`*.cloudapp.azure.com`). Ele saiu da Public Suffix
List, então todos esses nomes dividem o mesmo limite de emissão do Let's Encrypt no mundo
inteiro. Emite hoje e pode recusar amanhã, sem aviso.

Se houver subdomínio da UFAL, é a melhor opção. Senão, um gratuito com faixa própria de
emissão resolve — por exemplo **DuckDNS** (`duckdns.org`): criar um nome, apontar para o IP
da VM, e usar `<nome>.duckdns.org` em `DOMINIO`.

Confira antes de seguir, de outra máquina:

```bash
nslookup <nome>.duckdns.org
```

Tem de devolver exatamente o IP da VM. Se não devolver, o certificado não sai.

## 4. Preparar o servidor

```bash
ssh -i ~/Downloads/lumens-homolog-key.pem azureuser@<IP>
```

Docker e git:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git && sudo systemctl enable --now docker && sudo usermod -aG docker azureuser
```

Saia e entre de novo no SSH para o grupo `docker` valer. Confira:

```bash
docker compose version
```

Clone em `/opt/lumens` — é o caminho que o `scripts/deploy-homologacao.sh` espera:

```bash
sudo mkdir -p /opt/lumens && sudo chown azureuser:azureuser /opt/lumens && git clone https://github.com/lumens0/lumens.git /opt/lumens
```

```bash
cd /opt/lumens && cp .env.producao.example .env.producao && cp .env.producao.admin.example .env.producao.admin && chmod 600 .env.producao .env.producao.admin
```

São **dois** arquivos de ambiente, e a divisão não é organizacional:

| Arquivo               | Quem recebe            | O que tem                              |
| --------------------- | ---------------------- | -------------------------------------- |
| `.env.producao`       | `backend`, `migracao`  | logins restritos, chaves, Meta, e-mail |
| `.env.producao.admin` | `postgres`, `migracao` | owner do banco e senhas dos papéis     |

O serviço `backend` **não** recebe o arquivo admin. Se o processo que atende a internet
tivesse `DATABASE_URL_MIGRACAO`, um comprometimento dele daria acesso de owner: apagar
trigger, reescrever a linha do tempo de eventos, contornar os privilégios de `lumens_app`.
É a mesma separação do `.env` e `.env.database` locais, documentada em
`packages/db/README.md` e exercida pelo teste de isolamento do back-end.

O `scripts/deploy-homologacao.sh` recusa publicar se encontrar credencial administrativa
no `.env.producao`.

Preencha o `.env.producao`. As duas chaves de criptografia precisam ser **diferentes entre si
e diferentes das locais** — gere cada uma na própria instância:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Se o Node não estiver na instância, use o contêiner:

```bash
docker run --rm node:24-slim node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 5. Primeiro deploy

```bash
cd /opt/lumens && ./scripts/deploy-homologacao.sh origin/main
```

A migração roda antes de subir a nova versão, em comando separado: se ela falhar, o script
para e nada é publicado. Confira:

```bash
curl -s https://<DOMINIO>/saude
```

Esperado: `{"ok":true}`. Para a demo, com o banco vazio:

```bash
cd /opt/lumens && docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm migracao pnpm db:seed
```

## 6. Deploy automático

Cinco secrets no repositório (Settings → Secrets and variables → Actions):

| Secret                    | Valor                                |
| ------------------------- | ------------------------------------ |
| `HOMOLOG_SSH_HOST`        | IP público da VM                     |
| `HOMOLOG_SSH_USUARIO`     | `azureuser`                          |
| `HOMOLOG_SSH_CHAVE`       | conteúdo de `lumens-homolog-key.pem` |
| `HOMOLOG_SSH_KNOWN_HOSTS` | saída de `ssh-keyscan <IP>`          |
| `HOMOLOG_DOMINIO`         | o domínio, sem `https://`            |

A partir daí, todo push na `main` com o `check` verde roda o job `deploy-backend`, que migra
e publica o SHA exato que passou nos testes, e termina com um smoke test em `/saude` e
`/resumo`.

## 7. Webhook da Meta

Com o HTTPS no ar, cadastre `https://<DOMINIO>/webhook` no painel da Meta, com o mesmo
`META_VERIFY_TOKEN` do `.env.producao`.

## Ligar e desligar

A VM é o único gasto relevante do crédito: **$0,153 por hora ligada**, contra uns $3/mês de
disco quando desalocada. Com $100, ligada sem parar ela dura 27 dias. Desligada fora de uso,
dura o semestre.

Por isso a homologação **fica desligada por padrão** e é ligada quando alguém precisa dela.

**Desligamento automático.** No portal: a VM → **Operations** → **Auto-shutdown** → ativar,
horário **23:00**, fuso **(UTC-03:00) Brasília**, com notificação por e-mail 30 minutos antes.
A notificação traz um link para adiar por hoje, útil para quem estiver trabalhando tarde.
Isso tira a disciplina das pessoas: ninguém precisa lembrar.

**Ligar.** Portal → a VM → **Start**, ou pelo app do Azure no celular. Leva menos de um minuto.

**Semana da demo.** Desative o auto-shutdown e deixe ligada. Uma semana contínua custa ~$26 e
elimina o risco de o ambiente estar fora na hora errada.

### O que acontece com o deploy quando ela está desligada

O job `deploy-backend` testa a porta 22 antes de tentar publicar. Se a VM não responder, ele
**encerra com aviso, não com erro**: o merge na `main` continua verde e nada é publicado.

Isso é deliberado. Falhar o job pintaria a `main` de vermelho sem ninguém ter errado nada, e
CI que fica vermelho por motivo normal é CI que todo mundo aprende a ignorar.

Para publicar depois de ligar a máquina: **Actions → CI → Run workflow**. O `check` roda de
novo e o deploy sai em seguida. Vale conferir o aviso da execução anterior para saber se havia
mesmo algo pendente de publicar.

### O que o site mostra quando ela está desligada

O site continua no ar na Vercel, mas as páginas que leem a API (`/`, `/conquistas`, `/atividade`
e `/p/{slug}`) respondem **HTTP 500** e mostram o estado de erro do `error.tsx`: um `role="alert"`
com "Não deu para carregar as pautas." e o botão "Tentar de novo". As páginas que não leem a API
(`/privacidade`, `/dev/componentes`) seguem respondendo 200.

Isso é o comportamento esperado com a API fora do ar, não um defeito do site. Conferido em
2026-11-10 em `https://lumens-ufal.vercel.app/`, com a VM desligada (o `deploy-backend` da `main`
pulou a publicação).

O HTML que o servidor devolve nesse caso vem vazio: quem desenha o estado de erro é o navegador.
`curl` mostra só o 500; para ver o que a pessoa vê, abra a página num navegador.

Para tirar a dúvida entre "ambiente desligado" e "defeito":

1. Ligue a VM e espere `curl -s https://<DOMINIO>/saude` responder 200.
2. Recarregue `https://lumens-ufal.vercel.app/` (ou toque em "Tentar de novo"). A lista tem que
   aparecer.
3. Se o `/saude` responde 200 e a home continua em erro, aí é configuração ou código: confira a
   `LUMENS_API_URL` do projeto do site na Vercel e os logs da função na Vercel.

## Quando algo falha

```bash
cd /opt/lumens && docker compose -f docker-compose.prod.yml --env-file .env.producao logs --tail 100 backend
```

- **`/saude` responde 503:** o back-end está vivo e o banco não. Veja os logs do `postgres`.
- **Certificado não sai:** confira se o `DOMINIO` resolve para o IP da VM e se a porta 80 está
  liberada no NSG — a validação do Let's Encrypt passa por ela. Se o erro falar em _rate
  limit_, o domínio escolhido divide faixa de emissão com muita gente; troque de domínio.
- **Build morre sem mensagem:** disco cheio ou memória. `df -h` e `free -h` respondem qual.
- **Crédito acabou:** os recursos param e o ambiente some do ar. Sem cartão vinculado não há
  cobrança — mas também não há aviso útil. Vale olhar o painel _Education_ de vez em quando.
