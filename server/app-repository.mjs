import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { createRepository, pickNamedParams } from "./repository.mjs";
import {
  TASK_CONTACT_CHANNELS,
  TASK_PRIORITIES,
  TASK_STATUSES
} from "./constants.mjs";
import {
  coerceLegacyNumber,
  inferCatalogTaxonomy,
  legacySlug,
  normalizeLegacyText,
  parseLegacySheetDate,
  parseOdsBuffer,
  parseOdsFile
} from "./legacy-ods.mjs";
import {
  backupSqliteToMysql,
  cleanupDownloadedSources,
  createMysqlDumpFromSqlite,
  downloadLegacyWorkbookSources,
  exportSqliteBackupOds,
  importMysqlToSqlite,
  importSqliteBackupOds,
} from "./system-transfer.mjs";
import { createOdsWorkbook } from "./ods-export.mjs";
import {
  getLocalDateParts,
  getLocalDateString,
  isExpiredTimestamp,
  isBetweenDates,
  matchesSearch,
  normalizeText,
  nowIso,
  toInteger,
  toNumber,
  calculateProgressiveLineTotal
} from "./domain.mjs";

const LOW_STOCK_RULE_CODE = "LOW_STOCK_ACTIVE_NON_USED";
const BARCODE_SEARCH_URL = "https://barcodesdatabase.org/pt-br/?s=";
const FINANCE_SHEET_ACCOUNT_SEEDS = [
  { code: "CC_PIX_PJ_MAQ_VERM", name: "C/C pix PJ e maq verm" },
  { code: "MAQ_AMARELA_PIX_CEL", name: "Maq Amarela/pix cel" },
  { code: "CAIXINHA_LOJA", name: "Caixinha loja" },
  { code: "R_COM_DENIO", name: "R$ com Denio" },
  { code: "BOLETOS", name: "boletos" },
  { code: "ARTHUR", name: "Arthur" }
];
const FINANCE_SHEET_ACCOUNT_ORDER = new Map(
  FINANCE_SHEET_ACCOUNT_SEEDS.map((account, index) => [account.code, index])
);
const LEGACY_GENERIC_CASH_ACCOUNT_CODES = ["DINHEIRO", "PIX_PJ", "MAQUINA", "OUTROS"];
const INTERNAL_TRANSFER_ENTRY_TYPE = "TRANSFERENCIA";
const INTERNAL_TRANSFER_OUT = "TRANSFER_OUT";
const INTERNAL_TRANSFER_IN = "TRANSFER_IN";
const PAYMENT_METHOD_ACCOUNT_CODE_MAP = {
  CC_PIX_PJ_MAQ_VERM: "CC_PIX_PJ_MAQ_VERM",
  MAQ_AMARELA_PIX_CEL: "MAQ_AMARELA_PIX_CEL",
  CAIXINHA_LOJA: "CAIXINHA_LOJA",
  R_COM_DENIO: "R_COM_DENIO",
  ARTHUR: "ARTHUR",
  BOLETOS: "BOLETOS",
  DINHEIRO: "CAIXINHA_LOJA",
  PIX: "CC_PIX_PJ_MAQ_VERM",
  TRANSFERENCIA: "CC_PIX_PJ_MAQ_VERM",
  CARTAO: "MAQ_AMARELA_PIX_CEL",
  BOLETO: "BOLETOS"
};
const CASH_MANAGEMENT_BALANCE_CODE_MAP = {
  "c c pix pj e maq verm": "CC_PIX_PJ_MAQ_VERM",
  "maq amarela pix cel": "MAQ_AMARELA_PIX_CEL",
  "caixinha loja": "CAIXINHA_LOJA",
  "r com denio": "R_COM_DENIO",
  boletos: "BOLETOS",
  arthur: "ARTHUR"
};
const COMPANY_BRANDS = [
  {
    code: "BRASIL_EXPRESS",
    loginEmail: "contato@brasilexpress.info",
    password: "empresa123",
    name: "Brasil Express",
    shortName: "Brasil Express",
    appTitle: "Brasil Express | CRM OS",
    siteUrl: "https://brasilexpress.info/",
    logoUrl: "https://ordem.pp.ua/be2.png",
    faviconUrl: "https://ordem.pp.ua/be1.png",
    accent: "#10233f",
    store: {
      code: "BRASIL_EXPRESS_MATRIZ",
      name: "Brasil Express",
      shortName: "Loja Principal"
    },
    profiles: [
      { email: "admin@brasilexpress.local", role: "CONTA", name: "Denio", password: "admin123" },
      { email: "gerente@brasilexpress.local", role: "CONTA", name: "Geovanne", password: "gerente123" },
      { email: "atendente@brasilexpress.local", role: "CONTA", name: "Sofia", password: "atendente123" },
      { email: "arthur@brasilexpress.local", role: "CONTA", name: "Arthur", password: "arthur123" },
      { email: "tecnico@brasilexpress.local", role: "CONTA", name: "Daniel S.", password: "tecnico123" }
    ]
  }
];

export function createAppRepository(options = {}) {
  const repo = createRepository(options);
  const db = repo.db;
  const runtimeStorageRoot = options.storageRoot ?? process.env.CRM_STORAGE_ROOT ?? join(process.cwd(), "server", "storage");

  const baseCreateSession = repo.createSession.bind(repo);
  const baseDestroySession = repo.destroySession.bind(repo);
  const baseSaveClient = repo.saveClient.bind(repo);
  const baseDeleteClient = repo.deleteClient.bind(repo);
  const baseSaveCatalogItem = repo.saveCatalogItem.bind(repo);
  const baseReplenishCatalogItem = repo.replenishCatalogItem.bind(repo);
  const baseReplenishCatalogBatch = repo.replenishCatalogBatch.bind(repo);
  const baseRevertCatalogReplenishment = repo.revertCatalogReplenishment.bind(repo);
  const baseUpdateCatalogReplenishment = repo.updateCatalogReplenishment.bind(repo);
  const baseUpdateCatalogStockBatch = repo.updateCatalogStockBatch.bind(repo);
  const baseDeleteCatalogItems = repo.deleteCatalogItems.bind(repo);
  const baseSaveService = repo.saveService.bind(repo);
  const baseDeleteService = repo.deleteService.bind(repo);
  const baseSaveOrder = repo.saveOrder.bind(repo);
  const baseDeleteOrder = repo.deleteOrder.bind(repo);
  const baseSaveFinanceCategory = repo.saveFinanceCategory.bind(repo);
  const baseDeleteFinanceCategory = repo.deleteFinanceCategory.bind(repo);
  const baseReorderFinanceCategories = repo.reorderFinanceCategories.bind(repo);
  const baseSaveFinanceEntry = repo.saveFinanceEntry.bind(repo);
  const baseDashboard = repo.getDashboardSummary.bind(repo);
  const baseReports = repo.getReports.bind(repo);

  initAppSchema();
  seedAppDefaults();
  syncStores();
  reconcileCompletedOrdersFinance(requireStoreContext({}).id);
  syncCompanyProfiles();
  syncLowStockNotifications();
  repairLegacyStockCatalogArtifacts();

  return {
    ...repo,
    getMeta,
    authenticateCompany,
    createCompanySession,
    destroyCompanySession,
    getSessionContext,
    getCurrentStore,
    selectProfile,
    createSession,
    destroySession,
    saveClient,
    deleteClient,
    saveCatalogItem,
    saveCatalogBatch,
    replenishCatalogItem,
    replenishCatalogBatch,
    revertCatalogReplenishment,
    updateCatalogReplenishment,
    updateCatalogStockBatch,
    revertFinancialTransaction,
    deleteCatalogItems,
    saveService,
    deleteService,
    saveOrder,
    addOrderAttachments,
    deleteOrder,
    saveFinanceEntry,
    deleteFinanceEntry,
    listTasks,
    getTaskBoard,
    getTask,
    saveTask,
    deleteTask,
    saveTaskUpdate,
    getDashboardSummary,
    getReports,
    listNotifications,
    markNotificationRead,
    listAdminUsers,
    saveAdminUser,
    deleteAdminUser,
    listAutomationRules,
    saveAutomationRule,
    deleteAutomationRule,
    listAuditLogs,
    getPerformanceMetrics,
    getOrderTimeline,
    saveOrderTimelineEvent,
    updateOrderDueDate,
    addOrderRequestedProduct,
    addOrderStockItem,
    confirmRequestedProductPurchase,
    denyRequestedProductPurchase,
    listPurchaseRequests,
    listLowStockPurchaseItems,
    listCalendarEntries,
    scanBarcodeInput,
    lookupBarcode,
    listFiscalDocuments,
    getFiscalDocument,
    saveFiscalDocument,
    applyFiscalDocumentActions,
    listStoreCashAccounts,
    saveStoreCashAccount,
    deleteStoreCashAccount,
    listStoreCashMovements,
    getFinanceWorkbookView,
    saveStoreCashMovement,
    saveStoreCashTransfer,
    listCashSessions,
    openCashSession,
    closeCashSession,
    listPosSales,
    getPosSale,
    createPosSale,
    deletePosSale,
    listLegacyImportRows,
    getLegacyImportSummary,
    importLegacyOds,
    importOperationalOds,
    exportOperationalOds,
    exportBackupOds,
    importBackupOds,
    backupToMysql,
    createMysqlDump,
    importFromMysql,
    importLegacyOdsFromLinks
  };

  function run(sql, params = {}) {
    return db.prepare(sql).run(pickNamedParams(sql, params));
  }

  function get(sql, params = {}) {
    return db.prepare(sql).get(pickNamedParams(sql, params));
  }

  function all(sql, params = {}) {
    return db.prepare(sql).all(pickNamedParams(sql, params));
  }

  function transaction(work) {
    db.exec("BEGIN IMMEDIATE;");
    try {
      const result = work();
      db.exec("COMMIT;");
      return result;
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }

  function hasColumn(tableName, columnName) {
    return all(`PRAGMA table_info(${tableName})`).some((column) => column.name === columnName);
  }

  function addColumnIfMissing(tableName, columnName, definition) {
    if (!hasColumn(tableName, columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
    }
  }

  function safeParseJson(value, fallback = {}) {
    if (!value) {
      return fallback;
    }
    if (typeof value === "object") {
      return value;
    }
    try {
      return JSON.parse(String(value));
    } catch {
      return fallback;
    }
  }

  function serializeStructuredPayload(value, fallback = "{}") {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  function initAppSchema() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id INTEGER,
        actor_name TEXT NOT NULL DEFAULT 'Sistema',
        actor_role TEXT NOT NULL DEFAULT 'SYSTEM',
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        action TEXT NOT NULL,
        before_state TEXT DEFAULT '',
        after_state TEXT DEFAULT '',
        context_data TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_timeline_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        color TEXT DEFAULT '#0d6efd',
        event_date TEXT NOT NULL,
        actor_user_id INTEGER,
        actor_name TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS automation_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        config_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT DEFAULT '',
        tone TEXT DEFAULT 'secondary',
        entity_type TEXT DEFAULT '',
        entity_id INTEGER,
        rule_key TEXT NOT NULL UNIQUE,
        read_at TEXT DEFAULT '',
        resolved_at TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS barcode_lookup_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        title TEXT DEFAULT '',
        description TEXT DEFAULT '',
        source_url TEXT DEFAULT '',
        source_status TEXT DEFAULT 'UNKNOWN',
        raw_payload TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS company_sessions (
        token TEXT PRIMARY KEY,
        company_code TEXT NOT NULL,
        active_user_id INTEGER DEFAULT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (active_user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS fiscal_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_type TEXT NOT NULL,
        source_type TEXT NOT NULL,
        access_key TEXT DEFAULT '',
        issuer_name TEXT DEFAULT '',
        issuer_document TEXT DEFAULT '',
        document_number TEXT DEFAULT '',
        document_series TEXT DEFAULT '',
        issued_at TEXT DEFAULT '',
        total_amount REAL NOT NULL DEFAULT 0,
        danfe_url TEXT DEFAULT '',
        xml_payload TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_by_user_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fiscal_document_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fiscal_document_id INTEGER NOT NULL,
        line_number INTEGER NOT NULL DEFAULT 1,
        sku TEXT DEFAULT '',
        barcode TEXT DEFAULT '',
        description TEXT NOT NULL,
        ncm TEXT DEFAULT '',
        quantity REAL NOT NULL DEFAULT 0,
        unit TEXT DEFAULT '',
        unit_cost REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        matched_catalog_item_id INTEGER,
        action_status TEXT DEFAULT 'PENDING',
        action_payload TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (fiscal_document_id) REFERENCES fiscal_documents(id) ON DELETE CASCADE,
        FOREIGN KEY (matched_catalog_item_id) REFERENCES catalog_items(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_code TEXT NOT NULL UNIQUE,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        short_name TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS store_cash_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        baseline_amount REAL NOT NULL DEFAULT 0,
        balance_amount REAL NOT NULL DEFAULT 0,
        snapshot_source_workbook TEXT DEFAULT '',
        snapshot_source_sheet TEXT DEFAULT '',
        snapshot_source_row INTEGER DEFAULT NULL,
        snapshot_raw_payload TEXT DEFAULT '',
        snapshot_updated_at TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (store_id, code),
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS daily_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        order_id INTEGER DEFAULT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        task_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDENTE',
        priority TEXT NOT NULL DEFAULT 'MEDIA',
        responsible_name TEXT DEFAULT '',
        client_name TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        value_amount REAL DEFAULT NULL,
        value_label TEXT DEFAULT '',
        device TEXT DEFAULT '',
        contact_channel TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        source_workbook TEXT DEFAULT '',
        source_sheet TEXT DEFAULT '',
        source_row INTEGER DEFAULT NULL,
        legacy_queue_code TEXT DEFAULT '',
        legacy_queue_label TEXT DEFAULT '',
        legacy_priority_order INTEGER DEFAULT NULL,
        legacy_status_label TEXT DEFAULT '',
        legacy_target_date TEXT DEFAULT '',
        raw_payload TEXT DEFAULT '',
        created_by_user_id INTEGER DEFAULT NULL,
        created_by_name TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS daily_task_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        actor_user_id INTEGER DEFAULT NULL,
        actor_name TEXT DEFAULT '',
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES daily_tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS daily_task_checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        checked INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES daily_tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS legacy_import_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_workbook TEXT NOT NULL,
        source_path TEXT DEFAULT '',
        imported_by_user_id INTEGER DEFAULT NULL,
        imported_by_name TEXT DEFAULT '',
        imported_at TEXT NOT NULL,
        summary_json TEXT DEFAULT '',
        FOREIGN KEY (imported_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS legacy_import_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_run_id INTEGER NOT NULL,
        source_workbook TEXT NOT NULL,
        source_sheet TEXT NOT NULL,
        source_row INTEGER NOT NULL,
        entity_type TEXT DEFAULT '',
        entity_id INTEGER DEFAULT NULL,
        structured_payload TEXT DEFAULT '',
        raw_payload TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (import_run_id) REFERENCES legacy_import_runs(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS cash_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        operator_name TEXT NOT NULL,
        opening_amount REAL NOT NULL DEFAULT 0,
        closing_amount REAL NOT NULL DEFAULT 0,
        expected_amount REAL NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'OPEN',
        opened_at TEXT NOT NULL,
        closed_at TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pos_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        cash_session_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        client_id INTEGER,
        client_name TEXT DEFAULT '',
        subtotal_amount REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS pos_sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        catalog_item_id INTEGER DEFAULT NULL,
        service_catalog_id INTEGER DEFAULT NULL,
        item_type TEXT NOT NULL DEFAULT 'PRODUCT',
        item_name TEXT NOT NULL,
        sku TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_cost REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES pos_sales(id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE RESTRICT,
        FOREIGN KEY (service_catalog_id) REFERENCES service_catalog(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS pos_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES pos_sales(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS store_cash_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        cash_session_id INTEGER DEFAULT NULL,
        finance_entry_id INTEGER DEFAULT NULL,
        sale_id INTEGER DEFAULT NULL,
        cash_account_id INTEGER DEFAULT NULL,
        movement_type TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        movement_date TEXT NOT NULL,
        source_workbook TEXT DEFAULT '',
        source_sheet TEXT DEFAULT '',
        source_row INTEGER DEFAULT NULL,
        legacy_section TEXT DEFAULT '',
        actor_user_id INTEGER DEFAULT NULL,
        actor_name TEXT DEFAULT '',
        raw_payload TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
        FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL,
        FOREIGN KEY (finance_entry_id) REFERENCES finance_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (sale_id) REFERENCES pos_sales(id) ON DELETE SET NULL,
        FOREIGN KEY (cash_account_id) REFERENCES store_cash_accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    addColumnIfMissing("cash_sessions", "store_id", "INTEGER DEFAULT NULL");
    addColumnIfMissing("cash_sessions", "opened_by_user_id", "INTEGER DEFAULT NULL");
    addColumnIfMissing("pos_sales", "store_id", "INTEGER DEFAULT NULL");
    addColumnIfMissing("pos_sales", "discount_mode", "TEXT NOT NULL DEFAULT 'AMOUNT'");
    addColumnIfMissing("pos_sales", "discount_value", "REAL NOT NULL DEFAULT 0");
    addColumnIfMissing("service_catalog", "available_in_order", "INTEGER NOT NULL DEFAULT 1");
    addColumnIfMissing("service_catalog", "available_in_pdv", "INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing("pos_sale_items", "service_catalog_id", "INTEGER DEFAULT NULL");
    addColumnIfMissing("pos_sale_items", "item_type", "TEXT NOT NULL DEFAULT 'PRODUCT'");
    addColumnIfMissing("store_cash_accounts", "baseline_amount", "REAL NOT NULL DEFAULT 0");
    addColumnIfMissing("store_cash_accounts", "snapshot_source_workbook", "TEXT DEFAULT ''");
    addColumnIfMissing("store_cash_accounts", "snapshot_source_sheet", "TEXT DEFAULT ''");
    addColumnIfMissing("store_cash_accounts", "snapshot_source_row", "INTEGER DEFAULT NULL");
    addColumnIfMissing("store_cash_accounts", "snapshot_raw_payload", "TEXT DEFAULT ''");
    addColumnIfMissing("store_cash_accounts", "snapshot_updated_at", "TEXT DEFAULT ''");
    addColumnIfMissing("store_cash_movements", "source_workbook", "TEXT DEFAULT ''");
    addColumnIfMissing("store_cash_movements", "source_sheet", "TEXT DEFAULT ''");
    addColumnIfMissing("store_cash_movements", "source_row", "INTEGER DEFAULT NULL");
    addColumnIfMissing("store_cash_movements", "legacy_section", "TEXT DEFAULT ''");
    addColumnIfMissing("daily_tasks", "legacy_queue_code", "TEXT DEFAULT ''");
    addColumnIfMissing("daily_tasks", "legacy_queue_label", "TEXT DEFAULT ''");
    addColumnIfMissing("daily_tasks", "legacy_priority_order", "INTEGER DEFAULT NULL");
    addColumnIfMissing("daily_tasks", "legacy_status_label", "TEXT DEFAULT ''");
    addColumnIfMissing("daily_tasks", "legacy_target_date", "TEXT DEFAULT ''");
    addColumnIfMissing("daily_tasks", "value_label", "TEXT DEFAULT ''");
    ensurePosSaleItemsCatalogNullable();
  }

  function ensurePosSaleItemsCatalogNullable() {
    const info = all("PRAGMA table_info(pos_sale_items)") || [];
    const catalogColumn = info.find((column) => column.name === "catalog_item_id");
    if (!catalogColumn || Number(catalogColumn.notnull || 0) === 0) {
      return;
    }
    run("PRAGMA foreign_keys = OFF;");
    run(`
      CREATE TABLE pos_sale_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        catalog_item_id INTEGER DEFAULT NULL,
        service_catalog_id INTEGER DEFAULT NULL,
        item_type TEXT NOT NULL DEFAULT 'PRODUCT',
        item_name TEXT NOT NULL,
        sku TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_cost REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES pos_sales(id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE RESTRICT,
        FOREIGN KEY (service_catalog_id) REFERENCES service_catalog(id) ON DELETE RESTRICT
      );
    `);
    run(`
      INSERT INTO pos_sale_items_new (
        id, sale_id, catalog_item_id, service_catalog_id, item_type, item_name, sku,
        quantity, unit_cost, unit_price, line_total, created_at
      )
      SELECT
        id, sale_id,
        catalog_item_id, service_catalog_id, item_type, item_name, sku,
        quantity, unit_cost, unit_price, line_total, created_at
      FROM pos_sale_items;
    `);
    run("DROP TABLE pos_sale_items;");
    run("ALTER TABLE pos_sale_items_new RENAME TO pos_sale_items;");
    run("PRAGMA foreign_keys = ON;");
  }

  function seedAppDefaults() {
    const timestamp = nowIso();
    const existing = get("SELECT id FROM automation_rules WHERE code = :code", { code: LOW_STOCK_RULE_CODE });
    if (existing) {
      return;
    }

    run(
      `
        INSERT INTO automation_rules (code, name, description, active, config_json, created_at, updated_at)
        VALUES (:code, :name, :description, :active, :configJson, :createdAt, :updatedAt)
      `,
      {
        code: LOW_STOCK_RULE_CODE,
        name: "Alerta de baixo estoque",
        description: "Dispara notificacoes para itens ativos NOVA e SEMINOVA quando o estoque fica abaixo do minimo.",
        active: 1,
        configJson: JSON.stringify({ excludeConditions: ["USADA"] }),
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );
  }

  function syncStores() {
    const timestamp = nowIso();
    for (const brand of COMPANY_BRANDS) {
      const storeConfig = brand.store || {
        code: `${brand.code}_STORE`,
        name: brand.name,
        shortName: brand.shortName
      };
      const existing = get("SELECT id FROM stores WHERE company_code = :companyCode", { companyCode: brand.code });
      if (existing) {
        run(
          `
            UPDATE stores
            SET code = :code,
                name = :name,
                short_name = :shortName,
                updated_at = :updatedAt
            WHERE id = :id
          `,
          {
            id: existing.id,
            code: storeConfig.code,
            name: storeConfig.name,
            shortName: normalizeText(storeConfig.shortName, storeConfig.name),
            updatedAt: timestamp
          }
        );
      } else {
        run(
          `
            INSERT INTO stores (company_code, code, name, short_name, active, created_at, updated_at)
            VALUES (:companyCode, :code, :name, :shortName, 1, :createdAt, :updatedAt)
          `,
          {
            companyCode: brand.code,
            code: storeConfig.code,
            name: storeConfig.name,
            shortName: normalizeText(storeConfig.shortName, storeConfig.name),
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
      }

      const store = get("SELECT * FROM stores WHERE company_code = :companyCode", { companyCode: brand.code });
      if (!store) {
        continue;
      }

      seedStoreCashAccounts(store.id);
      run("UPDATE cash_sessions SET store_id = :storeId WHERE store_id IS NULL", { storeId: store.id });
      run("UPDATE pos_sales SET store_id = :storeId WHERE store_id IS NULL", { storeId: store.id });
      run("UPDATE finance_entries SET store_id = :storeId WHERE store_id IS NULL", { storeId: store.id });
    }
  }

  function seedStoreCashAccounts(storeId) {
    const timestamp = nowIso();
    for (const account of FINANCE_SHEET_ACCOUNT_SEEDS) {
      const existing = get(
        "SELECT id FROM store_cash_accounts WHERE store_id = :storeId AND code = :code",
        { storeId: Number(storeId), code: account.code }
      );
      if (existing) {
        run(
          `
            UPDATE store_cash_accounts
            SET name = :name,
                updated_at = :updatedAt
            WHERE id = :id
          `,
          {
            id: existing.id,
            name: account.name,
            updatedAt: timestamp
          }
        );
        continue;
      }

      run(
        `
          INSERT INTO store_cash_accounts (store_id, code, name, baseline_amount, balance_amount, active, created_at, updated_at)
          VALUES (:storeId, :code, :name, 0, 0, 1, :createdAt, :updatedAt)
        `,
        {
          storeId: Number(storeId),
          code: account.code,
          name: account.name,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );
    }

    for (const code of LEGACY_GENERIC_CASH_ACCOUNT_CODES) {
      run(
        `
          UPDATE store_cash_accounts
          SET active = 0,
              updated_at = :updatedAt
          WHERE store_id = :storeId
            AND code = :code
            AND code NOT IN ('CAIXINHA_LOJA')
        `,
        {
          storeId: Number(storeId),
          code,
          updatedAt: timestamp
        }
      );
    }
  }

  function getCompanyStore(companyCode) {
    if (!companyCode) {
      return null;
    }
    return get("SELECT * FROM stores WHERE company_code = :companyCode AND active = 1", { companyCode }) || null;
  }

  function getDefaultStore() {
    return get("SELECT * FROM stores WHERE active = 1 ORDER BY id ASC LIMIT 1") || null;
  }

  function buildStorePayload(companyCode) {
    const store = getCompanyStore(companyCode);
    if (!store) {
      return null;
    }
    return {
      id: store.id,
      companyCode: store.company_code,
      code: store.code,
      name: store.name,
      shortName: store.short_name || store.name
    };
  }

  function requireStoreContext(payload = {}) {
    const explicitStoreId = Number(payload.storeId || payload.store_id || payload._store?.id || 0);
    if (explicitStoreId > 0) {
      const explicit = get("SELECT * FROM stores WHERE id = :id AND active = 1", { id: explicitStoreId });
      if (explicit) {
        return explicit;
      }
    }
    const byCompany = payload.companyCode ? getCompanyStore(payload.companyCode) : null;
    if (byCompany) {
      return byCompany;
    }
    const fallback = getDefaultStore();
    if (!fallback) {
      throw new Error("Nenhuma loja ativa foi encontrada para a operacao.");
    }
    return fallback;
  }

  function listStoreCashAccounts(storeId) {
    return all(
      `
        SELECT
          a.*,
          COUNT(m.id) AS movement_count,
          MAX(m.movement_date) AS last_movement_date
        FROM store_cash_accounts
        a
        LEFT JOIN store_cash_movements m ON m.cash_account_id = a.id
        WHERE a.store_id = :storeId
        GROUP BY a.id
        ORDER BY a.active DESC, a.id ASC
      `,
      { storeId: Number(storeId) }
    );
  }

  function hasExplicitField(payload = {}, fieldName = "") {
    return Object.prototype.hasOwnProperty.call(payload, fieldName);
  }

  function resolveCashAccountCodeByPaymentMethod(paymentMethod = "") {
    const method = normalizeText(paymentMethod).toUpperCase();
    return PAYMENT_METHOD_ACCOUNT_CODE_MAP[method] || "CAIXINHA_LOJA";
  }

  function resolveCashManagementAccountCode(metric = {}) {
    const labelSlug = legacySlug(metric.label || "");
    return CASH_MANAGEMENT_BALANCE_CODE_MAP[labelSlug] || "";
  }

  function resolveCashAccountId(storeId, explicitId = null, paymentMethod = "") {
    const normalizedStoreId = Number(storeId || 0);
    if (!normalizedStoreId) {
      return null;
    }
    if (explicitId) {
      const account = get(
        "SELECT id FROM store_cash_accounts WHERE id = :id AND store_id = :storeId",
        { id: Number(explicitId), storeId: normalizedStoreId }
      );
      if (account) {
        return Number(account.id);
      }
    }

    const preferredCode = resolveCashAccountCodeByPaymentMethod(paymentMethod);

    const account = get(
      "SELECT id FROM store_cash_accounts WHERE store_id = :storeId AND code = :code AND active = 1",
      { storeId: normalizedStoreId, code: preferredCode }
    );
    return account ? Number(account.id) : null;
  }

  function normalizeEntryDateInput(value = "") {
    const text = normalizeText(value);
    if (!text) {
      return getLocalDateString();
    }
    return text.slice(0, 10);
  }

  function roundCurrency(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function sumOfficialStoreCashBalances(storeId) {
    return roundCurrency(
      listStoreCashAccounts(storeId)
        .filter((account) => Number(account.active) === 1 && FINANCE_SHEET_ACCOUNT_ORDER.has(String(account.code || "")))
        .reduce((sum, account) => sum + Number(account.balance_amount || 0), 0)
    );
  }

  function syncOrderRevenueEntry(order, storeId, actor = null) {
    const orderId = Number(order?.id || 0);
    if (!orderId || !storeId) {
      return null;
    }

    const existingEntries = all(
      `
        SELECT *
        FROM finance_entries
        WHERE order_id = :orderId
          AND entry_type = 'RECEITA'
          AND category = 'Recebimento de OS'
        ORDER BY id ASC
      `,
      { orderId }
    );
    const [primaryEntry, ...extraEntries] = existingEntries;

    for (const entry of extraEntries) {
      deleteFinanceEntry(Number(entry.id), { actor });
    }

    const shouldRegisterRevenue = String(order.order_status || "") === "CONCLUIDA" && Number(order.total_amount || 0) > 0;
    if (!shouldRegisterRevenue) {
      if (primaryEntry) {
        deleteFinanceEntry(Number(primaryEntry.id), { actor });
      }
      return null;
    }

    const paymentMethod = normalizeText(order.payment_method, "CAIXINHA_LOJA") || "CAIXINHA_LOJA";
    return saveFinanceEntry({
      id: primaryEntry?.id ? Number(primaryEntry.id) : undefined,
      entryType: "RECEITA",
      category: "Recebimento de OS",
      description: `Recebimento da OS ${order.code}`,
      amount: Number(order.total_amount || 0),
      entryDate: normalizeEntryDateInput(order.delivered_at || order.concluded_at || order.opened_at),
      paymentMethod,
      orderId,
      storeId,
      cashAccountId: resolveCashAccountId(storeId, null, paymentMethod),
      rawPayload: {
        origin: "ORDER_COMPLETION",
        orderCode: order.code
      },
      _allowOperationalFinanceEntryUpdate: true,
      _actor: actor
    });
  }

  function syncOrderRequestedProductCostEntries(order, storeId, actor = null) {
    const orderId = Number(order?.id || 0);
    if (!orderId || !storeId) {
      return [];
    }

    const existingEntries = all(
      `
        SELECT *
        FROM finance_entries
        WHERE order_id = :orderId
          AND entry_type = 'DESPESA'
          AND category = 'Compra de produto'
        ORDER BY id ASC
      `,
      { orderId }
    );
    const removedEntries = [];

    for (const entry of existingEntries) {
      const rawPayload = safeParseJson(entry.raw_payload, {});
      const source = normalizeText(rawPayload.source || rawPayload.origin).toUpperCase();
      if (source === 'ORDER_COMPLETION_REQUESTED_PRODUCT_COST') {
        removedEntries.push(entry);
      }
    }

    for (const entry of removedEntries) {
      deleteFinanceEntry(Number(entry.id), { actor });
    }

    const shouldRegisterCosts = String(order.order_status || "") === "CONCLUIDA";
    if (!shouldRegisterCosts) {
      return [];
    }

    const requestedProducts = (Array.isArray(order.requested_products) ? order.requested_products : [])
      .filter((requestedProduct) => String(requestedProduct.status || 'PENDENTE') !== 'NEGADO')
      .map((requestedProduct) => {
        const purchaseCost = Math.max(0, Number(requestedProduct.purchase_cost ?? requestedProduct.purchaseCost ?? 0));
        const quantity = Math.max(1, Number(requestedProduct.quantity || 1));
        return {
          id: Number(requestedProduct.id || 0),
          name: requestedProduct.product_name || requestedProduct.name || "Produto solicitado",
          purchaseCost,
          quantity,
          totalCost: roundCurrency(purchaseCost * quantity),
          cashAccountId: requestedProduct.purchase_cash_account_id || requestedProduct.purchaseCashAccountId || null
        };
      })
      .filter((requestedProduct) => requestedProduct.totalCost > 0);

    const totalCost = roundCurrency(requestedProducts.reduce((sum, requestedProduct) => sum + requestedProduct.totalCost, 0));
    if (totalCost <= 0) {
      return [];
    }

    const cashAccountId = requestedProducts.find((requestedProduct) => Number(requestedProduct.cashAccountId || 0) > 0)?.cashAccountId || null;
    const paymentMethod = cashAccountId
      ? (get("SELECT code FROM store_cash_accounts WHERE id = :id AND store_id = :storeId", { id: Number(cashAccountId), storeId })?.code || "CAIXINHA_LOJA")
      : normalizeText(order.payment_method, "CAIXINHA_LOJA") || "CAIXINHA_LOJA";
    const financeEntry = saveFinanceEntry({
      entryType: "DESPESA",
      category: "Compra de produto",
      description: `Custos extras da OS ${order.code}`,
      amount: totalCost,
      entryDate: normalizeEntryDateInput(order.delivered_at || order.concluded_at || order.opened_at),
      paymentMethod,
      orderId,
      storeId,
      cashAccountId: cashAccountId ? Number(cashAccountId) : resolveCashAccountId(storeId, null, paymentMethod),
      rawPayload: {
        source: "ORDER_COMPLETION_REQUESTED_PRODUCT_COST",
        orderCode: order.code,
        productCount: requestedProducts.length,
        products: requestedProducts
      },
      _actor: actor
    });

    return [financeEntry];
  }

  function syncCompletedOrderFinanceEntries(order, storeId, actor = null) {
    const normalizedOrder = order ? repo.getOrder(Number(order.id || 0)) || order : null;
    if (!normalizedOrder || !storeId) {
      return;
    }

    syncOrderRevenueEntry(normalizedOrder, storeId, actor);
    syncOrderRequestedProductCostEntries(normalizedOrder, storeId, actor);
  }

  function reconcileCompletedOrdersFinance(storeId, actor = null) {
    if (!storeId) {
      return;
    }

    const concludedOrders = all(
      `
        SELECT id
        FROM orders
        WHERE order_status = 'CONCLUIDA'
        ORDER BY id ASC
      `
    );

    for (const row of concludedOrders) {
      const order = repo.getOrder(Number(row.id));
      if (order) {
        syncCompletedOrderFinanceEntries(order, storeId, actor);
      }
    }
  }

  function ensureOrderIsEditable(order, operationLabel = "editar") {
    if (!order) {
      throw new Error("OS nao encontrada.");
    }

    if (["CONCLUIDA", "CANCELADA"].includes(String(order.order_status || "").toUpperCase())) {
      throw new Error(`A OS ${order.code} ja foi encerrada e nao pode mais ser ${operationLabel}.`);
    }
  }

  function recalculateStoreCashAccountBalance(accountId) {
    if (!accountId) {
      return;
    }
    const totals = get(
      `
        SELECT
          COALESCE(SUM(
            CASE
              WHEN entry_type = 'RECEITA' OR movement_type = 'TRANSFER_IN' THEN amount
              ELSE 0
            END
          ), 0) AS total_revenue,
          COALESCE(SUM(
            CASE
              WHEN entry_type = 'DESPESA' OR movement_type = 'TRANSFER_OUT' THEN amount
              ELSE 0
            END
          ), 0) AS total_expense
        FROM store_cash_movements
        WHERE cash_account_id = :accountId
      `,
      { accountId: Number(accountId) }
    ) || { total_revenue: 0, total_expense: 0 };

    run(
      `
        UPDATE store_cash_accounts
        SET balance_amount = :balanceAmount,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: Number(accountId),
        balanceAmount: Number(get("SELECT COALESCE(baseline_amount, 0) AS baseline_amount FROM store_cash_accounts WHERE id = :id", { id: Number(accountId) })?.baseline_amount || 0)
          + Number(totals.total_revenue || 0)
          - Number(totals.total_expense || 0),
        updatedAt: nowIso()
      }
    );
  }

  function saveStoreCashMovement(payload = {}) {
    const actor = payload._actor || payload.actor;
    const normalizedActor = normalizeActor(actor);
    const store = requireStoreContext(payload);
    const hasExplicitCashAccountId = hasExplicitField(payload, "cashAccountId") || hasExplicitField(payload, "cash_account_id");
    const requestedCashAccountId = payload.cashAccountId ?? payload.cash_account_id ?? null;
    const cashAccountId = hasExplicitCashAccountId
      ? (requestedCashAccountId ? resolveCashAccountId(store.id, requestedCashAccountId, "") : null)
      : resolveCashAccountId(
        store.id,
        null,
        payload.paymentMethod || payload.payment_method
      );
    const amount = roundCurrency(Number(toNumber(payload.amount) ?? 0));
    const entryType = normalizeText(payload.entryType, "RECEITA") || "RECEITA";
    const timestamp = nowIso();
    const result = run(
      `
        INSERT INTO store_cash_movements (
          store_id, cash_session_id, finance_entry_id, sale_id, cash_account_id, movement_type, entry_type,
          description, amount, movement_date, source_workbook, source_sheet, source_row, legacy_section,
          actor_user_id, actor_name, raw_payload, created_at, updated_at
        )
        VALUES (
          :storeId, :cashSessionId, :financeEntryId, :saleId, :cashAccountId, :movementType, :entryType,
          :description, :amount, :movementDate, :sourceWorkbook, :sourceSheet, :sourceRow, :legacySection,
          :actorUserId, :actorName, :rawPayload, :createdAt, :updatedAt
        )
      `,
      {
        storeId: store.id,
        cashSessionId: payload.cashSessionId ? Number(payload.cashSessionId) : null,
        financeEntryId: payload.financeEntryId ? Number(payload.financeEntryId) : null,
        saleId: payload.saleId ? Number(payload.saleId) : null,
        cashAccountId,
        movementType: normalizeText(payload.movementType, "MANUAL") || "MANUAL",
        entryType,
        description: normalizeText(payload.description, "Movimento de caixa") || "Movimento de caixa",
        amount,
        movementDate: normalizeText(payload.movementDate, getLocalDateString()),
        sourceWorkbook: normalizeText(payload.sourceWorkbook || payload.source_workbook),
        sourceSheet: normalizeText(payload.sourceSheet || payload.source_sheet),
        sourceRow: payload.sourceRow !== undefined || payload.source_row !== undefined
          ? Number(payload.sourceRow ?? payload.source_row) || null
          : null,
        legacySection: normalizeText(payload.legacySection || payload.legacy_section),
        actorUserId: normalizedActor.actorUserId,
        actorName: normalizedActor.actorName,
        rawPayload: serializeStructuredPayload(payload.rawPayload, "{}"),
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );
    if (cashAccountId) {
      recalculateStoreCashAccountBalance(cashAccountId);
    }
    if (payload.cashSessionId) {
      refreshCashSessionExpectedAmount(Number(payload.cashSessionId));
    }
    return get("SELECT * FROM store_cash_movements WHERE id = :id", { id: Number(result.lastInsertRowid) });
  }

  function saveStoreCashTransfer(payload = {}) {
    const actor = payload._actor || payload.actor;
    const normalizedActor = normalizeActor(actor);
    const store = requireStoreContext(payload);
    const sourceAccountId = Number(payload.fromCashAccountId ?? payload.from_cash_account_id ?? 0);
    const destinationAccountId = Number(payload.toCashAccountId ?? payload.to_cash_account_id ?? 0);
    const amount = roundCurrency(Number(toNumber(payload.amount) ?? 0));
    const movementDate = normalizeText(payload.movementDate || payload.movement_date, getLocalDateString()) || getLocalDateString();
    const notes = normalizeText(payload.notes);

    if (!sourceAccountId || !destinationAccountId) {
      throw new Error("Selecione a conta de origem e a conta de destino.");
    }
    if (sourceAccountId === destinationAccountId) {
      throw new Error("A conta de origem precisa ser diferente da conta de destino.");
    }
    if (amount === 0) {
      throw new Error("Informe um valor diferente de zero para transferir.");
    }

    const sourceAccount = get(
      "SELECT * FROM store_cash_accounts WHERE id = :id AND store_id = :storeId AND active = 1",
      { id: sourceAccountId, storeId: store.id }
    );
    const destinationAccount = get(
      "SELECT * FROM store_cash_accounts WHERE id = :id AND store_id = :storeId AND active = 1",
      { id: destinationAccountId, storeId: store.id }
    );

    if (!sourceAccount) {
      throw new Error("Conta de origem nao encontrada ou inativa.");
    }
    if (!destinationAccount) {
      throw new Error("Conta de destino nao encontrada ou inativa.");
    }

    const timestamp = nowIso();
    const transferKey = normalizeText(payload.transferKey) || randomUUID();
    const rawPayloadBase = {
      source: "INTERNAL_CASH_TRANSFER",
      transferKey,
      fromCashAccountId: sourceAccount.id,
      fromCashAccountCode: sourceAccount.code,
      fromCashAccountName: sourceAccount.name,
      toCashAccountId: destinationAccount.id,
      toCashAccountCode: destinationAccount.code,
      toCashAccountName: destinationAccount.name,
      amount,
      movementDate,
      notes
    };

    transaction(() => {
      run(
        `
          INSERT INTO store_cash_movements (
            store_id, cash_session_id, finance_entry_id, sale_id, cash_account_id, movement_type, entry_type,
            description, amount, movement_date, source_workbook, source_sheet, source_row, legacy_section,
            actor_user_id, actor_name, raw_payload, created_at, updated_at
          )
          VALUES (
            :storeId, NULL, NULL, NULL, :cashAccountId, :movementType, :entryType,
            :description, :amount, :movementDate, '', '', NULL, '',
            :actorUserId, :actorName, :rawPayload, :createdAt, :updatedAt
          )
        `,
        {
          storeId: store.id,
          cashAccountId: sourceAccount.id,
          movementType: INTERNAL_TRANSFER_OUT,
          entryType: INTERNAL_TRANSFER_ENTRY_TYPE,
          description: normalizeText(payload.sourceDescription, `Transferencia para ${destinationAccount.name}`) || `Transferencia para ${destinationAccount.name}`,
          amount,
          movementDate,
          actorUserId: normalizedActor.actorUserId,
          actorName: normalizedActor.actorName,
          rawPayload: JSON.stringify({ ...rawPayloadBase, direction: "OUT" }),
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );

      run(
        `
          INSERT INTO store_cash_movements (
            store_id, cash_session_id, finance_entry_id, sale_id, cash_account_id, movement_type, entry_type,
            description, amount, movement_date, source_workbook, source_sheet, source_row, legacy_section,
            actor_user_id, actor_name, raw_payload, created_at, updated_at
          )
          VALUES (
            :storeId, NULL, NULL, NULL, :cashAccountId, :movementType, :entryType,
            :description, :amount, :movementDate, '', '', NULL, '',
            :actorUserId, :actorName, :rawPayload, :createdAt, :updatedAt
          )
        `,
        {
          storeId: store.id,
          cashAccountId: destinationAccount.id,
          movementType: INTERNAL_TRANSFER_IN,
          entryType: INTERNAL_TRANSFER_ENTRY_TYPE,
          description: normalizeText(payload.destinationDescription, `Transferencia de ${sourceAccount.name}`) || `Transferencia de ${sourceAccount.name}`,
          amount,
          movementDate,
          actorUserId: normalizedActor.actorUserId,
          actorName: normalizedActor.actorName,
          rawPayload: JSON.stringify({ ...rawPayloadBase, direction: "IN" }),
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );

      recalculateStoreCashAccountBalance(sourceAccount.id);
      recalculateStoreCashAccountBalance(destinationAccount.id);
      writeAuditLog(actor, "STORE_CASH_TRANSFER", null, "TRANSFER", sourceAccount, destinationAccount, {
        amount,
        movementDate,
        fromCashAccountId: sourceAccount.id,
        toCashAccountId: destinationAccount.id,
        transferKey
      });
    });

    return {
      success: true,
      fromAccount: get("SELECT * FROM store_cash_accounts WHERE id = :id", { id: sourceAccount.id }),
      toAccount: get("SELECT * FROM store_cash_accounts WHERE id = :id", { id: destinationAccount.id })
    };
  }

  function normalizeLegacyOrderStatuses() {
    run(
      `
        UPDATE orders
        SET order_status = 'CONCLUIDA',
            concluded_at = CASE WHEN concluded_at = '' THEN COALESCE(delivered_at, updated_at, opened_at) ELSE concluded_at END,
            delivered_at = CASE WHEN delivered_at = '' THEN COALESCE(concluded_at, updated_at, opened_at) ELSE delivered_at END,
            updated_at = :updatedAt
        WHERE order_status = 'ENTREGUE_FECHADA'
      `,
      { updatedAt: nowIso() }
    );
    reconcileCompletedOrdersFinance(requireStoreContext({}).id);
  }

  function normalizeActor(actor) {
    const fallbackRole = actor?.id ? "CONTA" : "SYSTEM";
    return {
      actorUserId: Number(actor?.id || 0) || null,
      actorName: normalizeText(actor?.name, "Sistema") || "Sistema",
      actorRole: normalizeText(actor?.role, fallbackRole) || fallbackRole
    };
  }

  function compactState(value) {
    if (!value || typeof value !== "object") {
      return value ?? null;
    }

    const clone = JSON.parse(JSON.stringify(value));
    if (clone.photoUpload?.base64) {
      clone.photoUpload = {
        name: clone.photoUpload.name || "upload",
        size: String(clone.photoUpload.base64).length
      };
    }
    return clone;
  }

  function writeAuditLog(actor, entityType, entityId, action, beforeState = null, afterState = null, context = {}) {
    const normalizedActor = normalizeActor(actor);
    run(
      `
        INSERT INTO audit_logs (
          actor_user_id, actor_name, actor_role, entity_type, entity_id, action,
          before_state, after_state, context_data, created_at
        )
        VALUES (
          :actorUserId, :actorName, :actorRole, :entityType, :entityId, :action,
          :beforeState, :afterState, :contextData, :createdAt
        )
      `,
      {
        ...normalizedActor,
        entityType,
        entityId: entityId ? Number(entityId) : null,
        action,
        beforeState: JSON.stringify(compactState(beforeState) ?? {}),
        afterState: JSON.stringify(compactState(afterState) ?? {}),
        contextData: JSON.stringify(compactState(context) ?? {}),
        createdAt: nowIso()
      }
    );
  }

  function writeOrderTimelineEvent(orderId, eventType, title, description, color, eventDate, actor) {
    const normalizedActor = normalizeActor(actor);
    run(
      `
        INSERT INTO order_timeline_events (
          order_id, event_type, title, description, color, event_date, actor_user_id, actor_name, created_at
        )
        VALUES (
          :orderId, :eventType, :title, :description, :color, :eventDate, :actorUserId, :actorName, :createdAt
        )
      `,
      {
        orderId,
        eventType,
        title,
        description,
        color,
        eventDate: normalizeText(eventDate, getLocalDateString()) || getLocalDateString(),
        actorUserId: normalizedActor.actorUserId,
        actorName: normalizedActor.actorName,
        createdAt: nowIso()
      }
    );
  }

  function recordOrderFlow(beforeOrder, afterOrder, actor) {
    if (!afterOrder) {
      return;
    }

    const referenceDate =
      afterOrder.delivered_at || afterOrder.concluded_at || afterOrder.cancelled_at || afterOrder.opened_at || getLocalDateString();

    if (!beforeOrder) {
      writeOrderTimelineEvent(
        afterOrder.id,
        "OPENED",
        "OS aberta",
        `${afterOrder.code} criada para ${afterOrder.client_name}.`,
        "#0d6efd",
        afterOrder.opened_at,
        actor
      );
      return;
    }

    if (beforeOrder.order_status !== afterOrder.order_status) {
      writeOrderTimelineEvent(
        afterOrder.id,
        "STATUS_CHANGE",
        `Status alterado para ${afterOrder.order_status}`,
        `A OS ${afterOrder.code} mudou de ${beforeOrder.order_status} para ${afterOrder.order_status}.`,
        calendarStatusColor(afterOrder.order_status),
        referenceDate,
        actor
      );
      writeAuditLog(actor, "ORDER", afterOrder.id, "STATUS_CHANGE", beforeOrder, afterOrder, { code: afterOrder.code });
    }

    if (beforeOrder.approval_status !== afterOrder.approval_status) {
      writeOrderTimelineEvent(
        afterOrder.id,
        "APPROVAL_CHANGE",
        `Aprovacao: ${afterOrder.approval_status}`,
        `A aprovacao da OS ${afterOrder.code} mudou de ${beforeOrder.approval_status} para ${afterOrder.approval_status}.`,
        "#6610f2",
        referenceDate,
        actor
      );
      writeAuditLog(actor, "ORDER", afterOrder.id, "APPROVAL_CHANGE", beforeOrder, afterOrder, { code: afterOrder.code });
    }

    writeOrderTimelineEvent(
      afterOrder.id,
      "UPDATED",
      "OS atualizada",
      `${afterOrder.code} recebeu nova atualizacao operacional.`,
      "#6c757d",
      referenceDate,
      actor
    );
  }

  function syncLowStockNotifications() {
    const rule = get("SELECT * FROM automation_rules WHERE code = :code AND active = 1", { code: LOW_STOCK_RULE_CODE });
    if (!rule) {
      return;
    }

    const timestamp = nowIso();
    const items = repo
      .listCatalogItems({ activeOnly: true })
      .filter(
        (item) =>
          Number(item.active) === 1 &&
          item.item_condition !== "USADA" &&
          Number(item.min_stock || 0) > 0 &&
          Number(item.stock_quantity || 0) <= Number(item.min_stock || 0)
      );

    const activeKeys = new Set(items.map((item) => `LOW_STOCK:${item.id}`));
    const existing = all("SELECT * FROM notifications WHERE type = 'LOW_STOCK' AND resolved_at = ''");

    for (const notification of existing) {
      if (!activeKeys.has(notification.rule_key)) {
        run(
          `
            UPDATE notifications
            SET resolved_at = :resolvedAt,
                updated_at = :updatedAt
            WHERE id = :id
          `,
          {
            id: notification.id,
            resolvedAt: timestamp,
            updatedAt: timestamp
          }
        );
      }
    }

    for (const item of items) {
      const ruleKey = `LOW_STOCK:${item.id}`;
      const current = get("SELECT * FROM notifications WHERE rule_key = :ruleKey", { ruleKey });
      const payload = {
        type: "LOW_STOCK",
        title: `${item.name} em baixa no estoque`,
        message: `${item.sku ? `SKU ${item.sku} | ` : ""}${item.stock_quantity}/${item.min_stock} em estoque. Itens usados nao entram nessa regra.`,
        tone: Number(item.stock_quantity || 0) === 0 ? "danger" : "warning",
        entityType: "CATALOG_ITEM",
        entityId: item.id,
        ruleKey,
        updatedAt: timestamp
      };

      if (current) {
        run(
          `
            UPDATE notifications
            SET title = :title,
                message = :message,
                tone = :tone,
                entity_type = :entityType,
                entity_id = :entityId,
                resolved_at = '',
                updated_at = :updatedAt
            WHERE id = :id
          `,
          {
            ...payload,
            id: current.id
          }
        );
        continue;
      }

      run(
        `
          INSERT INTO notifications (
            type, title, message, tone, entity_type, entity_id, rule_key, read_at, resolved_at, created_at, updated_at
          )
          VALUES (
            :type, :title, :message, :tone, :entityType, :entityId, :ruleKey, '', '', :createdAt, :updatedAt
          )
        `,
        {
          ...payload,
          createdAt: timestamp
        }
      );
    }
  }

  function listNotifications(filters = {}) {
    const rows = all(`
      SELECT *
      FROM notifications
      WHERE resolved_at = ''
      ORDER BY CASE WHEN read_at = '' THEN 0 ELSE 1 END, created_at DESC, id DESC
    `);

    return rows.filter((row) => {
      if (!matchesSearch(`${row.title} ${row.message} ${row.type}`, filters.search)) {
        return false;
      }
      if (filters.unreadOnly && row.read_at) {
        return false;
      }
      return true;
    });
  }

  function markNotificationRead(notificationId, actor) {
    const current = get("SELECT * FROM notifications WHERE id = :id", { id: notificationId });
    if (!current) {
      throw new Error("Notificacao nao encontrada.");
    }

    const timestamp = nowIso();
    run(
      `
        UPDATE notifications
        SET read_at = :readAt,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: notificationId,
        readAt: timestamp,
        updatedAt: timestamp
      }
    );
    const updated = get("SELECT * FROM notifications WHERE id = :id", { id: notificationId });
    writeAuditLog(actor, "NOTIFICATION", notificationId, "READ", current, updated, { type: current.type });
    return updated;
  }

  function listAutomationRules() {
    return all("SELECT * FROM automation_rules ORDER BY name COLLATE NOCASE ASC");
  }

  function saveAutomationRule(payload) {
    const timestamp = nowIso();
    const normalized = {
      id: payload.id ? Number(payload.id) : null,
      code: normalizeText(payload.code),
      name: normalizeText(payload.name),
      description: normalizeText(payload.description),
      active: payload.active === false ? 0 : 1,
      configJson: JSON.stringify(payload.config || {})
    };

    if (!normalized.code || !normalized.name) {
      throw new Error("Codigo e nome da regra sao obrigatorios.");
    }

    if (normalized.id) {
      run(
        `
          UPDATE automation_rules
          SET code = :code,
              name = :name,
              description = :description,
              active = :active,
              config_json = :configJson,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          ...normalized,
          updatedAt: timestamp
        }
      );
    } else {
      run(
        `
          INSERT INTO automation_rules (code, name, description, active, config_json, created_at, updated_at)
          VALUES (:code, :name, :description, :active, :configJson, :createdAt, :updatedAt)
        `,
        {
          ...normalized,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );
    }

    syncLowStockNotifications();
    return get("SELECT * FROM automation_rules WHERE code = :code", { code: normalized.code });
  }

  function deleteAutomationRule(ruleId) {
    const normalizedId = Number(ruleId || 0);
    const current = get("SELECT * FROM automation_rules WHERE id = :id", { id: normalizedId });
    if (!current) {
      throw new Error("Regra de automacao nao encontrada.");
    }

    run("DELETE FROM automation_rules WHERE id = :id", { id: normalizedId });
    syncLowStockNotifications();
    return { success: true };
  }

  function scanBarcodeInput(payload = {}) {
    const rawCode = normalizeText(payload.code || payload.manualCode || payload.text || "");
    if (!rawCode) {
      throw new Error("Nenhum codigo foi informado para leitura.");
    }

    const code = rawCode.replace(/[^0-9A-Za-z]/g, "");
    return {
      code,
      digitsOnly: code.replace(/\D/g, ""),
      length: code.length,
      format: code.length === 13 ? "EAN-13" : code.length === 8 ? "EAN-8" : "GENERIC"
    };
  }

  async function lookupBarcode(codeInput) {
    const code = scanBarcodeInput({ code: codeInput }).code;
    const cached = get("SELECT * FROM barcode_lookup_cache WHERE code = :code", { code });
    if (cached) {
      return {
        code,
        title: cached.title,
        description: cached.description,
        externalUrl: cached.source_url,
        sourceStatus: cached.source_status,
        cached: true
      };
    }

    const sourceUrl = `${BARCODE_SEARCH_URL}${encodeURIComponent(code)}`;
    const timestamp = nowIso();

    try {
      const response = await fetch(sourceUrl, {
        headers: {
          "user-agent": "BrasilExpressCRM/2.0"
        }
      });
      const html = await response.text();
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
      const description = normalizeText(h1Match?.[1] || titleMatch?.[1] || "Produto nao identificado pela fonte assistida.")
        .replace(/\s+/g, " ")
        .replace(/\|.*$/g, "");

      run(
        `
          INSERT INTO barcode_lookup_cache (code, title, description, source_url, source_status, raw_payload, created_at, updated_at)
          VALUES (:code, :title, :description, :sourceUrl, :sourceStatus, :rawPayload, :createdAt, :updatedAt)
        `,
        {
          code,
          title: description || code,
          description,
          sourceUrl,
          sourceStatus: response.ok ? "FOUND" : `HTTP_${response.status}`,
          rawPayload: html.slice(0, 4000),
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );

      return {
        code,
        title: description || code,
        description,
        externalUrl: sourceUrl,
        sourceStatus: response.ok ? "FOUND" : `HTTP_${response.status}`,
        cached: false
      };
    } catch (error) {
      run(
        `
          INSERT INTO barcode_lookup_cache (code, title, description, source_url, source_status, raw_payload, created_at, updated_at)
          VALUES (:code, :title, :description, :sourceUrl, :sourceStatus, :rawPayload, :createdAt, :updatedAt)
        `,
        {
          code,
          title: code,
          description: "Consulta assistida indisponivel. O cadastro local pode seguir normalmente.",
          sourceUrl,
          sourceStatus: "UNAVAILABLE",
          rawPayload: JSON.stringify({ message: error instanceof Error ? error.message : String(error) }),
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );

      return {
        code,
        title: code,
        description: "Consulta assistida indisponivel. O cadastro local pode seguir normalmente.",
        externalUrl: sourceUrl,
        sourceStatus: "UNAVAILABLE",
        cached: false
      };
    }
  }

  function decodeUploadText(payload) {
    const base64 = normalizeText(payload?.base64, "");
    if (!base64) {
      return "";
    }
    const content = base64.includes(",") ? base64.split(",").pop() : base64;
    return Buffer.from(content || "", "base64").toString("utf8");
  }

  function extractTag(xml, tag) {
    const match = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return normalizeText(match?.[1], "");
  }

  function parseFiscalXml(xml) {
    const accessKey = String(xml).match(/Id="(?:NFe|NFCe)?(\d{44})"/i)?.[1] || String(xml).match(/\b\d{44}\b/)?.[0] || "";
    const model = extractTag(xml, "mod") || "55";
    const items = [...String(xml).matchAll(/<det\b[^>]*nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/gi)].map((match) => {
      const content = match[2];
      const quantity = toNumber(extractTag(content, "qCom")) ?? 0;
      const unitCost = toNumber(extractTag(content, "vUnCom")) ?? 0;
      return {
        lineNumber: Number(match[1]),
        sku: extractTag(content, "cProd"),
        barcode: extractTag(content, "cEAN") || extractTag(content, "cEANTrib"),
        description: extractTag(content, "xProd") || `Item ${match[1]}`,
        ncm: extractTag(content, "NCM"),
        quantity,
        unit: extractTag(content, "uCom"),
        unitCost,
        totalAmount: toNumber(extractTag(content, "vProd")) ?? quantity * unitCost
      };
    });

    return {
      documentType: model === "65" ? "NFC-e" : "NF-e",
      sourceType: "XML",
      accessKey,
      issuerName: extractTag(xml, "xNome"),
      issuerDocument: extractTag(xml, "CNPJ") || extractTag(xml, "CPF"),
      documentNumber: extractTag(xml, "nNF"),
      documentSeries: extractTag(xml, "serie"),
      issuedAt: (extractTag(xml, "dhEmi") || extractTag(xml, "dEmi") || "").slice(0, 10),
      totalAmount: toNumber(extractTag(xml, "vNF")) ?? items.reduce((sum, item) => sum + item.totalAmount, 0),
      danfeUrl: "",
      notes: "Importado a partir de XML.",
      items
    };
  }

  function listFiscalDocuments(filters = {}) {
    const rows = all(`
      SELECT *
      FROM fiscal_documents
      ORDER BY created_at DESC, id DESC
    `);

    return rows.filter((row) => {
      if (!matchesSearch(`${row.access_key} ${row.issuer_name} ${row.document_number}`, filters.search)) {
        return false;
      }
      return isBetweenDates(row.issued_at || row.created_at.slice(0, 10), filters.fromDate, filters.toDate);
    });
  }

  function getFiscalDocument(documentId) {
    const document = get("SELECT * FROM fiscal_documents WHERE id = :id", { id: documentId });
    if (!document) {
      return null;
    }

    const items = all(
      `
        SELECT fdi.*, ci.name AS matched_catalog_name, ci.sku AS matched_catalog_sku
        FROM fiscal_document_items fdi
        LEFT JOIN catalog_items ci ON ci.id = fdi.matched_catalog_item_id
        WHERE fdi.fiscal_document_id = :documentId
        ORDER BY fdi.line_number ASC, fdi.id ASC
      `,
      { documentId }
    );

    return {
      ...document,
      items
    };
  }

  function saveFiscalDocument(payload = {}) {
    const timestamp = nowIso();
    const actor = payload._actor;
    const xmlPayload = normalizeText(payload.xmlText || decodeUploadText(payload.xmlUpload), "");
    const parsed = xmlPayload
      ? parseFiscalXml(xmlPayload)
      : {
          documentType: normalizeText(payload.documentType, "NF-e") || "NF-e",
          sourceType: normalizeText(payload.sourceType, payload.accessKey ? "ACCESS_KEY" : payload.danfeUrl ? "DANFE_LINK" : "MANUAL") || "MANUAL",
          accessKey: normalizeText(payload.accessKey),
          issuerName: normalizeText(payload.issuerName),
          issuerDocument: normalizeText(payload.issuerDocument),
          documentNumber: normalizeText(payload.documentNumber),
          documentSeries: normalizeText(payload.documentSeries),
          issuedAt: normalizeText(payload.issuedAt, getLocalDateString()),
          totalAmount: toNumber(payload.totalAmount) ?? 0,
          danfeUrl: normalizeText(payload.danfeUrl),
          notes: normalizeText(payload.notes),
          items: Array.isArray(payload.items) ? payload.items : []
        };

    if (!parsed.accessKey && !parsed.documentNumber && !parsed.danfeUrl && !xmlPayload) {
      throw new Error("Informe XML, chave de acesso ou identificador do DANFE para registrar o documento fiscal.");
    }

    const result = run(
      `
        INSERT INTO fiscal_documents (
          document_type, source_type, access_key, issuer_name, issuer_document, document_number,
          document_series, issued_at, total_amount, danfe_url, xml_payload, notes,
          created_by_user_id, created_at, updated_at
        )
        VALUES (
          :documentType, :sourceType, :accessKey, :issuerName, :issuerDocument, :documentNumber,
          :documentSeries, :issuedAt, :totalAmount, :danfeUrl, :xmlPayload, :notes,
          :createdByUserId, :createdAt, :updatedAt
        )
      `,
      {
        documentType: parsed.documentType,
        sourceType: parsed.sourceType,
        accessKey: parsed.accessKey,
        issuerName: parsed.issuerName,
        issuerDocument: parsed.issuerDocument,
        documentNumber: parsed.documentNumber,
        documentSeries: parsed.documentSeries,
        issuedAt: parsed.issuedAt,
        totalAmount: parsed.totalAmount,
        danfeUrl: parsed.danfeUrl,
        xmlPayload,
        notes: parsed.notes,
        createdByUserId: Number(actor?.id || 0) || null,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );

    const documentId = Number(result.lastInsertRowid);
    for (const item of parsed.items) {
      run(
        `
          INSERT INTO fiscal_document_items (
            fiscal_document_id, line_number, sku, barcode, description, ncm, quantity, unit,
            unit_cost, total_amount, matched_catalog_item_id, action_status, action_payload, created_at, updated_at
          )
          VALUES (
            :documentId, :lineNumber, :sku, :barcode, :description, :ncm, :quantity, :unit,
            :unitCost, :totalAmount, NULL, 'PENDING', '', :createdAt, :updatedAt
          )
        `,
        {
          documentId,
          lineNumber: Number(item.lineNumber || 1),
          sku: normalizeText(item.sku),
          barcode: normalizeText(item.barcode),
          description: normalizeText(item.description, "Item fiscal"),
          ncm: normalizeText(item.ncm),
          quantity: toNumber(item.quantity) ?? 0,
          unit: normalizeText(item.unit),
          unitCost: toNumber(item.unitCost) ?? 0,
          totalAmount: toNumber(item.totalAmount) ?? 0,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );
    }

    const document = getFiscalDocument(documentId);
    writeAuditLog(actor, "FISCAL_DOCUMENT", documentId, "CREATE", null, document, { sourceType: parsed.sourceType });
    return document;
  }

  function adjustCatalogStock(catalogItemId, quantityDelta, unitCost = null, actor = null, reason = "MANUAL") {
    repo.syncCatalogStockBatches();
    const current = get("SELECT * FROM catalog_items WHERE id = :id", { id: catalogItemId });
    if (!current) {
      throw new Error("Item de catalogo nao encontrado para ajuste de estoque.");
    }

    const nextQuantity = Number(current.stock_quantity || 0) + Number(quantityDelta || 0);
    if (nextQuantity < 0) {
      throw new Error(`Estoque insuficiente para ${current.name}.`);
    }

    if (Number(quantityDelta || 0) > 0) {
      createCatalogStockBatchForAdjustment(catalogItemId, Number(quantityDelta || 0), unitCost, Number(current.price_amount || 0), reason);
    } else if (Number(quantityDelta || 0) < 0) {
      repo.consumeCatalogStock(catalogItemId, Math.abs(Number(quantityDelta || 0)), {
        sourceType: "APP_STOCK_ADJUSTMENT",
        sourceId: Number(Date.now())
      });
    } else if (unitCost !== null && Number(current.stock_quantity || 0) <= 0) {
      run(
        `
          UPDATE catalog_items
          SET cost_amount = :costAmount,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          id: catalogItemId,
          costAmount: Number(unitCost || 0),
          updatedAt: nowIso()
        }
      );
    }

    const updated = get("SELECT * FROM catalog_items WHERE id = :id", { id: catalogItemId });
    writeAuditLog(actor, "STOCK", catalogItemId, "ADJUST", current, updated, { reason, quantityDelta });
    return updated;
  }

  function createCatalogStockBatchForAdjustment(catalogItemId, quantity, unitCost, unitPrice, reason = "MANUAL") {
    const normalizedQuantity = Math.max(0, Number(quantity || 0));
    if (normalizedQuantity <= 0) {
      return null;
    }
    const timestamp = nowIso();
    run(
      `
        INSERT INTO catalog_stock_batches (
          catalog_item_id, source_type, source_id, quantity, quantity_remaining,
          unit_cost, unit_price, notes, created_at, updated_at
        )
        VALUES (
          :catalogItemId, :sourceType, :sourceId, :quantity, :quantityRemaining,
          :unitCost, :unitPrice, :notes, :createdAt, :updatedAt
        )
      `,
      {
        catalogItemId: Number(catalogItemId),
        sourceType: normalizeText(reason, "APP_MANUAL") || "APP_MANUAL",
        sourceId: Number(Date.now()),
        quantity: normalizedQuantity,
        quantityRemaining: normalizedQuantity,
        unitCost: toNumber(unitCost) ?? 0,
        unitPrice: toNumber(unitPrice) ?? 0,
        notes: normalizeText(reason),
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );
    repo.syncCatalogStockBatches();
    return get("SELECT * FROM catalog_items WHERE id = :id", { id: Number(catalogItemId) });
  }

  function applyFiscalDocumentActions(documentId, payload = {}) {
    const actor = payload._actor || payload.actor;
    const document = getFiscalDocument(documentId);
    if (!document) {
      throw new Error("Documento fiscal nao encontrado.");
    }

    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    const applied = [];

    transaction(() => {
      for (const action of actions) {
        const fiscalItem = get(
          "SELECT * FROM fiscal_document_items WHERE id = :id AND fiscal_document_id = :documentId",
          { id: Number(action.fiscalItemId), documentId }
        );
        if (!fiscalItem) {
          continue;
        }

        let matchedCatalogItemId = action.catalogItemId ? Number(action.catalogItemId) : null;
        let actionStatus = normalizeText(action.action, "PENDING") || "PENDING";

        if (action.action === "CREATE_ITEM") {
          const created = baseSaveCatalogItem({
            sku: normalizeText(action.sku || fiscalItem.sku || `NF-${documentId}-${fiscalItem.line_number}`),
            name: normalizeText(action.name || fiscalItem.description),
            category: normalizeText(action.category, "Acessórios") || "Acessórios",
            subcategory: normalizeText(action.subcategory),
            compatibility: normalizeText(action.compatibility),
            itemCondition: normalizeText(action.itemCondition, "NOVA") || "NOVA",
            stockQuantity: 0,
            minStock: Number(action.minStock || 0),
            costAmount: toNumber(action.unitCost) ?? toNumber(fiscalItem.unit_cost) ?? 0,
            priceAmount: toNumber(action.priceAmount) ?? toNumber(fiscalItem.unit_cost) ?? 0,
            isComplete: Boolean(action.isComplete),
            active: true
          });
          matchedCatalogItemId = created.id;
          actionStatus = "CREATED";
        }

        if (matchedCatalogItemId && ["CREATE_ITEM", "LINK_EXISTING", "RESTOCK"].includes(action.action)) {
          adjustCatalogStock(
            matchedCatalogItemId,
            toNumber(action.quantity) ?? toNumber(fiscalItem.quantity) ?? 0,
            toNumber(action.unitCost) ?? toNumber(fiscalItem.unit_cost),
            actor,
            `FISCAL_${action.action}`
          );
          actionStatus = action.action === "RESTOCK" ? "RESTOCKED" : actionStatus;
        }

        if (matchedCatalogItemId && action.action === "UPDATE_COST") {
          adjustCatalogStock(matchedCatalogItemId, 0, toNumber(action.unitCost) ?? toNumber(fiscalItem.unit_cost), actor, "FISCAL_UPDATE_COST");
          actionStatus = "COST_UPDATED";
        }

        if (action.action === "GENERATE_FINANCE") {
          baseSaveFinanceEntry({
            entryType: "DESPESA",
            category: "Documento fiscal",
            description: `${document.document_type} ${document.document_number || document.access_key}`,
            amount: toNumber(action.amount) ?? toNumber(fiscalItem.total_amount) ?? 0,
            entryDate: document.issued_at || getLocalDateString(),
            paymentMethod: "NAO_DEFINIDO"
          });
          actionStatus = "FINANCE_CREATED";
        }

        if (action.action === "IGNORE") {
          actionStatus = "IGNORED";
        }

        run(
          `
            UPDATE fiscal_document_items
            SET matched_catalog_item_id = :matchedCatalogItemId,
                action_status = :actionStatus,
                action_payload = :actionPayload,
                updated_at = :updatedAt
            WHERE id = :id
          `,
          {
            id: fiscalItem.id,
            matchedCatalogItemId,
            actionStatus,
            actionPayload: JSON.stringify(action),
            updatedAt: nowIso()
          }
        );

        applied.push({ fiscalItemId: fiscalItem.id, actionStatus, matchedCatalogItemId });
      }
    });

    syncLowStockNotifications();
    const updatedDocument = getFiscalDocument(documentId);
    writeAuditLog(actor, "FISCAL_DOCUMENT", documentId, "APPLY_ACTIONS", document, updatedDocument, { appliedCount: applied.length });
    return {
      success: true,
      applied,
      data: updatedDocument
    };
  }

  function getCashSessionRecord(sessionId) {
    return get(
      `
        SELECT
          cs.*,
          u.email AS user_email,
          st.name AS store_name,
          st.short_name AS store_short_name
        FROM cash_sessions cs
        LEFT JOIN users u ON u.id = COALESCE(cs.opened_by_user_id, cs.user_id)
        LEFT JOIN stores st ON st.id = cs.store_id
        WHERE cs.id = :id
      `,
      { id: Number(sessionId) }
    ) || null;
  }

  function listCashSessions(filters = {}) {
    const rows = all(`
      SELECT
        cs.*,
        u.email AS user_email,
        st.name AS store_name,
        st.short_name AS store_short_name
      FROM cash_sessions cs
      LEFT JOIN users u ON u.id = COALESCE(cs.opened_by_user_id, cs.user_id)
      LEFT JOIN stores st ON st.id = cs.store_id
      ORDER BY cs.opened_at DESC, cs.id DESC
    `);

    return rows.filter((row) => {
      if (String(filters.openOnly) === "true" && row.status !== "OPEN") {
        return false;
      }
      if (filters.storeId && Number(filters.storeId) !== Number(row.store_id)) {
        return false;
      }
      if (filters.userId && Number(filters.userId) !== Number(row.opened_by_user_id || row.user_id)) {
        return false;
      }
      return isBetweenDates(String(row.opened_at || ""), filters.fromDate, filters.toDate);
    });
  }

  function openCashSession(payload = {}) {
    const actor = payload._actor || payload.actor;
    const normalizedActor = normalizeActor(actor);
    if (!normalizedActor.actorUserId) {
      throw new Error("Sessao de caixa exige um usuario autenticado.");
    }

    const store = requireStoreContext(payload);
    const openSession = get(
      "SELECT id FROM cash_sessions WHERE store_id = :storeId AND status = 'OPEN'",
      { storeId: store.id }
    );
    if (openSession) {
      return getCashSessionRecord(openSession.id);
    }

    const hasExplicitOpeningAmount = hasExplicitField(payload, "openingAmount") || hasExplicitField(payload, "opening_amount");
    const openingAmount = hasExplicitOpeningAmount
      ? (toNumber(payload.openingAmount ?? payload.opening_amount) ?? sumOfficialStoreCashBalances(store.id))
      : sumOfficialStoreCashBalances(store.id);
    const timestamp = nowIso();
    const result = run(
      `
        INSERT INTO cash_sessions (
          user_id, opened_by_user_id, store_id, operator_name, opening_amount, closing_amount, expected_amount,
          notes, status, opened_at, closed_at, created_at, updated_at
        )
        VALUES (
          :userId, :openedByUserId, :storeId, :operatorName, :openingAmount, 0, :expectedAmount,
          :notes, 'OPEN', :openedAt, '', :createdAt, :updatedAt
        )
      `,
      {
        userId: normalizedActor.actorUserId,
        openedByUserId: normalizedActor.actorUserId,
        storeId: store.id,
        operatorName: store.short_name || store.name,
        openingAmount,
        expectedAmount: openingAmount,
        notes: normalizeText(payload.notes),
        openedAt: getLocalDateString(),
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );

    const session = getCashSessionRecord(Number(result.lastInsertRowid));
    writeAuditLog(actor, "CASH_SESSION", session.id, "OPEN", null, session, { storeId: store.id, storeName: store.name });
    return session;
  }

  function closeCashSession(sessionId, payload = {}) {
    const actor = payload._actor || payload.actor;
    const session = getCashSessionRecord(sessionId);
    if (!session) {
      throw new Error("Caixa nao encontrado.");
    }

    const totalSales = Number(
      get("SELECT COALESCE(SUM(total_amount), 0) AS total FROM pos_sales WHERE cash_session_id = :id", { id: sessionId })?.total || 0
    );
    const expectedAmount = sumOfficialStoreCashBalances(session.store_id);
    const hasExplicitClosingAmount = hasExplicitField(payload, "closingAmount") || hasExplicitField(payload, "closing_amount");
    const closingAmount = hasExplicitClosingAmount
      ? (toNumber(payload.closingAmount ?? payload.closing_amount) ?? expectedAmount)
      : expectedAmount;

    run(
      `
        UPDATE cash_sessions
        SET closing_amount = :closingAmount,
            expected_amount = :expectedAmount,
            notes = :notes,
            status = 'CLOSED',
            closed_at = :closedAt,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: Number(sessionId),
        closingAmount,
        expectedAmount,
        notes: normalizeText(payload.notes, session.notes),
        closedAt: getLocalDateString(),
        updatedAt: nowIso()
      }
    );

    const updated = getCashSessionRecord(sessionId);
    writeAuditLog(actor, "CASH_SESSION", Number(sessionId), "CLOSE", session, updated, {
      totalSales,
      expectedAmount,
      storeId: session.store_id
    });
    return updated;
  }

  function listStoreCashMovements(filters = {}) {
    const rows = all(`
      SELECT
        m.*,
        a.code AS cash_account_code,
        a.name AS cash_account_name,
        s.code AS sale_code,
        f.category AS finance_category,
        f.payment_method AS finance_payment_method,
        f.order_id AS finance_order_id,
        COALESCE(sr.id, sr_extra.id) AS replenishment_id
      FROM store_cash_movements m
      LEFT JOIN store_cash_accounts a ON a.id = m.cash_account_id
      LEFT JOIN pos_sales s ON s.id = m.sale_id
      LEFT JOIN finance_entries f ON f.id = m.finance_entry_id
      LEFT JOIN stock_replenishments sr ON sr.finance_entry_id = f.id
      LEFT JOIN stock_replenishments sr_extra ON sr_extra.extra_finance_entry_id = f.id
      ORDER BY m.movement_date DESC, m.id DESC
    `);

    return rows.filter((row) => {
      if (filters.storeId && Number(filters.storeId) !== Number(row.store_id)) {
        return false;
      }
      if (filters.cashAccountId && Number(filters.cashAccountId) !== Number(row.cash_account_id)) {
        return false;
      }
      if (filters.legacySection && normalizeText(filters.legacySection) !== normalizeText(row.legacy_section)) {
        return false;
      }
      if (!matchesSearch(`${row.description} ${row.cash_account_name || ""} ${row.sale_code || ""} ${row.source_sheet || ""} ${row.legacy_section || ""}`, filters.search)) {
        return false;
      }
      return isBetweenDates(String(row.movement_date || ""), filters.fromDate, filters.toDate);
    });
  }

  function normalizeCashFlowSection(entry) {
    return normalizeText(entry?.legacy_section, "ENTRADAS_SAIDAS") || "ENTRADAS_SAIDAS";
  }

  function inferCashFlowCategory(entry) {
    if (normalizeText(entry?.finance_category)) {
      return normalizeText(entry.finance_category);
    }
    const rawPayload = safeParseJson(entry?.raw_payload, {});
    if (normalizeText(entry?.movement_type) === INTERNAL_TRANSFER_OUT || normalizeText(entry?.movement_type) === INTERNAL_TRANSFER_IN) {
      return "Transferencia interna";
    }
    if (normalizeText(rawPayload.category)) {
      return normalizeText(rawPayload.category);
    }
    if (normalizeText(entry?.movement_type) === "PDV_PAYMENT") {
      return "Recebimento PDV";
    }
    return normalizeText(entry?.entry_type) === "DESPESA" ? "Saída de caixa" : "Movimento de caixa";
  }

  function inferCashFlowPaymentMethod(entry) {
    if (normalizeText(entry?.finance_payment_method)) {
      return normalizeText(entry.finance_payment_method);
    }
    const rawPayload = safeParseJson(entry?.raw_payload, {});
    if (normalizeText(rawPayload.paymentMethod)) {
      return normalizeText(rawPayload.paymentMethod);
    }
    if (normalizeText(entry?.cash_account_code)) {
      return normalizeText(entry.cash_account_code);
    }
    if (normalizeText(entry?.cash_account_name)) {
      return normalizeText(entry.cash_account_name);
    }
    return "NAO_DEFINIDO";
  }

  function mapStoreCashMovementToFinanceEntry(entry) {
    return {
      id: Number(entry.finance_entry_id || entry.id || 0),
      entry_type: normalizeText(entry.entry_type, "RECEITA") || "RECEITA",
      category: inferCashFlowCategory(entry),
      description: normalizeText(entry.description, "Movimento de caixa") || "Movimento de caixa",
      amount: Number(entry.amount || 0),
      entry_date: normalizeText(entry.movement_date, getLocalDateString()),
      payment_method: inferCashFlowPaymentMethod(entry),
      order_id: entry.finance_order_id ? Number(entry.finance_order_id) : null,
      store_id: entry.store_id ? Number(entry.store_id) : null,
      cash_account_id: entry.cash_account_id ? Number(entry.cash_account_id) : null,
      cash_account_name: normalizeText(entry.cash_account_name),
      cash_account_code: normalizeText(entry.cash_account_code),
      replenishment_id: entry.replenishment_id ? Number(entry.replenishment_id) : null,
      finance_entry_id: entry.finance_entry_id ? Number(entry.finance_entry_id) : null,
      order_code: normalizeText(entry.sale_code),
      source_workbook: normalizeText(entry.source_workbook),
      source_sheet: normalizeText(entry.source_sheet),
      source_row: entry.source_row !== undefined && entry.source_row !== null ? Number(entry.source_row) : null,
      legacy_section: normalizeCashFlowSection(entry),
      raw_payload: entry.raw_payload || ""
    };
  }

  function buildCashManagementMetric(sheetRows, rowIndex, labelIndex, valueIndex, prefixIndex = null) {
    const row = sheetRows[rowIndex] || [];
    const label = normalizeLegacyText(row[labelIndex] || "");
    const rawValue = normalizeLegacyText(row[valueIndex] || "");
    const prefix = prefixIndex === null ? "" : normalizeLegacyText(row[prefixIndex] || "");
    if (!label && !rawValue && !prefix) {
      return null;
    }
    return {
      rowIndex: rowIndex + 1,
      prefix,
      label,
      rawValue,
      value: coerceLegacyNumber(rawValue)
    };
  }

  function getCashManagementWorkbookPath() {
    const localWorkbook = join(process.cwd(), "caixa.ods");
    return existsSync(localWorkbook) ? localWorkbook : "";
  }

  function buildCashManagementSheetSnapshot(sheet, workbookPath = "") {
    if (!sheet) {
      return null;
    }

    const rows = sheet.rows;
    const cellText = (rowIndex, columnIndex) => normalizeLegacyText(rows[rowIndex]?.[columnIndex] || "");
    const cellNumber = (rowIndex, columnIndex) => coerceLegacyNumber(cellText(rowIndex, columnIndex));

    const balanceRows = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
      .map((rowIndex) => buildCashManagementMetric(rows, rowIndex, 1, 3, 0))
      .filter(Boolean);

    const typeRows = [5, 6, 7, 8, 9, 10, 11]
      .map((rowIndex) => buildCashManagementMetric(rows, rowIndex, 5, 6))
      .filter(Boolean);

    const futureRows = Array.from({ length: 10 }, (_, index) => {
      const rowIndex = 5 + index;
      return {
        rowIndex: rowIndex + 1,
        label: cellText(rowIndex, 8),
        rawValue: cellText(rowIndex, 9),
        value: cellNumber(rowIndex, 9),
        date: cellText(rowIndex, 10)
      };
    });

    const closingLeftRows = [18, 19, 20, 21, 22]
      .map((rowIndex) => buildCashManagementMetric(rows, rowIndex, 1, 3))
      .filter(Boolean);

    const closingRightRows = [9, 17, 18, 19, 20]
      .map((rowIndex) => buildCashManagementMetric(rows, rowIndex, 14, 16))
      .filter(Boolean);

    const notes = [5, 6, 7, 8, 23, 24, 25]
      .map((rowIndex) => cellText(rowIndex, 14) || cellText(rowIndex, 1))
      .filter(Boolean);

    return {
      workbookName: workbookPath ? basename(workbookPath) : "",
      workbookPath,
      sheetName: sheet.name,
      statusLabel: cellText(3, 0),
      topSummary: {
        openingLabel: cellText(1, 1),
        openingValueText: cellText(1, 3),
        openingValue: cellNumber(1, 3),
        openingDate: cellText(1, 4),
        differenceLabel: cellText(1, 5),
        differenceValueText: cellText(1, 6),
        differenceValue: cellNumber(1, 6),
        totalLabel: cellText(1, 8),
        previousLabel: cellText(1, 9),
        previousValueText: cellText(1, 10),
        previousValue: cellNumber(1, 10),
        currentLabel: cellText(1, 11),
        currentValueText: cellText(1, 12),
        currentValue: cellNumber(1, 12),
        variationValueText: cellText(1, 13),
        variationValue: cellNumber(1, 13)
      },
      currentBalance: {
        label: cellText(3, 1),
        rawValue: cellText(3, 3),
        value: cellNumber(3, 3)
      },
      balanceRows,
      typeSummary: {
        title: cellText(3, 5),
        rows: typeRows
      },
      futureValues: {
        title: cellText(3, 8),
        valueLabel: cellText(3, 9),
        dateLabel: cellText(3, 10),
        rows: futureRows,
        mainTotalText: cellText(15, 9),
        mainTotal: cellNumber(15, 9),
        auxTotalLabels: [cellText(3, 12), cellText(3, 13)].filter(Boolean),
        auxTotalTexts: [cellText(15, 12), cellText(15, 13)].filter(Boolean),
        auxTotals: [cellNumber(15, 12), cellNumber(15, 13)].filter((value) => value !== null)
      },
      closingLeftRows,
      closingRightRows,
      notes
    };
  }

  function getCashManagementSheetSnapshot(workbookPath = "") {
    const resolvedWorkbookPath = workbookPath || getCashManagementWorkbookPath();
    if (!resolvedWorkbookPath) {
      return null;
    }

    try {
      const workbook = parseOdsFile(resolvedWorkbookPath);
      const sheet = workbook.sheets.find((item) => legacySlug(item.name) === "gerencia de caixa");
      return buildCashManagementSheetSnapshot(sheet, resolvedWorkbookPath);
    } catch {
      return null;
    }
  }

  function getStoreCashAccountNetAmount(accountId) {
    if (!accountId) {
      return 0;
    }
    const totals = get(
      `
        SELECT
          COALESCE(SUM(CASE WHEN entry_type = 'RECEITA' THEN amount ELSE 0 END), 0) AS total_revenue,
          COALESCE(SUM(CASE WHEN entry_type = 'DESPESA' THEN amount ELSE 0 END), 0) AS total_expense
        FROM store_cash_movements
        WHERE cash_account_id = :accountId
      `,
      { accountId: Number(accountId) }
    ) || { total_revenue: 0, total_expense: 0 };
    return Number(totals.total_revenue || 0) - Number(totals.total_expense || 0);
  }

  function sortFinanceSheetAccounts(accounts = []) {
    return [...accounts].sort((left, right) => {
      const leftOrder = FINANCE_SHEET_ACCOUNT_ORDER.get(left.code) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = FINANCE_SHEET_ACCOUNT_ORDER.get(right.code) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return String(left.name || "").localeCompare(String(right.name || ""));
    });
  }

  function applyCashManagementSheetSnapshot(storeId, snapshot, importRunId = null) {
    if (!snapshot) {
      return [];
    }

    const timestamp = nowIso();
    const accountsByCode = new Map(
      listStoreCashAccounts(storeId).map((account) => [account.code, account])
    );
    const applied = [];

    for (const metric of snapshot.balanceRows || []) {
      const code = resolveCashManagementAccountCode(metric);
      if (!code) {
        continue;
      }

      const account = accountsByCode.get(code);
      if (!account) {
        continue;
      }
      const accountDefinition = FINANCE_SHEET_ACCOUNT_SEEDS.find((item) => item.code === code) || account;

      const targetBalance = Number(metric.value || 0);
      const netMovementAmount = getStoreCashAccountNetAmount(account.id);
      const baselineAmount = targetBalance - netMovementAmount;

      run(
        `
          UPDATE store_cash_accounts
          SET name = :name,
              baseline_amount = :baselineAmount,
              snapshot_source_workbook = :sourceWorkbook,
              snapshot_source_sheet = :sourceSheet,
              snapshot_source_row = :sourceRow,
              snapshot_raw_payload = :snapshotRawPayload,
              snapshot_updated_at = :snapshotUpdatedAt,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          id: account.id,
          name: accountDefinition.name,
          baselineAmount,
          sourceWorkbook: snapshot.workbookName,
          sourceSheet: snapshot.sheetName,
          sourceRow: metric.rowIndex,
          snapshotRawPayload: serializeStructuredPayload(metric, "{}"),
          snapshotUpdatedAt: timestamp,
          updatedAt: timestamp
        }
      );
      recalculateStoreCashAccountBalance(account.id);

      const updatedAccount = get("SELECT * FROM store_cash_accounts WHERE id = :id", { id: account.id });
      applied.push({
        metric,
        account: updatedAccount
      });

      if (importRunId) {
        recordLegacyImportRow(importRunId, {
          sourceWorkbook: snapshot.workbookName,
          sourceSheet: snapshot.sheetName,
          sourceRow: metric.rowIndex,
          entityType: "STORE_CASH_ACCOUNT_SNAPSHOT",
          entityId: account.id,
          structuredPayload: updatedAccount,
          rawPayload: metric
        });
      }
    }

    return applied;
  }

  function getFinanceWorkbookView(filters = {}) {
    const store = requireStoreContext(filters);
    const rawCashManagement = getCashManagementSheetSnapshot();
    const workbookName = rawCashManagement?.workbookName || "caixa.ods";
    const importSummary = getLegacyImportSummary({ sourceWorkbook: workbookName });
    const hasWorkbookImport = importSummary.length > 0;
    const isWorkbookOrManualEntry = (entry) => {
      const sourceWorkbook = normalizeText(entry.source_workbook);
      return !hasWorkbookImport || !sourceWorkbook || sourceWorkbook === workbookName;
    };
    const ledger = listStoreCashMovements({ ...filters, storeId: store.id }).filter(isWorkbookOrManualEntry);
    const unifiedFinanceFlow = ledger
      .filter((entry) => normalizeCashFlowSection(entry) !== "FLUXO_CAIXA")
      .map(mapStoreCashMovementToFinanceEntry);
    const hasOperationalFinanceData = unifiedFinanceFlow.length > 0;
    const cashManagement = hasWorkbookImport || hasOperationalFinanceData ? rawCashManagement : null;
    const accounts = hasWorkbookImport
      ? sortFinanceSheetAccounts(
        listStoreCashAccounts(store.id).filter((account) => Number(account.active || 0) === 1 && FINANCE_SHEET_ACCOUNT_ORDER.has(account.code))
      )
      : listStoreCashAccounts(store.id).filter((account) => Number(account.active || 0) === 1);

    return {
      store,
      accounts,
      cashManagement,
      ledger,
      entriesAndExpenses: unifiedFinanceFlow.filter((entry) => normalizeCashFlowSection(entry) !== "COMPRAS" && normalizeText(entry.entry_type) !== INTERNAL_TRANSFER_ENTRY_TYPE),
      purchases: unifiedFinanceFlow.filter((entry) => normalizeCashFlowSection(entry) === "COMPRAS"),
      purchaseRequests: listPurchaseRequests(filters),
      lowStockItems: listLowStockPurchaseItems(filters),
      importSummary
    };
  }

  function listFinanceReportEntries(filters = {}) {
    const accountsById = new Map(
      listStoreCashAccounts(filters.storeId ? Number(filters.storeId) : undefined).map((account) => [Number(account.id), account])
    );
    const replenishmentsByFinanceEntryId = new Map();
    all(
      `
        SELECT id, finance_entry_id, extra_finance_entry_id
        FROM stock_replenishments
        WHERE finance_entry_id IS NOT NULL OR extra_finance_entry_id IS NOT NULL
      `
    ).forEach((row) => {
      if (row.finance_entry_id) {
        replenishmentsByFinanceEntryId.set(Number(row.finance_entry_id), Number(row.id));
      }
      if (row.extra_finance_entry_id) {
        replenishmentsByFinanceEntryId.set(Number(row.extra_finance_entry_id), Number(row.id));
      }
    });

    return repo.listFinanceEntries(filters).map((entry) => {
      const cashAccount = entry.cash_account_id ? accountsById.get(Number(entry.cash_account_id)) : null;
      return {
        ...entry,
        cash_account_name: normalizeText(cashAccount?.name),
        cash_account_code: normalizeText(cashAccount?.code),
        replenishment_id: replenishmentsByFinanceEntryId.get(Number(entry.id)) || null,
        finance_entry_id: Number(entry.id || 0) || null
      };
    });
  }

  function listReplenishmentReportEntries(filters = {}) {
    function buildReplenishmentReportDescription(row) {
      const itemName = normalizeText(row.catalog_item_name, "Reposição de estoque") || "Reposição de estoque";
      const notes = normalizeText(row.notes);
      const quantity = Number(row.quantity || 0);
      const quantityLabel = quantity > 0 ? ` (Qtd: ${quantity})` : "";
      if (notes) {
        return `${notes}: ${itemName}${quantityLabel}`;
      }
      return `Reposição de estoque: ${itemName}${quantityLabel}`;
    }

    const rows = all(
      `
        SELECT
          sr.*,
          ci.name AS catalog_item_name,
          ci.sku AS catalog_item_sku
        FROM stock_replenishments sr
        JOIN catalog_items ci ON ci.id = sr.catalog_item_id
        ORDER BY sr.created_at DESC, sr.id DESC
      `
    );

    return rows
      .filter((row) => {
        if (filters.fromDate || filters.toDate) {
          if (!isBetweenDates(String(row.created_at || "").slice(0, 10), filters.fromDate, filters.toDate)) {
            return false;
          }
        }
        if (!matchesSearch(
          `${row.catalog_item_name || ""} ${row.catalog_item_sku || ""} ${row.notes || ""} ${row.source_sheet || ""}`,
          filters.search
        )) {
          return false;
        }
        return true;
      })
      .map((row) => ({
        id: -Number(row.id),
        entry_type: "DESPESA",
        category: "Reposição de estoque",
        description: buildReplenishmentReportDescription(row),
        amount: roundCurrency(Number(row.quantity || 0) * Number(row.new_cost_amount || 0)),
        entry_date: String(row.created_at || "").slice(0, 10),
        payment_method: "NAO_DEFINIDO",
        order_id: null,
        order_code: "",
        store_id: filters.storeId ? Number(filters.storeId) : null,
        cash_account_id: null,
        cash_account_name: "",
        cash_account_code: "",
        replenishment_id: Number(row.id || 0) || null,
        finance_entry_id: null,
        source_workbook: normalizeText(row.source_workbook),
        source_sheet: normalizeText(row.source_sheet),
        source_row: row.source_row !== undefined && row.source_row !== null ? Number(row.source_row) : null,
        legacy_section: "COMPRAS",
        raw_payload: row.raw_payload || ""
      }));
  }

  function listPosSales(filters = {}) {
    const rows = all(`
      SELECT
        ps.*,
        cs.operator_name,
        st.name AS store_name,
        st.short_name AS store_short_name
      FROM pos_sales ps
      JOIN cash_sessions cs ON cs.id = ps.cash_session_id
      LEFT JOIN stores st ON st.id = ps.store_id
      ORDER BY ps.created_at DESC, ps.id DESC
    `);

    return rows.filter((row) => {
      if (!matchesSearch(`${row.code} ${row.client_name} ${row.operator_name} ${row.store_name || ""}`, filters.search)) {
        return false;
      }
      if (filters.userId && Number(filters.userId) !== Number(row.user_id)) {
        return false;
      }
      if (filters.storeId && Number(filters.storeId) !== Number(row.store_id)) {
        return false;
      }
      return isBetweenDates(String(row.created_at || "").slice(0, 10), filters.fromDate, filters.toDate);
    });
  }

  function getPosSale(saleId) {
    const sale = get(
      `
        SELECT
          ps.*,
          cs.operator_name,
          st.name AS store_name,
          st.short_name AS store_short_name,
          c.phone AS client_phone,
          c.email AS client_email
        FROM pos_sales ps
        JOIN cash_sessions cs ON cs.id = ps.cash_session_id
        LEFT JOIN stores st ON st.id = ps.store_id
        LEFT JOIN clients c ON c.id = ps.client_id
        WHERE ps.id = :id
      `,
      { id: saleId }
    );
    if (!sale) {
      return null;
    }

    const items = all("SELECT * FROM pos_sale_items WHERE sale_id = :saleId ORDER BY id ASC", { saleId });
    const payments = all("SELECT * FROM pos_payments WHERE sale_id = :saleId ORDER BY id ASC", { saleId });
    return {
      ...sale,
      items,
      payments
    };
  }

  function findPosSaleByFinanceEntry(financeEntry) {
    if (!financeEntry) {
      return null;
    }

    const description = normalizeText(financeEntry.description);
    const codeMatch = description.match(/^Venda\s+(PDV-\d{8}-\d{4})$/i);
    if (!codeMatch) {
      return null;
    }

    return get(
      `
        SELECT id
        FROM pos_sales
        WHERE code = :code
      `,
      { code: codeMatch[1] }
    );
  }

  function refreshCashSessionExpectedAmount(sessionId) {
    if (!sessionId) {
      return;
    }
    const session = getCashSessionRecord(sessionId);
    if (!session) {
      return;
    }

    run(
      `
        UPDATE cash_sessions
        SET expected_amount = :expectedAmount,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: Number(sessionId),
        expectedAmount: sumOfficialStoreCashBalances(session.store_id),
        updatedAt: nowIso()
      }
    );
  }

  function createPosSale(payload = {}) {
    const actor = payload._actor || payload.actor;
    const normalizedActor = normalizeActor(actor);
    if (!normalizedActor.actorUserId) {
      throw new Error("Venda PDV exige um usuario autenticado.");
    }

    const store = requireStoreContext(payload);
    const session = payload.cashSessionId
      ? get("SELECT * FROM cash_sessions WHERE id = :id AND status = 'OPEN' AND store_id = :storeId", { id: Number(payload.cashSessionId), storeId: store.id })
      : get("SELECT * FROM cash_sessions WHERE store_id = :storeId AND status = 'OPEN'", { storeId: store.id });

    if (!session) {
      throw new Error("Abra um caixa antes de registrar vendas no PDV.");
    }

    const clientId = Number(payload.clientId || 0);
    const client = clientId
      ? get("SELECT id, name, phone, email FROM clients WHERE id = :id", { id: clientId })
      : null;
    if (clientId && !client) {
      throw new Error("Cliente do PDV nao encontrado.");
    }
    const clientName = client
      ? client.name
      : (normalizeText(payload.clientName || payload.client_name, "Cliente sem cadastro") || "Cliente sem cadastro");

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      throw new Error("Informe pelo menos um item no carrinho do PDV.");
    }

    return transaction(() => {
      const { year, month, day } = getLocalDateParts();
      const countToday = get(
        "SELECT COUNT(*) AS total FROM pos_sales WHERE substr(created_at, 1, 10) = :today",
        { today: getLocalDateString() }
      ).total;
      const code = `PDV-${year}${month}${day}-${String(Number(countToday) + 1).padStart(4, "0")}`;
      const timestamp = nowIso();
      const preparedItems = items.map((item) => {
        const itemType = String(item.itemType || item.item_type || "PRODUCT").toUpperCase();
        const quantity = Math.max(1, toInteger(item.quantity, 1));

        if (itemType === "SERVICE") {
          const serviceId = Number(item.serviceCatalogId || item.service_catalog_id || item.serviceId || 0);
          const customServiceName = normalizeText(item.customServiceName || item.custom_service_name);
          if (serviceId > 0) {
            const service = get("SELECT * FROM service_catalog WHERE id = :id", { id: serviceId });
            if (!service) {
              throw new Error("Servico do PDV nao encontrado.");
            }
            if (!Number(service.available_in_pdv || 0)) {
              throw new Error(`O servico ${service.name} nao esta liberado para o PDV.`);
            }
            const customPriceAllowed = Number(service.allow_custom_price || 0) === 1;
            const requestedCustomPrice = customPriceAllowed ? toNumber(item.unitPrice ?? item.unit_price) : null;
            const normalizedCustomPrice = requestedCustomPrice !== null ? Math.max(0, requestedCustomPrice) : null;
            const basePrice = normalizedCustomPrice !== null ? normalizedCustomPrice : Number(service.price_amount || 0);
            const pricingMode = normalizedCustomPrice !== null ? 'FIXED' : (normalizeText(service.pricing_mode, 'FIXED') || 'FIXED');
            const additionalPrice = normalizedCustomPrice !== null ? 0 : Number(service.additional_price_amount || 0);
            return {
              itemType,
              catalogItem: null,
              service,
              quantity,
              unitCost: 0,
              unitPrice: basePrice,
              lineTotal: calculateProgressiveLineTotal(pricingMode, basePrice, additionalPrice, quantity),
              itemName: service.name,
              sku: ""
            };
          }
          if (!customServiceName) {
            throw new Error("Servico do PDV nao encontrado.");
          }
          const unitPrice = Math.max(0, toNumber(item.unitPrice ?? item.unit_price) ?? 0);
          return {
            itemType,
            catalogItem: null,
            service: null,
            quantity,
            unitCost: 0,
            unitPrice,
            lineTotal: unitPrice * quantity,
            itemName: customServiceName,
            sku: ""
          };
        }

        const catalogItem = get("SELECT * FROM catalog_items WHERE id = :id", { id: Number(item.catalogItemId) });
        if (!catalogItem) {
          throw new Error("Item do PDV nao encontrado no catalogo.");
        }
        if (Number(catalogItem.stock_quantity || 0) < quantity) {
          throw new Error(`Estoque insuficiente para ${catalogItem.name}.`);
        }
        const unitPrice = Number(catalogItem.price_amount || 0);
        return {
          itemType,
          catalogItem,
          service: null,
          quantity,
          unitCost: Number(catalogItem.cost_amount || 0),
          unitPrice,
          lineTotal: unitPrice * quantity,
          itemName: catalogItem.name,
          sku: catalogItem.sku || ""
        };
      });

      const subtotalAmount = preparedItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const discountMode = normalizeText(payload.discountMode, "AMOUNT") || "AMOUNT";
      const discountValue = Math.max(0, toNumber(payload.discountValue ?? payload.discountAmount) ?? 0);
      const discountAmount = discountMode === "PERCENT"
        ? Math.min(subtotalAmount, subtotalAmount * (discountValue / 100))
        : Math.min(subtotalAmount, discountValue);
      const totalAmount = Math.max(0, subtotalAmount - discountAmount);

      const result = run(
        `
          INSERT INTO pos_sales (
            code, cash_session_id, store_id, user_id, client_id, client_name, subtotal_amount,
            discount_amount, discount_mode, discount_value, total_amount, notes, created_at, updated_at
          )
          VALUES (
            :code, :cashSessionId, :storeId, :userId, :clientId, :clientName, :subtotalAmount,
            :discountAmount, :discountMode, :discountValue, :totalAmount, :notes, :createdAt, :updatedAt
          )
        `,
        {
          code,
          cashSessionId: session.id,
          storeId: store.id,
          userId: normalizedActor.actorUserId,
          clientId: client?.id || null,
          clientName,
          subtotalAmount,
          discountAmount,
          discountMode,
          discountValue,
          totalAmount,
          notes: normalizeText(payload.notes),
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );

      const saleId = Number(result.lastInsertRowid);
      for (const item of preparedItems) {
        const insertResult = run(
          `
            INSERT INTO pos_sale_items (
              sale_id, catalog_item_id, service_catalog_id, item_type, item_name, sku, quantity, unit_cost, unit_price, line_total, created_at
            )
            VALUES (
              :saleId, :catalogItemId, :serviceCatalogId, :itemType, :itemName, :sku, :quantity, :unitCost, :unitPrice, :lineTotal, :createdAt
            )
          `,
          {
            saleId,
            catalogItemId: item.catalogItem?.id || null,
            serviceCatalogId: item.service?.id || null,
            itemType: item.itemType,
            itemName: item.itemName,
            sku: item.sku,
            quantity: item.quantity,
            unitCost: item.unitCost,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
            createdAt: timestamp
          }
        );
        if (item.catalogItem) {
          const saleItemId = Number(insertResult.lastInsertRowid || 0);
          const consumption = repo.consumeCatalogStock(Number(item.catalogItem.id), Number(item.quantity || 0), {
            sourceType: "POS_SALE_ITEM",
            sourceId: saleItemId
          });
          run("UPDATE pos_sale_items SET unit_cost = :unitCost WHERE id = :id", {
            id: saleItemId,
            unitCost: Number(consumption.unitCost || 0)
          });
        }
      }

      const payments = Array.isArray(payload.payments) && payload.payments.length
        ? payload.payments
        : [{ paymentMethod: normalizeText(payload.paymentMethod, "CAIXINHA_LOJA") || "CAIXINHA_LOJA", amount: totalAmount }];
      const saleFinanceCategory = resolvePosSaleFinanceCategory(preparedItems);

      for (const payment of payments) {
        const normalizedPaymentMethod = normalizeText(payment.paymentMethod, "CAIXINHA_LOJA") || "CAIXINHA_LOJA";
        const paymentAmount = toNumber(payment.amount) ?? 0;
        run(
          `
            INSERT INTO pos_payments (sale_id, payment_method, amount, created_at)
            VALUES (:saleId, :paymentMethod, :amount, :createdAt)
          `,
          {
            saleId,
            paymentMethod: normalizedPaymentMethod,
            amount: paymentAmount,
            createdAt: timestamp
          }
        );

        saveStoreCashMovement({
          storeId: store.id,
          cashSessionId: session.id,
          saleId,
          movementType: "PDV_PAYMENT",
          entryType: "RECEITA",
          description: `Pagamento da venda ${code}`,
          amount: paymentAmount,
          movementDate: getLocalDateString(),
          paymentMethod: normalizedPaymentMethod,
          rawPayload: {
            paymentMethod: normalizedPaymentMethod,
            category: saleFinanceCategory
          },
          _actor: actor
        });
      }

      saveFinanceEntry({
        entryType: "RECEITA",
        category: saleFinanceCategory,
        description: `Venda ${code}`,
        amount: totalAmount,
        entryDate: getLocalDateString(),
        paymentMethod: normalizeText(payments[0]?.paymentMethod, "CAIXINHA_LOJA") || "CAIXINHA_LOJA",
        orderId: null,
        storeId: store.id,
        cashAccountId: resolveCashAccountId(store.id, payments[0]?.cashAccountId, payments[0]?.paymentMethod),
        rawPayload: {
          source: "POS_SALE",
          saleId,
          saleCode: code,
          category: saleFinanceCategory
        },
        registerStoreCashMovement: false,
        _actor: actor
      });

      syncLowStockNotifications();
      const sale = getPosSale(saleId);
      writeAuditLog(actor, "POS_SALE", saleId, "CREATE", null, sale, { code });
      return sale;
    });
  }

  function deletePosSale(saleId, context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = getPosSale(saleId);
    if (!beforeState) {
      throw new Error("Venda do PDV nao encontrada.");
    }

    return transaction(() => {
      for (const item of beforeState.items || []) {
        if (!Number(item.catalog_item_id || 0)) {
          continue;
        }
        const restored = repo.restoreCatalogStockForSource("POS_SALE_ITEM", Number(item.id));
        if (!restored.length) {
          adjustCatalogStock(
            Number(item.catalog_item_id),
            Number(item.quantity || 0),
            Number(item.unit_cost || 0),
            actor,
            "PDV_DELETE"
          );
        }
      }

      const affectedCashAccounts = all(
        "SELECT cash_account_id FROM store_cash_movements WHERE sale_id = :saleId",
        { saleId: Number(saleId) }
      ).map((entry) => Number(entry.cash_account_id || 0)).filter(Boolean);

      run("DELETE FROM store_cash_movements WHERE sale_id = :saleId", { saleId: Number(saleId) });
      [...new Set(affectedCashAccounts)].forEach(recalculateStoreCashAccountBalance);

      const relatedFinanceEntries = all(
        `
          SELECT id
          FROM finance_entries
          WHERE entry_type = 'RECEITA'
            AND description = :description
        `,
        { description: `Venda ${beforeState.code}` }
      );
      for (const entry of relatedFinanceEntries) {
        deleteFinanceEntry(Number(entry.id), { actor });
      }

      run("DELETE FROM pos_sales WHERE id = :id", { id: Number(saleId) });
      refreshCashSessionExpectedAmount(beforeState.cash_session_id);
      syncLowStockNotifications();
      writeAuditLog(actor, "POS_SALE", Number(saleId), "DELETE", beforeState, null, { code: beforeState.code });
      return { success: true };
    });
  }
  function getCompanyBrandByEmail(email) {
    const normalizedEmail = normalizeText(email).toLowerCase();
    return COMPANY_BRANDS.find((item) => item.loginEmail.toLowerCase() === normalizedEmail) || null;
  }

  function getCompanyBrand(companyCode) {
    return COMPANY_BRANDS.find((item) => item.code === companyCode) || null;
  }

  function syncCompanyProfiles() {
    const timestamp = nowIso();
    for (const brand of COMPANY_BRANDS) {
      const profiles = Array.isArray(brand.profiles) ? brand.profiles : [];
      for (const profile of profiles) {
        const existing = get("SELECT id FROM users WHERE email = :email", { email: profile.email });
        if (existing) {
          run(
            `
              UPDATE users
              SET name = :name, role = :role, updated_at = :updatedAt
              WHERE email = :email
            `,
            {
              name: profile.name,
              role: profile.role,
              email: profile.email,
              updatedAt: timestamp
            }
          );
          continue;
        }

        run(
          `
            INSERT INTO users (name, email, password, role, created_at, updated_at)
            VALUES (:name, :email, :password, :role, :createdAt, :updatedAt)
          `,
          {
            name: profile.name,
            email: profile.email,
            password: profile.password || "perfil123",
            role: profile.role,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
      }
    }
  }

  function profileColorForIdentity(value) {
    const palette = ["#10233f", "#0d6efd", "#fd7e14", "#198754", "#6f42c1", "#d63384"];
    const textValue = String(value || "perfil").toLowerCase();
    const seed = [...textValue].reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);
    return palette[seed % palette.length];
  }

  function mapProfile(row) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      avatarInitial: String(row.name || "U").slice(0, 1).toUpperCase(),
      avatarColor: profileColorForIdentity(row.email || row.name)
    };
  }

  function buildCompanyPayload(companyCode) {
    const brand = getCompanyBrand(companyCode);
    return brand
      ? {
          code: brand.code,
          name: brand.name,
          shortName: brand.shortName,
          appTitle: brand.appTitle,
          siteUrl: brand.siteUrl,
          logoUrl: brand.logoUrl,
          faviconUrl: brand.faviconUrl,
          accent: brand.accent
        }
      : null;
  }

  function listCompanyProfiles(companyCode) {
    const brand = getCompanyBrand(companyCode);
    if (!brand) {
      return [];
    }

    const rows = all(`
      SELECT id, name, email, role
      FROM users
    `);
    const configuredEmails = (Array.isArray(brand.profiles) ? brand.profiles : []).map((profile) => String(profile.email || "").toLowerCase());
    rows.sort((left, right) => {
      const leftEmail = String(left.email || "").toLowerCase();
      const rightEmail = String(right.email || "").toLowerCase();
      const leftIndex = configuredEmails.indexOf(leftEmail);
      const rightIndex = configuredEmails.indexOf(rightEmail);
      const normalizedLeftIndex = leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER;
      const normalizedRightIndex = rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER;
      if (normalizedLeftIndex !== normalizedRightIndex) {
        return normalizedLeftIndex - normalizedRightIndex;
      }
      return String(left.name || "").localeCompare(String(right.name || ""), "pt-BR", { sensitivity: "base" });
    });
    return rows.map(mapProfile);
  }

  function getMeta() {
    const currentStore = getCurrentStore();
    const storeCashAccounts = currentStore?.id
      ? listStoreCashAccounts(currentStore.id).map((account) => ({
          id: Number(account.id),
          code: account.code,
          label: account.name,
          name: account.name
        }))
      : repo.getMeta().storeCashAccounts;

    return {
      ...repo.getMeta(),
      storeCashAccounts,
      taskStatuses: TASK_STATUSES,
      taskPriorities: TASK_PRIORITIES,
      taskContactChannels: TASK_CONTACT_CHANNELS
    };
  }

  function getCurrentStore(companyCode = "") {
    if (companyCode) {
      return buildStorePayload(companyCode);
    }
    const fallback = getDefaultStore();
    return fallback
      ? {
          id: fallback.id,
          companyCode: fallback.company_code,
          code: fallback.code,
          name: fallback.name,
          shortName: fallback.short_name || fallback.name
        }
      : null;
  }

  function authenticateCompany(email, password) {
    const brand = getCompanyBrandByEmail(email);
    if (!brand || brand.password !== password) {
      return null;
    }
    return {
      company: buildCompanyPayload(brand.code),
      store: buildStorePayload(brand.code),
      profiles: listCompanyProfiles(brand.code)
    };
  }

  function createCompanySession(companyCode) {
    const company = buildCompanyPayload(companyCode);
    if (!company) {
      throw new Error("Empresa nao encontrada para esta sessao.");
    }

    const token = randomUUID();
    const createdAt = nowIso();
    const expiresAt = nowIso(Date.now() + 30 * 24 * 60 * 60 * 1000);
    run(
      `
        INSERT INTO company_sessions (token, company_code, active_user_id, created_at, expires_at)
        VALUES (:token, :companyCode, NULL, :createdAt, :expiresAt)
      `,
      {
        token,
        companyCode,
        createdAt,
        expiresAt
      }
    );
    return token;
  }

  function getSessionContext(token) {
    if (!token) {
      return null;
    }

    const session = get("SELECT * FROM company_sessions WHERE token = :token", { token });
    if (!session) {
      return null;
    }

    if (isExpiredTimestamp(session.expires_at)) {
      run("DELETE FROM company_sessions WHERE token = :token", { token });
      return null;
    }

    const company = buildCompanyPayload(session.company_code);
    const store = buildStorePayload(session.company_code);
    const profiles = listCompanyProfiles(session.company_code);
    const user = session.active_user_id ? profiles.find((item) => item.id === Number(session.active_user_id)) || null : null;

    return {
      company,
      store,
      profiles,
      user
    };
  }

  function selectProfile(token, profileId) {
    const context = getSessionContext(token);
    if (!context?.company) {
      throw new Error("Sessao da empresa nao encontrada.");
    }

    const user = context.profiles.find((item) => item.id === Number(profileId));
    if (!user) {
      throw new Error("Perfil nao encontrado para esta empresa.");
    }

    run(
      `
        UPDATE company_sessions
        SET active_user_id = :profileId
        WHERE token = :token
      `,
      {
        profileId: user.id,
        token
      }
    );

    writeAuditLog(user, "SESSION_PROFILE", user.id, "SELECT_PROFILE", null, user, { companyCode: context.company.code });
    return getSessionContext(token);
  }

  function destroyCompanySession(token) {
    const context = getSessionContext(token);
    run("DELETE FROM company_sessions WHERE token = :token", { token });
    if (context?.user) {
      writeAuditLog(context.user, "SESSION_PROFILE", context.user.id, "LOGOUT_COMPANY", context.user, null, { companyCode: context.company?.code || "" });
    }
    return { ok: true };
  }
  function createSession(userId) {
    const token = baseCreateSession(userId);
    const actor = get("SELECT id, name, role, email FROM users WHERE id = :id", { id: userId });
    writeAuditLog(actor, "SESSION", userId, "LOGIN", null, actor, { token });
    return token;
  }

  function destroySession(token) {
    const actor = get(
      `
        SELECT u.id, u.name, u.role, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = :token
      `,
      { token }
    );
    baseDestroySession(token);
    if (actor) {
      writeAuditLog(actor, "SESSION", actor.id, "LOGOUT", actor, null, { token });
    }
    return { ok: true };
  }

  function saveClient(payload = {}) {
    const actor = payload._actor;
    const beforeState = payload.id ? repo.getClient(Number(payload.id)) : null;
    const client = baseSaveClient(payload);
    writeAuditLog(actor, "CLIENT", client.id, beforeState ? "UPDATE" : "CREATE", beforeState, client, { name: client.name });
    return client;
  }

  function deleteClient(clientId, context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = repo.getClient(clientId);
    const result = baseDeleteClient(clientId);
    writeAuditLog(actor, "CLIENT", clientId, "DELETE", beforeState, result, { deletedOrders: result.deletedOrders });
    syncLowStockNotifications();
    return result;
  }

  function saveCatalogItem(payload = {}) {
    const actor = payload._actor;
    const store = requireStoreContext(payload);
    const beforeState = payload.id ? repo.getCatalogItem(Number(payload.id)) : null;
    const item = baseSaveCatalogItem({ ...payload, storeId: store.id, registerFinanceEntry: false });

    if (!beforeState) {
      const shouldGenerateFinanceEntry = payload.generateFinanceEntry !== false && payload.generate_finance_entry !== false;
      const initialStockQuantity = Number(payload.stockQuantity ?? payload.stock_quantity ?? 0);
      const initialCostAmount = toNumber(payload.costAmount ?? payload.cost_amount) ?? 0;
      const initialCost = initialStockQuantity * initialCostAmount;
      if (shouldGenerateFinanceEntry && initialCost > 0) {
        const financeEntry = saveFinanceEntry({
          entryType: "DESPESA",
          category: "Compra de produto",
          description: `Estoque inicial: ${item.name} (Qtd: ${initialStockQuantity})`,
          amount: initialCost,
          entryDate: getLocalDateString(),
          storeId: store.id,
          cashAccountId: payload.cashAccountId ?? payload.cash_account_id ?? null,
          legacySection: "COMPRAS",
          rawPayload: {
            source: "CATALOG_INITIAL_STOCK",
            catalogItemId: item.id,
            catalogItemName: item.name,
            stockQuantity: initialStockQuantity,
            unitCost: initialCostAmount
          },
          _actor: actor
        });
        const latestReplenishment = repo.getCatalogItem(item.id)?.replenishment_history?.[0];
        if (latestReplenishment?.id) {
          run(
            "UPDATE stock_replenishments SET finance_entry_id = :financeEntryId WHERE id = :id",
            { id: Number(latestReplenishment.id), financeEntryId: Number(financeEntry.id) }
          );
        }
      }
    }

    writeAuditLog(actor, "CATALOG_ITEM", item.id, beforeState ? "UPDATE" : "CREATE", beforeState, item, { sku: item.sku });
    syncLowStockNotifications();
    return repo.getCatalogItem(item.id) || item;
  }

  function saveCatalogBatch(items = [], context = {}) {
    const actor = context.actor || context._actor;
    const store = requireStoreContext(context);
    const payloads = Array.isArray(items) ? items : [];
    const createdItems = transaction(() => payloads.map((itemPayload) => saveCatalogItem({ ...itemPayload, _actor: actor, _store: store })));
    syncLowStockNotifications();
    return createdItems;
  }

  function replenishCatalogItem(itemId, payload = {}) {
    const actor = payload._actor || payload.actor;
    const store = requireStoreContext(payload);
    const beforeState = repo.getCatalogItem(Number(itemId));
    const item = baseReplenishCatalogItem(itemId, { ...payload, _actor: actor, storeId: store.id, registerFinanceEntry: false });
    const quantity = Number(payload.quantity || 0);
    const costAmount = toNumber(payload.costAmount ?? payload.newCostAmount) ?? Number(beforeState?.cost_amount || 0);
    const totalCost = quantity * costAmount;

    let financeEntry = null;
    if (totalCost > 0) {
      financeEntry = saveFinanceEntry({
        entryType: "DESPESA",
        category: "Compra de produto",
        description: `Reposição de estoque: ${item.name} (Qtd: ${quantity})`,
        amount: totalCost,
        entryDate: getLocalDateString(),
        storeId: store.id,
        cashAccountId: payload.cashAccountId ?? payload.cash_account_id ?? null,
        legacySection: "COMPRAS",
        rawPayload: {
          source: "CATALOG_REPLENISHMENT",
          catalogItemId: item.id,
          catalogItemName: item.name,
          quantity,
          unitCost: costAmount
        },
        _actor: actor
      });
    }

    let extraFinanceEntry = null;
    if (payload.additionalCost && Number(payload.additionalCost) !== 0) {
      const additionalCost = Number(payload.additionalCost);
      extraFinanceEntry = saveFinanceEntry({
        entryType: additionalCost > 0 ? "DESPESA" : "RECEITA",
        category: additionalCost > 0 ? "Compra de produto" : "Outras receitas",
        description: `Custo adicional na reposição de: ${item.name} (Qtd: ${quantity})`,
        amount: Math.abs(additionalCost),
        entryDate: getLocalDateString(),
        storeId: store.id,
        cashAccountId: payload.cashAccountId ?? payload.cash_account_id ?? null,
        legacySection: "COMPRAS",
        rawPayload: {
          source: "CATALOG_REPLENISHMENT_ADDITIONAL_COST",
          catalogItemId: item.id,
          catalogItemName: item.name,
          quantity,
          additionalCost
        },
        _actor: actor
      });
    }

    const latestReplenishment = item?.replenishment_history?.[0] || repo.getCatalogItem(item.id)?.replenishment_history?.[0];
    if (latestReplenishment?.id) {
      run(
        "UPDATE stock_replenishments SET finance_entry_id = :financeEntryId, extra_finance_entry_id = :extraFinanceEntryId WHERE id = :id",
        {
          id: Number(latestReplenishment.id),
          financeEntryId: financeEntry?.id ? Number(financeEntry.id) : null,
          extraFinanceEntryId: extraFinanceEntry?.id ? Number(extraFinanceEntry.id) : null
        }
      );
    }

    writeAuditLog(actor, "STOCK_REPLENISHMENT", Number(itemId), "REPLENISH", beforeState, item, {
      quantity: Number(payload.quantity || 0),
      notes: normalizeText(payload.notes)
    });
    syncLowStockNotifications();
    return item;
  }


  function replenishCatalogBatch(items = [], context = {}) {
    const actor = context.actor || context._actor;
    const store = requireStoreContext(context);
    const beforeState = (Array.isArray(items) ? items : []).map((item) => repo.getCatalogItem(Number(item?.id))).filter(Boolean);
    const result = baseReplenishCatalogBatch(items, { _actor: actor, storeId: store.id, registerFinanceEntry: false });
    (Array.isArray(items) ? items : []).forEach((itemPayload, index) => {
      const replenishedItem = result[index];
      const latestReplenishment = replenishedItem?.replenishment_history?.[0] || repo.getCatalogItem(replenishedItem?.id)?.replenishment_history?.[0];
      const quantity = Number(itemPayload?.quantity || 0);
      const costAmount = toNumber(itemPayload?.costAmount ?? itemPayload?.newCostAmount) ?? Number(replenishedItem?.cost_amount || 0);
      const totalCost = quantity * costAmount;
      const cashAccountId = itemPayload?.cashAccountId ?? itemPayload?.cash_account_id ?? null;

      let financeEntry = null;
      if (replenishedItem && totalCost > 0) {
        financeEntry = saveFinanceEntry({
          entryType: "DESPESA",
          category: "Compra de produto",
          description: `Reposição de estoque: ${replenishedItem.name} (Qtd: ${quantity})`,
          amount: totalCost,
          entryDate: getLocalDateString(),
          storeId: store.id,
          cashAccountId,
          legacySection: "COMPRAS",
          rawPayload: {
            source: "CATALOG_REPLENISHMENT",
            catalogItemId: replenishedItem.id,
            catalogItemName: replenishedItem.name,
            quantity,
            unitCost: costAmount
          },
          _actor: actor
        });
      }

      let extraFinanceEntry = null;
      if (replenishedItem && itemPayload?.additionalCost && Number(itemPayload.additionalCost) !== 0) {
        const additionalCost = Number(itemPayload.additionalCost);
        extraFinanceEntry = saveFinanceEntry({
          entryType: additionalCost > 0 ? "DESPESA" : "RECEITA",
          category: additionalCost > 0 ? "Compra de produto" : "Outras receitas",
          description: `Custo adicional na reposição de: ${replenishedItem.name} (Qtd: ${quantity})`,
          amount: Math.abs(additionalCost),
          entryDate: getLocalDateString(),
          storeId: store.id,
          cashAccountId,
          legacySection: "COMPRAS",
          rawPayload: {
            source: "CATALOG_REPLENISHMENT_ADDITIONAL_COST",
            catalogItemId: replenishedItem.id,
            catalogItemName: replenishedItem.name,
            quantity,
            additionalCost
          },
          _actor: actor
        });
      }

      if (latestReplenishment?.id) {
        run(
          "UPDATE stock_replenishments SET finance_entry_id = :financeEntryId, extra_finance_entry_id = :extraFinanceEntryId WHERE id = :id",
          {
            id: Number(latestReplenishment.id),
            financeEntryId: financeEntry?.id ? Number(financeEntry.id) : null,
            extraFinanceEntryId: extraFinanceEntry?.id ? Number(extraFinanceEntry.id) : null
          }
        );
      }
    });
    writeAuditLog(actor, "STOCK_REPLENISHMENT", null, "REPLENISH_BATCH", beforeState, result, {
      items: Array.isArray(items) ? items.length : 0
    });
    syncLowStockNotifications();
    return result;
  }

  function revertCatalogReplenishment(replenishmentId, context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = get("SELECT * FROM stock_replenishments WHERE id = :id", { id: Number(replenishmentId) });
    if (!beforeState) {
      throw new Error("Reposicao de estoque nao encontrada.");
    }

    return transaction(() => {
      if (beforeState.finance_entry_id) {
        deleteFinanceEntry(Number(beforeState.finance_entry_id), { actor });
      }
      if (beforeState.extra_finance_entry_id) {
        deleteFinanceEntry(Number(beforeState.extra_finance_entry_id), { actor });
      }
      const result = baseRevertCatalogReplenishment(Number(replenishmentId));
      writeAuditLog(actor, "STOCK_REPLENISHMENT", Number(replenishmentId), "REVERT", beforeState, result, {
        catalogItemId: Number(beforeState.catalog_item_id || 0),
        quantity: Number(beforeState.quantity || 0)
      });
      syncLowStockNotifications();
      return result;
    });
  }

  function updateCatalogReplenishment(replenishmentId, payload = {}) {
    const actor = payload._actor || payload.actor;
    const beforeState = get("SELECT * FROM stock_replenishments WHERE id = :id", { id: Number(replenishmentId) });
    if (!beforeState) {
      throw new Error("Reposicao de estoque nao encontrada.");
    }
    const result = baseUpdateCatalogReplenishment(Number(replenishmentId), payload);
    writeAuditLog(actor, "STOCK_REPLENISHMENT", Number(replenishmentId), "UPDATE_LOT", beforeState, result, {
      catalogItemId: Number(beforeState.catalog_item_id || 0),
      quantity: Number(beforeState.quantity || 0)
    });
    syncLowStockNotifications();
    return result;
  }

  function updateCatalogStockBatch(batchId, payload = {}) {
    const actor = payload._actor || payload.actor;
    const beforeState = get("SELECT * FROM catalog_stock_batches WHERE id = :id", { id: Number(batchId) });
    if (!beforeState) {
      throw new Error("Lote de estoque nao encontrado.");
    }
    const result = baseUpdateCatalogStockBatch(Number(batchId), payload);
    writeAuditLog(actor, "CATALOG_STOCK_BATCH", Number(batchId), "UPDATE_LOT", beforeState, result, {
      catalogItemId: Number(beforeState.catalog_item_id || 0),
      sourceType: beforeState.source_type || "",
      sourceId: Number(beforeState.source_id || 0)
    });
    syncLowStockNotifications();
    return result;
  }

  function findStockReplenishmentByFinanceEntry(financeEntry) {
    if (!financeEntry?.id) {
      return null;
    }

    const directMatch = get(
      "SELECT * FROM stock_replenishments WHERE finance_entry_id = :entryId OR extra_finance_entry_id = :entryId ORDER BY id DESC LIMIT 1",
      { entryId: Number(financeEntry.id) }
    );
    if (directMatch?.id) {
      return directMatch;
    }

    const rawPayload = safeParseJson(financeEntry.raw_payload, {});
    const source = normalizeText(rawPayload.source || rawPayload.origin).toUpperCase();
    if (!source.startsWith("CATALOG_")) {
      return null;
    }

    const catalogItemId = Number(rawPayload.catalogItemId || rawPayload.catalog_item_id || 0) || 0;
    const quantity = Number(rawPayload.quantity || rawPayload.stockQuantity || rawPayload.stock_quantity || 0) || 0;
    if (!catalogItemId || !quantity) {
      return null;
    }

    const matchedByQuantity = get(
      `
        SELECT *
        FROM stock_replenishments
        WHERE catalog_item_id = :catalogItemId
          AND quantity = :quantity
          AND (
            finance_entry_id IS NULL
            OR extra_finance_entry_id IS NULL
            OR finance_entry_id = :entryId
            OR extra_finance_entry_id = :entryId
          )
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      {
        entryId: Number(financeEntry.id),
        catalogItemId,
        quantity
      }
    );
    if (matchedByQuantity?.id) {
      return matchedByQuantity;
    }

    return get(
      `
        SELECT *
        FROM stock_replenishments
        WHERE catalog_item_id = :catalogItemId
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      { catalogItemId }
    );
  }

  function isOrderCompletionFinanceEntry(entry) {
    if (!entry) {
      return false;
    }
    const rawPayload = safeParseJson(entry.raw_payload, {});
    const source = normalizeText(rawPayload.source || rawPayload.origin).toUpperCase();
    return ["ORDER_COMPLETION", "ORDER_COMPLETION_REQUESTED_PRODUCT_COST"].includes(source)
      || (Number(entry.order_id || 0) > 0 && String(entry.category || "") === "Recebimento de OS");
  }

  function resolveOrderStatusBeforeCompletion(orderId) {
    const logs = all(
      `
        SELECT before_state, after_state
        FROM audit_logs
        WHERE entity_type = 'ORDER'
          AND entity_id = :orderId
          AND action IN ('UPDATE', 'ORDER_TIMELINE_EVENT')
        ORDER BY id DESC
      `,
      { orderId: Number(orderId) }
    );

    for (const log of logs) {
      const beforeState = safeParseJson(log.before_state, {});
      const afterState = safeParseJson(log.after_state, {});
      const beforeStatus = normalizeText(beforeState.order_status || beforeState.orderStatus).toUpperCase();
      const afterStatus = normalizeText(afterState.order_status || afterState.orderStatus).toUpperCase();
      if (afterStatus === "CONCLUIDA" && beforeStatus && beforeStatus !== "CONCLUIDA" && beforeStatus !== "CANCELADA") {
        return beforeStatus;
      }
    }

    return "EM_ANDAMENTO";
  }

  function deleteOrderCompletionFinanceEntries(orderId, actor = null) {
    const entries = all(
      `
        SELECT *
        FROM finance_entries
        WHERE order_id = :orderId
        ORDER BY id ASC
      `,
      { orderId: Number(orderId) }
    ).filter(isOrderCompletionFinanceEntry);

    for (const entry of entries) {
      deleteFinanceEntry(Number(entry.id), { actor });
    }

    return entries;
  }

  function revertOrderCompletionFromFinanceEntry(financeEntry, actor = null) {
    const orderId = Number(financeEntry?.order_id || 0);
    if (!orderId || !isOrderCompletionFinanceEntry(financeEntry)) {
      return null;
    }

    const beforeState = repo.getOrder(orderId);
    if (!beforeState) {
      throw new Error("OS nao encontrada para reversao.");
    }

    const nextStatus = String(beforeState.order_status || "").toUpperCase() === "CONCLUIDA"
      ? resolveOrderStatusBeforeCompletion(orderId)
      : String(beforeState.order_status || "EM_ANDAMENTO").toUpperCase();
    const removedEntries = deleteOrderCompletionFinanceEntries(orderId, actor);

    run(
      `
        UPDATE orders
        SET order_status = :orderStatus,
            concluded_at = '',
            delivered_at = '',
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: orderId,
        orderStatus: nextStatus,
        updatedAt: nowIso()
      }
    );

    const afterState = repo.getOrder(orderId);
    writeAuditLog(actor, "ORDER", orderId, "REVERT_COMPLETION", beforeState, afterState, {
      code: beforeState.code,
      removedFinanceEntries: removedEntries.map((entry) => Number(entry.id))
    });
    return { success: true, order: afterState, removedFinanceEntries: removedEntries.length };
  }

  function revertFinancialTransaction(payload = {}, context = {}) {
    const actor = context.actor || context._actor || payload.actor || payload._actor;
    const financeEntryId = Number(payload.financeEntryId ?? payload.finance_entry_id ?? payload.id ?? 0) || 0;
    const replenishmentId = Number(payload.replenishmentId ?? payload.replenishment_id ?? 0) || 0;

    if (replenishmentId) {
      return revertCatalogReplenishment(replenishmentId, { actor });
    }
    if (!financeEntryId) {
      throw new Error("Transacao financeira nao encontrada para reversao.");
    }

    const financeEntry = get("SELECT * FROM finance_entries WHERE id = :id", { id: financeEntryId });
    if (!financeEntry) {
      throw new Error("Transacao financeira nao encontrada para reversao.");
    }

    const linkedReplenishment = findStockReplenishmentByFinanceEntry(financeEntry);
    if (linkedReplenishment?.id) {
      return revertCatalogReplenishment(Number(linkedReplenishment.id), { actor });
    }

    const rawPayload = safeParseJson(financeEntry.raw_payload, {});
    const source = normalizeText(rawPayload.source || rawPayload.origin).toUpperCase();
    const linkedPosSale = source === "POS_SALE" ? { id: Number(rawPayload.saleId || 0) } : findPosSaleByFinanceEntry(financeEntry);
    const revertedOrder = revertOrderCompletionFromFinanceEntry(financeEntry, actor);
    if (revertedOrder) {
      return revertedOrder;
    }
    if (source.startsWith("CATALOG_")) {
      throw new Error("Nao foi possivel localizar a reposicao de estoque vinculada. A reversao financeira isolada foi bloqueada para evitar divergencia no estoque.");
    }
    if (linkedPosSale?.id) {
      return deletePosSale(Number(linkedPosSale.id), { actor });
    }
    if (["ORDER_COMPLETION", "PDV_PAYMENT"].includes(source) || ["Recebimento de OS", "Venda de produto", "Venda de serviço", "Venda de servico", "Venda mista PDV"].includes(String(financeEntry.category || ""))) {
      throw new Error("Essa transacao nao pode ser revertida por esta tela. Reverta a origem operacional correspondente.");
    }

    deleteFinanceEntry(financeEntryId, { actor });
    return { success: true, financeEntryId };
  }
  function deleteCatalogItems(itemIds = [], context = {}) {
    const actor = context.actor || context._actor;
    const normalizedIds = Array.isArray(itemIds) ? itemIds : [itemIds];
    const beforeState = normalizedIds.map((itemId) => repo.getCatalogItem(Number(itemId))).filter(Boolean);
    const result = baseDeleteCatalogItems(itemIds);
    writeAuditLog(actor, "CATALOG_ITEM", null, "DELETE_BATCH", beforeState, result, { requested: normalizedIds.length });
    syncLowStockNotifications();
    return result;
  }

  function saveService(payload = {}) {
    const actor = payload._actor;
    const beforeState = payload.id ? repo.getService(Number(payload.id)) : null;
    const service = baseSaveService(payload);
    writeAuditLog(actor, "SERVICE", service.id, beforeState ? "UPDATE" : "CREATE", beforeState, service, { name: service.name });
    return service;
  }

  function deleteService(serviceId, context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = repo.getService(serviceId);
    const result = baseDeleteService(serviceId);
    writeAuditLog(actor, "SERVICE", serviceId, "DELETE", beforeState, result, { name: beforeState?.name || "" });
    return result;
  }

  function ensureOrderTask(order, storeId, actor) {
    if (!order?.id) {
      return null;
    }

    const existingTask = get("SELECT id FROM daily_tasks WHERE order_id = :orderId ORDER BY id DESC LIMIT 1", {
      orderId: Number(order.id)
    });
    if (existingTask?.id) {
      return getTask(Number(existingTask.id));
    }

    return saveTask({
      storeId,
      orderId: Number(order.id),
      title: `OS ${order.code} | ${normalizeText(order.client_name, "Sem cliente")}` ,
      description: normalizeText(order.defect, `Acompanhar OS ${order.code}`),
      taskDate: normalizeText(order.due_date, getLocalDateString()),
      status: "PENDENTE",
      priority: "MEDIA",
      responsibleName: normalizeText(order.technician_name),
      clientName: normalizeText(order.client_name),
      phone: normalizeText(order.phone_snapshot || order.client_phone),
      device: normalizeText(order.equipment),
      notes: normalizeText(order.notes),
      initialUpdate: `Tarefa criada automaticamente a partir da OS ${order.code}.`,
      rawPayload: {
        source: "ORDER_AUTO_TASK",
        orderId: Number(order.id),
        orderCode: order.code
      },
      _actor: actor,
      _store: { id: storeId }
    });
  }

  function saveOrder(payload = {}) {
    const actor = payload._actor;
    const store = requireStoreContext(payload);
    const beforeState = payload.id ? repo.getOrder(Number(payload.id)) : null;
    if (beforeState) {
      ensureOrderIsEditable(beforeState, "alterada");
    }
    const order = baseSaveOrder(payload);
    if (!beforeState) {
      ensureOrderTask(order, store.id, actor);
    }
    syncOrderRevenueEntry(order, store.id, actor);
    syncOrderRequestedProductCostEntries(order, store.id, actor);
    writeAuditLog(actor, "ORDER", order.id, beforeState ? "UPDATE" : "CREATE", beforeState, order, { code: order.code });
    recordOrderFlow(beforeState, order, actor);
    syncLowStockNotifications();
    return order;
  }

  function deleteOrder(orderId, context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = repo.getOrder(orderId);
    const result = baseDeleteOrder(orderId);
    writeAuditLog(actor, "ORDER", orderId, "DELETE", beforeState, result, { code: beforeState?.code || "" });
    syncLowStockNotifications();
    return result;
  }

  function addOrderAttachments(orderId, uploads = []) {
    const order = repo.getOrder(Number(orderId));
    if (!order) {
      throw new Error("OS nao encontrada.");
    }
    ensureOrderIsEditable(order, "alterada");
    return repo.addOrderAttachments(orderId, uploads);
  }

  function listFinanceCategories(entryType = "") {
    return repo.listFinanceCategories(entryType);
  }

  function listAdminUsers() {
    return all(`
      SELECT id, name, email, role, created_at, updated_at
      FROM users
      ORDER BY name COLLATE NOCASE ASC, email COLLATE NOCASE ASC
    `).map(mapProfile);
  }

  function saveAdminUser(payload = {}) {
    const actor = payload._actor;
    const beforeState = payload.id ? get("SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = :id", { id: Number(payload.id) }) : null;
    const user = transaction(() => saveAdminUserInner(payload));
    writeAuditLog(actor, "USER", user.id, beforeState ? "UPDATE" : "CREATE", beforeState, user, { email: user.email });
    return user;
  }

  function saveAdminUserInner(payload = {}) {
    const timestamp = nowIso();
    const normalized = {
      id: payload.id ? Number(payload.id) : null,
      name: normalizeText(payload.name),
      email: normalizeText(payload.email).toLowerCase(),
      password: normalizeText(payload.password),
      role: normalizeText(payload.role, "CONTA") || "CONTA"
    };

    if (!normalized.name || !normalized.email) {
      throw new Error("Nome e email do usuario sao obrigatorios.");
    }

    if (!normalized.id && !normalized.password) {
      throw new Error("A senha e obrigatoria para criar um usuario.");
    }

    const duplicate = get(
      "SELECT id FROM users WHERE lower(email) = lower(:email) AND (:id IS NULL OR id != :id)",
      { id: normalized.id, email: normalized.email }
    );
    if (duplicate?.id) {
      throw new Error("Ja existe um usuario com este email.");
    }

    if (normalized.id) {
      const current = get("SELECT * FROM users WHERE id = :id", { id: normalized.id });
      if (!current) {
        throw new Error("Usuario nao encontrado.");
      }

      run(
        `
          UPDATE users
          SET name = :name,
              email = :email,
              password = :password,
              role = :role,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          ...normalized,
          password: normalized.password || current.password,
          updatedAt: timestamp
        }
      );
      return mapProfile(get("SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = :id", { id: normalized.id }));
    }

    const result = run(
      `
        INSERT INTO users (name, email, password, role, created_at, updated_at)
        VALUES (:name, :email, :password, :role, :createdAt, :updatedAt)
      `,
      {
        ...normalized,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );
    return mapProfile(get("SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = :id", { id: Number(result.lastInsertRowid) }));
  }

  function deleteAdminUser(userId, context = {}) {
    const actor = context.actor || context._actor;
    const normalizedId = Number(userId || 0);
    const beforeState = get("SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = :id", { id: normalizedId });
    if (!beforeState) {
      throw new Error("Usuario nao encontrado.");
    }

    const totalUsers = Number(get("SELECT COUNT(*) AS total FROM users")?.total || 0);
    if (totalUsers <= 1) {
      throw new Error("Nao e permitido remover o ultimo usuario da loja.");
    }

    run("UPDATE company_sessions SET active_user_id = NULL WHERE active_user_id = :id", { id: normalizedId });
    run("DELETE FROM users WHERE id = :id", { id: normalizedId });
    const result = { success: true };
    writeAuditLog(actor, "USER", normalizedId, "DELETE", beforeState, result, { email: beforeState.email });
    return result;
  }

  function saveStoreCashAccount(payload = {}) {
    const actor = payload._actor;
    const store = requireStoreContext(payload);
    const beforeState = payload.id ? get("SELECT * FROM store_cash_accounts WHERE id = :id AND store_id = :storeId", { id: Number(payload.id), storeId: Number(store.id) }) : null;
    const timestamp = nowIso();
    const normalized = {
      id: payload.id ? Number(payload.id) : null,
      storeId: Number(payload.storeId || payload.store_id || store.id || 0),
      code: normalizeText(payload.code).toUpperCase().replace(/\s+/g, "_"),
      name: normalizeText(payload.name),
      baselineAmount: roundCurrency(payload.baselineAmount ?? payload.baseline_amount),
      balanceAmount: roundCurrency(payload.balanceAmount ?? payload.balance_amount),
      active: payload.active === false || Number(payload.active) === 0 ? 0 : 1
    };

    if (!normalized.storeId || !normalized.code || !normalized.name) {
      throw new Error("Codigo e nome da conta de caixa sao obrigatorios.");
    }

    const duplicate = get(
      "SELECT id FROM store_cash_accounts WHERE store_id = :storeId AND code = :code AND (:id IS NULL OR id != :id)",
      { id: normalized.id, storeId: normalized.storeId, code: normalized.code }
    );
    if (duplicate?.id) {
      throw new Error("Ja existe uma conta de caixa com este codigo.");
    }

    let accountId = normalized.id;
    if (normalized.id) {
      if (!beforeState) {
        throw new Error("Conta de caixa nao encontrada.");
      }
      run(
        `
          UPDATE store_cash_accounts
          SET code = :code,
              name = :name,
              baseline_amount = :baselineAmount,
              balance_amount = :balanceAmount,
              active = :active,
              updated_at = :updatedAt
          WHERE id = :id AND store_id = :storeId
        `,
        {
          ...normalized,
          updatedAt: timestamp
        }
      );
    } else {
      const result = run(
        `
          INSERT INTO store_cash_accounts (store_id, code, name, baseline_amount, balance_amount, active, created_at, updated_at)
          VALUES (:storeId, :code, :name, :baselineAmount, :balanceAmount, :active, :createdAt, :updatedAt)
        `,
        {
          ...normalized,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );
      accountId = Number(result.lastInsertRowid);
    }

    const account = get("SELECT * FROM store_cash_accounts WHERE id = :id", { id: Number(accountId) });
    writeAuditLog(actor, "STORE_CASH_ACCOUNT", account.id, beforeState ? "UPDATE" : "CREATE", beforeState, account, { code: account.code });
    return account;
  }

  function deleteStoreCashAccount(accountId, context = {}) {
    const actor = context.actor || context._actor;
    const store = requireStoreContext(context);
    const normalizedId = Number(accountId || 0);
    const beforeState = get("SELECT * FROM store_cash_accounts WHERE id = :id AND store_id = :storeId", { id: normalizedId, storeId: Number(store.id) });
    if (!beforeState) {
      throw new Error("Conta de caixa nao encontrada.");
    }

    const movementCount = Number(get("SELECT COUNT(*) AS total FROM store_cash_movements WHERE cash_account_id = :id", { id: normalizedId })?.total || 0);
    if (movementCount > 0) {
      run(
        `
          UPDATE store_cash_accounts
          SET active = 0,
              updated_at = :updatedAt
          WHERE id = :id AND store_id = :storeId
        `,
        {
          id: normalizedId,
          storeId: Number(store.id),
          updatedAt: nowIso()
        }
      );
      const archived = get("SELECT * FROM store_cash_accounts WHERE id = :id", { id: normalizedId });
      const result = { success: true, archived: true };
      writeAuditLog(actor, "STORE_CASH_ACCOUNT", normalizedId, "ARCHIVE", beforeState, archived, { code: beforeState.code, movementCount });
      return result;
    }

    run("DELETE FROM store_cash_accounts WHERE id = :id AND store_id = :storeId", { id: normalizedId, storeId: Number(store.id) });
    const result = { success: true };
    writeAuditLog(actor, "STORE_CASH_ACCOUNT", normalizedId, "DELETE", beforeState, result, { code: beforeState.code });
    return result;
  }

  function saveAutomationRule(payload = {}) {
    const actor = payload._actor;
    const beforeState = payload.id ? get("SELECT * FROM automation_rules WHERE id = :id", { id: Number(payload.id) }) : null;
    const rule = baseSaveAutomationRule(payload);
    writeAuditLog(actor, "AUTOMATION_RULE", rule.id, beforeState ? "UPDATE" : "CREATE", beforeState, rule, { code: rule.code });
    return rule;
  }

  function deleteAutomationRule(ruleId, context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = get("SELECT * FROM automation_rules WHERE id = :id", { id: Number(ruleId) });
    if (!beforeState) {
      throw new Error("Regra de automacao nao encontrada.");
    }

    run("DELETE FROM automation_rules WHERE id = :id", { id: Number(ruleId) });
    syncLowStockNotifications();
    const result = { success: true };
    writeAuditLog(actor, "AUTOMATION_RULE", Number(ruleId), "DELETE", beforeState, result, { code: beforeState.code || "" });
    return result;
  }

  function saveFinanceCategory(payload = {}) {
    const actor = payload._actor;
    const beforeState = payload.id ? repo.listFinanceCategories().find((item) => Number(item.id) === Number(payload.id)) || null : null;
    const category = baseSaveFinanceCategory(payload);
    writeAuditLog(actor, "FINANCE_CATEGORY", category.id, beforeState ? "UPDATE" : "CREATE", beforeState, category, { entryType: category.entry_type });
    return category;
  }

  function deleteFinanceCategory(categoryId, context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = repo.listFinanceCategories().find((item) => Number(item.id) === Number(categoryId)) || null;
    const result = baseDeleteFinanceCategory(categoryId);
    writeAuditLog(actor, "FINANCE_CATEGORY", Number(categoryId), "DELETE", beforeState, result, {});
    return result;
  }

  function reorderFinanceCategories(entryType, ids = [], context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = repo.listFinanceCategories(entryType);
    const result = baseReorderFinanceCategories(entryType, ids);
    writeAuditLog(actor, "FINANCE_CATEGORY", null, "REORDER", beforeState, result, { entryType });
    return result;
  }

  function isFinanceEntryEditable(entry) {
    if (!entry) {
      return false;
    }
    const linkedReplenishment = findStockReplenishmentByFinanceEntry(entry);
    if (linkedReplenishment?.id) {
      return false;
    }
    const rawPayload = safeParseJson(entry.raw_payload, {});
    const source = normalizeText(rawPayload.source || rawPayload.origin).toUpperCase();
    if (source.startsWith("CATALOG_") || ["ORDER_COMPLETION", "PDV_PAYMENT"].includes(source)) {
      return false;
    }
    if (Number(entry.order_id || 0) > 0) {
      return false;
    }
    return true;
  }

  function ensureFinanceEntryEditable(entry) {
    if (!isFinanceEntryEditable(entry)) {
      throw new Error("Esse lançamento está vinculado a uma origem operacional e não pode ser alterado por esta tela.");
    }
  }

  function saveFinanceEntry(payload = {}) {
    const actor = payload._actor;
    const beforeState = payload.id ? get("SELECT * FROM finance_entries WHERE id = :id", { id: Number(payload.id) }) : null;
    if (beforeState && payload._allowOperationalFinanceEntryUpdate !== true) {
      ensureFinanceEntryEditable(beforeState);
    }
    const store = requireStoreContext(payload);
    const legacySection = normalizeText(payload.legacySection || payload.legacy_section, beforeState?.legacy_section || "ENTRADAS_SAIDAS") || "ENTRADAS_SAIDAS";
    const hasExplicitCashAccountId = hasExplicitField(payload, "cashAccountId") || hasExplicitField(payload, "cash_account_id");
    const requestedCashAccountId = payload.cashAccountId ?? payload.cash_account_id ?? null;
    const resolvedCashAccountId = hasExplicitCashAccountId
      ? (requestedCashAccountId ? resolveCashAccountId(store.id, requestedCashAccountId, "") : null)
      : resolveCashAccountId(store.id, null, payload.paymentMethod);
    const resolvedCashAccount = resolvedCashAccountId
      ? get("SELECT code, name FROM store_cash_accounts WHERE id = :id AND store_id = :storeId", { id: Number(resolvedCashAccountId), storeId: store.id })
      : null;
    const paymentMethod = normalizeText(
      payload.paymentMethod || payload.payment_method,
      resolvedCashAccount?.code || beforeState?.payment_method || "NAO_DEFINIDO"
    ) || resolvedCashAccount?.code || beforeState?.payment_method || "NAO_DEFINIDO";
    const entry = baseSaveFinanceEntry({
      ...payload,
      paymentMethod,
      storeId: payload.storeId || payload.store_id || store.id,
      cashAccountId: resolvedCashAccountId,
      legacySection
    });

    if (payload.registerStoreCashMovement !== false) {
      const previousMovementAccounts = all(
        "SELECT cash_account_id FROM store_cash_movements WHERE finance_entry_id = :entryId",
        { entryId: entry.id }
      ).map((item) => Number(item.cash_account_id || 0)).filter(Boolean);
      run("DELETE FROM store_cash_movements WHERE finance_entry_id = :entryId", { entryId: entry.id });
      const movement = saveStoreCashMovement({
        storeId: entry.store_id || store.id,
        financeEntryId: entry.id,
        cashAccountId: entry.cash_account_id,
        movementType: "FINANCE_ENTRY",
        entryType: entry.entry_type,
        description: entry.description,
        amount: entry.amount,
        movementDate: entry.entry_date,
        paymentMethod: entry.payment_method,
        sourceWorkbook: entry.source_workbook,
        sourceSheet: entry.source_sheet,
        sourceRow: entry.source_row,
        legacySection: entry.legacy_section || legacySection,
        rawPayload: safeParseJson(entry.raw_payload, {}),
        _actor: actor
      });
      previousMovementAccounts.forEach(recalculateStoreCashAccountBalance);
      if (movement?.cash_account_id) {
        recalculateStoreCashAccountBalance(movement.cash_account_id);
      }
    }

    writeAuditLog(actor, "FINANCE", entry.id, beforeState ? "UPDATE" : "CREATE", beforeState, entry, { category: entry.category });
    return entry;
  }

  function deleteFinanceEntry(entryId, context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = get("SELECT * FROM finance_entries WHERE id = :id", { id: entryId });
    if (!beforeState) {
      throw new Error("Lancamento financeiro nao encontrado.");
    }
    const affectedAccounts = all(
      "SELECT cash_account_id FROM store_cash_movements WHERE finance_entry_id = :entryId",
      { entryId: Number(entryId) }
    ).map((item) => Number(item.cash_account_id || 0)).filter(Boolean);
    run("DELETE FROM store_cash_movements WHERE finance_entry_id = :entryId", { entryId: Number(entryId) });
    affectedAccounts.forEach(recalculateStoreCashAccountBalance);
    run("DELETE FROM finance_entries WHERE id = :id", { id: entryId });
    writeAuditLog(actor, "FINANCE", entryId, "DELETE", beforeState, null, {});
    return { success: true };
  }

  function getTask(taskId) {
    const task = get(
      `
        SELECT
          t.*,
          o.code AS order_code,
          o.client_id AS order_client_id,
          s.name AS store_name,
          s.short_name AS store_short_name
        FROM daily_tasks t
        JOIN stores s ON s.id = t.store_id
        LEFT JOIN orders o ON o.id = t.order_id
        WHERE t.id = :id
      `,
      { id: Number(taskId) }
    );

    if (!task) {
      return null;
    }

    const updates = all(
      `
        SELECT *
        FROM daily_task_updates
        WHERE task_id = :taskId
        ORDER BY created_at ASC, id ASC
      `,
      { taskId: Number(taskId) }
    );
    const checklist = all(
      `
        SELECT *
        FROM daily_task_checklist_items
        WHERE task_id = :taskId
        ORDER BY sort_order ASC, id ASC
      `,
      { taskId: Number(taskId) }
    );

    return {
      ...task,
      updates,
      checklist
    };
  }

  function listTasks(filters = {}) {
    const rows = all(
      `
        SELECT
          t.*,
          o.code AS order_code,
          s.name AS store_name,
          s.short_name AS store_short_name
        FROM daily_tasks t
        JOIN stores s ON s.id = t.store_id
        LEFT JOIN orders o ON o.id = t.order_id
        ORDER BY
          CASE WHEN t.legacy_priority_order IS NULL THEN 999 ELSE t.legacy_priority_order END ASC,
          t.task_date ASC,
          t.updated_at DESC,
          t.id DESC
      `
    );

    const boardDate = normalizeText(filters.taskDate || filters.date);
    const includePending = String(filters.includePendingFromPast || filters.includeBacklog || "false") === "true";

    return rows.filter((row) => {
      if (filters.storeId && Number(filters.storeId) !== Number(row.store_id)) {
        return false;
      }
      if (filters.status && row.status !== filters.status) {
        return false;
      }
      if (filters.priority && row.priority !== filters.priority) {
        return false;
      }
      if (filters.responsible && normalizeText(row.responsible_name).toLowerCase() !== normalizeText(filters.responsible).toLowerCase()) {
        return false;
      }
      if (String(filters.withoutOrder) === "true" && Number(row.order_id || 0) > 0) {
        return false;
      }
      if (String(filters.withOrder) === "true" && Number(row.order_id || 0) <= 0) {
        return false;
      }
      if (!matchesSearch(`${row.title} ${row.description} ${row.client_name} ${row.phone} ${row.device} ${row.order_code || ""}`, filters.search)) {
        return false;
      }
      if (boardDate) {
        if (includePending) {
          const isCarryOver = String(row.task_date || "") <= boardDate && !["CONCLUIDA", "CANCELADA"].includes(String(row.status || ""));
          const isToday = String(row.task_date || "") === boardDate;
          if (!isCarryOver && !isToday) {
            return false;
          }
        } else if (String(row.task_date || "") !== boardDate) {
          return false;
        }
      }
      return isBetweenDates(String(row.task_date || ""), filters.fromDate, filters.toDate);
    });
  }

  function getTaskBoard(filters = {}) {
    const taskDate = normalizeText(filters.taskDate || filters.date, getLocalDateString());
    const tasks = listTasks({ ...filters, taskDate });
    return {
      date: taskDate,
      columns: TASK_STATUSES.map((status) => ({
        code: status.code,
        label: status.label,
        tone: status.tone,
        tasks: tasks.filter((task) => task.status === status.code)
      }))
    };
  }

  function saveTask(payload = {}) {
    const actor = payload._actor || payload.actor;
    const normalizedActor = normalizeActor(actor);
    const store = requireStoreContext(payload);
    const existing = payload.id ? getTask(Number(payload.id)) : null;
    let existingRawPayload = {};
    if (existing?.raw_payload) {
      try {
        existingRawPayload = JSON.parse(existing.raw_payload);
      } catch {
        existingRawPayload = {};
      }
    }
    const taskDate = normalizeText(payload.taskDate || payload.task_date, existing?.task_date || getLocalDateString());
    const requestedLegacyQueueCode = normalizeText(payload.legacyQueueCode || payload.legacy_queue_code, existing?.legacy_queue_code);
    const inferredLegacy = requestedLegacyQueueCode ? parseLegacyTaskLane(requestedLegacyQueueCode, taskDate) : null;
    const hasExplicitStatus = hasExplicitField(payload, "status");
    const status = hasExplicitStatus
      ? (normalizeText(payload.status, existing?.status || "PENDENTE") || "PENDENTE")
      : (inferredLegacy?.inferredStatus || normalizeText(existing?.status || "PENDENTE") || "PENDENTE");
    const priority = inferredLegacy?.inferredPriority
      || normalizeText(payload.priority, existing?.priority || "MEDIA")
      || "MEDIA";
    const orderId = payload.orderId ? Number(payload.orderId) : existing?.order_id ? Number(existing.order_id) : null;
    const linkedOrder = orderId ? repo.getOrder(orderId) : null;
    const title = normalizeText(payload.title, existing?.title);
    const checklist = Array.isArray(payload.checklist) ? payload.checklist : existing?.checklist || [];
    const rawValueLabel = normalizeText(
      payload.valueLabel
      || payload.value_label,
      existing?.value_label || ""
    );
    const resolvedValueAmount = toNumber(payload.valueAmount ?? payload.value_amount)
      ?? coerceLegacyNumber(rawValueLabel)
      ?? existing?.value_amount
      ?? null;

    if (!title) {
      throw new Error("Titulo da tarefa e obrigatorio.");
    }
    if (!taskDate) {
      throw new Error("Data da tarefa e obrigatoria.");
    }

    const normalizedPayload = {
      storeId: store.id,
      orderId,
      title,
      description: normalizeText(payload.description, existing?.description),
      taskDate,
      status,
      priority,
      responsibleName: normalizeText(payload.responsibleName || payload.responsible_name, existing?.responsible_name),
      clientName: normalizeText(payload.clientName || payload.client_name, existing?.client_name || linkedOrder?.client_name),
      phone: normalizeText(payload.phone, existing?.phone || linkedOrder?.client_phone),
      valueAmount: resolvedValueAmount,
      valueLabel: rawValueLabel,
      device: normalizeText(payload.device, existing?.device),
      contactChannel: normalizeText(payload.contactChannel || payload.contact_channel, existing?.contact_channel),
      notes: normalizeText(payload.notes, existing?.notes),
      sourceWorkbook: normalizeText(payload.sourceWorkbook || payload.source_workbook, existing?.source_workbook),
      sourceSheet: normalizeText(payload.sourceSheet || payload.source_sheet, existing?.source_sheet),
      sourceRow: payload.sourceRow ? Number(payload.sourceRow) : existing?.source_row ? Number(existing.source_row) : null,
      legacyQueueCode: requestedLegacyQueueCode,
      legacyQueueLabel: normalizeText(payload.legacyQueueLabel || payload.legacy_queue_label, existing?.legacy_queue_label || inferredLegacy?.legacyQueueLabel),
      legacyPriorityOrder: payload.legacyPriorityOrder !== undefined || payload.legacy_priority_order !== undefined
        ? Number(payload.legacyPriorityOrder ?? payload.legacy_priority_order)
        : existing?.legacy_priority_order ?? inferredLegacy?.legacyPriorityOrder ?? null,
      legacyStatusLabel: normalizeText(payload.legacyStatusLabel || payload.legacy_status_label, existing?.legacy_status_label || inferredLegacy?.legacyStatusLabel),
      legacyTargetDate: normalizeText(payload.legacyTargetDate || payload.legacy_target_date, existing?.legacy_target_date || inferredLegacy?.legacyTargetDate),
      rawPayload: JSON.stringify(payload.rawPayload || existingRawPayload),
      createdByUserId: existing?.created_by_user_id || normalizedActor.actorUserId,
      createdByName: existing?.created_by_name || normalizedActor.actorName
    };

    const timestamp = nowIso();

    let persistedTaskId = existing?.id ? Number(existing.id) : 0;
    transaction(() => {
      let taskId = existing?.id ? Number(existing.id) : 0;
      if (existing) {
        run(
          `
            UPDATE daily_tasks
            SET store_id = :storeId,
                order_id = :orderId,
                title = :title,
                description = :description,
                task_date = :taskDate,
                status = :status,
                priority = :priority,
                responsible_name = :responsibleName,
                client_name = :clientName,
                phone = :phone,
                value_amount = :valueAmount,
                value_label = :valueLabel,
                device = :device,
                contact_channel = :contactChannel,
                notes = :notes,
                source_workbook = :sourceWorkbook,
                source_sheet = :sourceSheet,
                source_row = :sourceRow,
                legacy_queue_code = :legacyQueueCode,
                legacy_queue_label = :legacyQueueLabel,
                legacy_priority_order = :legacyPriorityOrder,
                legacy_status_label = :legacyStatusLabel,
                legacy_target_date = :legacyTargetDate,
                raw_payload = :rawPayload,
                updated_at = :updatedAt
            WHERE id = :id
          `,
          {
            id: Number(existing.id),
            ...normalizedPayload,
            updatedAt: timestamp
          }
        );
        taskId = Number(existing.id);
        run("DELETE FROM daily_task_checklist_items WHERE task_id = :taskId", { taskId });
      } else {
        const result = run(
          `
            INSERT INTO daily_tasks (
              store_id, order_id, title, description, task_date, status, priority, responsible_name,
              client_name, phone, value_amount, value_label, device, contact_channel, notes, source_workbook,
              source_sheet, source_row, legacy_queue_code, legacy_queue_label, legacy_priority_order,
              legacy_status_label, legacy_target_date, raw_payload, created_by_user_id, created_by_name, created_at, updated_at
            )
            VALUES (
              :storeId, :orderId, :title, :description, :taskDate, :status, :priority, :responsibleName,
              :clientName, :phone, :valueAmount, :valueLabel, :device, :contactChannel, :notes, :sourceWorkbook,
              :sourceSheet, :sourceRow, :legacyQueueCode, :legacyQueueLabel, :legacyPriorityOrder,
              :legacyStatusLabel, :legacyTargetDate, :rawPayload, :createdByUserId, :createdByName, :createdAt, :updatedAt
            )
          `,
          {
            ...normalizedPayload,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
        taskId = Number(result.lastInsertRowid);
      }

      checklist.forEach((item, index) => {
        const label = normalizeText(item.label || item.name || item.text);
        if (!label) {
          return;
        }
        run(
          `
            INSERT INTO daily_task_checklist_items (task_id, label, checked, sort_order, created_at, updated_at)
            VALUES (:taskId, :label, :checked, :sortOrder, :createdAt, :updatedAt)
          `,
          {
            taskId,
            label,
            checked: item.checked ? 1 : 0,
            sortOrder: index + 1,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
      });

      if (!existing && normalizeText(payload.initialUpdate)) {
        run(
          `
            INSERT INTO daily_task_updates (task_id, actor_user_id, actor_name, message, created_at)
            VALUES (:taskId, :actorUserId, :actorName, :message, :createdAt)
          `,
          {
            taskId,
            actorUserId: normalizedActor.actorUserId,
            actorName: normalizedActor.actorName,
            message: normalizeText(payload.initialUpdate),
            createdAt: timestamp
          }
        );
      }

      persistedTaskId = taskId;
    });

    const task = getTask(persistedTaskId);
    writeAuditLog(actor, "DAILY_TASK", task?.id || null, existing ? "UPDATE" : "CREATE", existing, task, { storeId: store.id });
    return task;
  }

  function saveTaskUpdate(taskId, payload = {}) {
    const actor = payload._actor || payload.actor;
    const normalizedActor = normalizeActor(actor);
    const task = getTask(taskId);
    if (!task) {
      throw new Error("Tarefa nao encontrada.");
    }

    const message = normalizeText(payload.message || payload.text);
    if (!message) {
      throw new Error("Informe a atualizacao da tarefa.");
    }

    run(
      `
        INSERT INTO daily_task_updates (task_id, actor_user_id, actor_name, message, created_at)
        VALUES (:taskId, :actorUserId, :actorName, :message, :createdAt)
      `,
      {
        taskId: Number(taskId),
        actorUserId: normalizedActor.actorUserId,
        actorName: normalizedActor.actorName,
        message,
        createdAt: nowIso()
      }
    );

    if (payload.status || payload.priority || payload.responsibleName || payload.taskDate) {
      saveTask({
        id: Number(taskId),
        status: payload.status || task.status,
        priority: payload.priority || task.priority,
        responsibleName: payload.responsibleName || task.responsible_name,
        taskDate: payload.taskDate || task.task_date,
        _actor: actor
      });
    } else {
      run("UPDATE daily_tasks SET updated_at = :updatedAt WHERE id = :id", { id: Number(taskId), updatedAt: nowIso() });
    }

    const updated = getTask(taskId);
    writeAuditLog(actor, "DAILY_TASK", Number(taskId), "ADD_UPDATE", task, updated, { message });
    return updated;
  }

  function deleteTask(taskId, context = {}) {
    const actor = context.actor || context._actor;
    const beforeState = getTask(taskId);
    if (!beforeState) {
      throw new Error("Tarefa nao encontrada.");
    }
    run("DELETE FROM daily_tasks WHERE id = :id", { id: Number(taskId) });
    writeAuditLog(actor, "DAILY_TASK", Number(taskId), "DELETE", beforeState, null, {});
    return { success: true };
  }

  function createLegacyImportRun(sourceWorkbook, sourcePath, actor) {
    const normalizedActor = normalizeActor(actor);
    const result = run(
      `
        INSERT INTO legacy_import_runs (source_workbook, source_path, imported_by_user_id, imported_by_name, imported_at, summary_json)
        VALUES (:sourceWorkbook, :sourcePath, :importedByUserId, :importedByName, :importedAt, '')
      `,
      {
        sourceWorkbook,
        sourcePath,
        importedByUserId: normalizedActor.actorUserId,
        importedByName: normalizedActor.actorName,
        importedAt: nowIso()
      }
    );
    return Number(result.lastInsertRowid);
  }

  function finalizeLegacyImportRun(importRunId, summary) {
    run(
      `
        UPDATE legacy_import_runs
        SET summary_json = :summaryJson
        WHERE id = :id
      `,
      {
        id: Number(importRunId),
        summaryJson: JSON.stringify(summary || {})
      }
    );
  }

  function recordLegacyImportRow(importRunId, payload = {}) {
    run(
      `
        INSERT INTO legacy_import_rows (
          import_run_id, source_workbook, source_sheet, source_row, entity_type, entity_id, structured_payload, raw_payload, created_at
        )
        VALUES (
          :importRunId, :sourceWorkbook, :sourceSheet, :sourceRow, :entityType, :entityId, :structuredPayload, :rawPayload, :createdAt
        )
      `,
      {
        importRunId: Number(importRunId),
        sourceWorkbook: normalizeLegacyText(payload.sourceWorkbook),
        sourceSheet: normalizeLegacyText(payload.sourceSheet),
        sourceRow: Number(payload.sourceRow || 0),
        entityType: normalizeLegacyText(payload.entityType),
        entityId: payload.entityId ? Number(payload.entityId) : null,
        structuredPayload: JSON.stringify(payload.structuredPayload || {}),
        rawPayload: JSON.stringify(payload.rawPayload || {}),
        createdAt: nowIso()
      }
    );
  }

  function listLegacyImportRows(filters = {}) {
    const rows = all(
      `
        SELECT *
        FROM legacy_import_rows
        ORDER BY source_workbook ASC, source_sheet ASC, source_row ASC, id ASC
      `
    );

    const limit = filters.limit ? Math.max(1, Number(filters.limit)) : 0;
    const filtered = rows.filter((row) => {
      if (filters.sourceWorkbook && row.source_workbook !== filters.sourceWorkbook) {
        return false;
      }
      if (filters.sourceSheet && row.source_sheet !== filters.sourceSheet) {
        return false;
      }
      if (filters.excludeSheet && row.source_sheet === filters.excludeSheet) {
        return false;
      }
      if (filters.entityType && row.entity_type !== filters.entityType) {
        return false;
      }
      return matchesSearch(
        `${row.source_workbook} ${row.source_sheet} ${row.entity_type} ${row.structured_payload || ""} ${row.raw_payload || ""}`,
        filters.search
      );
    });

    return limit ? filtered.slice(0, limit) : filtered;
  }

  function getLegacyImportSummary(filters = {}) {
    const rows = listLegacyImportRows(filters);
    const grouped = new Map();
    for (const row of rows) {
      const key = `${row.source_workbook}::${row.source_sheet}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          source_workbook: row.source_workbook,
          source_sheet: row.source_sheet,
          entity_count: 0,
          last_row: 0
        });
      }
      const current = grouped.get(key);
      current.entity_count += 1;
      current.last_row = Math.max(Number(current.last_row || 0), Number(row.source_row || 0));
    }
    return [...grouped.values()].sort((left, right) => {
      if (left.source_workbook !== right.source_workbook) {
        return left.source_workbook.localeCompare(right.source_workbook);
      }
      return left.source_sheet.localeCompare(right.source_sheet);
    });
  }

  function purgeLegacyWorkbookData(workbookName) {
    const normalizedWorkbook = normalizeLegacyText(workbookName);
    if (!normalizedWorkbook) {
      return;
    }

    const financeEntryIds = all(
      "SELECT id FROM finance_entries WHERE source_workbook = :sourceWorkbook",
      { sourceWorkbook: normalizedWorkbook }
    ).map((row) => Number(row.id));
    if (financeEntryIds.length) {
      const placeholders = financeEntryIds.map((id) => Number(id)).join(",");
      run(`DELETE FROM store_cash_movements WHERE finance_entry_id IN (${placeholders})`);
      run(`DELETE FROM finance_entries WHERE id IN (${placeholders})`);
    }

    run(
      "DELETE FROM store_cash_movements WHERE source_workbook = :sourceWorkbook AND (finance_entry_id IS NULL OR finance_entry_id = 0)",
      { sourceWorkbook: normalizedWorkbook }
    );
    run(
      "DELETE FROM stock_replenishments WHERE source_workbook = :sourceWorkbook",
      { sourceWorkbook: normalizedWorkbook }
    );
    run(
      "DELETE FROM daily_tasks WHERE source_workbook = :sourceWorkbook",
      { sourceWorkbook: normalizedWorkbook }
    );
    run(
      `
        UPDATE store_cash_accounts
        SET baseline_amount = 0,
            balance_amount = 0,
            snapshot_source_workbook = '',
            snapshot_source_sheet = '',
            snapshot_source_row = NULL,
            snapshot_raw_payload = '',
            snapshot_updated_at = '',
            updated_at = :updatedAt
        WHERE snapshot_source_workbook = :sourceWorkbook
      `,
      { sourceWorkbook: normalizedWorkbook, updatedAt: nowIso() }
    );
    run("DELETE FROM legacy_import_rows WHERE source_workbook = :sourceWorkbook", { sourceWorkbook: normalizedWorkbook });
    run("DELETE FROM legacy_import_runs WHERE source_workbook = :sourceWorkbook", { sourceWorkbook: normalizedWorkbook });
    all("SELECT id FROM store_cash_accounts ORDER BY id ASC").forEach((account) => {
      recalculateStoreCashAccountBalance(Number(account.id));
    });
  }

  function purgeAllTaskData() {
    run("DELETE FROM daily_tasks");
    run("DELETE FROM legacy_import_rows WHERE entity_type IN ('DAILY_TASK', 'TASK_HISTORY_ROW')");
    run(
      `
        DELETE FROM legacy_import_runs
        WHERE source_workbook IN ('Serviços 2026.ods', 'tarefas.ods')
           OR source_workbook IN (
             SELECT DISTINCT source_workbook
             FROM legacy_import_rows
             WHERE entity_type IN ('DAILY_TASK', 'TASK_HISTORY_ROW')
           )
      `
    );
  }

  function normalizeLegacySection(sheetName = "") {
    const sheetSlug = legacySlug(sheetName);
    if (sheetSlug.includes("fluxo de caixa")) {
      return "FLUXO_CAIXA";
    }
    if (sheetSlug.includes("gerencia de caixa")) {
      return "GERENCIA_CAIXA";
    }
    if (sheetSlug === "estoque") {
      return "ESTOQUE";
    }
    if (sheetSlug.includes("compras")) {
      return "COMPRAS";
    }
    return "ENTRADAS_SAIDAS";
  }

  function parseLegacyDateValue(value, fallbackDate = getLocalDateString()) {
    const normalized = normalizeLegacyText(value);
    if (!normalized) {
      return fallbackDate;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return normalized;
    }
    const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (slashMatch) {
      const fallbackParts = getLocalDateParts(fallbackDate || getLocalDateString());
      const day = slashMatch[1].padStart(2, "0");
      const month = slashMatch[2].padStart(2, "0");
      const year = slashMatch[3]
        ? (slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3])
        : fallbackParts.year;
      return `${year}-${month}-${day}`;
    }
    if (/^\d{1,2}$/.test(normalized)) {
      const fallbackParts = getLocalDateParts(fallbackDate || getLocalDateString());
      return `${fallbackParts.year}-${fallbackParts.month}-${normalized.padStart(2, "0")}`;
    }
    return fallbackDate;
  }

  function buildLegacyRowPayload(row = [], headerMap = {}) {
    const mapped = {};
    Object.entries(headerMap).forEach(([key, index]) => {
      const value = normalizeLegacyText(row[index] || "");
      if (value) {
        mapped[key] = value;
      }
    });
    return mapped;
  }

  function inferFinanceCategory(entryType, section, description = "") {
    const value = legacySlug(description);
    if (section === "COMPRAS") {
      return "Compra de produto";
    }
    if (entryType === "RECEITA") {
      if (value.includes("produto")) {
        return "Venda de produto";
      }
      if (value.includes("servico") || value.includes("os")) {
        return "Venda de serviço";
      }
      return "Outras receitas";
    }
    if (value.includes("compra")) {
      return "Compra de produto";
    }
    if (value.includes("frete")) {
      return "Frete";
    }
    return "Operacional";
  }

  function resolvePosSaleFinanceCategory(items = []) {
    const hasService = items.some((item) => item.itemType === "SERVICE");
    const hasProduct = items.some((item) => item.itemType === "PRODUCT");
    if (hasService && !hasProduct) {
      return "Venda de serviço";
    }
    if (hasService) {
      return "Venda mista PDV";
    }
    return "Venda de produto";
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
      const normalizedKey = legacySlug(key);
      const index = headerMap[key] ?? headerMap[normalizedKey];
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

  function parseResponsibleName(value = "") {
    return normalizeLegacyText(String(value || "").replace(/^\d+\s*/g, "")) || "";
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
    if (slug.includes("novos produtos") || slug.includes("soma de produtos") || slug.includes("total geral de produtos") || slug.includes("total de usados")) {
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

  function repairLegacyStockCatalogArtifacts() {
    const updatedAt = nowIso();

    run(
      `
        UPDATE catalog_items
        SET sku = legacy_source_id,
            updated_at = :updatedAt
        WHERE COALESCE(deleted_at, '') = ''
          AND COALESCE(legacy_source_sheet, '') = 'Estoque'
          AND COALESCE(legacy_source_id, '') <> ''
          AND COALESCE(sku, '') = ''
      `,
      { updatedAt }
    );

    const suspiciousItems = all(
      `
        SELECT id, name, legacy_source_id, price_amount, cost_amount, stock_quantity
        FROM catalog_items
        WHERE COALESCE(deleted_at, '') = ''
          AND (
            COALESCE(legacy_source_sheet, '') = 'Estoque'
            OR (
              COALESCE(sku, '') = ''
              AND COALESCE(name, '') = '-'
              AND COALESCE(price_amount, 0) = 0
              AND COALESCE(cost_amount, 0) = 0
            )
          )
      `
    );

    suspiciousItems
      .filter((item) =>
        shouldSkipLegacyStockRow({
          legacyId: item.legacy_source_id,
          name: item.name,
          priceAmount: item.price_amount,
          costAmount: item.cost_amount,
          stockQuantity: item.stock_quantity
        })
      )
      .forEach((item) => {
        run(
          `
            UPDATE catalog_items
            SET active = 0,
                deleted_at = :deletedAt,
                updated_at = :updatedAt
            WHERE id = :id
          `,
          {
            id: item.id,
            deletedAt: updatedAt,
            updatedAt
          }
        );
      });
  }

  function findOrderByLegacyReference(reference = "") {
    const normalized = normalizeLegacyText(reference);
    if (!normalized) {
      return null;
    }
    const numeric = Number.parseInt(normalized.replace(/\D/g, ""), 10);
    if (numeric > 0) {
      const direct = repo.getOrder(numeric);
      if (direct) {
        return direct;
      }
    }
    return get(
      `
        SELECT id
        FROM orders
        WHERE code = :reference OR code LIKE :contains
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
      {
        reference: normalized,
        contains: `%${normalized}%`
      }
    );
  }

  function findCatalogMatch({ sku = "", legacyId = "", name = "", allowNameFallback = true } = {}) {
    const normalizedSku = normalizeLegacyText(sku);
    const normalizedLegacyId = normalizeLegacyText(legacyId);
    const normalizedName = normalizeLegacyText(name);
    if (normalizedSku) {
      const bySku = get("SELECT * FROM catalog_items WHERE sku = :sku", { sku: normalizedSku });
      if (bySku) {
        return bySku;
      }
    }
    if (normalizedLegacyId) {
      const byLegacyId = get("SELECT * FROM catalog_items WHERE legacy_source_id = :legacyId", { legacyId: normalizedLegacyId });
      if (byLegacyId) {
        return byLegacyId;
      }
    }
    if (allowNameFallback && normalizedName) {
      const loweredName = legacySlug(normalizedName);
      const items = repo.listCatalogItems({});
      return items.find((item) => legacySlug(item.name) === loweredName) || null;
    }
    return null;
  }

  function addDaysToDate(dateText, days) {
    if (!dateText) {
      return "";
    }
    const base = new Date(`${dateText}T12:00:00`);
    if (Number.isNaN(base.getTime())) {
      return "";
    }
    base.setDate(base.getDate() + Number(days || 0));
    return base.toISOString().slice(0, 10);
  }

  function decodeLegacyInlineText(value = "") {
    return normalizeLegacyText(String(value || ""))
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'");
  }

  function formatShortDate(dateText) {
    if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      return "";
    }
    return `${dateText.slice(8, 10)}/${dateText.slice(5, 7)}`;
  }

  function mapLegacyPriority(priorityOrder, fallback = "MEDIA") {
    if (!Number.isFinite(Number(priorityOrder))) {
      return fallback;
    }
    const order = Number(priorityOrder);
    if (order <= 1) {
      return "URGENTE";
    }
    if (order <= 3) {
      return "ALTA";
    }
    if (order <= 5) {
      return "MEDIA";
    }
    return "BAIXA";
  }

  function parseLegacyTaskLane(value = "", taskDate = "") {
    const raw = decodeLegacyInlineText(value);
    const slug = legacySlug(raw);
    const explicitId = raw.match(/\d+/)?.[0];
    let priorityOrder = explicitId ? Number(explicitId) : null;
    let queueLabel = raw;
    let statusLabel = "";
    let targetDate = "";
    let inferredStatus = "PENDENTE";

    if (/^0\b/.test(raw) || slug.includes("hj")) {
      priorityOrder = 0;
      targetDate = taskDate;
      queueLabel = "Hoje";
      statusLabel = "Hoje";
    } else if (/^1\b/.test(raw)) {
      priorityOrder = 1;
      targetDate = addDaysToDate(taskDate, 1);
      queueLabel = targetDate ? `1 dia | ${formatShortDate(targetDate)}` : "1 dia";
      statusLabel = "1 dia";
    } else if (/^2\b/.test(raw)) {
      priorityOrder = 2;
      targetDate = addDaysToDate(taskDate, 2);
      queueLabel = targetDate ? `2 dias | ${formatShortDate(targetDate)}` : "2 dias";
      statusLabel = "2 dias";
    } else if (/^3\b/.test(raw) || slug.includes("7d")) {
      priorityOrder = priorityOrder ?? 3;
      targetDate = addDaysToDate(taskDate, 7);
      queueLabel = targetDate ? `3 < 7d | ${formatShortDate(targetDate)}` : "3 < 7d";
      statusLabel = "3 < 7 dias";
    } else if (/^4\b/.test(raw) || slug.includes("sem")) {
      priorityOrder = priorityOrder ?? 4;
      queueLabel = "Semanal";
      statusLabel = "Semanal";
    } else if (slug.includes("pron") || slug.includes("ap p")) {
      priorityOrder = priorityOrder ?? 5;
      queueLabel = "Pronto";
      statusLabel = "Serviço pronto, cliente não avisado";
      inferredStatus = "EM_ANDAMENTO";
    } else if (slug.includes("agu")) {
      priorityOrder = priorityOrder ?? 6;
      queueLabel = "Aguardando";
      statusLabel = "Aguardando";
      inferredStatus = "AGUARDANDO";
    } else if (slug.includes("ent")) {
      priorityOrder = priorityOrder ?? 7;
      queueLabel = "Entregue";
      statusLabel = "Tarefa realizada";
      inferredStatus = "CONCLUIDA";
    } else if (slug.includes("denio")) {
      priorityOrder = priorityOrder ?? 8;
      queueLabel = "Dênio";
      statusLabel = "Dênio";
    }

    return {
      legacyQueueCode: raw,
      legacyQueueLabel: queueLabel,
      legacyPriorityOrder: Number.isFinite(Number(priorityOrder)) ? Number(priorityOrder) : null,
      legacyStatusLabel: statusLabel || raw,
      legacyTargetDate: targetDate,
      inferredPriority: mapLegacyPriority(priorityOrder, "MEDIA"),
      inferredStatus
    };
  }

  function importServicesWorkbook(filePath, actor, store) {
    const workbookName = basename(filePath);
    purgeAllTaskData();
    const workbook = parseOdsFile(filePath);
    const importRunId = createLegacyImportRun(workbookName, filePath, actor);
    const activeSheet = workbook.sheets.find((sheet) => legacySlug(sheet.name) === "atual");
    const summary = {
      workbook: workbookName,
      tasksCreated: 0,
      taskUpdatesCreated: 0,
      activeRowsImported: 0,
      historyRowsPreserved: 0,
      ignoredSheets: Math.max(0, workbook.sheets.length - (activeSheet ? 1 : 0)),
      warnings: []
    };

    if (!activeSheet) {
      summary.warnings.push("Aba 'Atual' nao encontrada em tarefas.ods.");
      finalizeLegacyImportRun(importRunId, summary);
      return summary;
    }

    const taskDate = parseLegacySheetDate(activeSheet.name);
    let headerRowIndex = -1;
    let headerMap = {};

    for (let index = 0; index < Math.min(activeSheet.rows.length, 12); index += 1) {
      const map = buildHeaderMap(activeSheet.rows[index]);
      if (map.nome !== undefined || map.telefone !== undefined || map.servicos !== undefined || map["vlr"] !== undefined) {
        headerRowIndex = index;
        headerMap = map;
        break;
      }
    }

    if (headerRowIndex < 0) {
      summary.warnings.push("Cabecalho da aba Atual nao foi reconhecido.");
      finalizeLegacyImportRun(importRunId, summary);
      return summary;
    }

    for (let rowIndex = headerRowIndex + 1; rowIndex < activeSheet.rows.length; rowIndex += 1) {
      const row = activeSheet.rows[rowIndex];
      const rawValues = row.map((value) => decodeLegacyInlineText(value));
      const legacyQueueCode = decodeLegacyInlineText(rawValues[0] || "");
      const name = decodeLegacyInlineText(readCell(row, headerMap, ["nome"]));
      const phone = decodeLegacyInlineText(readCell(row, headerMap, ["tel", "telefone"])).replace(/^-$/, "");
      const valueLabel = decodeLegacyInlineText(readCell(row, headerMap, ["vlr", "valor"])).replace(/^-$/, "");
      const device = decodeLegacyInlineText(readCell(row, headerMap, ["dispositivo"])).replace(/^-$/, "");
      const services = decodeLegacyInlineText(readCell(row, headerMap, ["servicos", "servico"]));
      const updateParts = Object.entries(headerMap)
        .filter(([key]) => key.startsWith("atualizacao"))
        .map(([, index]) => decodeLegacyInlineText(row[index] || ""))
        .filter(Boolean);
      const orderRef = decodeLegacyInlineText(readCell(row, headerMap, ["os", "ficha"]));
      const joined = [legacyQueueCode, name, phone, valueLabel, device, services, ...updateParts].join(" ").trim();

      if (!joined || !legacyQueueCode) {
        continue;
      }

      const legacyLane = parseLegacyTaskLane(legacyQueueCode, taskDate);
      if (!legacyLane.legacyQueueCode) {
        continue;
      }

      const orderMatch = findOrderByLegacyReference(orderRef);
      const responsibleName = legacySlug(legacyQueueCode).includes("denio") ? "Dênio" : "";
      const title = name || services || `Tarefa importada ${activeSheet.name}`;
      const description = services || title;
      const notes = updateParts.join(" | ");
      const structuredRow = {
        title,
        taskDate,
        clientName: name,
        phone,
        valueLabel,
        valueAmount: coerceLegacyNumber(valueLabel),
        device,
        description,
        responsibleName,
        orderRef,
        legacyQueueCode: legacyLane.legacyQueueCode,
        legacyQueueLabel: legacyLane.legacyQueueLabel,
        legacyPriorityOrder: legacyLane.legacyPriorityOrder,
        legacyStatusLabel: legacyLane.legacyStatusLabel,
        legacyTargetDate: legacyLane.legacyTargetDate,
        updates: updateParts
      };

      const task = saveTask({
        storeId: store.id,
        orderId: orderMatch?.id || null,
        title,
        description,
        taskDate,
        status: legacyLane.inferredStatus,
        priority: legacyLane.inferredPriority || "MEDIA",
        responsibleName,
        clientName: name,
        phone,
        valueAmount: coerceLegacyNumber(valueLabel),
        valueLabel,
        device,
        contactChannel: "",
        notes,
        sourceWorkbook: workbookName,
        sourceSheet: activeSheet.name,
        sourceRow: rowIndex + 1,
        legacyQueueCode: legacyLane.legacyQueueCode,
        legacyQueueLabel: legacyLane.legacyQueueLabel,
        legacyPriorityOrder: legacyLane.legacyPriorityOrder,
        legacyStatusLabel: legacyLane.legacyStatusLabel,
        legacyTargetDate: legacyLane.legacyTargetDate,
        rawPayload: {
          row: rawValues,
          orderRef,
          nome: name,
          telefone: phone,
          valor: valueLabel,
          dispositivo: device,
          servico: services,
          atualizacoes: updateParts
        },
        initialUpdate: notes,
        _actor: actor
      });

      summary.tasksCreated += 1;
      summary.activeRowsImported += 1;
      if (updateParts.length) {
        summary.taskUpdatesCreated += 1;
      }
      recordLegacyImportRow(importRunId, {
        sourceWorkbook: workbookName,
        sourceSheet: activeSheet.name,
        sourceRow: rowIndex + 1,
        entityType: "DAILY_TASK",
        entityId: task?.id,
        structuredPayload: structuredRow,
        rawPayload: { row: rawValues, orderRef }
      });
    }

    finalizeLegacyImportRun(importRunId, summary);
    return summary;
  }

  function importCashWorkbook(filePath, actor, store) {
    const workbookName = basename(filePath);
    purgeLegacyWorkbookData(workbookName);
    const workbook = parseOdsFile(filePath);
    const importRunId = createLegacyImportRun(workbookName, filePath, actor);
    const cashManagementSnapshot = buildCashManagementSheetSnapshot(
      workbook.sheets.find((item) => legacySlug(item.name) === "gerencia de caixa"),
      filePath
    );
    const summary = {
      workbook: workbookName,
      financeImported: 0,
      stockImported: 0,
      purchasesImported: 0,
      purchaseFinanceImported: 0,
      accountSnapshots: 0,
      entrySheetsImported: 0,
      warnings: []
    };

    function findHeader(sheet, predicates = []) {
      for (let index = 0; index < Math.min(sheet.rows.length, 20); index += 1) {
        const map = buildHeaderMap(sheet.rows[index]);
        if (predicates.some((predicate) => predicate(map))) {
          return { headerRowIndex: index, headerMap: map };
        }
      }
      return { headerRowIndex: -1, headerMap: {} };
    }

    function saveImportedFinanceRow({ sheet, rowIndex, row, headerMap, section, entryType: forcedEntryType, category: forcedCategory, amount: forcedAmount, description: forcedDescription, entityType = "FINANCE" }) {
      const rawValues = row.map((value) => normalizeLegacyText(value));
      const structuredRow = buildLegacyRowPayload(row, headerMap);
      const description = normalizeLegacyText(
        forcedDescription
        || readCell(row, headerMap, ["descricao", "historico", "servico", "produto", "srv desp", "nr"])
        || rawValues.filter(Boolean).slice(0, 4).join(" | ")
      );
      const amountValue = forcedAmount ?? coerceLegacyNumber(
        readCell(row, headerMap, ["total", "valor", "entrada", "saida", "e", "s"])
      );
      if (!description || amountValue === null || Number(amountValue) === 0) {
        return null;
      }

      const dc = legacySlug(readCell(row, headerMap, ["d c", "tipo", "dc"]));
      const explicitExpense = Boolean(readCell(row, headerMap, ["saida", "s", "despesa"]));
      const explicitRevenue = Boolean(readCell(row, headerMap, ["entrada", "e", "receita"]));
      const entryType = forcedEntryType
        || (dc.startsWith("d") || (!explicitRevenue && explicitExpense) || Number(amountValue) < 0 ? "DESPESA" : "RECEITA");
      const entryDate = parseLegacyDateValue(readCell(row, headerMap, ["data", "dia"]), getLocalDateString());
      const category = forcedCategory || inferFinanceCategory(entryType, section, description);
      const rawPayload = {
        sourceWorkbook: workbookName,
        sourceSheet: sheet.name,
        section,
        row: structuredRow,
        rawValues
      };

      const entry = saveFinanceEntry({
        entryType,
        category,
        description,
        amount: Math.abs(Number(amountValue || 0)),
        entryDate,
        paymentMethod: "NAO_DEFINIDO",
        cashAccountId: null,
        registerStoreCashMovement: false,
        storeId: store.id,
        sourceWorkbook: workbookName,
        sourceSheet: sheet.name,
        sourceRow: rowIndex + 1,
        legacySection: section,
        rawPayload,
        _actor: actor
      });
      saveStoreCashMovement({
        storeId: store.id,
        financeEntryId: entry.id,
        cashAccountId: null,
        movementType: "FINANCE_ENTRY",
        entryType: entry.entry_type,
        description: entry.description,
        amount: entry.amount,
        movementDate: entry.entry_date,
        paymentMethod: entry.payment_method,
        sourceWorkbook: workbookName,
        sourceSheet: sheet.name,
        sourceRow: rowIndex + 1,
        legacySection: section,
        rawPayload,
        _actor: actor
      });

      summary.financeImported += 1;
      recordLegacyImportRow(importRunId, {
        sourceWorkbook: workbookName,
        sourceSheet: sheet.name,
        sourceRow: rowIndex + 1,
        entityType,
        entityId: entry?.id,
        structuredPayload: entry,
        rawPayload
      });
      return entry;
    }

    for (const sheet of workbook.sheets) {
      const section = normalizeLegacySection(sheet.name);

      if (section === "FLUXO_CAIXA") {
        const { headerRowIndex, headerMap } = findHeader(sheet, [
          (map) => map["d c"] !== undefined || map.total !== undefined || map["srv desp"] !== undefined
        ]);

        for (let rowIndex = headerRowIndex + 1; headerRowIndex >= 0 && rowIndex < sheet.rows.length; rowIndex += 1) {
          const row = sheet.rows[rowIndex];
          const totalValue = coerceLegacyNumber(readCell(row, headerMap, ["total", "e", "s"]));
          const description = [
            readCell(row, headerMap, ["servico"]),
            readCell(row, headerMap, ["produto"]),
            readCell(row, headerMap, ["srv desp"]),
            readCell(row, headerMap, ["nr"])
          ].filter(Boolean).join(" | ");

          if (totalValue === null || Number(totalValue) === 0) {
            continue;
          }

          const dc = legacySlug(readCell(row, headerMap, ["d c"]));
          saveImportedFinanceRow({
            sheet,
            rowIndex,
            row,
            headerMap,
            section,
            entryType: dc.startsWith("d") || Number(totalValue || 0) < 0 ? "DESPESA" : "RECEITA",
            description: description || `Importacao ${sheet.name}`,
            amount: Math.abs(Number(totalValue || 0)),
            entityType: "FINANCE_LEDGER"
          });
        }
        continue;
      }

      if (section === "GERENCIA_CAIXA") {
        const appliedSnapshots = applyCashManagementSheetSnapshot(store.id, cashManagementSnapshot, importRunId);
        summary.accountSnapshots += appliedSnapshots.length;
        continue;
      }

      if (section === "ESTOQUE") {
        const { headerRowIndex, headerMap } = findHeader(sheet, [
          (map) => map["planilha de estoque produto"] !== undefined || map["pr venda"] !== undefined
        ]);

        for (let rowIndex = headerRowIndex + 1; headerRowIndex >= 0 && rowIndex < sheet.rows.length; rowIndex += 1) {
          const row = sheet.rows[rowIndex];
          const rawValues = row.map((value) => normalizeLegacyText(value));
          const legacyId = normalizeLegacyStockCode(readCell(row, headerMap, ["id"]));
          const name = readCell(row, headerMap, ["planilha de estoque produto", "produto"]);
          if (!name) {
            continue;
          }

          const priceAmount = coerceLegacyNumber(readCell(row, headerMap, ["pr venda"])) ?? 0;
          const costAmount = coerceLegacyNumber(readCell(row, headerMap, ["pr custo"])) ?? 0;
          const stockQuantity = Math.max(0, Number.parseInt(String(coerceLegacyNumber(readCell(row, headerMap, ["atual"])) ?? 0), 10) || 0);
          const rawPayload = {
            sourceWorkbook: workbookName,
            sourceSheet: sheet.name,
            section,
            row: buildLegacyRowPayload(row, headerMap),
            rawValues
          };

          if (
            shouldSkipLegacyStockRow({
              legacyId,
              name,
              priceAmount,
              costAmount,
              stockQuantity
            })
          ) {
            recordLegacyImportRow(importRunId, {
              sourceWorkbook: workbookName,
              sourceSheet: sheet.name,
              sourceRow: rowIndex + 1,
              entityType: "CATALOG_ITEM_SKIPPED",
              entityId: null,
              structuredPayload: {
                legacyId,
                name,
                priceAmount,
                costAmount,
                stockQuantity,
                reason: "SUMMARY_OR_PLACEHOLDER"
              },
              rawPayload
            });
            continue;
          }

          const matched = findCatalogMatch({ sku: legacyId, legacyId, name, allowNameFallback: false });
          const taxonomy = inferCatalogTaxonomy(name, readCell(row, headerMap, ["produto"]));
          const saved = saveCatalogItem({
            id: matched?.id,
            sku: matched?.sku || legacyId || "",
            name,
            brand: matched?.brand || "",
            category: taxonomy.category,
            subcategory: taxonomy.subcategory,
            description: matched?.description || "",
            itemCondition: matched?.item_condition || "NOVA",
            stockQuantity,
            minStock: matched?.min_stock || 0,
            costAmount,
            priceAmount,
            locationType: "ESTOQUE",
            active: true,
            legacySourceId: legacyId,
            _actor: actor
          });
          run(
            `
              UPDATE catalog_items
              SET legacy_source_id = :legacySourceId,
                  legacy_source_sheet = :legacySourceSheet,
                  updated_at = :updatedAt
              WHERE id = :id
            `,
            {
              id: saved.id,
              legacySourceId: normalizeLegacyText(legacyId),
              legacySourceSheet: sheet.name,
              updatedAt: nowIso()
            }
          );
          summary.stockImported += 1;
          recordLegacyImportRow(importRunId, {
            sourceWorkbook: workbookName,
            sourceSheet: sheet.name,
            sourceRow: rowIndex + 1,
            entityType: "CATALOG_ITEM",
            entityId: saved.id,
            structuredPayload: saved,
            rawPayload
          });
        }
        continue;
      }

      if (section === "COMPRAS") {
        const { headerRowIndex, headerMap } = findHeader(sheet, [
          (map) => map.descricao !== undefined || map.codigo !== undefined || map.valor !== undefined
        ]);

        for (let rowIndex = headerRowIndex + 1; headerRowIndex >= 0 && rowIndex < sheet.rows.length; rowIndex += 1) {
          const row = sheet.rows[rowIndex];
          const rawValues = row.map((value) => normalizeLegacyText(value));
          const name = readCell(row, headerMap, ["descricao", "produto"]);
          if (!name) {
            continue;
          }
          const sku = readCell(row, headerMap, ["codigo", "cod"]);
          const quantity = Math.max(0, Number.parseInt(String(coerceLegacyNumber(readCell(row, headerMap, ["qtde", "quantidade", "qtd"])) ?? 0), 10) || 0);
          const unitCost = coerceLegacyNumber(readCell(row, headerMap, ["valor unit", "valor", "preco"])) ?? 0;
          const totalCost = coerceLegacyNumber(readCell(row, headerMap, ["total"])) ?? unitCost * Math.max(quantity, 1);
          const matched = findCatalogMatch({ sku, name });
          const rawPayload = {
            sourceWorkbook: workbookName,
            sourceSheet: sheet.name,
            section,
            row: buildLegacyRowPayload(row, headerMap),
            rawValues
          };

          if (!matched) {
            const taxonomy = inferCatalogTaxonomy(name);
            const created = saveCatalogItem({
              sku,
              name,
              category: taxonomy.category,
              subcategory: taxonomy.subcategory,
              itemCondition: "NOVA",
              stockQuantity: 0,
              minStock: 0,
              costAmount: unitCost,
              priceAmount: unitCost,
              locationType: "ESTOQUE",
              active: true,
              _actor: actor
            });
            run(
              `
                INSERT INTO stock_replenishments (
                catalog_item_id, quantity, new_cost_amount, new_price_amount, previous_cost_amount,
                  previous_price_amount, notes, actor_user_id, actor_name, source_workbook, source_sheet, source_row, raw_payload, created_at
                )
                VALUES (
                  :catalogItemId, :quantity, :newCostAmount, :newPriceAmount, NULL, NULL, :notes,
                  :actorUserId, :actorName, :sourceWorkbook, :sourceSheet, :sourceRow, :rawPayload, :createdAt
                )
              `,
              {
                catalogItemId: created.id,
                quantity,
                newCostAmount: unitCost,
                newPriceAmount: created.price_amount,
                notes: `Importado de ${sheet.name} | total ${totalCost}`,
                actorUserId: actor?.id ? Number(actor.id) : null,
                actorName: normalizeActor(actor).actorName,
                sourceWorkbook: workbookName,
                sourceSheet: sheet.name,
                sourceRow: rowIndex + 1,
                rawPayload: serializeStructuredPayload(rawPayload, "{}"),
                createdAt: nowIso()
              }
            );
            saveImportedFinanceRow({
              sheet,
              rowIndex,
              row,
              headerMap,
              section,
              entryType: "DESPESA",
              category: "Compra de produto",
              description: name,
              amount: Math.abs(Number(totalCost || unitCost || 0)),
              entityType: "PURCHASE_FINANCE"
            });
            summary.purchaseFinanceImported += 1;
            summary.purchasesImported += 1;
            continue;
          }

          run(
            `
              INSERT INTO stock_replenishments (
                catalog_item_id, quantity, new_cost_amount, new_price_amount, previous_cost_amount,
                previous_price_amount, notes, actor_user_id, actor_name, source_workbook, source_sheet, source_row, raw_payload, created_at
              )
              VALUES (
                :catalogItemId, :quantity, :newCostAmount, :newPriceAmount, :previousCostAmount,
                :previousPriceAmount, :notes, :actorUserId, :actorName, :sourceWorkbook, :sourceSheet, :sourceRow, :rawPayload, :createdAt
              )
            `,
            {
              catalogItemId: matched.id,
              quantity,
              newCostAmount: unitCost,
              newPriceAmount: matched.price_amount,
              previousCostAmount: matched.cost_amount,
              previousPriceAmount: matched.price_amount,
              notes: `Importado de ${sheet.name} | total ${totalCost}`,
              actorUserId: actor?.id ? Number(actor.id) : null,
              actorName: normalizeActor(actor).actorName,
              sourceWorkbook: workbookName,
              sourceSheet: sheet.name,
              sourceRow: rowIndex + 1,
              rawPayload: serializeStructuredPayload(rawPayload, "{}"),
              createdAt: nowIso()
            }
          );
          saveImportedFinanceRow({
            sheet,
            rowIndex,
            row,
            headerMap,
            section,
            entryType: "DESPESA",
            category: "Compra de produto",
            description: name,
            amount: Math.abs(Number(totalCost || unitCost || 0)),
            entityType: "PURCHASE_FINANCE"
          });
          summary.purchaseFinanceImported += 1;
          recordLegacyImportRow(importRunId, {
            sourceWorkbook: workbookName,
            sourceSheet: sheet.name,
            sourceRow: rowIndex + 1,
            entityType: "STOCK_REPLENISHMENT",
            entityId: matched.id,
            structuredPayload: {
              catalogItemId: matched.id,
              quantity,
              totalCost
            },
            rawPayload
          });
          summary.purchasesImported += 1;
        }
        continue;
      }

      const { headerRowIndex, headerMap } = findHeader(sheet, [
        (map) => map.descricao !== undefined || map.valor !== undefined || map.total !== undefined || map["entrada"] !== undefined || map["saida"] !== undefined
      ]);
      if (headerRowIndex < 0) {
        continue;
      }

      summary.entrySheetsImported += 1;
      for (let rowIndex = headerRowIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
        saveImportedFinanceRow({
          sheet,
          rowIndex,
          row: sheet.rows[rowIndex],
          headerMap,
          section,
          entityType: "FINANCE_ENTRY_LEGACY"
        });
      }
    }

    finalizeLegacyImportRun(importRunId, summary);
    return summary;
  }

  function importLegacyOds(payload = {}) {
    const actor = payload._actor || payload.actor;
    const store = requireStoreContext(payload);
    const defaultTaskWorkbook = existsSync(join(process.cwd(), "tarefas.ods"))
      ? join(process.cwd(), "tarefas.ods")
      : join(process.cwd(), "Serviços 2026.ods");
    const requestedFiles = Array.isArray(payload.files) && payload.files.length
      ? payload.files.map((item) => String(item))
      : [
          defaultTaskWorkbook,
          join(process.cwd(), "26 CX Loja ok em 29 02.ods")
        ];

    const summaries = [];
    for (const filePath of requestedFiles) {
      if (!existsSync(filePath)) {
        throw new Error(`Arquivo legado nao encontrado: ${filePath}`);
      }
      const name = basename(filePath);
      const fileSlug = legacySlug(name);
      if (fileSlug.includes("servicos") || fileSlug.includes("tarefas")) {
        summaries.push(importServicesWorkbook(filePath, actor, store));
      } else {
        summaries.push(importCashWorkbook(filePath, actor, store));
      }
    }

    return {
      store,
      files: summaries,
      importedAt: nowIso()
    };
  }

  function getOperationalWorkbookSheetMap() {
    return {
      resumo: "Resumo",
      saldoCaixa: "Saldos Caixa",
      movimentosCaixa: "Movimentos Caixa",
      lancamentos: "Lancamentos",
      estoque: "Estoque",
      reposicoes: "Reposicoes",
      ordensServico: "Ordens Servico",
      itensOs: "Itens OS",
      clientes: "Clientes",
      vendasPdv: "Vendas PDV",
      itensPdv: "Itens PDV",
      pagamentosPdv: "Pagamentos PDV",
      importacaoLegada: "Importacao Legada"
    };
  }

  function getWorkbookSheet(workbook, sheetName) {
    return workbook?.sheets?.find((sheet) => normalizeText(sheet?.name) === normalizeText(sheetName)) || null;
  }

  function getWorkbookRows(sheet) {
    return Array.isArray(sheet?.rows) ? sheet.rows : [];
  }

  function getWorkbookHeaderMap(sheet) {
    const rows = getWorkbookRows(sheet);
    return rows.length ? buildHeaderMap(rows[0]) : {};
  }

  function getWorkbookRowValue(row = [], headerMap = {}, keys = []) {
    return readCell(row, headerMap, keys);
  }

  function workbookRecordMap(sheet) {
    const rows = getWorkbookRows(sheet);
    const headerRow = rows[0] || [];
    return rows.slice(1).map((row) => {
      const record = {};
      headerRow.forEach((header, index) => {
        record[normalizeLegacyText(header)] = normalizeLegacyText(row[index] || "");
      });
      return record;
    });
  }

  function toWorkbookNumber(value, fallback = 0) {
    const normalized = toNumber(value);
    return normalized === null || normalized === undefined ? fallback : normalized;
  }

  function parseWorkbookDate(value, fallback = getLocalDateString()) {
    const normalized = normalizeText(value);
    if (!normalized) {
      return fallback;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
      return normalized.slice(0, 10);
    }
    return parseLegacyDateValue(normalized, fallback);
  }

  function normalizeWorkbookFileName(value = "", fallback = "loja") {
    const slug = legacySlug(value || fallback).replace(/\s+/g, "-");
    return slug || "loja";
  }

  function clearOperationalWorkbookData() {
    const tables = [
      "store_cash_movements",
      "finance_entries",
      "stock_replenishments",
      "pos_payments",
      "pos_sale_items",
      "pos_sales",
      "order_requested_products",
      "order_services",
      "order_items",
      "order_timeline_events",
      "order_attachments",
      "orders",
      "clients",
      "cash_sessions",
      "store_cash_accounts",
      "catalog_stock_consumptions",
      "catalog_stock_batches",
      "catalog_items",
      "legacy_import_rows",
      "legacy_import_runs"
    ];

    for (const tableName of tables) {
      run(`DELETE FROM ${tableName}`);
    }

    const quotedNames = tables.map((name) => `'${String(name).replace(/'/g, "''")}'`).join(", ");
    run(`DELETE FROM sqlite_sequence WHERE name IN (${quotedNames})`);
  }

  function buildOperationalOdsSheetRows({ store, exportedAt, actor }) {
    const storeId = Number(store?.id || 0);
    const storeAccounts = listStoreCashAccounts(storeId);
    const storeMovements = listStoreCashMovements({ storeId });
    const financeEntries = listFinanceReportEntries({ storeId });
    const replenishments = listReplenishmentReportEntries({ storeId });
    const catalogItems = repo.listCatalogItems({}).filter((item) => Number(item.active || 0) === 1 || Number(item.stock_quantity || 0) > 0);
    const orders = repo.listOrders({ storeId });
    const clients = repo.listClients({});
    const posSales = listPosSales({ storeId });

    const salePaymentsByCode = new Map();
    const saleItemsByCode = new Map();
    const saleTotalsByCode = new Map();
    for (const sale of posSales) {
      const saleDetail = getPosSale(Number(sale.id));
      salePaymentsByCode.set(sale.code, saleDetail?.payments || []);
      saleItemsByCode.set(sale.code, saleDetail?.items || []);
      saleTotalsByCode.set(sale.code, {
        subtotal: Number(sale.subtotal_amount || 0),
        total: Number(sale.total_amount || 0),
        discount: Number(sale.discount_amount || 0)
      });
    }

    const summaryRows = [
      { campo: "Exportado em", valor: exportedAt },
      { campo: "Loja", valor: store?.short_name || store?.name || "Loja" },
      { campo: "Usuario", valor: actor?.name || "Sistema" },
      { campo: "Contas de caixa", valor: storeAccounts.length },
      { campo: "Movimentos caixa", valor: storeMovements.length },
      { campo: "Lancamentos", valor: financeEntries.length },
      { campo: "Produtos estoque", valor: catalogItems.length },
      { campo: "Reposicoes", valor: replenishments.length },
      { campo: "Ordens de servico", valor: orders.length },
      { campo: "Clientes", valor: clients.length },
      { campo: "Vendas PDV", valor: posSales.length }
    ];

    const stockUsageCounts = new Map();
    for (const order of orders) {
      for (const item of order.items || []) {
        stockUsageCounts.set(Number(item.catalog_item_id || 0), (stockUsageCounts.get(Number(item.catalog_item_id || 0)) || 0) + Number(item.quantity || 0));
      }
    }

    const sheets = [
      {
        name: "Resumo",
        rows: [["campo", "valor"], ...summaryRows.map((row) => [row.campo, row.valor])]
      },
      {
        name: "Saldos Caixa",
        rows: [
          ["id", "codigo", "nome", "saldo_inicial", "saldo_atual", "ativo", "total_movimentos", "ultimo_movimento"],
          ...storeAccounts.map((account) => [
            account.id,
            account.code,
            account.name,
            Number(account.baseline_amount || 0),
            Number(account.balance_amount || 0),
            Number(account.active || 0),
            Number(account.movement_count || 0),
            account.last_movement_date || ""
          ])
        ]
      },
      {
        name: "Movimentos Caixa",
        rows: [
          ["id", "data_movimento", "tipo_lancamento", "tipo_movimento", "descricao", "valor", "conta_caixa_id", "conta_caixa_codigo", "conta_caixa_nome", "categoria_financeira", "forma_pagamento", "venda_pdv_codigo", "workbook_origem", "aba_origem", "linha_origem", "secao_legada", "payload_bruto"],
          ...storeMovements.map((movement) => [
            movement.id,
            String(movement.movement_date || "").slice(0, 10),
            movement.entry_type || "",
            movement.movement_type || "",
            movement.description || "",
            Number(movement.amount || 0),
            movement.cash_account_id || "",
            movement.cash_account_code || "",
            movement.cash_account_name || "",
            movement.finance_category || "",
            movement.finance_payment_method || "",
            movement.sale_code || "",
            movement.source_workbook || "",
            movement.source_sheet || "",
            movement.source_row || "",
            movement.legacy_section || "",
            movement.raw_payload || ""
          ])
        ]
      },
      {
        name: "Lancamentos",
        rows: [
          ["id", "data_lancamento", "tipo", "categoria", "descricao", "valor", "forma_pagamento", "conta_caixa_id", "conta_caixa_codigo", "conta_caixa_nome", "pedido_id", "codigo_os", "reposicao_id", "workbook_origem", "aba_origem", "linha_origem", "secao_legada", "payload_bruto"],
          ...[...financeEntries, ...replenishments]
            .sort((left, right) => String(right.entry_date || right.entryDate || right.entry_date || right.description || "").localeCompare(String(left.entry_date || left.description || "")))
            .map((entry) => [
              entry.finance_entry_id || entry.id || "",
              entry.entry_date || entry.entryDate || String(entry.entry_date || "").slice(0, 10),
              entry.entry_type || entry.entryType || "",
              entry.category || "",
              entry.description || "",
              Number(entry.amount || 0),
              entry.payment_method || "",
              entry.cash_account_id || "",
              entry.cash_account_code || "",
              entry.cash_account_name || "",
              entry.order_id || "",
              entry.order_code || "",
              entry.replenishment_id || "",
              entry.source_workbook || "",
              entry.source_sheet || "",
              entry.source_row || "",
              entry.legacy_section || "",
              entry.raw_payload || ""
            ])
        ]
      },
      {
        name: "Estoque",
        rows: [
          ["id", "sku", "nome", "marca", "categoria", "subcategoria", "condicao", "estoque", "estoque_minimo", "custo", "preco", "valor_custo_estoque", "valor_venda_estoque", "situacao_estoque", "ativo", "uso_em_os"],
          ...catalogItems.map((item) => {
            const stockQuantity = Number(item.stock_quantity || 0);
            const minStock = Number(item.min_stock || 0);
            const costAmount = Number(item.cost_amount || 0);
            const priceAmount = Number(item.price_amount || 0);
            const status = stockQuantity <= 0 ? "Sem estoque" : (stockQuantity <= minStock ? "Baixo" : "Saudavel");
            return [
              item.id,
              item.sku || "",
              item.name || "",
              item.brand || "",
              item.category || "",
              item.subcategory || "",
              item.item_condition || "",
              stockQuantity,
              minStock,
              costAmount,
              priceAmount,
              roundCurrency(stockQuantity * costAmount),
              roundCurrency(stockQuantity * priceAmount),
              status,
              Number(item.active || 0),
              stockUsageCounts.get(Number(item.id)) || 0
            ];
          })
        ]
      },
      {
        name: "Reposicoes",
        rows: [
          ["id", "data", "descricao", "valor", "workbook_origem", "aba_origem", "linha_origem"],
          ...replenishments.map((entry) => [
            entry.replenishment_id || entry.id || "",
            String(entry.entry_date || "").slice(0, 10),
            entry.description || "",
            Number(entry.amount || 0),
            entry.source_workbook || "",
            entry.source_sheet || "",
            entry.source_row || ""
          ])
        ]
      },
      {
        name: "Ordens Servico",
        rows: [
          ["id", "codigo", "cliente", "telefone_cliente", "equipamento", "defeito", "tecnico", "status_os", "status_aprovacao", "total", "aberto_em", "concluido_em", "atualizado_em"],
          ...orders.map((order) => [
            order.id,
            order.code || "",
            order.client_name || "",
            order.client_phone || "",
            order.equipment || "",
            order.defect || "",
            order.technician_name || "",
            order.order_status || "",
            order.approval_status || "",
            Number(order.total_amount || 0),
            String(order.opened_at || "").slice(0, 10),
            String(order.concluded_at || "").slice(0, 10),
            order.updated_at || ""
          ])
        ]
      },
      {
        name: "Itens OS",
        rows: [["sem_dados"], ["Nenhum registro encontrado."]]
      },
      {
        name: "Clientes",
        rows: [
          ["id", "nome", "telefone", "email", "documento", "endereco", "pedidos", "gasto_total", "pedidos_abertos"],
          ...clients.map((client) => [
            client.id,
            client.name || "",
            client.phone || "",
            client.email || "",
            client.document || "",
            client.address || "",
            Number(client.orders_count || 0),
            Number(client.total_spent || 0),
            Number(client.open_orders || 0)
          ])
        ]
      },
      {
        name: "Vendas PDV",
        rows: [
          ["id", "codigo", "cliente", "operador", "subtotal", "desconto", "total", "formas_pagamento", "troco", "criado_em"],
          ...posSales.map((sale) => {
            const payments = salePaymentsByCode.get(sale.code) || [];
            const paymentMethods = [...new Set(payments.map((payment) => payment.payment_method).filter(Boolean))].join(", ");
            const saleTotals = saleTotalsByCode.get(sale.code) || {};
            const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            return [
              sale.id,
              sale.code || "",
              sale.client_name || "",
              sale.operator_name || store?.short_name || store?.name || "",
              Number(saleTotals.subtotal ?? sale.subtotal_amount ?? 0),
              Number(sale.discount_amount || 0),
              Number(saleTotals.total ?? sale.total_amount ?? 0),
              paymentMethods,
              roundCurrency(Math.max(0, totalPaid - Number(sale.total_amount || 0))),
              sale.created_at || ""
            ];
          })
        ]
      },
      {
        name: "Itens PDV",
        rows: [
          ["id", "venda_id", "codigo_venda", "tipo_item", "catalogo_id", "servico_id", "descricao", "quantidade", "custo_unitario", "preco_unitario", "total_linha"],
          ...posSales.flatMap((sale) => {
            const saleItems = saleItemsByCode.get(sale.code) || [];
            return saleItems.map((item) => [
              item.id,
              item.sale_id || sale.id,
              sale.code || "",
              item.item_type || "",
              item.catalog_item_id || "",
              item.service_catalog_id || "",
              item.item_name || "",
              Number(item.quantity || 0),
              Number(item.unit_cost || 0),
              Number(item.unit_price || 0),
              Number(item.line_total || 0)
            ]);
          })
        ]
      },
      {
        name: "Pagamentos PDV",
        rows: [
          ["id", "venda_id", "codigo_venda", "forma_pagamento", "valor", "criado_em"],
          ...posSales.flatMap((sale) => {
            const payments = salePaymentsByCode.get(sale.code) || [];
            return payments.map((payment) => [
              payment.id,
              payment.sale_id || sale.id,
              sale.code || "",
              payment.payment_method || "",
              Number(payment.amount || 0),
              payment.created_at || ""
            ]);
          })
        ]
      },
      {
        name: "Importacao Legada",
        rows: [["sem_dados"], ["Nenhum registro encontrado."]]
      }
    ];

    return sheets;
  }

  function exportOperationalOds(payload = {}) {
    const actor = payload._actor || payload.actor;
    const store = requireStoreContext(payload);
    const exportedAt = nowIso();
    const storeSlug = normalizeWorkbookFileName(store.short_name || store.name || "loja");
    const fileName = `exportacao-${storeSlug}-${exportedAt.slice(0, 10)}.ods`;
    const sheets = buildOperationalOdsSheetRows({ store, exportedAt, actor });
    const buffer = createOdsWorkbook({
      sheets,
      meta: {
        creator: actor?.name || "Sistema",
        createdAt: exportedAt
      }
    });
    const summary = {
      fileName,
      exportedAt,
      store: {
        id: store.id,
        name: store.name,
        shortName: store.short_name
      },
      sheets: sheets.map((sheet) => ({
        name: sheet.name,
        rows: Math.max(0, (sheet.rows || []).length - 1)
      })),
      totalRows: sheets.reduce((total, sheet) => total + Math.max(0, (sheet.rows || []).length - 1), 0),
      buffer
    };

    writeAuditLog(actor, "SYSTEM_TRANSFER", null, "ODS_EXPORT", null, summary, {
      fileName,
      exportedAt,
      storeId: store.id
    });

    return summary;
  }

  function importSheetRowsAsRecords(sheet) {
    const rows = getWorkbookRows(sheet);
    const headerRow = rows[0] || [];
    const headerMap = buildHeaderMap(headerRow);
    return { rows, headerRow, headerMap };
  }

  function clearTableRows(tableNames = []) {
    for (const tableName of tableNames) {
      run(`DELETE FROM ${tableName}`);
    }
    if (tableNames.length) {
      const quotedNames = tableNames.map((name) => `'${String(name).replace(/'/g, "''")}'`).join(", ");
      run(`DELETE FROM sqlite_sequence WHERE name IN (${quotedNames})`);
    }
  }

  function importOperationalOds(payload = {}) {
    const actor = payload._actor || payload.actor;
    const store = requireStoreContext(payload);
    const fileName = normalizeText(payload.fileName, "exportacao-loja-principal.ods");
    const contentBase64 = normalizeText(payload.contentBase64 || payload.content || "");
    if (!contentBase64) {
      throw new Error("Envie um arquivo ODS para importar.");
    }

    const workbook = parseOdsBuffer(Buffer.from(contentBase64, "base64"));
    const sheetMap = new Map(workbook.sheets.map((sheet) => [normalizeText(sheet.name), sheet]));
    const requiredSheets = Object.values(getOperationalWorkbookSheetMap());
    const missingSheets = requiredSheets.filter((sheetName) => !sheetMap.has(normalizeText(sheetName)));
    if (missingSheets.length) {
      throw new Error(`Arquivo ODS incompleto ou legado. Faltam abas: ${missingSheets.join(", ")}`);
    }

    const importRunId = createLegacyImportRun(fileName, "", actor);
    const summary = {
      workbook: fileName,
      store: {
        id: store.id,
        name: store.name,
        shortName: store.short_name
      },
      sheets: {},
      importedAt: nowIso()
    };
    const timestamp = nowIso();
    const fallbackUserId = normalizeActor(actor).actorUserId || Number(get("SELECT id FROM users ORDER BY id ASC LIMIT 1")?.id || 0) || null;
    const fallbackUserName = normalizeActor(actor).actorName || normalizeText(get("SELECT name FROM users ORDER BY id ASC LIMIT 1")?.name, "Sistema") || "Sistema";

    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN IMMEDIATE");

    try {
      clearTableRows([
        "store_cash_movements",
        "finance_entries",
        "stock_replenishments",
        "pos_payments",
        "pos_sale_items",
        "pos_sales",
        "order_requested_products",
        "order_services",
        "order_items",
        "order_timeline_events",
        "order_attachments",
        "orders",
        "clients",
        "cash_sessions",
        "store_cash_accounts",
        "catalog_stock_consumptions",
        "catalog_stock_batches",
        "catalog_items"
      ]);

      const clientsSheet = sheetMap.get("Clientes");
      const accountsSheet = sheetMap.get("Saldos Caixa");
      const stockSheet = sheetMap.get("Estoque");
      const ordersSheet = sheetMap.get("Ordens Servico");
      const salesSheet = sheetMap.get("Vendas PDV");
      const salesItemsSheet = sheetMap.get("Itens PDV");
      const paymentsSheet = sheetMap.get("Pagamentos PDV");
      const movementsSheet = sheetMap.get("Movimentos Caixa");
      const financeSheet = sheetMap.get("Lancamentos");
      const replenishmentSheet = sheetMap.get("Reposicoes");

      const clientMap = new Map();
      const accountMap = new Map();
      const accountSnapshotValues = new Map();
      const itemMap = new Map();
      const orderMap = new Map();
      const saleMap = new Map();
      const financeMap = new Map();
      const replenishmentMap = new Map();

      const clientRows = getWorkbookRows(clientsSheet);
      const clientHeaderMap = buildHeaderMap(clientRows[0] || []);
      for (let rowIndex = 1; rowIndex < clientRows.length; rowIndex += 1) {
        const row = clientRows[rowIndex] || [];
        const id = Number(getWorkbookRowValue(row, clientHeaderMap, ["id"]) || 0);
        const name = getWorkbookRowValue(row, clientHeaderMap, ["nome"]);
        const phone = getWorkbookRowValue(row, clientHeaderMap, ["telefone"]);
        if (!name || !phone) {
          continue;
        }
        run(
          `
            INSERT INTO clients (
              id, name, phone, email, document, address, notes, created_at, updated_at, photo_path
            )
            VALUES (
              :id, :name, :phone, :email, :document, :address, '', :createdAt, :updatedAt, ''
            )
          `,
          {
            id: id || null,
            name,
            phone,
            email: getWorkbookRowValue(row, clientHeaderMap, ["email"]),
            document: getWorkbookRowValue(row, clientHeaderMap, ["documento"]),
            address: getWorkbookRowValue(row, clientHeaderMap, ["endereco"]),
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
        const insertedId = id || Number(get("SELECT id FROM clients WHERE name = :name AND phone = :phone ORDER BY id DESC LIMIT 1", { name, phone })?.id || 0);
        clientMap.set(`${legacySlug(name)}|${legacySlug(phone)}`, insertedId);
        clientMap.set(`${legacySlug(name)}`, insertedId);
      }
      summary.sheets["Clientes"] = clientRows.length - 1;

      const accountRows = getWorkbookRows(accountsSheet);
      const accountHeaderMap = buildHeaderMap(accountRows[0] || []);
      for (let rowIndex = 1; rowIndex < accountRows.length; rowIndex += 1) {
        const row = accountRows[rowIndex] || [];
        const id = Number(getWorkbookRowValue(row, accountHeaderMap, ["id"]) || 0);
        const code = normalizeText(getWorkbookRowValue(row, accountHeaderMap, ["codigo"]), "").toUpperCase();
        const name = getWorkbookRowValue(row, accountHeaderMap, ["nome"]);
        if (!code || !name) {
          continue;
        }
        run(
          `
            INSERT INTO store_cash_accounts (
              id, store_id, code, name, baseline_amount, balance_amount, active, created_at, updated_at,
              snapshot_source_workbook, snapshot_source_sheet, snapshot_source_row, snapshot_raw_payload, snapshot_updated_at
            )
            VALUES (
              :id, :storeId, :code, :name, :baselineAmount, :balanceAmount, :active, :createdAt, :updatedAt,
              '', '', NULL, '', ''
            )
          `,
          {
            id: id || null,
            storeId: store.id,
            code,
            name,
            baselineAmount: toWorkbookNumber(getWorkbookRowValue(row, accountHeaderMap, ["saldo_inicial"])),
            balanceAmount: toWorkbookNumber(getWorkbookRowValue(row, accountHeaderMap, ["saldo_atual"])),
            active: Number(getWorkbookRowValue(row, accountHeaderMap, ["ativo"]) || 1) ? 1 : 0,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
        const insertedId = id || Number(get("SELECT id FROM store_cash_accounts WHERE store_id = :storeId AND code = :code ORDER BY id DESC LIMIT 1", { storeId: store.id, code })?.id || 0);
        accountMap.set(code, insertedId);
        accountSnapshotValues.set(code, {
          baselineAmount: toWorkbookNumber(getWorkbookRowValue(row, accountHeaderMap, ["saldo_inicial"])),
          balanceAmount: toWorkbookNumber(getWorkbookRowValue(row, accountHeaderMap, ["saldo_atual"]))
        });
      }
      summary.sheets["Saldos Caixa"] = accountRows.length - 1;

      const stockRows = getWorkbookRows(stockSheet);
      const stockHeaderMap = buildHeaderMap(stockRows[0] || []);
      for (let rowIndex = 1; rowIndex < stockRows.length; rowIndex += 1) {
        const row = stockRows[rowIndex] || [];
        const id = Number(getWorkbookRowValue(row, stockHeaderMap, ["id"]) || 0);
        const sku = normalizeText(getWorkbookRowValue(row, stockHeaderMap, ["sku"])) || null;
        const name = getWorkbookRowValue(row, stockHeaderMap, ["nome"]);
        if (!name) {
          continue;
        }
        run(
          `
            INSERT INTO catalog_items (
              id, sku, name, brand, category, subcategory, compatibility, description, item_condition,
              stock_quantity, min_stock, cost_amount, price_amount, is_complete, active, is_store_inventory,
              created_at, updated_at, location_type, deleted_at, legacy_source_id, legacy_source_sheet
            )
            VALUES (
              :id, :sku, :name, :brand, :category, :subcategory, '', '', :itemCondition,
              :stockQuantity, :minStock, :costAmount, :priceAmount, 0, :active, 0,
              :createdAt, :updatedAt, 'ESTOQUE', '', :legacySourceId, 'Estoque'
            )
          `,
          {
            id: id || null,
            sku,
            name,
            brand: getWorkbookRowValue(row, stockHeaderMap, ["marca"]),
            category: getWorkbookRowValue(row, stockHeaderMap, ["categoria"]) || "Outros",
            subcategory: getWorkbookRowValue(row, stockHeaderMap, ["subcategoria"]),
            itemCondition: getWorkbookRowValue(row, stockHeaderMap, ["condicao"]) || "NOVA",
            stockQuantity: Math.max(0, Math.trunc(toWorkbookNumber(getWorkbookRowValue(row, stockHeaderMap, ["estoque"])))),
            minStock: Math.max(0, Math.trunc(toWorkbookNumber(getWorkbookRowValue(row, stockHeaderMap, ["estoque_minimo"])))),
            costAmount: toWorkbookNumber(getWorkbookRowValue(row, stockHeaderMap, ["custo"])),
            priceAmount: toWorkbookNumber(getWorkbookRowValue(row, stockHeaderMap, ["preco"])),
            active: Number(getWorkbookRowValue(row, stockHeaderMap, ["ativo"]) || 1) ? 1 : 0,
            createdAt: timestamp,
            updatedAt: timestamp,
            legacySourceId: sku || String(id || "")
          }
        );
        const insertedId = id || Number(get("SELECT id FROM catalog_items WHERE name = :name ORDER BY id DESC LIMIT 1", { name })?.id || 0);
        itemMap.set(String(id || insertedId), insertedId);
        itemMap.set(legacySlug(name), insertedId);
        if (sku) {
          itemMap.set(legacySlug(sku), insertedId);
        }
      }
      summary.sheets["Estoque"] = stockRows.length - 1;

      const replenishmentRows = getWorkbookRows(replenishmentSheet);
      const replenishmentHeaderMap = buildHeaderMap(replenishmentRows[0] || []);
      for (let rowIndex = 1; rowIndex < replenishmentRows.length; rowIndex += 1) {
        const row = replenishmentRows[rowIndex] || [];
        const description = getWorkbookRowValue(row, replenishmentHeaderMap, ["descricao"]);
        if (!description) {
          continue;
        }
        const id = Number(getWorkbookRowValue(row, replenishmentHeaderMap, ["id"]) || 0);
        const extractedName = normalizeText(description.replace(/^Estoque inicial:\s*/i, "").replace(/\s*\(Qtd:.*/i, ""));
        const quantityMatch = description.match(/\(Qtd:\s*(\d+)\s*\)/i);
        const quantity = Math.max(1, Number(quantityMatch?.[1] || 1));
        const matchedItemId = itemMap.get(legacySlug(extractedName)) || itemMap.get(legacySlug(description)) || null;
        if (!matchedItemId) {
          continue;
        }
        const amount = toWorkbookNumber(getWorkbookRowValue(row, replenishmentHeaderMap, ["valor"]));
        run(
          `
            INSERT INTO stock_replenishments (
              id, catalog_item_id, quantity, new_cost_amount, new_price_amount, previous_cost_amount,
              previous_price_amount, notes, actor_user_id, actor_name, created_at, source_workbook,
              source_sheet, source_row, raw_payload, finance_entry_id, extra_finance_entry_id
            )
            VALUES (
              :id, :catalogItemId, :quantity, :newCostAmount, :newPriceAmount, NULL,
              NULL, :notes, :actorUserId, :actorName, :createdAt, :sourceWorkbook,
              :sourceSheet, :sourceRow, :rawPayload, NULL, NULL
            )
          `,
          {
            id: id || null,
            catalogItemId: matchedItemId,
            quantity,
            newCostAmount: matchedItemId ? Number(get("SELECT cost_amount FROM catalog_items WHERE id = :id", { id: matchedItemId })?.cost_amount || 0) : amount,
            newPriceAmount: matchedItemId ? Number(get("SELECT price_amount FROM catalog_items WHERE id = :id", { id: matchedItemId })?.price_amount || 0) : amount,
            notes: description,
            actorUserId: fallbackUserId,
            actorName: fallbackUserName,
            createdAt: timestamp,
            sourceWorkbook: getWorkbookRowValue(row, replenishmentHeaderMap, ["workbook_origem"]),
            sourceSheet: getWorkbookRowValue(row, replenishmentHeaderMap, ["aba_origem"]) || "Reposicoes",
            sourceRow: Number(getWorkbookRowValue(row, replenishmentHeaderMap, ["linha_origem"]) || rowIndex + 1),
            rawPayload: JSON.stringify({
              description,
              value: amount
            })
          }
        );
        const insertedId = id || Number(get("SELECT id FROM stock_replenishments ORDER BY id DESC LIMIT 1")?.id || 0);
        replenishmentMap.set(String(id || insertedId), insertedId);
      }
      summary.sheets["Reposicoes"] = replenishmentRows.length - 1;

      const orderRows = getWorkbookRows(ordersSheet);
      const orderHeaderMap = buildHeaderMap(orderRows[0] || []);
      for (let rowIndex = 1; rowIndex < orderRows.length; rowIndex += 1) {
        const row = orderRows[rowIndex] || [];
        const id = Number(getWorkbookRowValue(row, orderHeaderMap, ["id"]) || 0);
        const code = getWorkbookRowValue(row, orderHeaderMap, ["codigo"]);
        const clientName = getWorkbookRowValue(row, orderHeaderMap, ["cliente"]);
        const phone = getWorkbookRowValue(row, orderHeaderMap, ["telefone_cliente"]);
        if (!code || !clientName) {
          continue;
        }
        const clientId = clientMap.get(`${legacySlug(clientName)}|${legacySlug(phone)}`) || clientMap.get(legacySlug(clientName)) || null;
        if (!clientId) {
          continue;
        }
        run(
          `
            INSERT INTO orders (
              id, code, client_id, phone_snapshot, equipment, defect, extras, photo_path, technician_name, due_date,
              order_status, approval_status, quote_amount, pre_approved_limit, actual_amount, service_amount,
              discount_amount, total_amount, payment_method, notes, opened_at, concluded_at, delivered_at,
              cancelled_at, created_at, updated_at
            )
            VALUES (
              :id, :code, :clientId, :phoneSnapshot, :equipment, :defect, '', '', :technicianName, '',
              :orderStatus, :approvalStatus, :quoteAmount, NULL, NULL, :serviceAmount,
              0, :totalAmount, 'NAO_DEFINIDO', '', :openedAt, :concludedAt, '', '',
              :createdAt, :updatedAt
            )
          `,
          {
            id: id || null,
            code,
            clientId,
            phoneSnapshot: phone,
            equipment: getWorkbookRowValue(row, orderHeaderMap, ["equipamento"]),
            defect: getWorkbookRowValue(row, orderHeaderMap, ["defeito"]),
            technicianName: getWorkbookRowValue(row, orderHeaderMap, ["tecnico"]),
            orderStatus: getWorkbookRowValue(row, orderHeaderMap, ["status_os"]) || "ABERTA",
            approvalStatus: getWorkbookRowValue(row, orderHeaderMap, ["status_aprovacao"]) || "AGUARDANDO_APROVACAO",
            quoteAmount: toWorkbookNumber(getWorkbookRowValue(row, orderHeaderMap, ["total"])),
            serviceAmount: toWorkbookNumber(getWorkbookRowValue(row, orderHeaderMap, ["total"])),
            totalAmount: toWorkbookNumber(getWorkbookRowValue(row, orderHeaderMap, ["total"])),
            openedAt: parseWorkbookDate(getWorkbookRowValue(row, orderHeaderMap, ["aberto_em"]), timestamp.slice(0, 10)),
            concludedAt: parseWorkbookDate(getWorkbookRowValue(row, orderHeaderMap, ["concluido_em"]), ""),
            createdAt: timestamp,
            updatedAt: getWorkbookRowValue(row, orderHeaderMap, ["atualizado_em"]) || timestamp
          }
        );
        const insertedId = id || Number(get("SELECT id FROM orders WHERE code = :code ORDER BY id DESC LIMIT 1", { code })?.id || 0);
        orderMap.set(String(id || insertedId), insertedId);
        orderMap.set(legacySlug(code), insertedId);
      }
      summary.sheets["Ordens Servico"] = orderRows.length - 1;

      const salesRows = getWorkbookRows(salesSheet);
      const salesHeaderMap = buildHeaderMap(salesRows[0] || []);
      const sessionResult = run(
        `
          INSERT INTO cash_sessions (
            id, user_id, opened_by_user_id, store_id, operator_name, opening_amount, closing_amount, expected_amount,
            notes, status, opened_at, closed_at, created_at, updated_at
          )
          VALUES (
            1, :userId, :openedByUserId, :storeId, :operatorName, 0, 0, 0,
            :notes, 'OPEN', :openedAt, '', :createdAt, :updatedAt
          )
        `,
        {
          userId: fallbackUserId || 1,
          openedByUserId: fallbackUserId || 1,
          storeId: store.id,
          operatorName: store.short_name || store.name || "Loja",
          notes: `Importado de ${fileName}`,
          openedAt: timestamp.slice(0, 10),
          createdAt: timestamp,
          updatedAt: timestamp
        }
      );
      const sessionId = Number(sessionResult.lastInsertRowid || 1) || 1;

      for (let rowIndex = 1; rowIndex < salesRows.length; rowIndex += 1) {
        const row = salesRows[rowIndex] || [];
        const id = Number(getWorkbookRowValue(row, salesHeaderMap, ["id"]) || 0);
        const code = getWorkbookRowValue(row, salesHeaderMap, ["codigo"]);
        if (!code) {
          continue;
        }
        const createdAt = getWorkbookRowValue(row, salesHeaderMap, ["criado_em"]) || timestamp;
        const saleClientName = getWorkbookRowValue(row, salesHeaderMap, ["cliente"]);
        const clientId = clientMap.get(legacySlug(saleClientName)) || null;
        run(
          `
            INSERT INTO pos_sales (
              id, code, cash_session_id, user_id, client_id, client_name, subtotal_amount, discount_amount,
              total_amount, notes, created_at, updated_at, discount_mode, discount_value, store_id
            )
            VALUES (
              :id, :code, :cashSessionId, :userId, :clientId, :clientName, :subtotalAmount, :discountAmount,
              :totalAmount, '', :createdAt, :updatedAt, 'AMOUNT', :discountValue, :storeId
            )
          `,
          {
            id: id || null,
            code,
            cashSessionId: sessionId,
            userId: fallbackUserId || 1,
            clientId,
            clientName: saleClientName,
            subtotalAmount: toWorkbookNumber(getWorkbookRowValue(row, salesHeaderMap, ["subtotal"])),
            discountAmount: toWorkbookNumber(getWorkbookRowValue(row, salesHeaderMap, ["desconto"])),
            totalAmount: toWorkbookNumber(getWorkbookRowValue(row, salesHeaderMap, ["total"])),
            createdAt,
            updatedAt: createdAt,
            discountValue: toWorkbookNumber(getWorkbookRowValue(row, salesHeaderMap, ["desconto"])),
            storeId: store.id
          }
        );
        const insertedId = id || Number(get("SELECT id FROM pos_sales WHERE code = :code ORDER BY id DESC LIMIT 1", { code })?.id || 0);
        saleMap.set(String(id || insertedId), insertedId);
        saleMap.set(legacySlug(code), insertedId);
      }
      summary.sheets["Vendas PDV"] = salesRows.length - 1;

      const salesItemsRows = getWorkbookRows(salesItemsSheet);
      const salesItemsHeaderMap = buildHeaderMap(salesItemsRows[0] || []);
      for (let rowIndex = 1; rowIndex < salesItemsRows.length; rowIndex += 1) {
        const row = salesItemsRows[rowIndex] || [];
        const id = Number(getWorkbookRowValue(row, salesItemsHeaderMap, ["id"]) || 0);
        const saleCode = getWorkbookRowValue(row, salesItemsHeaderMap, ["codigo_venda"]);
        const saleId = saleMap.get(legacySlug(saleCode)) || Number(getWorkbookRowValue(row, salesItemsHeaderMap, ["venda_id"]) || 0) || null;
        const itemType = normalizeText(getWorkbookRowValue(row, salesItemsHeaderMap, ["tipo_item"]), "PRODUCT") || "PRODUCT";
        const catalogIdText = getWorkbookRowValue(row, salesItemsHeaderMap, ["catalogo_id"]);
        const catalogItemId = catalogIdText ? Number(catalogIdText) : null;
        const serviceIdText = getWorkbookRowValue(row, salesItemsHeaderMap, ["servico_id"]);
        const serviceId = serviceIdText ? Number(serviceIdText) : null;
        if (!saleId) {
          continue;
        }
        run(
          `
            INSERT INTO pos_sale_items (
              id, sale_id, catalog_item_id, service_catalog_id, item_type, item_name, sku, quantity, unit_cost,
              unit_price, line_total, created_at
            )
            VALUES (
              :id, :saleId, :catalogItemId, :serviceCatalogId, :itemType, :itemName, :sku, :quantity, :unitCost,
              :unitPrice, :lineTotal, :createdAt
            )
          `,
          {
            id: id || null,
            saleId,
            catalogItemId,
            serviceCatalogId: serviceId,
            itemType,
            itemName: getWorkbookRowValue(row, salesItemsHeaderMap, ["descricao"]),
            sku: "",
            quantity: Math.max(1, Math.trunc(toWorkbookNumber(getWorkbookRowValue(row, salesItemsHeaderMap, ["quantidade"]), 1))),
            unitCost: toWorkbookNumber(getWorkbookRowValue(row, salesItemsHeaderMap, ["custo_unitario"])),
            unitPrice: toWorkbookNumber(getWorkbookRowValue(row, salesItemsHeaderMap, ["preco_unitario"])),
            lineTotal: toWorkbookNumber(getWorkbookRowValue(row, salesItemsHeaderMap, ["total_linha"])),
            createdAt: timestamp
          }
        );
      }
      summary.sheets["Itens PDV"] = Math.max(0, salesItemsRows.length - 1);

      const paymentsRows = getWorkbookRows(paymentsSheet);
      const paymentsHeaderMap = buildHeaderMap(paymentsRows[0] || []);
      for (let rowIndex = 1; rowIndex < paymentsRows.length; rowIndex += 1) {
        const row = paymentsRows[rowIndex] || [];
        const id = Number(getWorkbookRowValue(row, paymentsHeaderMap, ["id"]) || 0);
        const saleCode = getWorkbookRowValue(row, paymentsHeaderMap, ["codigo_venda"]);
        const saleId = saleMap.get(legacySlug(saleCode)) || Number(getWorkbookRowValue(row, paymentsHeaderMap, ["venda_id"]) || 0) || null;
        if (!saleId) {
          continue;
        }
        run(
          `
            INSERT INTO pos_payments (
              id, sale_id, payment_method, amount, created_at
            )
            VALUES (
              :id, :saleId, :paymentMethod, :amount, :createdAt
            )
          `,
          {
            id: id || null,
            saleId,
            paymentMethod: getWorkbookRowValue(row, paymentsHeaderMap, ["forma_pagamento"]) || "CAIXINHA_LOJA",
            amount: toWorkbookNumber(getWorkbookRowValue(row, paymentsHeaderMap, ["valor"])),
            createdAt: getWorkbookRowValue(row, paymentsHeaderMap, ["criado_em"]) || timestamp
          }
        );
      }
      summary.sheets["Pagamentos PDV"] = Math.max(0, paymentsRows.length - 1);

      const financeRows = getWorkbookRows(financeSheet);
      const financeHeaderMap = buildHeaderMap(financeRows[0] || []);
      const usedFinanceIds = new Set();
      for (let rowIndex = 1; rowIndex < financeRows.length; rowIndex += 1) {
        const row = financeRows[rowIndex] || [];
        const id = Number(getWorkbookRowValue(row, financeHeaderMap, ["id"]) || 0);
        const insertId = id && !usedFinanceIds.has(id) ? id : null;
        const description = getWorkbookRowValue(row, financeHeaderMap, ["descricao"]);
        if (!description) {
          continue;
        }
        if (insertId) {
          usedFinanceIds.add(insertId);
        }
        const orderRef = getWorkbookRowValue(row, financeHeaderMap, ["codigo_os"]);
        const orderId = orderMap.get(legacySlug(orderRef)) || Number(getWorkbookRowValue(row, financeHeaderMap, ["pedido_id"]) || 0) || null;
        const cashAccountCode = normalizeText(getWorkbookRowValue(row, financeHeaderMap, ["conta_caixa_codigo"]), "").toUpperCase();
        const cashAccountId = accountMap.get(cashAccountCode) || null;
        const saleCodeMatch = description.match(/Venda\s+(PDV-\d{8}-\d{4})/i);
        const rawPayload = getWorkbookRowValue(row, financeHeaderMap, ["payload_bruto"]);
        run(
          `
            INSERT INTO finance_entries (
              id, entry_type, category, description, amount, entry_date, payment_method, order_id, created_at,
              updated_at, store_id, cash_account_id, raw_payload, source_workbook, source_sheet, source_row, legacy_section
            )
            VALUES (
              :id, :entryType, :category, :description, :amount, :entryDate, :paymentMethod, :orderId, :createdAt,
              :updatedAt, :storeId, :cashAccountId, :rawPayload, :sourceWorkbook, :sourceSheet, :sourceRow, :legacySection
            )
          `,
          {
            id: insertId,
            entryType: getWorkbookRowValue(row, financeHeaderMap, ["tipo"]) || "RECEITA",
            category: getWorkbookRowValue(row, financeHeaderMap, ["categoria"]) || "Outras receitas",
            description,
            amount: toWorkbookNumber(getWorkbookRowValue(row, financeHeaderMap, ["valor"])),
            entryDate: parseWorkbookDate(getWorkbookRowValue(row, financeHeaderMap, ["data_lancamento"]), timestamp.slice(0, 10)),
            paymentMethod: getWorkbookRowValue(row, financeHeaderMap, ["forma_pagamento"]) || "NAO_DEFINIDO",
            orderId,
            createdAt: timestamp,
            updatedAt: timestamp,
            storeId: store.id,
            cashAccountId,
            rawPayload: rawPayload || JSON.stringify({
              source: "ODS_IMPORT",
              saleCode: saleCodeMatch?.[1] || ""
            }),
            sourceWorkbook: fileName,
            sourceSheet: "Lancamentos",
            sourceRow: rowIndex + 1,
            legacySection: getWorkbookRowValue(row, financeHeaderMap, ["secao_legada"]) || "ENTRADAS_SAIDAS"
          }
        );
        const insertedId = insertId || Number(get("SELECT id FROM finance_entries ORDER BY id DESC LIMIT 1")?.id || 0);
        if (id && !financeMap.has(String(id))) {
          financeMap.set(String(id), insertedId);
        }
        financeMap.set(String(insertedId), insertedId);
        financeMap.set(legacySlug(description), insertedId);
        if (orderRef) {
          financeMap.set(legacySlug(`Venda ${orderRef}`), insertedId);
        }
      }
      summary.sheets["Lancamentos"] = financeRows.length - 1;

      const movementRows = getWorkbookRows(movementsSheet);
      const movementHeaderMap = buildHeaderMap(movementRows[0] || []);
      for (let rowIndex = 1; rowIndex < movementRows.length; rowIndex += 1) {
        const row = movementRows[rowIndex] || [];
        const id = Number(getWorkbookRowValue(row, movementHeaderMap, ["id"]) || 0);
        const description = getWorkbookRowValue(row, movementHeaderMap, ["descricao"]);
        if (!description) {
          continue;
        }
        const saleCode = getWorkbookRowValue(row, movementHeaderMap, ["venda_pdv_codigo"]);
        const saleId = saleMap.get(legacySlug(saleCode)) || null;
        const cashAccountCode = normalizeText(getWorkbookRowValue(row, movementHeaderMap, ["conta_caixa_codigo"]), "").toUpperCase();
        const cashAccountId = accountMap.get(cashAccountCode) || null;
        const matchingFinanceId = saleCode
          ? financeMap.get(legacySlug(`Venda ${saleCode}`))
          : financeMap.get(legacySlug(description)) || null;
        run(
          `
            INSERT INTO store_cash_movements (
              id, store_id, cash_session_id, finance_entry_id, sale_id, cash_account_id, movement_type, entry_type,
              description, amount, movement_date, actor_user_id, actor_name, raw_payload, created_at, updated_at,
              source_workbook, source_sheet, source_row, legacy_section
            )
            VALUES (
              :id, :storeId, :cashSessionId, :financeEntryId, :saleId, :cashAccountId, :movementType, :entryType,
              :description, :amount, :movementDate, :actorUserId, :actorName, :rawPayload, :createdAt, :updatedAt,
              :sourceWorkbook, :sourceSheet, :sourceRow, :legacySection
            )
          `,
          {
            id: id || null,
            storeId: store.id,
            cashSessionId: sessionId,
            financeEntryId: matchingFinanceId || null,
            saleId,
            cashAccountId,
            movementType: getWorkbookRowValue(row, movementHeaderMap, ["tipo_movimento"]) || "FINANCE_ENTRY",
            entryType: getWorkbookRowValue(row, movementHeaderMap, ["tipo_lancamento"]) || "RECEITA",
            description,
            amount: toWorkbookNumber(getWorkbookRowValue(row, movementHeaderMap, ["valor"])),
            movementDate: parseWorkbookDate(getWorkbookRowValue(row, movementHeaderMap, ["data_movimento"]), timestamp.slice(0, 10)),
            actorUserId: fallbackUserId,
            actorName: fallbackUserName,
            rawPayload: getWorkbookRowValue(row, movementHeaderMap, ["payload_bruto"]) || JSON.stringify({ saleCode }),
            createdAt: timestamp,
            updatedAt: timestamp,
            sourceWorkbook: getWorkbookRowValue(row, movementHeaderMap, ["workbook_origem"]) || fileName,
            sourceSheet: getWorkbookRowValue(row, movementHeaderMap, ["aba_origem"]) || "Movimentos Caixa",
            sourceRow: Number(getWorkbookRowValue(row, movementHeaderMap, ["linha_origem"]) || rowIndex + 1),
            legacySection: getWorkbookRowValue(row, movementHeaderMap, ["secao_legada"]) || "ENTRADAS_SAIDAS"
          }
        );
      }
      summary.sheets["Movimentos Caixa"] = movementRows.length - 1;

      run(
        `
          UPDATE store_cash_accounts
          SET baseline_amount = :baselineAmount,
              balance_amount = :balanceAmount,
              updated_at = :updatedAt
          WHERE store_id = :storeId
        `,
        {
          baselineAmount: 0,
          balanceAmount: 0,
          updatedAt: timestamp,
          storeId: store.id
        }
      );
      for (const [code, values] of accountSnapshotValues.entries()) {
        run(
          `
            UPDATE store_cash_accounts
            SET baseline_amount = :baselineAmount,
                balance_amount = :balanceAmount,
                updated_at = :updatedAt
            WHERE store_id = :storeId AND code = :code
          `,
          {
            storeId: store.id,
            code,
            baselineAmount: values.baselineAmount,
            balanceAmount: values.balanceAmount,
            updatedAt: timestamp
          }
        );
      }

      for (const sheetName of requiredSheets) {
        if (!summary.sheets[sheetName]) {
          summary.sheets[sheetName] = 0;
        }
      }

      db.exec("COMMIT");
      db.exec("PRAGMA foreign_keys = ON");
      repo.syncCatalogStockBatches();
      writeAuditLog(actor, "SYSTEM_TRANSFER", null, "ODS_IMPORT", null, summary, {
        fileName,
        importedAt: summary.importedAt
      });
      finalizeLegacyImportRun(importRunId, summary);
      return summary;
    } catch (error) {
      db.exec("ROLLBACK");
      db.exec("PRAGMA foreign_keys = ON");
      throw error;
    }
  }

  async function backupToMysql(payload = {}) {
    const actor = payload._actor || payload.actor;
    const summary = await backupSqliteToMysql(db, payload);
    writeAuditLog(actor, "SYSTEM_TRANSFER", null, "MYSQL_BACKUP_PUSH", null, summary, {
      databaseName: summary.databaseName,
      totalRows: summary.totalRows
    });
    return summary;
  }

  function createMysqlDump(payload = {}) {
    const actor = payload._actor || payload.actor;
    const summary = createMysqlDumpFromSqlite(db, payload);
    writeAuditLog(actor, "SYSTEM_TRANSFER", null, "MYSQL_BACKUP_DUMP", null, {
      fileName: summary.fileName,
      totalRows: summary.totalRows,
      databaseName: summary.databaseName
    });
    return summary;
  }

  function exportBackupOds(payload = {}) {
    const actor = payload._actor || payload.actor;
    const actorName = normalizeActor(actor).actorName || "Sistema";
    const summary = exportSqliteBackupOds(db, {
      actorName,
      fileName: payload.fileName
    });
    writeAuditLog(actor, "SYSTEM_TRANSFER", null, "ODS_BACKUP_EXPORT", null, {
      fileName: summary.fileName,
      totalRows: summary.totalRows,
      exportedAt: summary.exportedAt
    }, {
      fileName: summary.fileName,
      totalRows: summary.totalRows
    });
    return summary;
  }

  function importBackupOds(payload = {}) {
    const actor = payload._actor || payload.actor;
    const contentBase64 = normalizeText(payload.contentBase64 || payload.content || "");
    if (!contentBase64) {
      throw new Error("Envie um arquivo ODS para importar.");
    }
    const summary = importSqliteBackupOds(db, Buffer.from(contentBase64, "base64"), {
      fileName: payload.fileName,
      clearExisting: payload.clearExisting !== false
    });
    syncStores();
    syncCompanyProfiles();
    syncLowStockNotifications();
    writeAuditLog(actor, "SYSTEM_TRANSFER", null, "ODS_BACKUP_IMPORT", null, summary, {
      fileName: summary.fileName,
      totalRows: summary.totalRows
    });
    return summary;
  }

  async function importFromMysql(payload = {}) {
    const actor = payload._actor || payload.actor;
    const summary = await importMysqlToSqlite(db, payload);
    syncStores();
    syncCompanyProfiles();
    syncLowStockNotifications();
    writeAuditLog(actor, "SYSTEM_TRANSFER", null, "MYSQL_IMPORT", null, summary, {
      databaseName: summary.databaseName,
      totalRows: summary.totalRows
    });
    return summary;
  }

  async function importLegacyOdsFromLinks(payload = {}) {
    const actor = payload._actor || payload.actor;
    const store = requireStoreContext(payload);
    const sources = Array.isArray(payload.sources) ? payload.sources.filter((item) => item?.url) : [];
    if (!sources.length) {
      throw new Error("Informe ao menos um link público para importar.");
    }

    const downloaded = await downloadLegacyWorkbookSources(sources, {
      tempRoot: join(runtimeStorageRoot, "imports")
    });
    try {
      const result = importLegacyOds({
        files: downloaded.map((item) => item.path),
        storeId: store.id,
        _store: store,
        _actor: actor
      });
      syncLowStockNotifications();
      writeAuditLog(actor, "SYSTEM_TRANSFER", null, "ODS_LINK_IMPORT", null, result, {
        sources: downloaded.map((item) => ({
          fileName: item.fileName,
          originalUrl: item.originalUrl,
          resolvedUrl: item.resolvedUrl,
          size: item.size
        }))
      });
      return {
        ...result,
        sources: downloaded.map((item) => ({
          fileName: item.fileName,
          originalUrl: item.originalUrl,
          resolvedUrl: item.resolvedUrl,
          size: item.size
        }))
      };
    } finally {
      await cleanupDownloadedSources(downloaded);
    }
  }

  function listAuditLogs(filters = {}) {
    const rows = all("SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC");
    return rows.filter((row) => {
      if (!matchesSearch(`${row.actor_name} ${row.entity_type} ${row.action}`, filters.search)) {
        return false;
      }
      if (filters.entityType && row.entity_type !== filters.entityType) {
        return false;
      }
      if (filters.actorUserId && Number(filters.actorUserId) !== Number(row.actor_user_id)) {
        return false;
      }
      return isBetweenDates(row.created_at.slice(0, 10), filters.fromDate, filters.toDate);
    });
  }

  function getPerformanceMetrics(filters = {}) {
    const logs = listAuditLogs(filters);
    const grouped = new Map();

    for (const log of logs) {
      const key = String(log.actor_user_id || log.actor_name || "Sistema");
      const current = grouped.get(key) || {
        actorUserId: log.actor_user_id,
        actorName: log.actor_name,
        actorRole: log.actor_role,
        totalActions: 0,
        ordersCreated: 0,
        ordersClosed: 0,
        approvalsHandled: 0,
        stockAdjustments: 0,
        financeMoves: 0,
        cashEvents: 0,
        pdvSales: 0,
        lastActionAt: log.created_at
      };

      current.totalActions += 1;
      current.lastActionAt = current.lastActionAt > log.created_at ? current.lastActionAt : log.created_at;
      if (log.entity_type === "ORDER" && log.action === "CREATE") {
        current.ordersCreated += 1;
      }
      if (log.entity_type === "ORDER" && log.action === "STATUS_CHANGE") {
        current.ordersClosed += 1;
      }
      if (log.entity_type === "ORDER" && log.action === "APPROVAL_CHANGE") {
        current.approvalsHandled += 1;
      }
      if (log.entity_type === "STOCK") {
        current.stockAdjustments += 1;
      }
      if (log.entity_type === "FINANCE") {
        current.financeMoves += 1;
      }
      if (log.entity_type === "CASH_SESSION") {
        current.cashEvents += 1;
      }
      if (log.entity_type === "POS_SALE") {
        current.pdvSales += 1;
      }
      grouped.set(key, current);
    }

    return [...grouped.values()].sort((left, right) => right.totalActions - left.totalActions);
  }

  function getOrderTimeline(orderId) {
    const order = repo.getOrder(orderId);
    if (!order) {
      return null;
    }

    const events = all(
      `
        SELECT *
        FROM order_timeline_events
        WHERE order_id = :orderId
        ORDER BY event_date ASC, id ASC
      `,
      { orderId }
    );

    return {
      order,
      events
    };
  }

  function saveOrderTimelineEvent(orderId, payload = {}) {
    const order = repo.getOrder(orderId);
    if (!order) {
      throw new Error("OS nao encontrada para registrar andamento.");
    }
    ensureOrderIsEditable(order, "alterada");

    const actor = payload._actor || payload.actor;
    const title = String(payload.title || "").trim();
    if (!title) {
      throw new Error("Informe um titulo para o registro da OS.");
    }

    const description = String(payload.description || "").trim();
    const eventType = String(payload.eventType || "MANUAL_NOTE").trim() || "MANUAL_NOTE";
    const eventDate = String(payload.eventDate || getLocalDateString()).trim() || getLocalDateString();
    const color = String(payload.color || "#0d6efd").trim() || "#0d6efd";

    let currentOrder = order;
    let nextStatus = "";
    if (eventType === "ENTREGA_RETORNO") {
      nextStatus = "CONCLUIDA";
    } else if (order.order_status === "ABERTA") {
      nextStatus = "EM_ANDAMENTO";
    }

    if (nextStatus && order.order_status !== nextStatus && order.order_status !== "CANCELADA") {
      run(
        `
          UPDATE orders
          SET order_status = :nextStatus,
              concluded_at = CASE WHEN :nextStatus = 'CONCLUIDA' AND concluded_at = '' THEN :eventDate ELSE concluded_at END,
              delivered_at = CASE WHEN :nextStatus = 'CONCLUIDA' AND delivered_at = '' THEN :eventDate ELSE delivered_at END,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          id: orderId,
          nextStatus,
          eventDate,
          updatedAt: nowIso()
        }
      );
      currentOrder = repo.getOrder(orderId);
      recordOrderFlow(order, currentOrder, actor);
      if (String(nextStatus || "") === "CONCLUIDA") {
        syncCompletedOrderFinanceEntries(currentOrder, requireStoreContext(payload).id, actor);
      }
    }

    writeOrderTimelineEvent(orderId, eventType, title, description, color, eventDate, actor);
    writeAuditLog(actor, "ORDER", orderId, "TIMELINE_EVENT_CREATE", null, {
      title,
      description,
      eventType,
      eventDate,
      code: currentOrder.code
    }, {
      code: currentOrder.code,
      eventType
    });

    return getOrderTimeline(orderId);
  }

  function updateOrderDueDate(orderId, dueDate, actor = null) {
    const order = repo.getOrder(orderId);
    if (!order) {
      throw new Error("OS não encontrada para atualizar a previsão.");
    }
    ensureOrderIsEditable(order, "alterada");

    const normalizedDueDate = String(dueDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDueDate)) {
      throw new Error("Informe uma data válida para a previsão.");
    }

    run(
      `
        UPDATE orders
        SET due_date = :dueDate,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: Number(orderId),
        dueDate: normalizedDueDate,
        updatedAt: nowIso()
      }
    );

    const updated = repo.getOrder(orderId);
    writeAuditLog(actor, "ORDER", Number(orderId), "ORDER_DUE_DATE_UPDATE", { dueDate: order.due_date || "" }, { dueDate: normalizedDueDate }, {
      code: order.code
    });
    return updated;
  }


  function recalculateOrderAmounts(orderId) {
    const order = repo.getOrder(orderId);
    if (!order) {
      throw new Error("OS nao encontrada.");
    }
    const itemsTotal = (order.items || []).reduce((sum, item) => sum + Number(item.unit_price || item.unitPrice || 0) * Number(item.quantity || 1), 0);
    const servicesTotal = (order.services || []).reduce((sum, item) => sum + Number(item.line_total || item.lineTotal || 0 || (Number(item.unit_price || item.unitPrice || 0) * Number(item.quantity || 1))), 0);
    const requestedTotal = (order.requested_products || []).reduce((sum, item) => {
      if (String(item.status || 'PENDENTE') === 'NEGADO') {
        return sum;
      }
      return sum + Number(item.sale_price || item.salePrice || 0) * Number(item.quantity || 1);
    }, 0);
    const quoteAmount = itemsTotal + servicesTotal + requestedTotal;
    const totalAmount = Math.max(0, quoteAmount - Number(order.discount_amount || 0));
    run(
      `
        UPDATE orders
        SET quote_amount = :quoteAmount,
            service_amount = :serviceAmount,
            total_amount = :totalAmount,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: Number(orderId),
        quoteAmount,
        serviceAmount: servicesTotal,
        totalAmount,
        updatedAt: nowIso()
      }
    );
    return repo.getOrder(orderId);
  }

  function listPurchaseRequests(filters = {}) {
    const rows = all(
      `
        SELECT
          rp.*,
          o.code AS order_code,
          o.client_id,
          o.equipment,
          o.due_date,
          o.order_status,
          c.name AS client_name
        FROM order_requested_products rp
        JOIN orders o ON o.id = rp.order_id
        JOIN clients c ON c.id = o.client_id
        ORDER BY rp.created_at DESC, rp.id DESC
      `
    );

    return rows.filter((row) => {
      if (String(filters.includeResolved) !== 'true' && String(row.status || 'PENDENTE') !== 'PENDENTE') {
        return false;
      }
      if (filters.search && !matchesSearch(`${row.product_name} ${row.order_code} ${row.client_name} ${row.equipment}`, filters.search)) {
        return false;
      }
      return true;
    });
  }

  function listLowStockPurchaseItems(filters = {}) {
    return repo.listCatalogItems({ ...filters, activeOnly: true }).filter((item) => Number(item.min_stock || 0) > 0 && Number(item.stock_quantity || 0) <= Number(item.min_stock || 0));
  }

  function addOrderRequestedProduct(orderId, payload = {}) {
    const actor = payload._actor || payload.actor || null;
    const order = repo.getOrder(Number(orderId));
    if (!order) {
      throw new Error('OS nao encontrada.');
    }
    ensureOrderIsEditable(order, "alterada");
    const name = normalizeText(payload.name || payload.product_name);
    const quantity = Math.max(1, toInteger(payload.quantity, 1));
    const salePrice = Math.max(0, toNumber(payload.salePrice ?? payload.sale_price) ?? 0);
    if (!name) {
      throw new Error('Informe o produto solicitado.');
    }
    run(
      `
        INSERT INTO order_requested_products (
          order_id, product_name, quantity, sale_price, status, created_at, updated_at
        )
        VALUES (
          :orderId, :productName, :quantity, :salePrice, 'PENDENTE', :createdAt, :updatedAt
        )
      `,
      {
        orderId: Number(orderId),
        productName: name,
        quantity,
        salePrice,
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
    );
    const updated = recalculateOrderAmounts(Number(orderId));
    syncOrderRevenueEntry(updated, requireStoreContext(payload).id, actor);
    writeAuditLog(actor, 'ORDER', Number(orderId), 'ORDER_REQUESTED_PRODUCT_ADD', order, updated, { code: order.code, productName: name });
    return updated;
  }

  function addOrderStockItem(orderId, payload = {}) {
    const actor = payload._actor || payload.actor || null;
    const order = repo.getOrder(Number(orderId));
    if (!order) {
      throw new Error('OS nao encontrada.');
    }
    ensureOrderIsEditable(order, "alterada");
    const catalogItemId = Number(payload.catalogItemId || payload.catalog_item_id || 0);
    const quantity = Math.max(1, toInteger(payload.quantity, 1));
    const catalogItem = get('SELECT * FROM catalog_items WHERE id = :id', { id: catalogItemId });
    if (!catalogItem) {
      throw new Error('Produto de estoque nao encontrado.');
    }
    if (Number(catalogItem.stock_quantity || 0) < quantity) {
      throw new Error(`Estoque insuficiente para ${catalogItem.name}.`);
    }
    run(
      `
        INSERT INTO order_items (
          order_id, catalog_item_id, item_name, sku, category, item_condition, quantity, unit_cost, unit_price
        )
        VALUES (
          :orderId, :catalogItemId, :itemName, :sku, :category, :itemCondition, :quantity, :unitCost, :unitPrice
        )
      `,
      {
        orderId: Number(orderId),
        catalogItemId,
        itemName: catalogItem.name,
        sku: catalogItem.sku || '',
        category: catalogItem.category || '',
        itemCondition: catalogItem.item_condition || '',
        quantity,
        unitCost: Number(catalogItem.cost_amount || 0),
        unitPrice: Number(catalogItem.price_amount || 0)
      }
    );
    const orderItemId = Number(get("SELECT last_insert_rowid() AS id")?.id || 0);
    const consumption = repo.consumeCatalogStock(catalogItemId, quantity, {
      sourceType: "ORDER_ITEM",
      sourceId: orderItemId
    });
    run("UPDATE order_items SET unit_cost = :unitCost WHERE id = :id", {
      id: orderItemId,
      unitCost: Number(consumption.unitCost || 0)
    });
    const updated = recalculateOrderAmounts(Number(orderId));
    syncOrderRevenueEntry(updated, requireStoreContext(payload).id, actor);
    syncLowStockNotifications();
    writeAuditLog(actor, 'ORDER', Number(orderId), 'ORDER_STOCK_ITEM_ADD', order, updated, { code: order.code, catalogItemId, quantity });
    return updated;
  }

  function confirmRequestedProductPurchase(requestId, payload = {}) {
    const actor = payload._actor || payload.actor || null;
    const store = requireStoreContext(payload);
    const request = get('SELECT * FROM order_requested_products WHERE id = :id', { id: Number(requestId) });
    if (!request) {
      throw new Error('Produto solicitado nao encontrado.');
    }
    if (String(request.status || 'PENDENTE') !== 'PENDENTE') {
      throw new Error('Esse produto solicitado ja foi resolvido.');
    }
    const order = repo.getOrder(Number(request.order_id));
    if (!order) {
      throw new Error('OS nao encontrada para este produto solicitado.');
    }
    const costAmount = Math.max(0, toNumber(payload.costAmount ?? payload.purchaseCost ?? payload.purchase_cost) ?? 0);
    if (costAmount <= 0) {
      throw new Error('Informe o valor de custo da compra.');
    }
    const financeEntry = saveFinanceEntry({
      entryType: 'DESPESA',
      category: 'Compra de produto',
      description: `Compra para OS ${order.code}: ${request.product_name}`,
      amount: costAmount * Math.max(1, Number(request.quantity || 1)),
      entryDate: getLocalDateString(),
      paymentMethod: normalizeText(
        payload.paymentMethod,
        request.purchase_cash_account_id
          ? (get("SELECT code FROM store_cash_accounts WHERE id = :id AND store_id = :storeId", { id: Number(request.purchase_cash_account_id), storeId: store.id })?.code || 'CAIXINHA_LOJA')
          : 'CAIXINHA_LOJA'
      ) || 'CAIXINHA_LOJA',
      storeId: store.id,
      cashAccountId: payload.cashAccountId
        ? Number(payload.cashAccountId)
        : (request.purchase_cash_account_id ? Number(request.purchase_cash_account_id) : resolveCashAccountId(store.id, null, payload.paymentMethod)),
      rawPayload: {
        source: 'ORDER_REQUEST_PURCHASE',
        orderId: Number(order.id),
        orderCode: order.code,
        requestId: Number(request.id),
        productName: request.product_name
      },
      _actor: actor
    });
    run(
      `
        UPDATE order_requested_products
        SET status = 'COMPRADO',
            purchase_cost = :purchaseCost,
            finance_entry_id = :financeEntryId,
            purchased_at = :purchasedAt,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: Number(requestId),
        purchaseCost: costAmount,
        financeEntryId: Number(financeEntry.id),
        purchasedAt: nowIso(),
        updatedAt: nowIso()
      }
    );
    const updated = recalculateOrderAmounts(Number(order.id));
    writeAuditLog(actor, 'ORDER', Number(order.id), 'ORDER_REQUEST_PURCHASE_CONFIRM', request, updated, { code: order.code, requestId: Number(requestId) });
    return { order: updated, financeEntry, request: get('SELECT * FROM order_requested_products WHERE id = :id', { id: Number(requestId) }) };
  }

  function denyRequestedProductPurchase(requestId, payload = {}) {
    const actor = payload._actor || payload.actor || null;
    const request = get('SELECT * FROM order_requested_products WHERE id = :id', { id: Number(requestId) });
    if (!request) {
      throw new Error('Produto solicitado nao encontrado.');
    }
    const order = repo.getOrder(Number(request.order_id));
    if (!order) {
      throw new Error('OS nao encontrada para este produto solicitado.');
    }
    run(
      `
        UPDATE order_requested_products
        SET status = 'NEGADO',
            denied_at = :deniedAt,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id: Number(requestId),
        deniedAt: nowIso(),
        updatedAt: nowIso()
      }
    );
    const updated = recalculateOrderAmounts(Number(order.id));
    syncOrderRevenueEntry(updated, requireStoreContext(payload).id, actor);
    writeAuditLog(actor, 'ORDER', Number(order.id), 'ORDER_REQUEST_PURCHASE_DENY', request, updated, { code: order.code, requestId: Number(requestId) });
    return updated;
  }

  function calendarStatusColor(orderStatus) {
    switch (String(orderStatus || "ABERTA")) {
      case "CONCLUIDA":
        return "#198754";
      case "EM_ANDAMENTO":
        return "#fd7e14";
      case "CANCELADA":
        return "#dc3545";
      case "ABERTA":
      default:
        return "#0d6efd";
    }
  }

  function listCalendarEntries(filters = {}) {
    const orders = repo.listOrders(filters);
    return orders.map((order) => {
      const latestEvent = get(
        `
          SELECT title, actor_name, event_date
          FROM order_timeline_events
          WHERE order_id = :orderId
          ORDER BY event_date DESC, id DESC
          LIMIT 1
        `,
        { orderId: order.id }
      );
      const latestAudit = get(
        `
          SELECT actor_name, created_at
          FROM audit_logs
          WHERE entity_type = 'ORDER' AND entity_id = :orderId
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
        { orderId: order.id }
      );
      const actorName = normalizeText(latestEvent?.actor_name || latestAudit?.actor_name, "Sistema") || "Sistema";
      const latestTitle = normalizeText(latestEvent?.title, order.equipment || "OS aberta") || "OS aberta";
      return {
        id: order.id,
        code: order.code,
        title: `${order.code} | ${actorName} | ${latestTitle}`,
        subtitle: order.client_name,
        startDate: order.opened_at,
        endDate: order.delivered_at || order.concluded_at || order.due_date || order.opened_at,
        orderStatus: order.order_status,
        approvalStatus: order.approval_status,
        color: calendarStatusColor(order.order_status),
        clientName: order.client_name,
        technicianName: actorName,
        totalAmount: order.total_amount
      };
    });
  }

  function buildOperationalTrend(baseTrend = [], posSales = []) {
    const grouped = new Map();

    for (const item of baseTrend) {
      grouped.set(item.label, {
        label: item.label,
        orderRevenue: Number(item.revenue || 0),
        pdvRevenue: 0,
        revenue: Number(item.revenue || 0),
        totalOrders: Number(item.totalOrders || 0),
        totalSales: 0
      });
    }

    for (const sale of posSales) {
      const label = String(sale.created_at || '').slice(0, 7);
      if (!label) {
        continue;
      }
      const current = grouped.get(label) || {
        label,
        orderRevenue: 0,
        pdvRevenue: 0,
        revenue: 0,
        totalOrders: 0,
        totalSales: 0
      };
      current.pdvRevenue += Number(sale.total_amount || 0);
      current.totalSales += 1;
      current.revenue = current.orderRevenue + current.pdvRevenue;
      grouped.set(label, current);
    }

    return [...grouped.values()].sort((left, right) => String(left.label).localeCompare(String(right.label)));
  }

  function readCashManagementTypeValue(cashManagement, label) {
    const target = legacySlug(label);
    const match = (cashManagement?.typeSummary?.rows || []).find((row) => legacySlug(row.label || "") === target);
    return Number(match?.value || 0);
  }

  function getDashboardSummary(filters = {}) {
    const basePayload = baseDashboard(filters);
    const orders = repo.listOrders(filters);
    const activeOrders = orders.filter((order) => order.order_status !== 'CANCELADA');
    const posSales = listPosSales(filters);
    const orderRevenue = activeOrders.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const pdvRevenue = posSales.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const anonymousPdvSales = posSales.filter((sale) => Number(sale.client_id || 0) <= 0).length;
    const anonymousPdvRevenue = posSales
      .filter((sale) => Number(sale.client_id || 0) <= 0)
      .reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
    const totalEntries = orderRevenue + pdvRevenue;
    const expense = Number(basePayload.kpis.expense || 0);
    const operationalCount = activeOrders.length + posSales.length;

    return {
      ...basePayload,
      kpis: {
        ...basePayload.kpis,
        orderRevenue,
        pdvRevenue,
        anonymousPdvSales,
        anonymousPdvRevenue,
        totalEntries,
        revenue: totalEntries,
        averageTicket: totalEntries / Math.max(operationalCount, 1),
        margin: totalEntries - expense,
        projectedRevenue90d: totalEntries * 3
      },
      charts: {
        ...basePayload.charts,
        trend: buildOperationalTrend(basePayload.charts.trend, posSales)
      },
      notifications: listNotifications({ unreadOnly: true }).slice(0, 10),
      performance: getPerformanceMetrics(filters).slice(0, 6)
    };
  }

  function getReports(filters = {}) {
    const basePayload = baseReports(filters);
    const globalInventory = repo
      .listCatalogItems({ activeOnly: true })
      .filter((item) => !String(item.deleted_at || "").trim());
    const posSales = listPosSales(filters);
    const financeWorkbook = getFinanceWorkbookView(filters);
    const reportFinanceEntries = listFinanceReportEntries(filters);
    const financeEntries = reportFinanceEntries.filter((entry) => normalizeCashFlowSection(entry) !== "COMPRAS");
    const purchaseFinanceEntries = reportFinanceEntries.filter((entry) => normalizeCashFlowSection(entry) === "COMPRAS");
    const replenishmentOnlyEntries = listReplenishmentReportEntries(filters)
      .filter((entry) => !entry.finance_entry_id)
      .filter((entry) => !purchaseFinanceEntries.some((financeEntry) => Number(financeEntry.replenishment_id || 0) === Number(entry.replenishment_id || 0)));
    const purchases = [...purchaseFinanceEntries, ...replenishmentOnlyEntries]
      .sort((left, right) => {
        const leftDate = String(left.entry_date || "");
        const rightDate = String(right.entry_date || "");
        if (leftDate !== rightDate) {
          return rightDate.localeCompare(leftDate);
        }
        return Number(right.replenishment_id || right.id || 0) - Number(left.replenishment_id || left.id || 0);
      });
    const totalPdvValue = posSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
    const totalEntries = Number(basePayload.summary.totalOrderValue || 0) + totalPdvValue;
    const rawReportedExpenses = financeEntries
      .filter((entry) => String(entry.entry_type || "").toUpperCase() === "DESPESA")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const officialExpenseTotal = roundCurrency(
      readCashManagementTypeValue(financeWorkbook.cashManagement, "desp cartao sinic")
      + readCashManagementTypeValue(financeWorkbook.cashManagement, "desp cartao smes")
    );
    const totalPurchaseExpenses = purchases
      .filter((entry) => String(entry.entry_type || "").toUpperCase() === "DESPESA")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const totalRevenue = financeEntries
      .filter((entry) => String(entry.entry_type || "").toUpperCase() === "RECEITA")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return {
      ...basePayload,
      summary: {
        ...basePayload.summary,
        totalRevenue,
        totalExpenses: officialExpenseTotal > 0 ? officialExpenseTotal : rawReportedExpenses,
        totalPurchaseExpenses,
        totalInventoryValue: globalInventory.reduce((sum, item) => sum + Number(item.stock_value || 0), 0),
        totalInventoryUnits: globalInventory.reduce((sum, item) => sum + Number(item.stock_quantity || 0), 0),
        totalInventoryItems: globalInventory.length,
        totalPdvValue,
        totalEntries,
        officialCashBalance: Number(financeWorkbook.cashManagement?.currentBalance?.value || 0),
        financeDifference: Number(financeWorkbook.cashManagement?.topSummary?.differenceValue || 0)
      },
      finance: financeEntries,
      purchases,
      pdvSales: posSales,
      notifications: listNotifications(filters),
      performance: getPerformanceMetrics(filters),
      calendar: listCalendarEntries(filters)
    };
  }
}
