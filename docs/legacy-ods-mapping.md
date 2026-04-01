# Mapeamento das planilhas legadas para o CRM

## Origem

- `Serviços 2026.ods`
- `26 CX Loja ok em 29 02.ods`

## Conversão funcional

### `Serviços 2026.ods` -> tarefas diárias

- Cada aba com nome de data vira um dia no quadro `/tarefas`.
- Cada linha operacional vira uma `daily_task`.
- Referências antigas de OS/Ficha tentam vínculo com uma OS real do CRM.
- Atualizações e observações livres viram histórico em `daily_task_updates`.
- Dados não estruturados continuam preservados em:
  - `source_workbook`
  - `source_sheet`
  - `source_row`
  - `raw_payload`

### `26 CX Loja ok em 29 02.ods` -> caixa, financeiro, estoque e compras

- `Fluxo de Caixa`
  - vira `finance_entries`
  - e também `store_cash_movements`
- `Gerência de Caixa`
  - vira snapshot dos saldos em `store_cash_accounts`
- `Estoque`
  - vira `catalog_items`
  - com taxonomia interna do CRM
- `Compras*`
  - vira histórico de reposição em `stock_replenishments`

## Caixa por loja

- O CRM passou a operar com **um caixa aberto por loja**.
- Perfis diferentes da mesma empresa compartilham a mesma sessão de caixa.
- O usuário continua sendo o ator dos eventos, mas não o dono exclusivo do caixa.

## Comparativo lógico

### Antes

- `Serviços 2026.ods` misturava agenda, OS, follow-up, loja e anotações livres em uma mesma linha.
- `26 CX Loja ok em 29 02.ods` misturava razão de caixa, saldos, estoque e compras no mesmo arquivo.

### Agora

- tarefas diárias -> agenda operacional
- OS -> serviço estruturado com timeline
- financeiro -> razão classificada
- caixa por loja -> operação compartilhada
- catálogo/reposição -> estoque e compras

## Importação prática

### Pela CLI

```bash
npm run import:legacy-ods
```

### Com arquivos explícitos

```bash
npm run import:legacy-ods -- --file "Serviços 2026.ods" --file "26 CX Loja ok em 29 02.ods"
```

### Banco sem dados demo

```bash
npm run import:legacy-ods -- --no-seed-demo
```

## Observações

- A importação preserva o bruto legado para auditoria.
- Quando o dado não encaixa 100% no modelo novo, o trecho estruturável entra no CRM e o restante fica em `raw_payload`.
- A taxonomia importada é convertida para as categorias oficiais do catálogo do CRM.
