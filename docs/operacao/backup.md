# Backup do banco

Rotina de backup do Postgres da homologação (SCRUM-95) e como restaurar em caso de incidente.
A linha do tempo é permanente (RN11) e os apoios são a base de tudo: perder o banco apaga o
histórico das pautas. **Backup que nunca foi restaurado não conta**, por isso o teste de
restauração faz parte da rotina.

## Estratégia

A homologação é uma VM com o Postgres em Docker ([homologacao.md](homologacao.md)), não um banco
gerenciado. Então o backup é próprio:

| O quê        | Como                                                                                |
| ------------ | ----------------------------------------------------------------------------------- |
| Formato      | `pg_dump --format=custom`, conferido com `pg_restore --list` antes de valer         |
| Frequência   | Diária, pelo timer `lumens-backup.timer` (12:00 de Maceió)                          |
| VM desligada | `Persistent=true`: o backup perdido roda logo depois do próximo boot                |
| Retenção     | 7 diários + 4 semanais (o de domingo)                                               |
| Onde fica    | `/var/backups/lumens/{diario,semanal}` na própria VM, legível só pelo `azureuser`   |
| Fora da VM   | Cada diário, cifrado, num bucket privado do Backblaze B2, por 30 dias (até 60)      |
| Fotos e PDFs | Com o storage no MinIO, o espelho vai junto, num `.tar` cifrado por dia             |
| Cifra        | `age` com chave pública: a VM cifra e não decifra; a chave privada fica fora dela   |
| Restauração  | Toda quarta, pelo timer `lumens-restauracao.timer`, no dump do dia                  |
| Falha        | `OnFailure=` manda e-mail ao time (backup, envio ou teste de restauração)           |
| Acesso       | Só quem tem SSH na VM. O banco continua sem porta publicada: o dump sai pelo `exec` |

> **Fora do backup, de propósito:** os volumes da Evolution (`evolution-pgdata` e
> `evolution-instances`, SCRUM-275). Eles guardam só a sessão do chip do WhatsApp, nenhum dado do
> Lumens, e essa sessão não deve sair da VM. Perdê-los só obriga a parear o chip de novo
> ([canal da Evolution](evolution.md)).

> **Por que só a cópia de fora é cifrada:** o diário na VM fica no mesmo disco do próprio banco,
> que está em claro; cifrá-lo ali não protegeria nada e obrigaria a chave privada a morar na VM
> para o teste semanal. O que sai da VM vai cifrado, e a VM não consegue decifrar
> ([decisão SCRUM-309](../decisoes/SCRUM-309-backup-fora-da-vm.md)).

## Instalar na VM

Uma vez, depois do primeiro deploy. O `scripts/deploy-homologacao.sh` deixa um aviso no log do CI
a cada deploy enquanto o timer não estiver ativo, o último backup tiver falhado ou não houver
dump das últimas 72 h:

```bash
sudo mkdir -p /var/backups/lumens && sudo chown azureuser:azureuser /var/backups/lumens && sudo chmod 700 /var/backups/lumens
```

### Cópia fora da VM (Backblaze B2)

Uma vez, na conta do Backblaze da equipe (o plano gratuito tem 10 GB, sem cartão):

1. **Bucket:** _Buckets → Create a Bucket_, nome `lumens-backup`, **Private**, com _Default
   Encryption_ ligada. Anote o _Endpoint_ (`s3.<região>.backblazeb2.com`): a região é o pedaço do
   meio.
2. **Retenção:** em _Lifecycle Settings_ do bucket, _Use custom lifecycle rules_ com o prefixo
   **vazio** (vale para `diario/` e `arquivos/`), esconder depois de **30** dias e apagar **30**
   dias depois de escondido. Os 30 dias depois de escondido protegem a versão antiga se alguém
   enviar outro arquivo com o mesmo nome. Se o bucket já tiver uma regra só para `diario/`, troque-a
   por esta em vez de somar as duas: sem ela, nada em `arquivos/` expira e o bucket cresce até
   encher.
3. **Chave da VM:** _Application Keys → Add a New Application Key_, só para o bucket
   `lumens-backup`, com acesso **Write Only**. É a que vai para a VM: ela envia, mas não lê nem
   apaga. Quem invadir a VM ainda consegue esconder uma cópia ou mandar outra com o mesmo nome,
   e aí há 30 dias para recuperar a versão antiga em _Browse Files_ (mostrar versões escondidas).
   Imutabilidade de verdade exigiria o _Object Lock_ do B2; não ligamos.
4. **Chave de leitura:** outra, do mesmo bucket, **Read Only**. Vai só para o gerenciador de
   senhas da equipe; é a usada para [restaurar da cópia de fora](#restaurar-da-cópia-fora-da-vm).

Na **sua** máquina, nunca na VM, gere o par de chaves do `age`:

```bash
age-keygen -o lumens-backup-age.txt
```

O comando mostra a chave pública (`age1...`). Guarde o arquivo inteiro, que é a chave privada, no
gerenciador de senhas da equipe e apague-o da máquina. Sem ela nenhuma cópia de fora se restaura:
vale gerar dois pares, um por pessoa, e pôr as duas públicas na VM.

Na VM, instale as ferramentas e preencha o `.env.backup` (chave da VM do passo 3, as públicas do
`age` e quem recebe o alerta):

```bash
sudo apt-get install -y age rclone curl
```

```bash
cd /opt/lumens && cp .env.backup.example .env.backup && chmod 600 .env.backup
```

O alerta usa o SMTP do `EMAIL_*` do `.env.producao`; nada a configurar além do destinatário.

**Espaço no B2.** Com o storage das fotos no MinIO do compose, o envio manda também, todo dia, o
espelho inteiro das fotos e dos PDFs num `.tar` cifrado (`arquivos/` no bucket). Inteiro porque a
chave da VM não lista nem apaga: é assim que a foto de quem saiu deixa de ir para fora, e some do
bucket em até 60 dias depois da saída (30 no pacote mais velho que ainda a tem, mais 30 escondida).
Com a retenção acima ficam até 60 pacotes e 60 dumps, então os 10 GB do plano gratuito comportam um
espelho de até uns 150 MB com dumps de até uns 15 MB. Para conferir:
`du -sh /var/backups/lumens/arquivos /var/backups/lumens/diario`. Passando disso, ou o plano pago
(barato por GB), ou o envio do pacote só uma vez por semana.

### Unidades do systemd

```bash
sudo cp /opt/lumens/scripts/systemd/lumens-backup.{service,timer} /opt/lumens/scripts/systemd/lumens-restauracao.{service,timer} /opt/lumens/scripts/systemd/lumens-alerta@.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now lumens-backup.timer lumens-restauracao.timer
```

Conferir que está agendado e rodar o primeiro na hora:

```bash
systemctl list-timers lumens-backup.timer
```

```bash
sudo systemctl start lumens-backup.service && journalctl -u lumens-backup.service -n 20
```

O log termina com `Cópia fora da VM pronta`, e o arquivo `.dump.age` aparece em _Browse Files_ do
bucket. **Confira que a chave do cofre abre essa cópia**, uma vez agora e sempre que trocar as
chaves: baixe o `.dump.age` na sua máquina e decifre como no passo 2 de
[Restaurar da cópia fora da VM](#restaurar-da-cópia-fora-da-vm). Sai um arquivo do tamanho do dump,
e uma chave pública errada só apareceria no dia do incidente. Apague os dois arquivos em seguida.

Depois, **force uma falha** para ver o alerta chegar (o critério da SCRUM-309). O comando aponta o
envio para uma porta fechada, numa cópia do `.env.backup`, e devolve o original no fim. O dump
local continua sendo feito, e o destinatário do alerta não muda:

```bash
cd /opt/lumens && cp -p .env.backup .env.backup.bom && sed -i 's|^BACKUP_S3_ENDPOINT=.*|BACKUP_S3_ENDPOINT=http://127.0.0.1:9|' .env.backup && { sudo systemctl start lumens-backup.service; mv .env.backup.bom .env.backup; }
```

O `systemctl start` termina com erro, e em um minuto chega o e-mail `[Lumens] Falhou:
lumens-backup.service`. Se não chegar: `journalctl -u 'lumens-alerta@*' -n 20`. Rode o backup
de novo em seguida (`sudo systemctl start lumens-backup.service`), para a unidade não ficar
marcada como falha.

Ao mudar os scripts do envio ou do alerta, rode o teste de regressão. Ele só precisa do Docker: um
MinIO faz o papel do B2, e um Mailpit, o do SMTP.

```bash
./scripts/testar-backup-externo.sh
```

## Teste de restauração

Restaura o backup num banco **temporário** (`lumens_restauracao`) do mesmo Postgres, compara com
o banco de verdade e apaga o temporário no fim, inclusive se algo falhar. O banco de verdade não
é tocado. O `lumens-restauracao.timer` roda este teste sozinho toda quarta, no dump do dia, e uma
falha manda o alerta por e-mail; à mão:

```bash
cd /opt/lumens && ./scripts/restaurar-backup.sh
```

Sem argumento usa o diário mais novo; passe o caminho de um `.dump` para testar outro. O script
confere:

- contagem de pautas, apoios e eventos igual à da origem (difere se houve atividade depois do
  backup: rode logo depois de um backup para comparar). Essa comparação só **avisa**: se a origem
  estiver fora do ar ou incompleta, o teste segue com as checagens abaixo. `ORIGEM=<banco>` compara
  com outro banco, e `ORIGEM=` (vazio) pula a comparação;
- o trigger que impede `UPDATE` na tabela `evento` (RN11) continua ativo no banco restaurado;
- as views públicas (`v_pauta_publica`, `v_resumo`) respondem.

Registre cada teste na tabela abaixo. O critério da SCRUM-95 pede um feito por alguém além de
quem escreveu este procedimento.

| Data       | Quem | Backup (data, tamanho) | Origem → restaurado                       | Resultado                    |
| ---------- | ---- | ---------------------- | ----------------------------------------- | ---------------------------- |
| 2026-11-10 | —    | local, 152 KB          | 9 pautas, 982 apoios, 35 eventos → igual  | ok, no Postgres local (seed) |
| 2026-11-17 | —    | VM, 784 KB             | 13 pautas, 983 apoios, 70 eventos → igual | ok, na homologação (timer)   |

Para testar na sua máquina, contra o Postgres do `docker-compose.yml`:

```bash
REPO_DIR=$PWD BACKUP_DIR=/tmp/lumens-backup COMPOSE="docker compose --env-file .env.database" ./scripts/backup-banco.sh
```

```bash
REPO_DIR=$PWD BACKUP_DIR=/tmp/lumens-backup COMPOSE="docker compose --env-file .env.database" ./scripts/restaurar-backup.sh
```

Ao mudar os scripts, rode o teste de regressão. Ele cobre a restauração normal, a origem sem uma
tabela, a origem inexistente e o backup truncado (que tem de falhar):

```bash
./scripts/testar-restauracao.sh
```

## Restaurar de verdade (incidente)

Use só quando o banco de produção estiver perdido ou corrompido. **Isto substitui o banco.**

1. Escolha o backup: `ls -lh /var/backups/lumens/diario /var/backups/lumens/semanal`.
2. Garanta o banco `lumens` e os logins `lumens_app` e `lumens_site`. O backup traz as permissões
   dos logins, e num Postgres novo (volume perdido) eles não existem: sem este passo, até um backup
   íntegro falha no primeiro `GRANT`. O `db:provision` conecta no banco da aplicação, então ele
   precisa existir antes, nem que vazio (o caso de alguém ter apagado o banco). Os dois comandos
   podem rodar sempre: o primeiro não mexe num banco que já existe, e o segundo é idempotente.

   ```bash
   cd /opt/lumens && docker compose -f docker-compose.prod.yml --env-file .env.producao exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "$POSTGRES_DB" 2>/dev/null && echo "Banco recriado, vazio." || echo "O banco já existe."'
   ```

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.producao run --rm migracao pnpm db:provision
   ```

3. Teste esse arquivo antes: `./scripts/restaurar-backup.sh <arquivo>`. Se falhar, escolha outro.
   O script recusa de cara, apontando para o passo 2, se os logins ainda não existem.
4. Pare quem escreve no banco:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.producao stop backend painel
   ```

5. Recrie o banco e restaure (o `pg_restore` lê o arquivo pelo stdin). O `--if-exists` cobre o
   banco que já não existe:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.producao exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
   ```

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.producao exec -T postgres sh -c 'pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < /var/backups/lumens/diario/<arquivo>.dump
   ```

6. Suba tudo com o deploy normal, que também aplica migrações mais novas que o backup:

   ```bash
   ./scripts/deploy-homologacao.sh origin/main
   ```

7. Confira `https://<DOMINIO>/saude` e `https://<DOMINIO>/resumo`.

## Chaves

O backup **não** contém `CHAVE_CIFRA` nem `CHAVE_HMAC`: elas ficam só no `.env.producao` da VM
(e no gerenciador de senhas da equipe). Sem as mesmas chaves, um banco restaurado funciona, mas os
telefones e e-mails cifrados não decifram e ninguém é reencontrado pelo HMAC do telefone. Guarde
as chaves fora da VM, separadas dos backups. Para trocar a chave de cifra, use
`pnpm --filter @lumens/backend rotacionar-cifra` (SCRUM-90); um backup feito antes da troca só
decifra com a chave antiga.

## Restaurar da cópia fora da VM

Para quando a VM ou o disco se perderam. Tudo na **sua** máquina, com a chave de leitura do B2 e
a chave privada do `age`, as duas do gerenciador de senhas:

1. Baixe o `.dump.age` mais novo: _Browse Files_ do bucket `lumens-backup`, pasta `diario/`, ou
   com o `rclone` e a chave de leitura.
2. Decifre (o `age` lê a chave privada do arquivo; apague-o no fim):

   ```bash
   age -d -i lumens-backup-age.txt -o lumens.dump lumens-<data>.dump.age
   ```

3. Suba a VM nova ([homologação](homologacao.md)) com as **mesmas** `CHAVE_CIFRA` e `CHAVE_HMAC`
   do gerenciador de senhas (sem elas, telefones e e-mails não decifram; veja [Chaves](#chaves)).
   Copie o dump para ela e siga [Restaurar de verdade](#restaurar-de-verdade-incidente) a partir do
   passo 2, com esse arquivo:

   ```bash
   scp lumens.dump azureuser@<IP-DA-VM>:/var/backups/lumens/
   ```

4. **Fotos e PDFs**, se o storage era o MinIO: baixe também, da pasta `arquivos/`, o
   `lumens-arquivos-<data>.tar.age` com a **mesma** data do dump (se o envio dele falhou naquele
   dia, o mais novo anterior a ela: um pacote mais novo que o dump pode ter fotos que o banco
   restaurado não conhece). Decifre e mande para o espelho da VM nova. Com o MinIO no ar (o deploy
   o cria), devolva o espelho ao bucket como em _Fotos e PDFs_, no fim de
   [Restaurar de verdade](#restaurar-de-verdade-incidente). O `COPYFILE_DISABLE=1` evita que o
   `tar` do macOS ponha arquivos `._*` no meio.

   ```bash
   mkdir arquivos && age -d -i lumens-backup-age.txt lumens-arquivos-<data>.tar.age | tar -C arquivos -xf -
   ```

   ```bash
   COPYFILE_DISABLE=1 tar -C arquivos -cf - . | ssh azureuser@<IP-DA-VM> 'mkdir -p /var/backups/lumens/arquivos && tar -C /var/backups/lumens/arquivos -xf -'
   ```

5. Apague da sua máquina o `lumens.dump`, a pasta `arquivos` e a chave privada: o dump decifrado
   tem a linha do tempo e os dados cifrados por coluna, e os PDFs podem ter nome de quem manifestou.

## Quando o backup falha

O e-mail diz qual unidade falhou e traz o fim do log. Na VM:

```bash
journalctl -u lumens-backup.service -n 50
```

- **Dump ou conferência:** Postgres parado (`docker compose ... ps`) ou disco cheio (`df -h`).
- **`Sem /opt/lumens/.env.backup` ou `Falta ...`:** configuração do envio; veja
  [Cópia fora da VM](#cópia-fora-da-vm-backblaze-b2). Sem o `.env.backup`, o próprio e-mail vai
  para a conta do `EMAIL_USUARIO`, não para o `BACKUP_ALERTA_PARA`.
- **Erro do `rclone` (403, timeout):** chave do B2 revogada ou trocada, ou B2 fora do ar. O dump
  local do dia foi feito; rode `./scripts/enviar-backup.sh` quando resolver.
- **Erro no pacote das fotos (`tar`, disco cheio):** o dump já foi para fora antes dele, e só as
  fotos ficaram para trás. O pacote ocupa no disco o tamanho do espelho enquanto é enviado: veja
  `df -h` e `du -sh /var/backups/lumens/arquivos`.
- **`lumens-restauracao.service`:** o dump não restaura ou perdeu o trigger da linha do tempo.
  Rode `./scripts/restaurar-backup.sh` à mão para ver a mensagem, e teste o diário anterior.
- **Nenhum e-mail chega, mas o backup falhou:** `journalctl -u 'lumens-alerta@*' -n 20` mostra se
  o SMTP recusou.
