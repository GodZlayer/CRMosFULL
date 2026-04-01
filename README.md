# Brasil Express CRM

CRM interno para ordem de servico, clientes, catalogo, estoque, financeiro leve, calendario, PDV e dashboards.

## Stack local

- `Vue 3 + Vite + TypeScript`
- `Bootstrap 5 + Font Awesome + ApexCharts + Tabulator + SweetAlert2` via CDN
- API local em `Node.js` com `node:sqlite`

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm test`

## Acesso demo

1. Na tela inicial, entre com a conta da empresa:
   - `contato@brasilexpress.info`
   - `empresa123`
2. Depois do login, o sistema abre a selecao de perfis no estilo Netflix.
3. Escolha o perfil que vai usar o CRM:
   - `Admin`
   - `Gerente`
   - `Atendente`
   - `Tecnico`

## Branding dinamico

O nome da empresa, logo, favicon e identidade visual do shell passam a depender do login da empresa. A tela inicial permanece neutra, mostrando apenas e-mail e senha.

## Observacao

O repositorio implementa uma API local executavel em Node para desenvolvimento com SQLite. Os contratos, regras de negocio e estrutura de armazenamento foram modelados para facilitar a futura transicao para `Laravel + MySQL/MariaDB`.

## Migracao de dados do Firestore

A URL do console do Firebase nao entrega os dados diretamente para o script. Para migrar, use um JSON de service account do projeto e rode primeiro a inspecao para descobrir o nome real das colecoes.

1. Gere/baixe um service account JSON do projeto Firebase/Google Cloud.
2. Rode a inspecao:
   - `npm run firestore:inspect -- --service-account caminho/do/service-account.json`
3. Revise o arquivo JSON gerado em `server/storage/imports/` e ajuste `scripts/firestore-mapping.example.json` conforme os nomes reais das colecoes/campos.
4. Rode a migracao:
   - `npm run firestore:migrate -- --service-account caminho/do/service-account.json --mapping scripts/firestore-mapping.example.json --clear-first`

Opcoes uteis:
- `--allow-nonempty`: permite migrar sem limpar a base local antes.
- `--db-path`: aponta para outro arquivo SQLite de destino.
- `--uploads-root`: altera a pasta local de uploads.
- `--actor-email`: atribui os logs da migracao a um usuario local existente.

O importador atual cobre clientes, catalogo/estoque, servicos, OS e financeiro. Se a base do Firestore tiver estruturas diferentes, rode primeiro a inspecao e ajuste o arquivo de mapeamento antes de migrar.

