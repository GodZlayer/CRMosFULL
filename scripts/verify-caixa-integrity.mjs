import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { coerceLegacyNumber, legacySlug, normalizeLegacyText, parseOdsFile } from '../server/legacy-ods.mjs';

const OFFICIAL_CODES = [
  'CC_PIX_PJ_MAQ_VERM',
  'MAQ_AMARELA_PIX_CEL',
  'CAIXINHA_LOJA',
  'R_COM_DENIO',
  'OUTROS_REGINA',
  'BOLETOS',
  'ARTHUR'
];

const CASH_LABEL_MAP = {
  'c c pix pj e maq verm': 'CC_PIX_PJ_MAQ_VERM',
  'maq amarela pix cel': 'MAQ_AMARELA_PIX_CEL',
  'caixinha loja': 'CAIXINHA_LOJA',
  'r com denio': 'R_COM_DENIO',
  'outros regina': 'OUTROS_REGINA',
  'boletos': 'BOLETOS',
  'arthur': 'ARTHUR'
};

const CASH_TYPE_LABELS = {
  'conta bancaria': 'conta',
  dinheiro: 'dinheiro',
  'outros 09 01': 'outros'
};

const CASH_METRIC_LABELS = [
  'saldo atual',
  'saldo final',
  'estoque final',
  'geral final',
  'soma confere',
  'diferenca',
  'diferença',
  'saldo sem maq'
];

function nowIso() {
  return new Date().toISOString();
}

function stamp() {
  return nowIso().replace(/[:.]/g, '-');
}

function readOption(args, name, fallback = '') {
  const index = args.findIndex((arg) => arg === `--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
}

function round(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
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
    if (index === undefined) continue;
    const value = normalizeLegacyText(row[index] || '');
    if (value) return value;
  }
  return '';
}

function readNumber(value) {
  return round(coerceLegacyNumber(value) ?? 0);
}

function normalizeCode(value = '') {
  return normalizeLegacyText(value).replace(/\s+/g, '').toLowerCase();
}

function normalizeName(value = '') {
  return normalizeLegacyText(value)
    .replace(/^\d+\s*-\s*/u, '')
    .replace(/^-\s*/u, '')
    .replace(/\s*-\s*$/u, '')
    .toLowerCase();
}

function uniqueRoundedValues(items = []) {
  return [...new Set(items.map((item) => round(item.value)))];
}

function collectLabelValues(sheet, labels = []) {
  const targets = new Set(labels.map((label) => legacySlug(label)));
  const matches = [];
  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex] || [];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const label = legacySlug(row[columnIndex] || '');
      if (!targets.has(label)) continue;
      let value = null;
      let valueColumn = null;
      for (let cursor = columnIndex + 1; cursor < row.length; cursor += 1) {
        const numeric = coerceLegacyNumber(row[cursor]);
        if (numeric !== null) {
          value = round(numeric);
          valueColumn = cursor + 1;
          break;
        }
      }
      matches.push({
        label,
        row: rowIndex + 1,
        column: columnIndex + 1,
        value,
        valueColumn
      });
    }
  }
  return matches;
}

function firstNonNullValue(matches = []) {
  const found = matches.find((item) => item.value !== null);
  return found ? round(found.value) : null;
}

function findStockSheet(workbook) {
  const sheet = workbook.sheets.find((item) => legacySlug(item.name) === 'estoque');
  if (!sheet) {
    throw new Error('Aba Estoque não encontrada.');
  }
  return sheet;
}

function parseCashManagementSheet(workbook) {
  const sheet = workbook.sheets.find((item) => normalizeLegacyText(item.name) === 'Gerência de Caixa');
  if (!sheet) {
    throw new Error('Aba Gerência de Caixa não encontrada.');
  }

  const balances = {};
  const groupedDeclared = {};
  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex] || [];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const slug = legacySlug(row[columnIndex] || '');
      const code = CASH_LABEL_MAP[slug];
      if (code && columnIndex + 2 < row.length) {
        const numeric = coerceLegacyNumber(row[columnIndex + 2]);
        if (numeric !== null) {
          balances[code] = round(numeric);
        }
      }
      const groupKey = CASH_TYPE_LABELS[slug];
      if (groupKey && columnIndex + 1 < row.length) {
        const numeric = coerceLegacyNumber(row[columnIndex + 1]);
        if (numeric !== null) {
          groupedDeclared[groupKey] = round(numeric);
        }
      }
    }
  }

  const metrics = Object.fromEntries(
    CASH_METRIC_LABELS.map((label) => {
      const key = legacySlug(label).replace(/ /g, '_');
      return [key, collectLabelValues(sheet, [label])];
    })
  );

  return {
    workbookName: basename(workbook.filePath || ''),
    balances,
    groupedDeclared,
    groupedComputed: {
      conta: round((balances.CC_PIX_PJ_MAQ_VERM || 0) + (balances.MAQ_AMARELA_PIX_CEL || 0)),
      dinheiro: round((balances.CAIXINHA_LOJA || 0) + (balances.R_COM_DENIO || 0)),
      outros: round((balances.OUTROS_REGINA || 0) + (balances.BOLETOS || 0))
    },
    total: round(OFFICIAL_CODES.reduce((sum, code) => sum + Number(balances[code] || 0), 0)),
    metrics
  };
}

function parseFluxoSheet(workbook) {
  const sheet = workbook.sheets.find((item) => normalizeLegacyText(item.name) === 'Fluxo de Caixa');
  if (!sheet) {
    throw new Error('Aba Fluxo de Caixa não encontrada.');
  }

  let headerRowIndex = -1;
  let headerMap = {};
  for (let index = 0; index < Math.min(sheet.rows.length, 20); index += 1) {
    const map = buildHeaderMap(sheet.rows[index]);
    if (map['d c'] !== undefined || map.total !== undefined || map['saldo dia'] !== undefined) {
      headerRowIndex = index;
      headerMap = map;
      break;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error('Cabeçalho da aba Fluxo de Caixa não encontrado.');
  }

  const rows = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex] || [];
    const dc = legacySlug(readCell(row, headerMap, ['d c']));
    const service = readCell(row, headerMap, ['servico', 'serviço']);
    const product = readCell(row, headerMap, ['produto']);
    const total = coerceLegacyNumber(readCell(row, headerMap, ['total']));
    const runningBalance = coerceLegacyNumber(readCell(row, headerMap, ['saldo dia']));
    const id = readCell(row, headerMap, ['id']);
    const normalizedId = normalizeLegacyText(id) === '-' ? '' : normalizeLegacyText(id);
    const normalizedService = normalizeLegacyText(service) === '-' ? '' : normalizeLegacyText(service);
    const normalizedProduct = normalizeLegacyText(product) === '-' ? '' : normalizeLegacyText(product);
    const substantive = Boolean(dc || normalizedService || normalizedProduct || normalizedId || Number(total || 0) !== 0);
    rows.push({
      row: rowIndex + 1,
      dc,
      service,
      product,
      id,
      total: total === null ? null : round(total),
      runningBalance: runningBalance === null ? null : round(runningBalance),
      substantive
    });
  }

  const transactionRows = rows.filter((row) => row.substantive);
  const monetaryRows = transactionRows.filter((row) => row.total !== null);
  const firstMonetaryRow = monetaryRows.find((row) => row.runningBalance !== null);
  const openingBalance = firstMonetaryRow ? round(firstMonetaryRow.runningBalance - firstMonetaryRow.total) : null;

  let revenue = 0;
  let expense = 0;
  let continuityBalance = openingBalance;
  const balanceMismatches = [];
  for (const row of monetaryRows) {
    if (Number(row.total || 0) > 0) revenue += Number(row.total || 0);
    if (Number(row.total || 0) < 0) expense += Math.abs(Number(row.total || 0));
    if (continuityBalance !== null && row.runningBalance !== null) {
      const expected = round(continuityBalance + row.total);
      if (round(row.runningBalance) !== expected) {
        balanceMismatches.push({ row: row.row, expected, found: round(row.runningBalance) });
      }
      continuityBalance = round(row.runningBalance);
    } else if (row.runningBalance !== null) {
      continuityBalance = round(row.runningBalance);
    }
  }

  const lastSubstantive = [...transactionRows].reverse().find((row) => row.runningBalance !== null) || null;
  const trailingRepeatedZeroRows = rows.filter((row) => row.row > (lastSubstantive?.row || 0) && Number(row.total || 0) === 0 && row.runningBalance !== null && lastSubstantive && round(row.runningBalance) === round(lastSubstantive.runningBalance)).length;

  return {
    revenue: round(revenue),
    expense: round(expense),
    net: round(revenue - expense),
    countedRows: transactionRows.filter((row) => Number(row.total || 0) !== 0).length,
    openingBalance,
    closingBalance: lastSubstantive ? round(lastSubstantive.runningBalance) : null,
    lastSubstantiveRow: lastSubstantive?.row || null,
    trailingRepeatedZeroRows,
    balanceMismatches: balanceMismatches.slice(0, 20),
    balanceMismatchesCount: balanceMismatches.length
  };
}

function classifyStockRow(item) {
  const code = item.normalizedCode;
  const name = item.normalizedName;
  if (code === 'uu9999') return 'usedAggregate';
  if (code.startsWith('zz')) return 'summary';
  if (!item.name || item.name === '-') return 'blank';
  if (name.includes('novos produtos') || name.includes('soma de produtos') || name.includes('total geral de produtos') || name.includes('estoque inicial e final')) {
    return 'summary';
  }
  return 'detail';
}

function parseStockSheet(workbook) {
  const sheet = findStockSheet(workbook);
  let headerRowIndex = -1;
  for (let index = 0; index < Math.min(sheet.rows.length, 20); index += 1) {
    const map = buildHeaderMap(sheet.rows[index]);
    if (map['planilha de estoque produto'] !== undefined || map['pr venda'] !== undefined) {
      headerRowIndex = index;
      break;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error('Cabeçalho da aba Estoque não encontrado.');
  }

  const headerRow = sheet.rows[headerRowIndex] || [];
  const headerMap = buildHeaderMap(headerRow);
  const topTotals = {
    previousCost: round(coerceLegacyNumber(headerRow[7]) ?? 0),
    currentCost: round(coerceLegacyNumber(headerRow[9]) ?? 0),
    currentSale: round(coerceLegacyNumber(headerRow[11]) ?? 0)
  };

  const items = [];
  const blankNamedRows = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex] || [];
    const legacyId = normalizeLegacyText(readCell(row, headerMap, ['id']));
    const name = readCell(row, headerMap, ['planilha de estoque produto', 'produto']);
    const currentQty = Math.max(0, Number.parseInt(String(coerceLegacyNumber(readCell(row, headerMap, ['atual'])) ?? 0), 10) || 0);
    const previousQty = Math.max(0, Number.parseInt(String(coerceLegacyNumber(readCell(row, headerMap, ['ant'])) ?? 0), 10) || 0);
    const priceAmount = round(coerceLegacyNumber(readCell(row, headerMap, ['pr venda'])) ?? 0);
    const unitCost = round(coerceLegacyNumber(readCell(row, headerMap, ['pr custo', 'pr cus u'])) ?? 0);
    const previousCostTotal = round(coerceLegacyNumber(row[7]) ?? 0);
    const currentCostTotal = round(coerceLegacyNumber(row[9]) ?? 0);
    const currentSaleTotal = round(coerceLegacyNumber(row[11]) ?? 0);
    if (!legacyId && !name && currentQty === 0 && previousQty === 0 && unitCost === 0 && priceAmount === 0 && currentCostTotal === 0 && currentSaleTotal === 0) {
      continue;
    }
    const item = {
      sourceRow: rowIndex + 1,
      legacyId,
      normalizedCode: normalizeCode(legacyId),
      name,
      normalizedName: normalizeName(name),
      previousQty,
      stockQuantity: currentQty,
      unitCost,
      priceAmount,
      previousCostTotal,
      currentCostTotal,
      currentSaleTotal
    };
    const rowType = classifyStockRow(item);
    item.rowType = rowType;
    if (rowType === 'blank' && (legacyId || currentQty || unitCost || priceAmount || currentCostTotal || currentSaleTotal)) {
      blankNamedRows.push(item);
    }
    items.push(item);
  }

  const detailRows = items.filter((item) => item.rowType === 'detail');
  const usedAggregate = items.find((item) => item.rowType === 'usedAggregate') || null;
  const summaryRows = items.filter((item) => item.rowType === 'summary');
  const duplicatesMap = new Map();
  for (const item of detailRows) {
    if (!item.normalizedCode) continue;
    if (!duplicatesMap.has(item.normalizedCode)) duplicatesMap.set(item.normalizedCode, []);
    duplicatesMap.get(item.normalizedCode).push(item.sourceRow);
  }
  const duplicateCodes = [...duplicatesMap.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([code, rows]) => ({ code, rows }))
    .slice(0, 20);

  const totals = {
    detailQty: round(detailRows.reduce((sum, item) => sum + Number(item.stockQuantity || 0), 0)),
    detailCurrentCost: round(detailRows.reduce((sum, item) => sum + Number(item.currentCostTotal || 0), 0)),
    detailCurrentSale: round(detailRows.reduce((sum, item) => sum + Number(item.currentSaleTotal || 0), 0))
  };

  const zz9998 = summaryRows.find((item) => item.normalizedCode === 'zz9998') || null;
  const zz9999 = summaryRows.find((item) => item.normalizedCode === 'zz9999') || null;

  return {
    topTotals,
    detailRows,
    usedAggregate,
    summaryRows,
    blankNamedRows: blankNamedRows.slice(0, 20),
    blankNamedRowsCount: blankNamedRows.length,
    duplicateCodes,
    duplicateCodesCount: duplicateCodes.length,
    totals,
    summaryAnchors: {
      zz9998,
      zz9999
    }
  };
}

function compareStock(db, stockSheet) {
  const crmNewItems = db.prepare(`
    SELECT id, sku, name, stock_quantity, cost_amount, price_amount, legacy_source_id
    FROM catalog_items
    WHERE active = 1
      AND COALESCE(deleted_at, '') = ''
      AND COALESCE(item_condition, 'NOVA') <> 'USADA'
    ORDER BY id ASC
  `).all().map((item) => ({
    ...item,
    unitCost: round(item.cost_amount),
    priceAmount: round(item.price_amount),
    normalizedCode: normalizeCode(item.legacy_source_id || item.sku || ''),
    normalizedName: normalizeName(item.name)
  }));

  const crmUsedTotals = db.prepare(`
    SELECT
      COUNT(*) AS item_count,
      ROUND(SUM(stock_quantity), 2) AS qty,
      ROUND(SUM(stock_quantity * cost_amount), 2) AS current_cost,
      ROUND(SUM(stock_quantity * price_amount), 2) AS current_sale
    FROM catalog_items
    WHERE active = 1
      AND COALESCE(deleted_at, '') = ''
      AND item_condition = 'USADA'
  `).get();

  const byCode = new Map();
  const byName = new Map();
  for (const item of crmNewItems) {
    if (item.normalizedCode) {
      if (!byCode.has(item.normalizedCode)) byCode.set(item.normalizedCode, []);
      byCode.get(item.normalizedCode).push(item);
    }
    if (item.normalizedName) {
      if (!byName.has(item.normalizedName)) byName.set(item.normalizedName, []);
      byName.get(item.normalizedName).push(item);
    }
  }

  const matchedIds = new Set();
  const stockMismatches = [];
  const costMismatches = [];
  const priceMismatches = [];
  const sheetOnly = [];

  for (const sheetItem of stockSheet.detailRows) {
    const codeMatches = sheetItem.normalizedCode ? (byCode.get(sheetItem.normalizedCode) || []) : [];
    const nameMatches = byName.get(sheetItem.normalizedName) || [];
    const candidate = [...codeMatches, ...nameMatches].find((item) => !matchedIds.has(item.id));
    if (!candidate) {
      sheetOnly.push(sheetItem);
      continue;
    }
    matchedIds.add(candidate.id);
    if (Number(candidate.stock_quantity || 0) !== Number(sheetItem.stockQuantity || 0)) {
      stockMismatches.push({ crmId: candidate.id, code: candidate.legacy_source_id || candidate.sku || '', name: candidate.name, crm: Number(candidate.stock_quantity || 0), sheet: sheetItem.stockQuantity, row: sheetItem.sourceRow });
    }
    if (round(candidate.unitCost) !== round(sheetItem.unitCost)) {
      costMismatches.push({ crmId: candidate.id, code: candidate.legacy_source_id || candidate.sku || '', name: candidate.name, crm: round(candidate.unitCost), sheet: sheetItem.unitCost, row: sheetItem.sourceRow });
    }
    if (round(candidate.priceAmount) !== round(sheetItem.priceAmount)) {
      priceMismatches.push({ crmId: candidate.id, code: candidate.legacy_source_id || candidate.sku || '', name: candidate.name, crm: round(candidate.priceAmount), sheet: sheetItem.priceAmount, row: sheetItem.sourceRow });
    }
  }

  const crmOnly = crmNewItems.filter((item) => !matchedIds.has(item.id));
  const usedSheet = stockSheet.usedAggregate ? {
    row: stockSheet.usedAggregate.sourceRow,
    qtyPlaceholder: stockSheet.usedAggregate.stockQuantity,
    currentCost: round(stockSheet.usedAggregate.currentCostTotal),
    currentSale: round(stockSheet.usedAggregate.currentSaleTotal)
  } : null;
  const usedCrm = {
    itemCount: Number(crmUsedTotals.item_count || 0),
    qty: round(crmUsedTotals.qty || 0),
    currentCost: round(crmUsedTotals.current_cost || 0),
    currentSale: round(crmUsedTotals.current_sale || 0)
  };

  const sheetExpectedCurrentCost = round(stockSheet.totals.detailCurrentCost + Number(usedSheet?.currentCost || 0));
  const sheetExpectedCurrentSale = round(stockSheet.totals.detailCurrentSale + Number(usedSheet?.currentSale || 0));

  return {
    sheetDetailItemCount: stockSheet.detailRows.length,
    crmNewItemCount: crmNewItems.length,
    sheetOnlyCount: sheetOnly.length,
    crmOnlyCount: crmOnly.length,
    stockMismatchesCount: stockMismatches.length,
    costMismatchesCount: costMismatches.length,
    priceMismatchesCount: priceMismatches.length,
    alignedNewItems: sheetOnly.length === 0 && crmOnly.length === 0 && stockMismatches.length === 0 && costMismatches.length === 0 && priceMismatches.length === 0,
    topTotals: stockSheet.topTotals,
    sheetTotals: {
      detailQty: stockSheet.totals.detailQty,
      detailCurrentCost: stockSheet.totals.detailCurrentCost,
      detailCurrentSale: stockSheet.totals.detailCurrentSale,
      expectedCurrentCostIncludingUsed: sheetExpectedCurrentCost,
      expectedCurrentSaleIncludingUsed: sheetExpectedCurrentSale,
      zz9998Qty: Number(stockSheet.summaryAnchors.zz9998?.stockQuantity || 0),
      zz9999Qty: Number(stockSheet.summaryAnchors.zz9999?.stockQuantity || 0)
    },
    internalSheetChecks: {
      zz9999MatchesDetailQty: round(Number(stockSheet.summaryAnchors.zz9999?.stockQuantity || 0)) === round(stockSheet.totals.detailQty),
      topCurrentCostMatchesDetailPlusUsed: round(stockSheet.topTotals.currentCost) === sheetExpectedCurrentCost,
      topCurrentSaleMatchesDetailPlusUsed: round(stockSheet.topTotals.currentSale) === sheetExpectedCurrentSale,
      blankNamedRowsCount: stockSheet.blankNamedRowsCount,
      duplicateCodesCount: stockSheet.duplicateCodesCount
    },
    usedAggregate: {
      sheet: usedSheet,
      crm: usedCrm,
      saleAligned: usedSheet ? round(usedSheet.currentSale) === round(usedCrm.currentSale) : false,
      costAligned: usedSheet ? round(usedSheet.currentCost) === round(usedCrm.currentCost) : false
    },
    sheetOnly: sheetOnly.slice(0, 20),
    crmOnly: crmOnly.slice(0, 20),
    stockMismatches: stockMismatches.slice(0, 20),
    costMismatches: costMismatches.slice(0, 20),
    priceMismatches: priceMismatches.slice(0, 20),
    blankNamedRows: stockSheet.blankNamedRows,
    duplicateCodes: stockSheet.duplicateCodes
  };
}

function analyzeWorkbookConsistency(cash, fluxo, stockComparison) {
  const saldoAtualValues = uniqueRoundedValues(cash.metrics.saldo_atual || []);
  const saldoFinalValues = uniqueRoundedValues(cash.metrics.saldo_final || []);
  const estoqueFinalValues = uniqueRoundedValues(cash.metrics.estoque_final || []);
  const geralFinalValues = uniqueRoundedValues(cash.metrics.geral_final || []);
  const somaConfereValues = uniqueRoundedValues(cash.metrics.soma_confere || []);
  const diferencaValues = uniqueRoundedValues([...(cash.metrics.diferenca || []), ...(cash.metrics['diferença'] || [])]);

  const primarySaldoAtual = saldoAtualValues[0] ?? cash.total;
  const primaryGeralFinal = geralFinalValues[0] ?? null;
  const primarySomaConfere = somaConfereValues[0] ?? null;

  return {
    gerenciaCaixa: {
      saldoAtualValues,
      saldoFinalValues,
      estoqueFinalValues,
      geralFinalValues,
      somaConfereValues,
      diferencaValues,
      officialBalancesMatchSaldoAtual: primarySaldoAtual !== null && round(cash.total) === round(primarySaldoAtual),
      groupedTypesMatchOfficialBalances:
        round(cash.groupedComputed.conta) === round(cash.groupedDeclared.conta || 0)
        && round(cash.groupedComputed.dinheiro) === round(cash.groupedDeclared.dinheiro || 0)
        && round(cash.groupedComputed.outros) === round(cash.groupedDeclared.outros || 0),
      geralFinalMinusSomaConfereMatchesStockCurrentCost:
        primaryGeralFinal !== null
        && primarySomaConfere !== null
        && round(primaryGeralFinal - primarySomaConfere) === round(stockComparison.topTotals.currentCost),
      duplicateMetricConflicts: {
        saldoAtual: saldoAtualValues.length > 1,
        saldoFinal: saldoFinalValues.length > 1,
        estoqueFinal: estoqueFinalValues.length > 1,
        geralFinal: geralFinalValues.length > 1,
        somaConfere: somaConfereValues.length > 1,
        diferenca: diferencaValues.length > 1
      },
      zeroStockFinalDespiteCurrentStock: estoqueFinalValues.includes(0) && round(stockComparison.topTotals.currentCost) > 0
    },
    fluxoCaixa: {
      closingMatchesSaldoAtual: fluxo.closingBalance !== null && primarySaldoAtual !== null && round(fluxo.closingBalance) === round(primarySaldoAtual),
      openingPlusNetMatchesClosing:
        fluxo.openingBalance !== null
        && fluxo.closingBalance !== null
        && round(fluxo.openingBalance + fluxo.net) === round(fluxo.closingBalance),
      balanceMismatchesCount: fluxo.balanceMismatchesCount,
      trailingRepeatedZeroRows: fluxo.trailingRepeatedZeroRows
    },
    estoque: {
      zz9999MatchesDetailQty: stockComparison.internalSheetChecks.zz9999MatchesDetailQty,
      topCurrentCostMatchesDetailPlusUsed: stockComparison.internalSheetChecks.topCurrentCostMatchesDetailPlusUsed,
      topCurrentSaleMatchesDetailPlusUsed: stockComparison.internalSheetChecks.topCurrentSaleMatchesDetailPlusUsed,
      usedAggregateSaleMatchesCrm: stockComparison.usedAggregate.saleAligned,
      usedAggregateCostMatchesCrm: stockComparison.usedAggregate.costAligned,
      blankNamedRowsCount: stockComparison.internalSheetChecks.blankNamedRowsCount,
      duplicateCodesCount: stockComparison.internalSheetChecks.duplicateCodesCount
    }
  };
}

const args = process.argv.slice(2);
const dbPath = resolve(process.cwd(), readOption(args, 'db-path', 'server/storage/database/crm.sqlite'));
const workbookPath = resolve(process.cwd(), readOption(args, 'workbook', '/home/loja/Downloads/26 CX Loja ok em 23 03.ods'));
const reportDir = resolve(process.cwd(), 'server/storage/reports');
mkdirSync(reportDir, { recursive: true });

const workbook = parseOdsFile(workbookPath);
workbook.filePath = workbookPath;
const db = new DatabaseSync(dbPath);

try {
  const cash = parseCashManagementSheet(workbook);
  const fluxo = parseFluxoSheet(workbook);
  const stockSheet = parseStockSheet(workbook);
  const stock = compareStock(db, stockSheet);
  const crmAccounts = Object.fromEntries(
    db.prepare(`SELECT code, ROUND(balance_amount, 2) AS balance FROM store_cash_accounts WHERE active = 1 AND code IN (${OFFICIAL_CODES.map(() => '?').join(',')})`).all(...OFFICIAL_CODES).map((row) => [row.code, round(row.balance)])
  );
  const crmGrouped = {
    conta: round((crmAccounts.CC_PIX_PJ_MAQ_VERM || 0) + (crmAccounts.MAQ_AMARELA_PIX_CEL || 0)),
    dinheiro: round((crmAccounts.CAIXINHA_LOJA || 0) + (crmAccounts.R_COM_DENIO || 0)),
    outros: round((crmAccounts.OUTROS_REGINA || 0) + (crmAccounts.BOLETOS || 0))
  };
  const financeTotals = db.prepare(`
    SELECT
      ROUND(SUM(CASE WHEN entry_type = 'RECEITA' THEN amount ELSE 0 END), 2) AS revenue,
      ROUND(SUM(CASE WHEN entry_type = 'DESPESA' THEN amount ELSE 0 END), 2) AS expense,
      COUNT(*) AS total_rows
    FROM finance_entries
  `).get();
  const cashMovementTotals = db.prepare(`
    SELECT
      ROUND(SUM(CASE WHEN entry_type = 'RECEITA' THEN amount ELSE -amount END), 2) AS net,
      COUNT(*) AS total_rows
    FROM store_cash_movements
  `).get();
  const workbookConsistency = analyzeWorkbookConsistency(cash, fluxo, stock);

  const report = {
    generatedAt: nowIso(),
    workbookPath,
    dbPath,
    sourceOfTruth: 'A planilha ODS foi tratada como base oficial. O CRM foi usado somente para comparação.',
    assumptions: {
      usedAggregateRule: 'uu9999 representa todos os itens usados do CRM.',
      groupedTypeRule: {
        conta: ['CC_PIX_PJ_MAQ_VERM', 'MAQ_AMARELA_PIX_CEL'],
        dinheiro: ['CAIXINHA_LOJA', 'R_COM_DENIO'],
        outros: ['OUTROS_REGINA', 'BOLETOS']
      }
    },
    workbookConsistency,
    gerenciaCaixa: {
      sheetBalances: cash.balances,
      crmBalances: crmAccounts,
      groupedSheetDeclared: cash.groupedDeclared,
      groupedSheetComputed: cash.groupedComputed,
      groupedCrm: crmGrouped,
      totalSheet: cash.total,
      totalCrm: round(OFFICIAL_CODES.reduce((sum, code) => sum + Number(crmAccounts[code] || 0), 0)),
      differences: Object.fromEntries(OFFICIAL_CODES.map((code) => [code, round((crmAccounts[code] || 0) - (cash.balances[code] || 0))])),
      rawMetrics: cash.metrics
    },
    fluxoCaixa: {
      sheet: fluxo,
      crmFinance: {
        revenue: round(financeTotals.revenue || 0),
        expense: round(financeTotals.expense || 0),
        net: round((financeTotals.revenue || 0) - (financeTotals.expense || 0)),
        totalRows: Number(financeTotals.total_rows || 0)
      },
      crmCashMovements: {
        net: round(cashMovementTotals.net || 0),
        totalRows: Number(cashMovementTotals.total_rows || 0)
      },
      note: 'Fluxo de Caixa manual foi auditado pela coerência interna e também comparado com os totais globais do CRM. Não foi assumido espelhamento 1:1 de lançamentos.'
    },
    estoque: stock
  };

  const reportPath = join(reportDir, `caixa-integrity-${stamp()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ reportPath, report }, null, 2));
} finally {
  db.close();
}
