# SCRUM-309 · Cópia do backup fora da VM, cifrada, no Backblaze B2

Decisão · 2026-11-17 · @sthefanyblima

## Contexto

O backup diário do banco (SCRUM-95) ficava só no disco da VM. Ele cobria erro humano, migração
ruim e banco corrompido, mas não a perda do disco, da VM ou da conta da nuvem. A única cópia de
fora era um `scp` à mão, em claro, para notebooks pessoais. O teste de restauração só rodava à
mão, e uma falha do backup ficava só no `journalctl`.

## Decisão

**Destino: um bucket privado no Backblaze B2**, pela API S3 dele.

| Opção              | Por que sim ou não                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| **Backblaze B2**   | Outro provedor que não o da VM: a cópia sobrevive à conta do Azure comprometida. 10 GB sem cartão |
| Azure Blob privado | Mais simples, mas na mesma conta da VM: não protege do risco que motivou o ticket                 |
| Cloudflare R2      | Também outro provedor, mas pede cartão para ativar                                                |

- **Só a cópia de fora é cifrada**, com `age` e chave pública. O dump local fica no mesmo disco do
  banco em claro, e o teste semanal precisa restaurá-lo: cifrar ali obrigaria a chave privada a
  morar na VM, e não protegeria nada.
- **A VM não decifra nem apaga.** A chave privada do `age` fica no gerenciador de senhas da
  equipe. A chave do B2 na VM é _Write Only_: quem invadir a VM não lê nem apaga as cópias na hora.
  Ela ainda consegue esconder uma cópia ou mandar outra com o mesmo nome; nos dois casos a versão
  antiga continua no bucket por mais 30 dias, e é essa a janela para perceber e recuperar.
  Imutabilidade de verdade seria o _Object Lock_ do B2, que deixamos de fora por ora.
- **Retenção pelo bucket**, não pelo script: a regra de ciclo de vida esconde cada cópia depois de
  30 dias e apaga a escondida 30 dias depois. Os 30 dias depois de escondida são o que protege a
  versão antiga de um arquivo sobrescrito. A chave da VM nem teria permissão de apagar.
- **Teste de restauração semanal** (`lumens-restauracao.timer`, quarta), com o
  `restaurar-backup.sh` que já existia, no dump local do dia. A cópia de fora tem a mesma origem, e
  o teste de regressão `testar-backup-externo.sh` confere que ela decifra igual ao dump.
- **Alerta por e-mail** pelo `OnFailure=` do backup e do teste, com o SMTP que o back-end já usa
  (`EMAIL_*`). Sem serviço novo, e o e-mail chega a quem não tem SSH na VM.

## Fora daqui

- **Backup que nem roda** (VM sempre desligada no horário) não dispara `OnFailure=`. Quem cobre é
  o aviso do deploy sobre backup ausente, de outra task. A consequência pesa: a regra de ciclo de
  vida esconde também a última cópia, então 60 dias sem backup novo deixam o bucket vazio.
- **Restaurar a cópia de fora automaticamente:** a VM não decifra, de propósito. A conferência de
  que a chave do cofre abre a cópia é à mão, na instalação e a cada troca de chave.
- **Fotos e PDFs da resposta oficial** no storage da VM: quando o storage existir, a cópia deles
  para fora segue o mesmo caminho.
