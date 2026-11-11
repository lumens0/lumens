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
| Acesso       | Só quem tem SSH na VM. O banco continua sem porta publicada: o dump sai pelo `exec` |

> **Limitação conhecida:** os backups ficam no mesmo disco da VM. Eles cobrem erro humano,
> migração ruim e banco corrompido, mas não a perda do disco ou da VM. Até a equipe decidir um
> destino fora dela (Azure Blob Storage privado, por exemplo), copie um backup para fora antes de
> qualquer mudança grande — veja [Cópia para fora da VM](#cópia-para-fora-da-vm).

## Instalar na VM

Uma vez, depois do primeiro deploy:

```bash
sudo mkdir -p /var/backups/lumens && sudo chown azureuser:azureuser /var/backups/lumens && sudo chmod 700 /var/backups/lumens
```

```bash
sudo cp /opt/lumens/scripts/systemd/lumens-backup.{service,timer} /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now lumens-backup.timer
```

Conferir que está agendado e rodar o primeiro na hora:

```bash
systemctl list-timers lumens-backup.timer
```

```bash
sudo systemctl start lumens-backup.service && journalctl -u lumens-backup.service -n 20
```

## Teste de restauração

Restaura o backup num banco **temporário** (`lumens_restauracao`) do mesmo Postgres, compara com
o banco de verdade e apaga o temporário no fim, inclusive se algo falhar. O banco de verdade não
é tocado.

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

| Data       | Quem | Backup (data, tamanho) | Origem → restaurado                      | Resultado                    |
| ---------- | ---- | ---------------------- | ---------------------------------------- | ---------------------------- |
| 2026-11-10 | —    | local, 152 KB          | 9 pautas, 982 apoios, 35 eventos → igual | ok, no Postgres local (seed) |

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
2. Teste esse arquivo antes: `./scripts/restaurar-backup.sh <arquivo>`. Se falhar, escolha outro.
3. Pare quem escreve no banco:

   ```bash
   cd /opt/lumens && docker compose -f docker-compose.prod.yml --env-file .env.producao stop backend painel
   ```

4. Recrie o banco e restaure (o `pg_restore` lê o arquivo pelo stdin):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.producao exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
   ```

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.producao exec -T postgres sh -c 'pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < /var/backups/lumens/diario/<arquivo>.dump
   ```

   Num Postgres novo (volume perdido), os logins `lumens_app` e `lumens_site` não existem e as
   permissões do dump falham: rode antes `docker compose ... run --rm migracao pnpm db:provision`.

5. Suba tudo com o deploy normal, que também aplica migrações mais novas que o backup:

   ```bash
   ./scripts/deploy-homologacao.sh origin/main
   ```

6. Confira `https://<DOMINIO>/saude` e `https://<DOMINIO>/resumo`.

## Chaves

O backup **não** contém `CHAVE_CIFRA` nem `CHAVE_HMAC`: elas ficam só no `.env.producao` da VM
(e no gerenciador de senhas da equipe). Sem as mesmas chaves, um banco restaurado funciona, mas os
telefones e e-mails cifrados não decifram e ninguém é reencontrado pelo HMAC do telefone. Guarde
as chaves fora da VM, separadas dos backups. Para trocar a chave de cifra, use
`pnpm --filter @lumens/backend rotacionar-cifra` (SCRUM-90); um backup feito antes da troca só
decifra com a chave antiga.

## Cópia para fora da VM

Da sua máquina, com o SSH da VM configurado:

```bash
scp azureuser@<IP-DA-VM>:/var/backups/lumens/diario/<arquivo>.dump .
```

O arquivo tem os dados cifrados e a linha do tempo: guarde em lugar privado e apague quando não
precisar mais.
