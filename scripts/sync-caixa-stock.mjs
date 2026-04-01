import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  coerceLegacyNumber,
  inferCatalogTaxonomy,
  legacySlug,
  normalizeLegacyText,
  parseOdsFile
} from "../server/legacy-ods.mjs";

function nowIso() {
  return new Date().toISOString();
}

function timestampLabel() {
  return nowIso().replace(/[:.]/g, "-");
}

function readOption(args, name, fallback = "") {
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index < 0) {
    return fallback;
  }
  return args[index + 1] ?? fallback;
}

function normalizeCode(value = "") {
  return normalizeLegacyText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeName(value = "") {
  return normalizeLegacyText(value)
    .replace(/^\d+\s*-\s*/u, "")
    .replace(/^-\s*/u, "")
    .replace(/\s*-\s*$/u, "")
    .toLowerCase();
}

function buildHeaderMap(row = []) {
  return row.reduce((map, cell, index) => {
    const key = legacySlug(cell);
    if (key) {
      map[key] = index;
    }
    return map;
  }, {});
}

function readCell(row, headerMap, keys = []) {
  for (const key of keys) {
    const index = headerMap[key];
    if (index === undefined) {
      continue;
    }
    const value = normalizeLegacyText(row[index] || "");
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeLegacyStockCode(value = "") {
  return normalizeLegacyText(value).replace(/\s+/g, "");
}

function shouldSkipLegacyStockRow({ legacyId = "", name = "", priceAmount = 0, costAmount = 0, stockQuantity = 0 } = {}) {
  const normalizedCode = normalizeLegacyStockCode(legacyId);
  const normalizedName = normalizeLegacyText(name);
  const slug = legacySlug(normalizedName);

  if (!normalizedName || normalizedName === "-") {
    return true;
  }
  if (normalizedName.endsWith(" -") || normalizedName.endsWith("-")) {
    return true;
  }
  if (slug.startsWith("estoque inicial")) {
    return true;
  }
  if (
    slug.includes("novos produtos")
    || slug.includes("soma de produtos")
    || slug.includes("total geral de produtos")
    || slug.includes("total de usados")
  ) {
    return true;
  }
  if (/^[a-z]{2}9999$/.test(normalizedCode) || normalizedCode === "zz9998" || normalizedCode === "zz9999" || normalizedCode === "uu9999") {
    return true;
  }
  if (!normalizedCode && Number(priceAmount || 0) === 0 && Number(costAmount || 0) === 0 && Number(stockQuantity || 0) === 0) {
    return true;
  }
  return false;
}

function checkpointAndBackupDatabase(dbPath, db) {
  const backupDir = join(dirname(dbPath), "backups");
  const stamp = timestampLabel();
  mkdirSync(backupDir, { recursive: true });

  try {
    db.exec("PRAGMA wal_checkpoint(FULL);");
  } catch {
    // Segue mesmo se o checkpoint falhar.
  }

  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].filter((filePath) => existsSync(filePath));
  for (const filePath of files) {
    const target = join(backupDir, `${stamp}-${filePath.split(/[/\\]/).pop()}`);
    copyFileSync(filePath, target);
  }

  return backupDir;
}

function hasTable(db, tableName) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)
  );
}

function parseStockSheet(workbookPath) {
  const workbook = parseOdsFile(workbookPath);
  const sheet = workbook.sheets.find((entry) => legacySlug(entry.name) === "estoque");
  if (!sheet) {
    throw new Error(`Nao foi encontrada a aba Estoque em ${workbookPath}.`);
  }

  let headerRowIndex = -1;
  let headerMap = {};
  for (let index = 0; index < Math.min(sheet.rows.length, 20); index += 1) {
    const map = buildHeaderMap(sheet.rows[index]);
    if (map["planilha de estoque produto"] !== undefined || map["pr venda"] !== undefined) {
      headerRowIndex = index;
      headerMap = map;
      break;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error(`Nao foi possivel localizar o cabecalho da aba Estoque em ${workbookPath}.`);
  }

  const items = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex];
    const legacyId = normalizeLegacyStockCode(readCell(row, headerMap, ["id"]));
    const name = readCell(row, headerMap, ["planilha de estoque produto", "produto"]);
    const priceAmount = coerceLegacyNumber(readCell(row, headerMap, ["pr venda"])) ?? 0;
    const costAmount = coerceLegacyNumber(readCell(row, headerMap, ["pr custo"])) ?? 0;
    const stockQuantity = Math.max(0, Number.parseInt(String(coerceLegacyNumber(readCell(row, headerMap, ["atual"])) ?? 0), 10) || 0);

    if (
      shouldSkipLegacyStockRow({
        legacyId,
        name,
        priceAmount,
        costAmount,
        stockQuantity
      })
    ) {
      continue;
    }

    const taxonomy = inferCatalogTaxonomy(name, readCell(row, headerMap, ["produto"]));
    items.push({
      sourceRow: rowIndex + 1,
      legacyId,
      normalizedCode: normalizeCode(legacyId),
      name,
      normalizedName: normalizeName(name),
      stockQuantity,
      costAmount,
      priceAmount,
      category: taxonomy.category,
      subcategory: taxonomy.subcategory
    });
  }

  return {
    workbook,
    sheet,
    headerRowIndex,
    items
  };
}

function loadActiveNonUsedCatalog(db) {
  return db.prepare(
    `
      SELECT
        id,
        sku,
        name,
        category,
        subcategory,
        compatibility,
        description,
        item_condition,
        stock_quantity,
        min_stock,
        cost_amount,
        price_amount,
        is_complete,
        active,
        is_store_inventory,
        created_at,
        updated_at,
        location_type,
        brand,
        deleted_at,
        legacy_source_id,
        legacy_source_sheet
      FROM catalog_items
      WHERE active = 1
        AND COALESCE(deleted_at, '') = ''
        AND COALESCE(item_condition, 'NOVA') <> 'USADA'
      ORDER BY id ASC
    `
  ).all().map((item) => ({
    ...item,
    codeCandidates: [...new Set([normalizeCode(item.sku), normalizeCode(item.legacy_source_id)].filter(Boolean))],
    normalizedName: normalizeName(item.name)
  }));
}

function buildCatalogIndexes(items = []) {
  const byCode = new Map();
  const byName = new Map();

  for (const item of items) {
    for (const code of item.codeCandidates) {
      if (!byCode.has(code)) {
        byCode.set(code, []);
      }
      byCode.get(code).push(item);
    }
    if (item.normalizedName) {
      if (!byName.has(item.normalizedName)) {
        byName.set(item.normalizedName, []);
      }
      byName.get(item.normalizedName).push(item);
    }
  }

  return { byCode, byName };
}

function compareSheetAgainstCatalog(sheetItems, activeCatalog) {
  const { byCode, byName } = buildCatalogIndexes(activeCatalog);
  const matchedCatalogIds = new Set();
  const matchedRows = [];
  const sheetOnlyRows = [];

  for (const sheetItem of sheetItems) {
    const codeMatches = sheetItem.normalizedCode ? (byCode.get(sheetItem.normalizedCode) || []) : [];
    const unmatchedCodeMatches = codeMatches.filter((item) => !matchedCatalogIds.has(item.id));
    let match = null;
    let matchType = "";

    if (unmatchedCodeMatches.length === 1) {
      match = unmatchedCodeMatches[0];
      matchType = "code";
    } else if (!unmatchedCodeMatches.length && sheetItem.normalizedName) {
      const nameMatches = (byName.get(sheetItem.normalizedName) || []).filter((item) => !matchedCatalogIds.has(item.id));
      if (nameMatches.length === 1) {
        match = nameMatches[0];
        matchType = "name";
      }
    } else if (unmatchedCodeMatches.length > 1) {
      throw new Error(`Match ambiguo por codigo para ${sheetItem.legacyId || sheetItem.name}.`);
    }

    if (!match) {
      sheetOnlyRows.push(sheetItem);
      continue;
    }

    matchedCatalogIds.add(match.id);
    matchedRows.push({
      sheet: sheetItem,
      catalog: match,
      matchType,
      differences: {
        name: normalizeLegacyText(match.name) !== normalizeLegacyText(sheetItem.name),
        category: normalizeLegacyText(match.category) !== normalizeLegacyText(sheetItem.category),
        subcategory: normalizeLegacyText(match.subcategory) !== normalizeLegacyText(sheetItem.subcategory),
        stockQuantity: Number(match.stock_quantity || 0) !== Number(sheetItem.stockQuantity || 0),
        costAmount: Number(match.cost_amount || 0) !== Number(sheetItem.costAmount || 0),
        priceAmount: Number(match.price_amount || 0) !== Number(sheetItem.priceAmount || 0),
        condition: normalizeLegacyText(match.item_condition || "NOVA") !== "NOVA",
        location: normalizeLegacyText(match.location_type || "ESTOQUE") !== "ESTOQUE",
        legacySourceId: normalizeLegacyText(match.legacy_source_id || "") !== normalizeLegacyText(sheetItem.legacyId),
        legacySourceSheet: normalizeLegacyText(match.legacy_source_sheet || "") !== "Estoque",
        sku: normalizeLegacyText(match.sku || "") !== normalizeLegacyText(sheetItem.legacyId)
      }
    });
  }

  const crmOnlyRows = activeCatalog.filter((item) => !matchedCatalogIds.has(item.id));
  const stockMismatches = matchedRows.filter((row) => row.differences.stockQuantity);
  const costMismatches = matchedRows.filter((row) => row.differences.costAmount);
  const priceMismatches = matchedRows.filter((row) => row.differences.priceAmount);
  const nameMismatches = matchedRows.filter((row) => row.differences.name);

  return {
    sheetItemCount: sheetItems.length,
    crmItemCount: activeCatalog.length,
    matchedRows,
    matchedSheetRows: matchedRows.length,
    matchedByCode: matchedRows.filter((row) => row.matchType === "code").length,
    matchedByName: matchedRows.filter((row) => row.matchType === "name").length,
    sheetOnlyRows,
    crmOnlyRows,
    stockMismatches,
    costMismatches,
    priceMismatches,
    nameMismatches
  };
}

function collectReferenceSummary(db, itemId, tableSupport) {
  const result = {
    order_items: 0,
    pos_sale_items: 0,
    stock_replenishments: 0,
    fiscal_document_items: 0
  };

  result.order_items = Number(
    db.prepare("SELECT COUNT(*) AS total FROM order_items WHERE catalog_item_id = ?").get(itemId)?.total || 0
  );
  if (tableSupport.hasPosSaleItems) {
    result.pos_sale_items = Number(
      db.prepare("SELECT COUNT(*) AS total FROM pos_sale_items WHERE catalog_item_id = ?").get(itemId)?.total || 0
    );
  }
  if (tableSupport.hasStockReplenishments) {
    result.stock_replenishments = Number(
      db.prepare("SELECT COUNT(*) AS total FROM stock_replenishments WHERE catalog_item_id = ?").get(itemId)?.total || 0
    );
  }
  if (tableSupport.hasFiscalDocumentItems) {
    result.fiscal_document_items = Number(
      db.prepare("SELECT COUNT(*) AS total FROM fiscal_document_items WHERE matched_catalog_item_id = ?").get(itemId)?.total || 0
    );
  }

  return result;
}

const args = process.argv.slice(2);
const dbPath = resolve(process.cwd(), readOption(args, "db-path", "server/storage/database/crm.sqlite"));
const workbookPath = resolve(process.cwd(), readOption(args, "workbook", "caixa.ods"));
const reportDir = resolve(process.cwd(), "server/storage/reports");
mkdirSync(reportDir, { recursive: true });

const db = new DatabaseSync(dbPath);
const tableSupport = {
  hasPosSaleItems: hasTable(db, "pos_sale_items"),
  hasStockReplenishments: hasTable(db, "stock_replenishments"),
  hasFiscalDocumentItems: hasTable(db, "fiscal_document_items")
};

try {
  const parsedSheet = parseStockSheet(workbookPath);
  const beforeCatalog = loadActiveNonUsedCatalog(db);
  const beforeComparison = compareSheetAgainstCatalog(parsedSheet.items, beforeCatalog);
  const backupDir = checkpointAndBackupDatabase(dbPath, db);
  const timestamp = nowIso();

  const updates = beforeComparison.matchedRows
    .filter((row) => Object.values(row.differences).some(Boolean))
    .map((row) => ({
      id: row.catalog.id,
      sku: row.sheet.legacyId || row.catalog.sku || null,
      name: row.sheet.name,
      category: row.sheet.category,
      subcategory: row.sheet.subcategory,
      stockQuantity: row.sheet.stockQuantity,
      costAmount: row.sheet.costAmount,
      priceAmount: row.sheet.priceAmount,
      brand: normalizeLegacyText(row.catalog.brand || ""),
      compatibility: normalizeLegacyText(row.catalog.compatibility || ""),
      description: normalizeLegacyText(row.catalog.description || ""),
      minStock: Number(row.catalog.min_stock || 0),
      isComplete: Number(row.catalog.is_complete || 0),
      createdAt: row.catalog.created_at,
      differences: row.differences
    }));

  const creates = beforeComparison.sheetOnlyRows.map((row) => ({
    sku: row.legacyId || null,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    stockQuantity: row.stockQuantity,
    costAmount: row.costAmount,
    priceAmount: row.priceAmount,
    sourceRow: row.sourceRow,
    legacyId: row.legacyId
  }));

  const archives = beforeComparison.crmOnlyRows.map((row) => ({
    id: row.id,
    sku: row.sku || "",
    legacy_source_id: row.legacy_source_id || "",
    name: row.name,
    stock_quantity: Number(row.stock_quantity || 0),
    cost_amount: Number(row.cost_amount || 0),
    price_amount: Number(row.price_amount || 0),
    references: collectReferenceSummary(db, row.id, tableSupport)
  }));

  db.exec("BEGIN IMMEDIATE;");
  try {
    const updateStmt = db.prepare(
      `
        UPDATE catalog_items
        SET sku = :sku,
            name = :name,
            brand = :brand,
            category = :category,
            subcategory = :subcategory,
            compatibility = :compatibility,
            description = :description,
            item_condition = 'NOVA',
            stock_quantity = :stockQuantity,
            min_stock = :minStock,
            cost_amount = :costAmount,
            price_amount = :priceAmount,
            is_complete = :isComplete,
            active = 1,
            is_store_inventory = 0,
            location_type = 'ESTOQUE',
            deleted_at = '',
            legacy_source_id = :legacySourceId,
            legacy_source_sheet = 'Estoque',
            updated_at = :updatedAt
        WHERE id = :id
      `
    );

    for (const item of updates) {
      updateStmt.run({
        id: item.id,
        sku: item.sku,
        name: item.name,
        brand: item.brand,
        category: item.category,
        subcategory: item.subcategory,
        compatibility: item.compatibility,
        description: item.description,
        stockQuantity: item.stockQuantity,
        minStock: item.minStock,
        costAmount: item.costAmount,
        priceAmount: item.priceAmount,
        isComplete: item.isComplete,
        legacySourceId: item.sku || "",
        updatedAt: timestamp
      });
    }

    const insertStmt = db.prepare(
      `
        INSERT INTO catalog_items (
          sku,
          name,
          category,
          subcategory,
          compatibility,
          description,
          item_condition,
          stock_quantity,
          min_stock,
          cost_amount,
          price_amount,
          is_complete,
          active,
          is_store_inventory,
          created_at,
          updated_at,
          location_type,
          brand,
          deleted_at,
          legacy_source_id,
          legacy_source_sheet
        )
        VALUES (
          :sku,
          :name,
          :category,
          :subcategory,
          '',
          '',
          'NOVA',
          :stockQuantity,
          0,
          :costAmount,
          :priceAmount,
          0,
          1,
          0,
          :createdAt,
          :updatedAt,
          'ESTOQUE',
          '',
          '',
          :legacySourceId,
          'Estoque'
        )
      `
    );

    const createdRows = [];
    for (const item of creates) {
      const result = insertStmt.run({
        sku: item.sku,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        stockQuantity: item.stockQuantity,
        costAmount: item.costAmount,
        priceAmount: item.priceAmount,
        createdAt: timestamp,
        updatedAt: timestamp,
        legacySourceId: item.legacyId
      });
      createdRows.push({
        id: Number(result.lastInsertRowid),
        ...item
      });
    }

    const archiveStmt = db.prepare(
      `
        UPDATE catalog_items
        SET active = 0,
            deleted_at = :deletedAt,
            updated_at = :updatedAt
        WHERE id = :id
      `
    );
    for (const item of archives) {
      archiveStmt.run({
        id: item.id,
        deletedAt: timestamp,
        updatedAt: timestamp
      });
    }

    db.exec("COMMIT;");

    const afterCatalog = loadActiveNonUsedCatalog(db);
    const afterComparison = compareSheetAgainstCatalog(parsedSheet.items, afterCatalog);
    const aligned = (
      afterComparison.sheetOnlyRows.length === 0
      && afterComparison.crmOnlyRows.length === 0
      && afterComparison.stockMismatches.length === 0
      && afterComparison.costMismatches.length === 0
      && afterComparison.priceMismatches.length === 0
      && afterComparison.nameMismatches.length === 0
      && afterComparison.sheetItemCount === afterComparison.crmItemCount
    );

    const report = {
      syncedAt: timestamp,
      workbookPath,
      dbPath,
      backupDir,
      scope: "Sincroniza o catalogo ativo nao usado do CRM com a aba Estoque do caixa.ods. Itens USADA ficam fora da equalizacao.",
      before: {
        sheetItemCount: beforeComparison.sheetItemCount,
        crmItemCount: beforeComparison.crmItemCount,
        matchedRows: beforeComparison.matchedSheetRows,
        sheetOnlyRows: beforeComparison.sheetOnlyRows.length,
        crmOnlyRows: beforeComparison.crmOnlyRows.length,
        stockMismatches: beforeComparison.stockMismatches.length,
        costMismatches: beforeComparison.costMismatches.length,
        priceMismatches: beforeComparison.priceMismatches.length,
        nameMismatches: beforeComparison.nameMismatches.length
      },
      changes: {
        updatedCount: updates.length,
        updated: updates.map((item) => ({
          id: item.id,
          sku: item.sku || "",
          name: item.name,
          stockQuantity: item.stockQuantity,
          costAmount: item.costAmount,
          priceAmount: item.priceAmount,
          differences: item.differences
        })),
        createdCount: createdRows.length,
        created: createdRows,
        archivedCount: archives.length,
        archived: archives
      },
      after: {
        sheetItemCount: afterComparison.sheetItemCount,
        crmItemCount: afterComparison.crmItemCount,
        matchedRows: afterComparison.matchedSheetRows,
        sheetOnlyRows: afterComparison.sheetOnlyRows.length,
        crmOnlyRows: afterComparison.crmOnlyRows.length,
        stockMismatches: afterComparison.stockMismatches.length,
        costMismatches: afterComparison.costMismatches.length,
        priceMismatches: afterComparison.priceMismatches.length,
        nameMismatches: afterComparison.nameMismatches.length,
        aligned
      }
    };

    const reportPath = join(reportDir, `caixa-stock-sync-${timestampLabel()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

    if (!aligned) {
      throw new Error(`A sincronizacao terminou, mas ainda restaram diferencas. Veja ${reportPath}.`);
    }

    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
} finally {
  db.close();
}
