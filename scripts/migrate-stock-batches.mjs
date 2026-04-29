import { resolve } from "node:path";
import { createAppRepository } from "../server/app-repository.mjs";

const dbPath = process.argv[2] ? resolve(process.argv[2]) : resolve("server/storage/database/crm.sqlite");

const repository = createAppRepository({ dbPath, seedDemo: false });

const batchSummary = repository.db.prepare(`
  SELECT
    COUNT(*) AS batches,
    COUNT(DISTINCT catalog_item_id) AS items,
    COALESCE(SUM(quantity_remaining), 0) AS units
  FROM catalog_stock_batches
`).get();

const replenishmentSummary = repository.db.prepare(`
  SELECT
    COUNT(*) AS replenishments,
    COALESCE(SUM(CASE WHEN finance_entry_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS linked_finance
  FROM stock_replenishments
`).get();

repository.close();

console.log(JSON.stringify({
  dbPath,
  batches: Number(batchSummary.batches || 0),
  itemsWithBatches: Number(batchSummary.items || 0),
  unitsInBatches: Number(batchSummary.units || 0),
  replenishments: Number(replenishmentSummary.replenishments || 0),
  replenishmentsWithFinance: Number(replenishmentSummary.linked_finance || 0)
}, null, 2));
