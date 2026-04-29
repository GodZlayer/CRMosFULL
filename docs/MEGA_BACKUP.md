# Backup Automatico no MEGA

Este projeto agora inclui um fluxo de backup por snapshot:

- origem viva: `server/storage`
- snapshot consistente do banco com `sqlite3 .backup`
- copia dos uploads
- compactacao em `.tar.gz`
- envio do arquivo para o MEGA com `MEGAcmd`

## Arquivos

- script: `scripts/backup-storage-to-mega.sh`
- service: `ops/systemd/brasil-express-mega-backup.service`
- timer: `ops/systemd/brasil-express-mega-backup.timer`

## O que entra no backup

- `server/storage/database/crm.sqlite`
- `server/storage/uploads`

O backup atual para MySQL continua existindo no sistema, mas este fluxo e o que cobre o estado real do CRM com banco e arquivos.

## Dependencias

Comandos esperados:

- `sqlite3`
- `tar`
- `mega-whoami`
- `mega-mkdir`
- `mega-put`

Antes de ativar o timer, autentique o `MEGAcmd`:

```bash
mega-login SEU_EMAIL SENHA
mega-whoami
```

## Teste manual

```bash
bash /home/loja/Documentos/BrasilExpressCRMinterno/scripts/backup-storage-to-mega.sh
```

## Instalacao do timer

Copie as units para o systemd:

```bash
sudo cp /home/loja/Documentos/BrasilExpressCRMinterno/ops/systemd/brasil-express-mega-backup.service /etc/systemd/system/
sudo cp /home/loja/Documentos/BrasilExpressCRMinterno/ops/systemd/brasil-express-mega-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now brasil-express-mega-backup.timer
sudo systemctl list-timers brasil-express-mega-backup.timer
```

## Frequencia

O timer atual roda a cada 6 horas:

- 00:00
- 06:00
- 12:00
- 18:00

## Variaveis uteis

No service, voce pode ajustar:

- `BACKUP_ROOT`
- `MEGA_REMOTE_DIR`
- `LOCAL_RETENTION_DAYS`

## Observacoes

- o CRM nao precisa ser parado
- o snapshot do banco usa `.backup`, que e a forma correta para SQLite em uso
- o script so faz limpeza local; a retencao remota no MEGA pode ser adicionada depois, mas o envio principal ja fica automatico
