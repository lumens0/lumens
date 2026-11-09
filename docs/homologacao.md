# Homologação

Ambiente público do Lumens para a demo (SCRUM-93): uma máquina virtual rodando Postgres,
back-end e Caddy em `docker compose`. O site e o painel continuam na Vercel.

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
| OS disk size          | **30 GiB** ou mais                                           |

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
cd /opt/lumens && cp .env.producao.example .env.producao
```

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
