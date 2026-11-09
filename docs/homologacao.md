# Homologação na AWS

Ambiente público do Lumens para a demo (SCRUM-93): uma instância EC2 rodando Postgres,
back-end e Caddy em `docker compose`. O site e o painel continuam na Vercel.

> **A conta é do Free plan.** Ela fecha sozinha 6 meses depois de criada, ou antes se os
> créditos acabarem, e os dados são apagados 90 dias depois disso. Não guarde nada aqui que
> não possa ser recriado pelo seed.

## Por que esta forma

| Decisão                 | Alternativa descartada  | Motivo                                                                                                                                                       |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Postgres na própria EC2 | RDS                     | Um serviço em vez de dois, montagem em horas e não em um dia, e muito menos crédito. O preço é não ter backup automático — a SCRUM-95 vira `pg_dump` em cron |
| Caddy                   | ACM + ALB               | O ALB sozinho consome os créditos. O Caddy emite e renova o certificado sem configuração                                                                     |
| Build na instância      | ECR                     | Menos uma peça. Exige swap, porque a t3.micro tem 1 GB de RAM                                                                                                |
| Site na Vercel          | Amplify / S3+CloudFront | Já funciona, é o endereço registrado na SCRUM-242 e não gasta crédito                                                                                        |

## Antes de qualquer recurso

**1. Alerta de orçamento.** Console → Billing and Cost Management → Budgets → Create budget →
_Zero spend budget_. É a única proteção contra a conta fechar no meio do semestre.

**2. Credenciais do CLI:**

```bash
aws configure
```

```bash
aws sts get-caller-identity
```

## Rede e acesso

A chave privada sai no `stdout` uma única vez — se perder, não há como recuperar, só criar outra.

```bash
aws ec2 create-key-pair --key-name lumens-homologacao --query KeyMaterial --output text > ~/.ssh/lumens-homologacao.pem
```

```bash
chmod 600 ~/.ssh/lumens-homologacao.pem
```

Security group: 80 e 443 abertos para a internet (o Caddy precisa da 80 para validar o
certificado), e 22 **só para o seu IP**.

```bash
aws ec2 create-security-group --group-name lumens-homologacao --description "Homologacao do Lumens"
```

```bash
aws ec2 authorize-security-group-ingress --group-name lumens-homologacao --protocol tcp --port 80 --cidr 0.0.0.0/0
```

```bash
aws ec2 authorize-security-group-ingress --group-name lumens-homologacao --protocol tcp --port 443 --cidr 0.0.0.0/0
```

```bash
aws ec2 authorize-security-group-ingress --group-name lumens-homologacao --protocol tcp --port 22 --cidr $(curl -s https://checkip.amazonaws.com)/32
```

Nunca abra a 5432. O compose não publica a porta do Postgres, então o banco só existe
dentro da rede dos contêineres — é assim que o critério "o banco não aceita conexão vinda
da internet" se sustenta.

## A instância

20 GB de disco, não os 8 GB padrão: a imagem do back-end tem ~1,1 GB, e com Postgres, cache
de build e a versão anterior da imagem o disco de 8 GB enche em poucos deploys. O erro que
aparece depois é falta de espaço no build, que não parece ter relação com o deploy.

```bash
aws ec2 run-instances --image-id $(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value --output text) --instance-type t3.micro --key-name lumens-homologacao --security-groups lumens-homologacao --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3"}}]' --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=lumens-homologacao}]'
```

Endereço fixo, para o DNS não quebrar a cada reinício:

```bash
aws ec2 allocate-address --domain vpc
```

```bash
aws ec2 associate-address --instance-id <ID-DA-INSTANCIA> --allocation-id <ID-DO-ENDERECO>
```

> IPv4 público é cobrado por hora mesmo associado a uma instância ligada. Sai de graça dos
> créditos, mas entra na conta — e um endereço alocado e **não** associado custa igual.
> Se derrubar a instância, libere o endereço com `aws ec2 release-address`.

## Preparar o servidor

Conecte com `ssh -i ~/.ssh/lumens-homologacao.pem ec2-user@<IP>` e rode:

```bash
sudo dnf install -y docker git && sudo systemctl enable --now docker && sudo usermod -aG docker ec2-user
```

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins && sudo curl -sSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose && sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

Swap, senão o `pnpm install` dentro do build estoura o 1 GB de RAM da t3.micro:

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Saia e entre de novo no SSH para o grupo `docker` valer. Então clone o repositório em
`/opt/lumens` (é o caminho que o `scripts/deploy-homologacao.sh` espera) e preencha o
ambiente:

```bash
sudo mkdir -p /opt/lumens && sudo chown ec2-user:ec2-user /opt/lumens && git clone https://github.com/lumens0/lumens.git /opt/lumens
```

```bash
cd /opt/lumens && cp .env.producao.example .env.producao
```

Gere as duas chaves, **diferentes entre si e diferentes das locais**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Domínio

O Caddy precisa de um domínio real apontando para o IP da instância. O DNS público da AWS
não serve: o Let's Encrypt recusa emitir para `*.amazonaws.com`. Use o subdomínio da UFAL,
se houver, ou um gratuito. Coloque o nome em `DOMINIO`, no `.env.producao`.

## Primeiro deploy

```bash
cd /opt/lumens && ./scripts/deploy-homologacao.sh origin/main
```

Para a demo, com o banco vazio:

```bash
cd /opt/lumens && docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm migracao pnpm db:seed
```

## Deploy automático

Quatro secrets no repositório (Settings → Secrets and variables → Actions):

| Secret                    | Valor                                       |
| ------------------------- | ------------------------------------------- |
| `HOMOLOG_SSH_HOST`        | IP público da instância                     |
| `HOMOLOG_SSH_USUARIO`     | `ec2-user`                                  |
| `HOMOLOG_SSH_CHAVE`       | conteúdo de `~/.ssh/lumens-homologacao.pem` |
| `HOMOLOG_SSH_KNOWN_HOSTS` | saída de `ssh-keyscan <IP>`                 |
| `HOMOLOG_DOMINIO`         | o domínio sem `https://`                    |

A partir daí, todo push na `main` com o `check` verde roda o job `deploy-backend`: ele migra
primeiro, em comando separado, e só então sobe a nova versão. **Migração que falha interrompe
o deploy e deixa a versão anterior servindo.** No fim, o smoke test bate em `/saude` e
`/resumo`.

## Webhook da Meta

Com o HTTPS no ar, cadastre `https://<DOMINIO>/webhook` no painel da Meta, usando o mesmo
`META_VERIFY_TOKEN` do `.env.producao`.

## Quando algo falha

```bash
cd /opt/lumens && docker compose -f docker-compose.prod.yml --env-file .env.producao logs --tail 100 backend
```

- **`/saude` responde 503:** o back-end está vivo e o banco não. Veja os logs do `postgres`.
- **Certificado não sai:** confira se o `DOMINIO` resolve para o IP da instância e se a porta
  80 está aberta — a validação do Let's Encrypt passa por ela.
- **Build morre sem mensagem:** quase sempre é o swap ausente ou o disco cheio. `free -h` e
  `df -h` respondem qual dos dois.
