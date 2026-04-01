import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  APPROVAL_STATUSES,
  CATALOG_CATEGORIES,
  CATALOG_SUBCATEGORIES_MAP,
  DEMO_USERS,
  FINANCE_CATEGORY_SEEDS,
  ENTRY_TYPES,
  ITEM_CONDITIONS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  ROLES,
  STORE_CASH_ACCOUNT_SEEDS,
  TASK_CONTACT_CHANNELS,
  TASK_PRIORITIES,
  TASK_STATUSES
} from "./constants.mjs";
import {
  computeDueDateFromMinutes,
  ensureOrderCanAdvance,
  formatOrderCode,
  getLocalDateParts,
  getLocalDateString,
  isBetweenDates,
  matchesSearch,
  normalizeOrderInput,
  normalizeText,
  nowIso,
  toNumber,
  calculateProgressiveLineTotal
} from "./domain.mjs";

const DEFAULT_STORAGE_ROOT = join(process.cwd(), "server", "storage");

function resolveRuntimePath(value, fallback) {
  if (value === ":memory:") {
    return ":memory:";
  }
  return value ? resolve(process.cwd(), String(value)) : fallback;
}

function serializeStructuredValue(value, fallback = "") {
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

export function pickNamedParams(sql, params = {}) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return params;
  }

  const namedParams = [...sql.matchAll(/[:@$]([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((match) => match[1]);
  if (namedParams.length === 0) {
    return params;
  }

  return namedParams.reduce((filtered, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      filtered[key] = params[key];
    }
    return filtered;
  }, {});
}

export function createRepository(options = {}) {
  const storageRoot = resolveRuntimePath(options.storageRoot ?? process.env.CRM_STORAGE_ROOT, DEFAULT_STORAGE_ROOT);
  const dbPath = resolveRuntimePath(
    options.dbPath ?? process.env.CRM_DB_PATH,
    join(storageRoot, "database", "crm.sqlite")
  );
  const uploadsRoot = resolveRuntimePath(
    options.uploadsRoot ?? process.env.CRM_UPLOADS_ROOT,
    join(storageRoot, "uploads")
  );

  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  mkdirSync(uploadsRoot, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");

  const repo = {
    db,
    initSchema,
    seedDemo,
    getMeta,
    authenticateUser,
    createSession,
    getUserBySession,
    destroySession,
    clearBusinessData,
    listClients,
    getClient,
    saveClient,
    deleteClient,
    listCatalogItems,
    getCatalogItem,
    saveCatalogItem,
    replenishCatalogItem,
    replenishCatalogBatch,
    revertCatalogReplenishment,
    deleteCatalogItems,
    listServices,
    getService,
    saveService,
    deleteService,
    listOrders,
    getOrder,
    deleteOrder,
    saveOrder,
    listFinanceCategories,
    saveFinanceCategory,
    deleteFinanceCategory,
    reorderFinanceCategories,
    listFinanceEntries,
    saveFinanceEntry,
    getDashboardSummary,
    getReports,
    close() {
      db.close();
    }
  };

  initSchema();
  if (options.seedDemo !== false) {
    seedDemo();
  }

  return repo;

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

  function tableSql(tableName) {
    return get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = :tableName", { tableName })?.sql || "";
  }

  function hasColumn(tableName, columnName) {
    return all(`PRAGMA table_info(${tableName})`).some((column) => column.name === columnName);
  }

  function addColumnIfMissing(tableName, columnName, definition) {
    if (!hasColumn(tableName, columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
    }
  }

  function normalizeCatalogItem(row) {
    if (!row) {
      return row;
    }

    return {
      ...row,
      sku: row.sku || "",
      brand: row.brand || "",
      description: row.description || "",
      location_type: row.location_type || (Number(row.is_store_inventory || 0) === 1 ? "INVENTARIO" : "ESTOQUE"),
      is_store_inventory: Number(row.is_store_inventory || 0)
    };
  }

  function migrateCatalogItemsSchema() {
    const schemaSql = tableSql("catalog_items");
    if (!/sku\s+TEXT\s+NOT\s+NULL/i.test(schemaSql)) {
      return;
    }

    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(`
        CREATE TABLE IF NOT EXISTS catalog_items__new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT UNIQUE,
          name TEXT NOT NULL,
          brand TEXT DEFAULT '',
        category TEXT NOT NULL,
        subcategory TEXT DEFAULT '',
        compatibility TEXT DEFAULT '',
        description TEXT DEFAULT '',
        item_condition TEXT NOT NULL,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        min_stock INTEGER NOT NULL DEFAULT 0,
        cost_amount REAL NOT NULL DEFAULT 0,
        price_amount REAL NOT NULL DEFAULT 0,
        is_complete INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          is_store_inventory INTEGER NOT NULL DEFAULT 0,
          location_type TEXT NOT NULL DEFAULT 'ESTOQUE',
          deleted_at TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO catalog_items__new (
          id, sku, name, brand, category, subcategory, compatibility, description, item_condition, stock_quantity,
          min_stock, cost_amount, price_amount, is_complete, active, is_store_inventory, deleted_at, created_at, updated_at
        )
        SELECT
          id, NULLIF(sku, ''), name, COALESCE(brand, ''), category, subcategory, compatibility, COALESCE(description, ''), item_condition, stock_quantity,
          min_stock, cost_amount, price_amount, is_complete, active, COALESCE(is_store_inventory, 0), '', created_at, updated_at
        FROM catalog_items;

      DROP TABLE catalog_items;
      ALTER TABLE catalog_items__new RENAME TO catalog_items;
    `);
    db.exec("PRAGMA foreign_keys = ON;");
  }

  function initSchema() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT DEFAULT '',
        document TEXT DEFAULT '',
        address TEXT DEFAULT '',
        photo_path TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

        CREATE TABLE IF NOT EXISTS catalog_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT UNIQUE,
          name TEXT NOT NULL,
          brand TEXT DEFAULT '',
          category TEXT NOT NULL,
          subcategory TEXT DEFAULT '',
          compatibility TEXT DEFAULT '',
          description TEXT DEFAULT '',
          item_condition TEXT NOT NULL,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        min_stock INTEGER NOT NULL DEFAULT 0,
        cost_amount REAL NOT NULL DEFAULT 0,
        price_amount REAL NOT NULL DEFAULT 0,
          is_complete INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          is_store_inventory INTEGER NOT NULL DEFAULT 0,
          location_type TEXT NOT NULL DEFAULT 'ESTOQUE',
          deleted_at TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        client_id INTEGER NOT NULL,
        phone_snapshot TEXT DEFAULT '',
        equipment TEXT NOT NULL,
        defect TEXT NOT NULL,
        extras TEXT DEFAULT '',
        photo_path TEXT DEFAULT '',
        technician_name TEXT DEFAULT '',
        due_date TEXT DEFAULT '',
        order_status TEXT NOT NULL,
        approval_status TEXT NOT NULL,
        quote_amount REAL DEFAULT NULL,
        pre_approved_limit REAL DEFAULT NULL,
        actual_amount REAL DEFAULT NULL,
        service_amount REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        payment_method TEXT DEFAULT 'NAO_DEFINIDO',
        notes TEXT DEFAULT '',
        opened_at TEXT NOT NULL,
        concluded_at TEXT DEFAULT '',
        delivered_at TEXT DEFAULT '',
        cancelled_at TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        catalog_item_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        sku TEXT NOT NULL,
        category TEXT NOT NULL,
        item_condition TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_cost REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS service_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        price_amount REAL NOT NULL DEFAULT 0,
        pricing_mode TEXT NOT NULL DEFAULT 'FIXED',
        additional_price_amount REAL NOT NULL DEFAULT 0,
        estimated_minutes INTEGER NOT NULL DEFAULT 0,
        available_in_order INTEGER NOT NULL DEFAULT 1,
        available_in_pdv INTEGER NOT NULL DEFAULT 0,
        allow_custom_price INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        service_name TEXT NOT NULL,
        description TEXT DEFAULT '',
        estimated_minutes INTEGER NOT NULL DEFAULT 0,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES service_catalog(id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS order_requested_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        sale_price REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDENTE',
        purchase_cost REAL DEFAULT NULL,
        finance_entry_id INTEGER DEFAULT NULL,
        purchased_at TEXT DEFAULT '',
        denied_at TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (finance_entry_id) REFERENCES finance_entries(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS finance_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_type TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        entry_date TEXT NOT NULL,
        payment_method TEXT DEFAULT 'NAO_DEFINIDO',
        order_id INTEGER DEFAULT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS finance_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_type TEXT NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(entry_type, name)
      );

      CREATE TABLE IF NOT EXISTS stock_replenishments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalog_item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        new_cost_amount REAL NOT NULL,
        new_price_amount REAL NOT NULL,
        previous_cost_amount REAL DEFAULT NULL,
        previous_price_amount REAL DEFAULT NULL,
        notes TEXT DEFAULT '',
        actor_user_id INTEGER DEFAULT NULL,
        actor_name TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    addColumnIfMissing('clients', 'photo_path', "TEXT DEFAULT ''");
    addColumnIfMissing('catalog_items', 'description', "TEXT DEFAULT ''");
    addColumnIfMissing('catalog_items', 'brand', "TEXT DEFAULT ''");
      addColumnIfMissing('catalog_items', 'is_store_inventory', 'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing('catalog_items', 'location_type', "TEXT NOT NULL DEFAULT 'ESTOQUE'");
      addColumnIfMissing('catalog_items', 'deleted_at', "TEXT DEFAULT ''");
      addColumnIfMissing('catalog_items', 'legacy_source_id', "TEXT DEFAULT ''");
      addColumnIfMissing('catalog_items', 'legacy_source_sheet', "TEXT DEFAULT ''");
    addColumnIfMissing('finance_entries', 'store_id', 'INTEGER DEFAULT NULL');
    addColumnIfMissing('finance_entries', 'cash_account_id', 'INTEGER DEFAULT NULL');
    addColumnIfMissing('finance_entries', 'raw_payload', "TEXT DEFAULT ''");
    addColumnIfMissing('finance_entries', 'source_workbook', "TEXT DEFAULT ''");
    addColumnIfMissing('finance_entries', 'source_sheet', "TEXT DEFAULT ''");
    addColumnIfMissing('finance_entries', 'source_row', 'INTEGER DEFAULT NULL');
    addColumnIfMissing('finance_entries', 'legacy_section', "TEXT DEFAULT ''");
    addColumnIfMissing('stock_replenishments', 'source_workbook', "TEXT DEFAULT ''");
    addColumnIfMissing('stock_replenishments', 'source_sheet', "TEXT DEFAULT ''");
    addColumnIfMissing('stock_replenishments', 'source_row', 'INTEGER DEFAULT NULL');
    addColumnIfMissing('stock_replenishments', 'raw_payload', "TEXT DEFAULT ''");
    addColumnIfMissing('stock_replenishments', 'finance_entry_id', 'INTEGER DEFAULT NULL');
    addColumnIfMissing('stock_replenishments', 'extra_finance_entry_id', 'INTEGER DEFAULT NULL');
    addColumnIfMissing('service_catalog', 'allow_custom_price', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('service_catalog', 'pricing_mode', "TEXT NOT NULL DEFAULT 'FIXED'");
    addColumnIfMissing('service_catalog', 'additional_price_amount', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing('order_services', 'line_total', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing('order_requested_products', 'quantity', 'INTEGER NOT NULL DEFAULT 1');
    addColumnIfMissing('order_requested_products', 'sale_price', 'REAL NOT NULL DEFAULT 0');
    addColumnIfMissing('order_requested_products', 'status', "TEXT NOT NULL DEFAULT 'PENDENTE'");
    addColumnIfMissing('order_requested_products', 'purchase_cost', 'REAL DEFAULT NULL');
    addColumnIfMissing('order_requested_products', 'finance_entry_id', 'INTEGER DEFAULT NULL');
    addColumnIfMissing('order_requested_products', 'purchased_at', "TEXT DEFAULT ''");
    addColumnIfMissing('order_requested_products', 'denied_at', "TEXT DEFAULT ''");
    migrateCatalogItemsSchema();
    run("UPDATE catalog_items SET location_type = CASE WHEN COALESCE(is_store_inventory, 0) = 1 THEN 'INVENTARIO' ELSE 'ESTOQUE' END WHERE location_type IS NULL OR location_type = ''");
    seedFinanceCategories();
    run("UPDATE orders SET approval_status = 'AGUARDANDO_APROVACAO' WHERE approval_status IS NULL OR approval_status = '' OR approval_status = 'SEM_ORCAMENTO'");
  }

  function seedFinanceCategories() {
    const timestamp = nowIso();
    for (const [entryType, categories] of Object.entries(FINANCE_CATEGORY_SEEDS)) {
      categories.forEach((name, index) => {
        const existing = get(
          "SELECT id FROM finance_categories WHERE entry_type = :entryType AND lower(name) = lower(:name)",
          { entryType, name }
        );
        if (existing) {
          run(
            `
              UPDATE finance_categories
              SET active = 1,
                  sort_order = :sortOrder,
                  updated_at = :updatedAt
              WHERE id = :id
            `,
            {
              id: existing.id,
              sortOrder: index + 1,
              updatedAt: timestamp
            }
          );
          return;
        }

        run(
          `
            INSERT INTO finance_categories (entry_type, name, active, sort_order, created_at, updated_at)
            VALUES (:entryType, :name, 1, :sortOrder, :createdAt, :updatedAt)
          `,
          {
            entryType,
            name,
            sortOrder: index + 1,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
      });
    }
  }

  function seedDemo() {
    const demoSeeded = get("SELECT value FROM app_settings WHERE key = 'demo_seeded_at'");
    const totalUsers = get("SELECT COUNT(*) AS total FROM users").total;
    if (totalUsers === 0) {
      const timestamp = nowIso();
      for (const user of DEMO_USERS) {
        run(
          `
            INSERT INTO users (name, email, password, role, created_at, updated_at)
            VALUES (:name, :email, :password, :role, :createdAt, :updatedAt)
          `,
          {
            name: user.name,
            email: user.email,
            password: user.password,
            role: user.role,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
      }
    }

    if (demoSeeded) {
      return;
    }

    const totalClients = get("SELECT COUNT(*) AS total FROM clients").total;
    if (totalClients === 0) {
      const timestamp = nowIso();
      const demoClients = [
        {
          name: "Lucas Andrade",
          phone: "(11) 99999-1001",
          email: "lucas@cliente.com",
          document: "123.456.789-00",
          address: "Rua da Tecnologia, 120 - Sao Paulo",
          notes: "Cliente recorrente com foco em notebooks."
        },
        {
          name: "Marina Souza",
          phone: "(11) 98888-2002",
          email: "marina@cliente.com",
          document: "987.654.321-00",
          address: "Av. Central, 450 - Campinas",
          notes: "Prefere contato por WhatsApp."
        },
        {
          name: "Empresa Solucao TI",
          phone: "(11) 97777-3003",
          email: "compras@solucaoti.com",
          document: "18.235.111/0001-12",
          address: "Rua das Empresas, 88 - Guarulhos",
          notes: "Conta corporativa com equipamentos recorrentes."
        },
        {
          name: "Ana Ribeiro",
          phone: "(11) 96666-4004",
          email: "ana@cliente.com",
          document: "321.789.654-11",
          address: "Rua Primavera, 920 - Osasco",
          notes: "Valoriza previsao rapida de entrega."
        }
      ];

      for (const client of demoClients) {
        run(
          `
            INSERT INTO clients (name, phone, email, document, address, notes, created_at, updated_at)
            VALUES (:name, :phone, :email, :document, :address, :notes, :createdAt, :updatedAt)
          `,
          {
            ...client,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
      }
    }

    const totalCatalog = get("SELECT COUNT(*) AS total FROM catalog_items").total;
    if (totalCatalog === 0) {
      const timestamp = nowIso();
      const demoItems = [
        {
          sku: "BE-SSD-480",
          name: "SSD 480GB SATA",
          category: "Armazenamento",
          subcategory: "SSD SATA 2.5",
          compatibility: "Notebook e desktop",
          item_condition: "NOVA",
          stock_quantity: 12,
          min_stock: 4,
          cost_amount: 180,
          price_amount: 249,
          is_complete: 0
        },
        {
          sku: "BE-RAM-16-DDR4",
          name: "Memória 16GB DDR4",
          category: "Memória RAM",
          subcategory: "DDR4",
          compatibility: "DDR4 2666/3200",
          item_condition: "NOVA",
          stock_quantity: 8,
          min_stock: 3,
          cost_amount: 170,
          price_amount: 239,
          is_complete: 0
        },
        {
          sku: "BE-SCREEN-NB15",
          name: "Tela notebook 15.6 HD",
          category: "Notebooks e Portáteis",
          subcategory: "Notebook",
          compatibility: "Conector 30 pinos",
          item_condition: "NOVA",
          stock_quantity: 3,
          min_stock: 2,
          cost_amount: 290,
          price_amount: 420,
          is_complete: 0
        },
        {
          sku: "BE-BAT-DELL",
          name: "Bateria Dell Inspiron",
          category: "Baterias e Carregadores",
          subcategory: "Bateria notebook",
          compatibility: "Inspiron 14/15",
          item_condition: "NOVA",
          stock_quantity: 5,
          min_stock: 2,
          cost_amount: 140,
          price_amount: 219,
          is_complete: 0
        },
        {
          sku: "BE-PC-I5-16-512",
          name: "Desktop Intel i5 16GB 512GB SSD",
          category: "Computadores",
          subcategory: "PC completo",
          compatibility: "Uso corporativo",
          item_condition: "USADA",
          stock_quantity: 2,
          min_stock: 1,
          cost_amount: 1450,
          price_amount: 2190,
          is_complete: 1
        },
        {
          sku: "BE-CHG-65W",
          name: "Carregador 65W universal",
          category: "Baterias e Carregadores",
          subcategory: "Carregador notebook",
          compatibility: "Multiplos conectores",
          item_condition: "NOVA",
          stock_quantity: 10,
          min_stock: 3,
          cost_amount: 70,
          price_amount: 129,
          is_complete: 0
        }
      ];

      for (const item of demoItems) {
        run(
          `
            INSERT INTO catalog_items (
              sku, name, category, subcategory, compatibility, item_condition, stock_quantity,
              min_stock, cost_amount, price_amount, is_complete, active, created_at, updated_at
            )
            VALUES (
              :sku, :name, :category, :subcategory, :compatibility, :item_condition, :stock_quantity,
              :min_stock, :cost_amount, :price_amount, :is_complete, 1, :createdAt, :updatedAt
            )
          `,
          {
            ...item,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
      }
    }

    const totalOrders = get("SELECT COUNT(*) AS total FROM orders").total;
    if (totalOrders === 0) {
      const clients = all("SELECT id, phone FROM clients ORDER BY id");
      const catalog = all("SELECT id, cost_amount, price_amount FROM catalog_items ORDER BY id");
      const orders = [
        {
          clientId: clients[0].id,
          phoneSnapshot: clients[0].phone,
          equipment: "Notebook Dell Inspiron 15",
          defect: "Tela quebrada apos queda",
          extras: "Fonte original e mochila",
          technicianName: "Carlos Tecnico",
          dueDate: getLocalDateString(),
          orderStatus: "ABERTA",
          approvalStatus: "PRE_APROVADA",
          quoteAmount: 1350,
          preApprovedLimit: 1400,
          actualAmount: 1390,
          serviceAmount: 420,
          discountAmount: 30,
          paymentMethod: "PIX",
          notes: "Cliente aceita contato por WhatsApp.",
          items: [
            {
              catalogItemId: catalog[2].id,
              quantity: 1,
              unitCost: catalog[2].cost_amount,
              unitPrice: catalog[2].price_amount
            }
          ]
        },
        {
          clientId: clients[1].id,
          phoneSnapshot: clients[1].phone,
          equipment: "MacBook Air M1",
          defect: "Troca de bateria e limpeza interna",
          extras: "Sem carregador",
          technicianName: "Aline Tecnica",
          dueDate: getLocalDateString(),
          orderStatus: "EM_ANDAMENTO",
          approvalStatus: "APROVADA",
          quoteAmount: 900,
          preApprovedLimit: 950,
          actualAmount: 920,
          serviceAmount: 300,
          discountAmount: 0,
          paymentMethod: "CARTAO",
          notes: "Aguardando retirada.",
          items: [
            {
              catalogItemId: catalog[3].id,
              quantity: 1,
              unitCost: catalog[3].cost_amount,
              unitPrice: catalog[3].price_amount
            }
          ]
        },
        {
          clientId: clients[2].id,
          phoneSnapshot: clients[2].phone,
          equipment: "Desktop corporativo Lenovo",
          defect: "Upgrade de memoria e SSD",
          extras: "Maquina de escritorio",
          technicianName: "Carlos Tecnico",
          dueDate: getLocalDateString(),
          orderStatus: "CONCLUIDA",
          approvalStatus: "APROVADA",
          quoteAmount: 950,
          preApprovedLimit: 1100,
          actualAmount: 1030,
          serviceAmount: 180,
          discountAmount: 40,
          paymentMethod: "TRANSFERENCIA",
          notes: "Entrega feita para o setor de compras.",
          items: [
            {
              catalogItemId: catalog[0].id,
              quantity: 1,
              unitCost: catalog[0].cost_amount,
              unitPrice: catalog[0].price_amount
            },
            {
              catalogItemId: catalog[1].id,
              quantity: 1,
              unitCost: catalog[1].cost_amount,
              unitPrice: catalog[1].price_amount
            }
          ]
        },
        {
          clientId: clients[3].id,
          phoneSnapshot: clients[3].phone,
          equipment: "Notebook Acer Aspire 5",
          defect: "Nao liga apos oscilacao",
          extras: "Cliente quer aprovacao antes de trocar placa",
          technicianName: "Aline Tecnica",
          dueDate: getLocalDateString(),
          orderStatus: "ABERTA",
          approvalStatus: "AGUARDANDO_APROVACAO",
          quoteAmount: 780,
          preApprovedLimit: 700,
          actualAmount: 820,
          serviceAmount: 260,
          discountAmount: 0,
          paymentMethod: "NAO_DEFINIDO",
          notes: "Aguardar sinal do cliente.",
          items: [
            {
              catalogItemId: catalog[5].id,
              quantity: 1,
              unitCost: catalog[5].cost_amount,
              unitPrice: catalog[5].price_amount
            }
          ]
        }
      ];

      for (const order of orders) {
        saveOrder(order);
      }
    }

    const totalFinance = get("SELECT COUNT(*) AS total FROM finance_entries").total;
    if (totalFinance === 0) {
      const timestamp = nowIso();
      const demoEntries = [
        {
          entry_type: "DESPESA",
          category: "Marketing",
          description: "Campanha local de anuncios",
          amount: 350,
          entry_date: getLocalDateString(),
          payment_method: "PIX"
        },
        {
          entry_type: "DESPESA",
          category: "Infraestrutura",
          description: "Compra de etiquetas e embalagens",
          amount: 128,
          entry_date: getLocalDateString(),
          payment_method: "DINHEIRO"
        }
      ];

      for (const entry of demoEntries) {
        run(
          `
            INSERT INTO finance_entries (
              entry_type, category, description, amount, entry_date, payment_method, created_at, updated_at
            )
            VALUES (:entry_type, :category, :description, :amount, :entry_date, :payment_method, :createdAt, :updatedAt)
          `,
          {
            ...entry,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
      }
    }

    run(
      `
        INSERT INTO app_settings (key, value)
        VALUES ('demo_seeded_at', :value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      { value: nowIso() }
    );
  }

  function clearBusinessData() {
    return transaction(() => {
      const summary = {
        financeEntries: Number(get("SELECT COUNT(*) AS total FROM finance_entries").total || 0),
        orderItems: Number(get("SELECT COUNT(*) AS total FROM order_items").total || 0),
        orderServices: Number(get("SELECT COUNT(*) AS total FROM order_services").total || 0),
        services: Number(get("SELECT COUNT(*) AS total FROM service_catalog").total || 0),
        orders: Number(get("SELECT COUNT(*) AS total FROM orders").total || 0),
        clients: Number(get("SELECT COUNT(*) AS total FROM clients").total || 0),
        catalogItems: Number(get("SELECT COUNT(*) AS total FROM catalog_items").total || 0)
      };

      run("DELETE FROM finance_entries");
      run("DELETE FROM order_services");
      run("DELETE FROM order_items");
      run("DELETE FROM orders");
      run("DELETE FROM clients");
      run("DELETE FROM service_catalog");
      run("DELETE FROM catalog_items");

      try {
        rmSync(join(uploadsRoot, "os"), { recursive: true, force: true });
      } catch {
        // Best effort cleanup for local order uploads.
      }

      try {
        rmSync(join(uploadsRoot, "clients"), { recursive: true, force: true });
      } catch {
        // Best effort cleanup for local client uploads.
      }

      return {
        success: true,
        summary
      };
    });
  }

  function getMeta() {
    return {
      roles: ROLES,
      orderStatuses: ORDER_STATUSES,
      approvalStatuses: APPROVAL_STATUSES,
      paymentMethods: PAYMENT_METHODS,
      itemConditions: ITEM_CONDITIONS,
      entryTypes: ENTRY_TYPES,
      catalogCategories: CATALOG_CATEGORIES,
      catalogSubcategoriesMap: CATALOG_SUBCATEGORIES_MAP,
      taskStatuses: TASK_STATUSES,
      taskPriorities: TASK_PRIORITIES,
      taskContactChannels: TASK_CONTACT_CHANNELS,
      storeCashAccounts: STORE_CASH_ACCOUNT_SEEDS.map((item) => ({
        code: item.code,
        label: item.name
      })),
      financeCategories: ENTRY_TYPES.reduce((groups, entryType) => {
        groups[entryType.code] = listFinanceCategories(entryType.code);
        return groups;
      }, {})
    };
  }

  function authenticateUser(email, password) {
    return get(
      `
        SELECT id, name, email, role
        FROM users
        WHERE lower(email) = lower(:email) AND password = :password
      `,
      { email, password }
    );
  }

  function createSession(userId) {
    const token = randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    run(
      `
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (:token, :userId, :createdAt, :expiresAt)
      `,
      { token, userId, createdAt, expiresAt }
    );
    return token;
  }

  function getUserBySession(token) {
    if (!token) {
      return null;
    }

    const session = get(
      `
        SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = :token
      `,
      { token }
    );

    if (!session) {
      return null;
    }

    if (session.expires_at < nowIso()) {
      destroySession(token);
      return null;
    }

    return {
      id: session.id,
      name: session.name,
      email: session.email,
      role: session.role
    };
  }

  function destroySession(token) {
    run("DELETE FROM sessions WHERE token = :token", { token });
  }

  function listClients(filters = {}) {
    const rows = all(`
      SELECT
        c.*,
        COUNT(o.id) AS orders_count,
        SUM(CASE WHEN o.order_status = 'CONCLUIDA' THEN o.total_amount ELSE 0 END) AS total_spent,
        SUM(CASE WHEN o.order_status IN ('ABERTA', 'EM_ANDAMENTO') THEN 1 ELSE 0 END) AS open_orders,
        COALESCE(MAX(o.updated_at), c.updated_at) AS last_order_activity
      FROM clients c
      LEFT JOIN orders o ON o.client_id = c.id
      GROUP BY c.id
      ORDER BY last_order_activity DESC, c.name COLLATE NOCASE ASC
    `);

    return rows
      .filter((row) => matchesSearch(`${row.name} ${row.phone} ${row.email} ${row.document}`, filters.search))
      .map((row) => ({
        ...row,
        photo_url: row.photo_path ? `/uploads/${row.photo_path}` : ""
      }));
  }

  function getClient(clientId) {
    const client = get(
      `
        SELECT
          c.id,
          c.name,
          c.phone,
          c.email,
          c.document,
          c.address,
          c.photo_path,
          c.notes,
          c.created_at,
          c.updated_at,
          COUNT(o.id) AS orders_count,
          SUM(CASE WHEN o.order_status = 'CONCLUIDA' THEN o.total_amount ELSE 0 END) AS total_spent,
          SUM(CASE WHEN o.order_status IN ('ABERTA', 'EM_ANDAMENTO') THEN 1 ELSE 0 END) AS open_orders
        FROM clients
        c
        LEFT JOIN orders o ON o.client_id = c.id
        WHERE c.id = :id
        GROUP BY c.id
      `,
      { id: clientId }
    );

    if (!client) {
      return null;
    }

    const history = all(
      `
        SELECT id, code, equipment, order_status, approval_status, total_amount, opened_at, updated_at
        FROM orders
        WHERE client_id = :clientId
        ORDER BY updated_at DESC
      `,
      { clientId }
    );

    return {
      ...client,
      photo_url: client.photo_path ? `/uploads/${client.photo_path}` : "",
      history
    };
  }

  function saveClient(payload) {
    const timestamp = nowIso();
    const normalized = {
      id: payload.id ? Number(payload.id) : null,
      name: normalizeText(payload.name),
      phone: normalizeText(payload.phone),
      email: normalizeText(payload.email),
      document: normalizeText(payload.document),
      address: normalizeText(payload.address),
      notes: normalizeText(payload.notes)
    };
    const existing = normalized.id
      ? get("SELECT id, photo_path FROM clients WHERE id = :id", { id: normalized.id })
      : null;

    if (!normalized.name || !normalized.phone) {
      throw new Error("Nome e telefone do cliente sao obrigatorios.");
    }

    if (normalized.id) {
      if (!existing) {
        throw new Error("Cliente nao encontrado.");
      }

      let photoPath = existing.photo_path || "";
      const shouldRemovePhoto = payload.photoPreview === "" && !payload.photoUpload?.base64;

      if ((payload.photoUpload?.base64 || shouldRemovePhoto) && existing.photo_path) {
        removeUploadDirectoryByRelativePath(existing.photo_path);
        photoPath = "";
      }

      if (payload.photoUpload?.base64) {
        photoPath = saveClientPhoto(normalized.id, payload.photoUpload.base64, payload.photoUpload.name);
      }

      run(
        `
          UPDATE clients
          SET name = :name, phone = :phone, email = :email, document = :document,
              address = :address, photo_path = :photoPath, notes = :notes, updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          ...normalized,
          photoPath,
          updatedAt: timestamp
        }
      );
      return getClient(normalized.id);
    }

    const result = run(
      `
        INSERT INTO clients (name, phone, email, document, address, notes, created_at, updated_at)
        VALUES (:name, :phone, :email, :document, :address, :notes, :createdAt, :updatedAt)
      `,
      (() => {
        const { id: _id, ...insertPayload } = normalized;
        return {
          ...insertPayload,
          createdAt: timestamp,
          updatedAt: timestamp
        };
      })()
    );
    const clientId = Number(result.lastInsertRowid);

    if (payload.photoUpload?.base64) {
      const photoPath = saveClientPhoto(clientId, payload.photoUpload.base64, payload.photoUpload.name);
      run(
        `
          UPDATE clients
          SET photo_path = :photoPath,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          id: clientId,
          photoPath,
          updatedAt: timestamp
        }
      );
    }

    return getClient(clientId);
  }

  function deleteClient(clientId) {
    const client = get(
      `
        SELECT id, photo_path
        FROM clients
        WHERE id = :clientId
      `,
      { clientId }
    );
    const orders = all(
      `
        SELECT id, order_status, photo_path
        FROM orders
        WHERE client_id = :clientId
      `,
      { clientId }
    );

    const photoDirectories = orders
      .map((order) => order.photo_path)
      .filter(Boolean)
      .map((photoPath) => join(uploadsRoot, dirname(photoPath)));

    if (client?.photo_path) {
      photoDirectories.push(join(uploadsRoot, dirname(client.photo_path)));
    }

    const deletedOrders = transaction(() => {
      for (const order of orders) {
        if (order.order_status !== "CANCELADA") {
          restoreStockForOrder(order.id);
        }
        run("DELETE FROM finance_entries WHERE order_id = :orderId", { orderId: order.id });
        run("DELETE FROM orders WHERE id = :orderId", { orderId: order.id });
      }

      run("DELETE FROM clients WHERE id = :clientId", { clientId });
      return orders.length;
    });

    for (const directory of photoDirectories) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Best effort cleanup for local uploads after DB deletion.
      }
    }

    return { success: true, deletedOrders };
  }

  function deleteOrder(orderId) {
    const order = get(
      `
        SELECT id, order_status, photo_path
        FROM orders
        WHERE id = :id
      `,
      { id: orderId }
    );

    if (!order) {
      throw new Error("OS nao encontrada.");
    }

    const photoDirectory = order.photo_path ? join(uploadsRoot, dirname(order.photo_path)) : "";

    transaction(() => {
      if (order.order_status !== "CANCELADA") {
        restoreStockForOrder(order.id);
      }

      run("DELETE FROM finance_entries WHERE order_id = :orderId", { orderId: order.id });
      run("DELETE FROM orders WHERE id = :orderId", { orderId: order.id });
    });

    if (photoDirectory) {
      try {
        rmSync(photoDirectory, { recursive: true, force: true });
      } catch {
        // Best effort cleanup for local uploads after DB deletion.
      }
    }

    return { success: true };
  }

  function listCatalogItems(filters = {}) {
    const rows = all(`
      SELECT
        ci.*,
        (ci.price_amount - ci.cost_amount) AS unit_margin,
        (ci.stock_quantity * ci.price_amount) AS stock_value,
        CASE
          WHEN ci.cost_amount > 0 THEN ROUND(((ci.price_amount - ci.cost_amount) / ci.cost_amount) * 100, 2)
          ELSE 0
        END AS profit_percent,
        COALESCE((
          SELECT ROUND(AVG(sr.new_cost_amount), 2)
          FROM stock_replenishments sr
          WHERE sr.catalog_item_id = ci.id
        ), ci.cost_amount) AS average_cost_amount,
        COALESCE((
          SELECT ROUND(AVG(sr.new_price_amount), 2)
          FROM stock_replenishments sr
          WHERE sr.catalog_item_id = ci.id
        ), ci.price_amount) AS average_price_amount,
        (
          SELECT sr.previous_cost_amount
          FROM stock_replenishments sr
          WHERE sr.catalog_item_id = ci.id
          ORDER BY sr.created_at DESC, sr.id DESC
          LIMIT 1
        ) AS last_previous_cost_amount,
        (
          SELECT sr.previous_price_amount
          FROM stock_replenishments sr
          WHERE sr.catalog_item_id = ci.id
          ORDER BY sr.created_at DESC, sr.id DESC
          LIMIT 1
        ) AS last_previous_price_amount,
        CASE
          WHEN ci.stock_quantity <= 0 THEN 'SEM_ESTOQUE'
          WHEN ci.stock_quantity <= ci.min_stock THEN 'BAIXO'
          ELSE 'SAUDAVEL'
        END AS stock_health,
        CASE
          WHEN ci.stock_quantity <= 0 THEN 'Sem estoque'
          WHEN ci.stock_quantity <= ci.min_stock THEN 'Baixo'
          ELSE 'Saudavel'
        END AS stock_health_label,
        COALESCE((
          SELECT COUNT(DISTINCT oi.order_id)
          FROM order_items oi
          WHERE oi.catalog_item_id = ci.id
        ), 0) AS linked_orders_count,
        COALESCE((
          SELECT COUNT(DISTINCT oi.order_id)
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.catalog_item_id = ci.id
            AND o.order_status NOT IN ('CANCELADA', 'CONCLUIDA')
        ), 0) AS active_orders_count,
        COALESCE((
          SELECT SUM(oi.quantity)
          FROM order_items oi
          WHERE oi.catalog_item_id = ci.id
        ), 0) AS total_quantity_used,
        COALESCE((
          SELECT SUM(oi.quantity)
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.catalog_item_id = ci.id
            AND o.order_status IN ('ABERTA', 'EM_ANDAMENTO')
        ), 0) AS open_quantity,
        COALESCE((
          SELECT o.code
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.catalog_item_id = ci.id
          ORDER BY o.updated_at DESC, o.id DESC
          LIMIT 1
        ), '') AS last_order_code,
        COALESCE((
          SELECT o.updated_at
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.catalog_item_id = ci.id
          ORDER BY o.updated_at DESC, o.id DESC
          LIMIT 1
        ), '') AS last_used_at,
        COALESCE((
          SELECT COUNT(*)
          FROM stock_replenishments sr
          WHERE sr.catalog_item_id = ci.id
        ), 0) AS replenishment_count,
        COALESCE((
          SELECT sr.created_at
          FROM stock_replenishments sr
          WHERE sr.catalog_item_id = ci.id
          ORDER BY sr.created_at DESC, sr.id DESC
          LIMIT 1
        ), '') AS last_replenishment_at,
        COALESCE((
          SELECT sr.quantity
          FROM stock_replenishments sr
          WHERE sr.catalog_item_id = ci.id
          ORDER BY sr.created_at DESC, sr.id DESC
          LIMIT 1
        ), 0) AS last_replenishment_quantity,
        COALESCE((
          SELECT sr.actor_name
          FROM stock_replenishments sr
          WHERE sr.catalog_item_id = ci.id
          ORDER BY sr.created_at DESC, sr.id DESC
          LIMIT 1
        ), '') AS last_replenishment_actor,
        COALESCE((
          SELECT sr.notes
          FROM stock_replenishments sr
          WHERE sr.catalog_item_id = ci.id
          ORDER BY sr.created_at DESC, sr.id DESC
          LIMIT 1
        ), '') AS last_replenishment_notes
      FROM catalog_items ci
      ORDER BY name COLLATE NOCASE ASC
    `);

    return rows
      .map(normalizeCatalogItem)
        .filter((row) => {
          if (String(row.deleted_at || "").trim()) {
            return false;
          }
          if (!matchesSearch(`${row.name} ${row.brand} ${row.sku} ${row.compatibility} ${row.category} ${row.description}`, filters.search)) {
            return false;
          }
        if (filters.category && row.category !== filters.category) {
          return false;
        }
        if (filters.itemCondition && row.item_condition !== filters.itemCondition) {
          return false;
        }
        if (String(filters.lowStockOnly) === "true" && row.stock_quantity > row.min_stock) {
          return false;
        }
        if (String(filters.activeOnly) === "true" && !row.active) {
          return false;
        }
        if (String(filters.storeInventoryOnly) === "true" && !Number(row.is_store_inventory || 0)) {
          return false;
        }
        return true;
      });
  }
  function getCatalogItem(itemId) {
    const item = get(
      `
        SELECT
          ci.*,
          (ci.price_amount - ci.cost_amount) AS unit_margin,
          (ci.stock_quantity * ci.price_amount) AS stock_value,
          CASE
            WHEN ci.stock_quantity <= 0 THEN 'SEM_ESTOQUE'
            WHEN ci.stock_quantity <= ci.min_stock THEN 'BAIXO'
            ELSE 'SAUDAVEL'
          END AS stock_health,
          CASE
            WHEN ci.stock_quantity <= 0 THEN 'Sem estoque'
            WHEN ci.stock_quantity <= ci.min_stock THEN 'Baixo'
            ELSE 'Saudavel'
          END AS stock_health_label,
          COALESCE((
            SELECT COUNT(DISTINCT oi.order_id)
            FROM order_items oi
            WHERE oi.catalog_item_id = ci.id
          ), 0) AS linked_orders_count,
          COALESCE((
            SELECT COUNT(DISTINCT oi.order_id)
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.catalog_item_id = ci.id
              AND o.order_status NOT IN ('CANCELADA', 'CONCLUIDA')
          ), 0) AS active_orders_count,
          COALESCE((
            SELECT SUM(oi.quantity)
            FROM order_items oi
            WHERE oi.catalog_item_id = ci.id
          ), 0) AS total_quantity_used,
          COALESCE((
            SELECT SUM(oi.quantity)
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.catalog_item_id = ci.id
              AND o.order_status IN ('ABERTA', 'EM_ANDAMENTO')
          ), 0) AS open_quantity,
          COALESCE((
            SELECT o.code
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.catalog_item_id = ci.id
            ORDER BY o.updated_at DESC, o.id DESC
            LIMIT 1
          ), '') AS last_order_code,
          COALESCE((
            SELECT o.updated_at
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.catalog_item_id = ci.id
            ORDER BY o.updated_at DESC, o.id DESC
            LIMIT 1
          ), '') AS last_used_at
        FROM catalog_items ci
        WHERE ci.id = :id
      `,
      { id: itemId }
    );

    if (!item) {
      return null;
    }

    const usageHistory = all(
      `
        SELECT
          oi.id,
          oi.order_id,
          o.code AS order_code,
          c.name AS client_name,
          o.equipment,
          o.order_status,
          o.approval_status,
          o.technician_name,
          o.opened_at,
          o.updated_at,
          oi.quantity,
          oi.unit_cost,
          oi.unit_price,
          (oi.quantity * oi.unit_price) AS line_total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN clients c ON c.id = o.client_id
        WHERE oi.catalog_item_id = :itemId
        ORDER BY o.updated_at DESC, oi.id DESC
      `,
      { itemId }
    );

    const replenishmentHistory = all(
      `
        SELECT *
        FROM stock_replenishments
        WHERE catalog_item_id = :itemId
        ORDER BY created_at DESC, id DESC
      `,
      { itemId }
    );

    return {
      ...normalizeCatalogItem(item),
      usage_history: usageHistory,
      replenishment_history: replenishmentHistory
    };
  }
  function saveCatalogItem(payload) {
    const timestamp = nowIso();
    const locationType = normalizeText(payload.locationType || payload.location_type || (payload.isStoreInventory ? "INVENTARIO" : "ESTOQUE"), "ESTOQUE") || "ESTOQUE";
    const normalized = {
      id: payload.id ? Number(payload.id) : null,
      sku: normalizeText(payload.sku) || null,
        name: normalizeText(payload.name),
        brand: normalizeText(payload.brand),
        category: normalizeText(payload.category),
      subcategory: normalizeText(payload.subcategory),
      compatibility: normalizeText(payload.compatibility),
      description: normalizeText(payload.description),
      itemCondition: normalizeText(payload.itemCondition, "NOVA") || "NOVA",
      stockQuantity: Number(payload.stockQuantity ?? 0),
      minStock: Number(payload.minStock ?? 0),
      costAmount: Number(payload.costAmount ?? 0),
      priceAmount: Number(payload.priceAmount ?? 0),
      isComplete: 0,
      active: payload.active === false ? 0 : 1,
      isStoreInventory: locationType === "INVENTARIO" ? 1 : 0,
      locationType
    };

    if (!normalized.name || !normalized.category) {
      throw new Error("Nome e categoria são obrigatórios.");
    }

    if (normalized.sku) {
      const duplicate = get(
        "SELECT id FROM catalog_items WHERE sku = :sku AND (:id IS NULL OR id != :id)",
        { sku: normalized.sku, id: normalized.id }
      );
      if (duplicate) {
        throw new Error("Já existe um item com este SKU.");
      }
    }

    if (normalized.id) {
      run(
        `
          UPDATE catalog_items
          SET sku = :sku, name = :name, brand = :brand, category = :category, subcategory = :subcategory,
                compatibility = :compatibility, description = :description, item_condition = :itemCondition,
              stock_quantity = :stockQuantity, min_stock = :minStock, cost_amount = :costAmount,
              price_amount = :priceAmount, is_complete = :isComplete, active = :active,
              is_store_inventory = :isStoreInventory, location_type = :locationType, updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          ...normalized,
          updatedAt: timestamp
        }
      );
      return getCatalogItem(normalized.id) || get("SELECT * FROM catalog_items WHERE id = :id", { id: normalized.id });
    }

    const result = run(
      `
        INSERT INTO catalog_items (
          sku, name, brand, category, subcategory, compatibility, description, item_condition, stock_quantity,
            min_stock, cost_amount, price_amount, is_complete, active, is_store_inventory, location_type, created_at, updated_at
        )
        VALUES (
          :sku, :name, :brand, :category, :subcategory, :compatibility, :description, :itemCondition, :stockQuantity,
            :minStock, :costAmount, :priceAmount, :isComplete, :active, :isStoreInventory, :locationType, :createdAt, :updatedAt
        )
      `,
      {
        ...normalized,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );

    const cashAccountId = payload.cashAccountId ? Number(payload.cashAccountId) : null;
    const initialCost = normalized.stockQuantity * normalized.costAmount;

    if (initialCost > 0 && payload.registerFinanceEntry !== false) {
      saveFinanceEntry({
        entryType: "DESPESA",
        category: "Compra de produto",
        description: `Estoque inicial: ${normalized.name} (Qtd: ${normalized.stockQuantity})`,
        amount: initialCost,
        entryDate: getLocalDateString(),
        storeId: payload.storeId ? Number(payload.storeId) : null,
        cashAccountId,
        legacySection: "COMPRAS",
        rawPayload: {
          source: "CATALOG_INITIAL_STOCK",
          catalogItemName: normalized.name,
          stockQuantity: normalized.stockQuantity,
          unitCost: normalized.costAmount
        },
        _actor: payload._actor
      });
    }

    return getCatalogItem(Number(result.lastInsertRowid)) || get("SELECT * FROM catalog_items WHERE id = :id", { id: Number(result.lastInsertRowid) });
  }
  function replenishCatalogItem(itemId, payload = {}) {
    return transaction(() => _replenishCatalogItem(itemId, payload));
  }

  function _replenishCatalogItem(itemId, payload = {}) {
    const current = get("SELECT * FROM catalog_items WHERE id = :id", { id: Number(itemId) });
    if (!current) {
      throw new Error(`Item de catalogo ${itemId} nao encontrado.`);
    }

    const quantity = Math.max(0, Number.parseInt(String(payload.quantity ?? 0), 10) || 0);
    const newCostAmount = toNumber(payload.costAmount ?? payload.newCostAmount) ?? Number(current.cost_amount || 0);
    const newPriceAmount = toNumber(payload.priceAmount ?? payload.newPriceAmount) ?? Number(current.price_amount || 0);
    const notes = normalizeText(payload.notes);
    const actorUserId = payload._actor?.id ? Number(payload._actor.id) : null;
    const actorName = normalizeText(payload._actor?.name, "Sistema") || "Sistema";

    if (quantity <= 0) {
      throw new Error(`Informe a quantidade da reposicao para o item ${current.name}.`);
    }

    const timestamp = nowIso();
    run(
      `
          INSERT INTO stock_replenishments (
            catalog_item_id, quantity, new_cost_amount, new_price_amount, previous_cost_amount,
            previous_price_amount, notes, actor_user_id, actor_name, created_at
          )
          VALUES (
            :catalogItemId, :quantity, :newCostAmount, :newPriceAmount, :previousCostAmount,
            :previousPriceAmount, :notes, :actorUserId, :actorName, :createdAt
          )
        `,
      {
        catalogItemId: Number(itemId),
        quantity,
        newCostAmount,
        newPriceAmount,
        previousCostAmount: current.cost_amount,
        previousPriceAmount: current.price_amount,
        notes,
        actorUserId,
        actorName,
        createdAt: timestamp
      }
    );

    run(
      `
          UPDATE catalog_items
          SET stock_quantity = stock_quantity + :quantity,
              cost_amount = :costAmount,
              price_amount = :priceAmount,
              updated_at = :updatedAt
          WHERE id = :id
        `,
      {
        id: Number(itemId),
        quantity,
        costAmount: newCostAmount,
        priceAmount: newPriceAmount,
        updatedAt: timestamp
      }
    );

    const cashAccountId = payload.cashAccountId ? Number(payload.cashAccountId) : null;
    const totalCost = quantity * newCostAmount;

    if (totalCost > 0 && payload.registerFinanceEntry !== false) {
      saveFinanceEntry({
        entryType: "DESPESA",
        category: "Compra de produto",
        description: `Reposição de estoque: ${current.name} (Qtd: ${quantity})`,
        amount: totalCost,
        entryDate: getLocalDateString(),
        storeId: payload.storeId ? Number(payload.storeId) : null,
        cashAccountId,
        legacySection: "COMPRAS",
        rawPayload: {
          source: "CATALOG_REPLENISHMENT",
          catalogItemId: Number(itemId),
          catalogItemName: current.name,
          quantity,
          unitCost: newCostAmount
        },
        _actor: payload._actor
      });
    }

    if (payload.additionalCost && Number(payload.additionalCost) !== 0 && payload.registerFinanceEntry !== false) {
      const additionalCost = Number(payload.additionalCost);
      saveFinanceEntry({
        entryType: additionalCost > 0 ? "DESPESA" : "RECEITA",
        category: additionalCost > 0 ? "Compra de produto" : "Outras receitas",
        description: `Custo adicional na reposição de: ${current.name} (Qtd: ${quantity})`,
        amount: Math.abs(additionalCost),
        entryDate: getLocalDateString(),
        storeId: payload.storeId ? Number(payload.storeId) : null,
        cashAccountId,
        legacySection: "COMPRAS",
        rawPayload: {
          source: "CATALOG_REPLENISHMENT_ADDITIONAL_COST",
          catalogItemId: Number(itemId),
          catalogItemName: current.name,
          quantity,
          additionalCost
        },
        _actor: payload._actor
      });
    }

    return getCatalogItem(Number(itemId));
  }

  function replenishCatalogBatch(items = [], payload_context = {}) {
    if (!Array.isArray(items) || !items.length) {
      throw new Error("Informe a lista de itens para reposicao em lote.");
    }

    return transaction(() => {
      const results = [];
      for (const itemPayload of items) {
        results.push(_replenishCatalogItem(itemPayload.id, { ...itemPayload, _actor: payload_context._actor }));
      }
      return results;
    });
  }
  function revertCatalogReplenishment(replenishmentId) {
      const replenishment = get("SELECT * FROM stock_replenishments WHERE id = :id", { id: Number(replenishmentId) });
      if (!replenishment) {
        throw new Error("Reposicao de estoque nao encontrada.");
      }

      const latest = get(
        `
          SELECT id
          FROM stock_replenishments
          WHERE catalog_item_id = :itemId
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
        { itemId: Number(replenishment.catalog_item_id) }
      );
      if (!latest || Number(latest.id) !== Number(replenishment.id)) {
        throw new Error("Apenas a reposicao mais recente do item pode ser revertida.");
      }

      const current = get("SELECT * FROM catalog_items WHERE id = :id", { id: Number(replenishment.catalog_item_id) });
      if (!current) {
        throw new Error("Item de catalogo nao encontrado para reverter a reposicao.");
      }
      if (Number(current.stock_quantity || 0) < Number(replenishment.quantity || 0)) {
        throw new Error("Nao e possivel reverter a reposicao porque parte desse estoque ja foi consumida.");
      }

      run(
        `
          UPDATE catalog_items
          SET stock_quantity = :stockQuantity,
              cost_amount = :costAmount,
              price_amount = :priceAmount,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          id: Number(current.id),
          stockQuantity: Number(current.stock_quantity || 0) - Number(replenishment.quantity || 0),
          costAmount: replenishment.previous_cost_amount === null ? current.cost_amount : replenishment.previous_cost_amount,
          priceAmount: replenishment.previous_price_amount === null ? current.price_amount : replenishment.previous_price_amount,
          updatedAt: nowIso()
        }
      );

      run("DELETE FROM stock_replenishments WHERE id = :id", { id: Number(replenishment.id) });
    return getCatalogItem(Number(replenishment.catalog_item_id));
  }

  function deleteCatalogItems(itemIds = []) {
    const normalizedIds = [...new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).map((id) => Number(id)).filter(Boolean))];
    if (normalizedIds.length === 0) {
      throw new Error("Nenhum item de catalogo foi informado para exclusao.");
    }

    return transaction(() => {
      const deleted = [];
      const archived = [];
      const blocked = [];
      const hasPosSaleItemsTable = Boolean(
        get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pos_sale_items'")
      );
      const timestamp = nowIso();

      for (const itemId of normalizedIds) {
        const item = get("SELECT id, name, sku FROM catalog_items WHERE id = :id", { id: itemId });
        if (!item) {
          continue;
        }

        const linkedOrders = Number(
          get("SELECT COUNT(*) AS total FROM order_items WHERE catalog_item_id = :id", { id: itemId })?.total ?? 0
        );
        const linkedPosSales = hasPosSaleItemsTable
          ? Number(get("SELECT COUNT(*) AS total FROM pos_sale_items WHERE catalog_item_id = :id", { id: itemId })?.total ?? 0)
          : 0;

        if (linkedOrders > 0 || linkedPosSales > 0) {
          run(
            `
              UPDATE catalog_items
              SET active = 0,
                  deleted_at = :deletedAt,
                  updated_at = :updatedAt,
                  stock_quantity = 0,
                  min_stock = 0,
                  sku = NULL
              WHERE id = :id
            `,
            {
              id: itemId,
              deletedAt: timestamp,
              updatedAt: timestamp
            }
          );
          archived.push({
            id: item.id,
            name: item.name,
            sku: item.sku,
            linkedOrders,
            linkedPosSales
          });
          continue;
        }

        run("DELETE FROM catalog_items WHERE id = :id", { id: itemId });
        deleted.push({
          id: item.id,
          name: item.name,
          sku: item.sku
        });
      }

        return {
          success: true,
          deletedCount: deleted.length,
          deleted,
          archivedCount: archived.length,
          archived,
          blockedCount: blocked.length,
          blocked
        };
      });
    }

  function listServices(filters = {}) {
    const rows = all(`
      SELECT *
      FROM service_catalog
      ORDER BY active DESC, name COLLATE NOCASE ASC
    `);

    return rows.filter((row) => {
      if (!matchesSearch(`${row.name} ${row.description}`, filters.search)) {
        return false;
      }
      if (String(filters.activeOnly) === "true" && !Number(row.active || 0)) {
        return false;
      }
      if (String(filters.availableInOrder) === "true" && !Number(row.available_in_order || 0)) {
        return false;
      }
      if (String(filters.availableInPdv) === "true" && !Number(row.available_in_pdv || 0)) {
        return false;
      }
      return true;
    });
  }

  function getService(serviceId) {
    return get("SELECT * FROM service_catalog WHERE id = :id", { id: serviceId }) || null;
  }

  function saveService(payload = {}) {
    const timestamp = nowIso();
    const normalized = {
      id: payload.id ? Number(payload.id) : null,
      name: normalizeText(payload.name),
      description: normalizeText(payload.description),
      priceAmount: toNumber(payload.priceAmount ?? payload.price_amount) ?? 0,
      pricingMode: normalizeText(payload.pricingMode ?? payload.pricing_mode, 'FIXED') || 'FIXED',
      additionalPriceAmount: toNumber(payload.additionalPriceAmount ?? payload.additional_price_amount) ?? 0,
      estimatedMinutes: Math.max(0, Number.parseInt(String(payload.estimatedMinutes ?? payload.estimated_minutes ?? 0), 10) || 0),
      availableInOrder: payload.availableInOrder === false || Number(payload.available_in_order) === 0 ? 0 : 1,
      availableInPdv: payload.availableInPdv === true || Number(payload.available_in_pdv) === 1 ? 1 : 0,
      allowCustomPrice: payload.allowCustomPrice === true || Number(payload.allow_custom_price) === 1 ? 1 : 0,
      active: payload.active === false || Number(payload.active) === 0 ? 0 : 1
    };

    if (!normalized.name) {
      throw new Error("Nome do servico e obrigatorio.");
    }

    if (normalized.id) {
      run(
        `
          UPDATE service_catalog
          SET name = :name,
              description = :description,
              price_amount = :priceAmount,
              pricing_mode = :pricingMode,
              additional_price_amount = :additionalPriceAmount,
              estimated_minutes = :estimatedMinutes,
              available_in_order = :availableInOrder,
              available_in_pdv = :availableInPdv,
              allow_custom_price = :allowCustomPrice,
              active = :active,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          ...normalized,
          updatedAt: timestamp
        }
      );
      return getService(normalized.id);
    }

    const result = run(
      `
        INSERT INTO service_catalog (
          name, description, price_amount, pricing_mode, additional_price_amount, estimated_minutes, available_in_order, available_in_pdv, allow_custom_price, active, created_at, updated_at
        )
        VALUES (
          :name, :description, :priceAmount, :pricingMode, :additionalPriceAmount, :estimatedMinutes, :availableInOrder, :availableInPdv, :allowCustomPrice, :active, :createdAt, :updatedAt
        )
      `,
      {
        ...normalized,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );

    return getService(Number(result.lastInsertRowid));
  }

  function deleteService(serviceId) {
    const service = getService(serviceId);
    if (!service) {
      throw new Error("Servico nao encontrado.");
    }

    const linkedOrders = Number(get("SELECT COUNT(*) AS total FROM order_services WHERE service_id = :id", { id: serviceId })?.total || 0);
    if (linkedOrders > 0) {
      throw new Error("Servico ja vinculado a OS e nao pode ser excluido.");
    }

    run("DELETE FROM service_catalog WHERE id = :id", { id: serviceId });
    return { success: true };
  }
  function listOrders(filters = {}) {
    const rows = all(`
      SELECT
        o.*,
        c.name AS client_name,
        c.phone AS client_phone,
        COUNT(oi.id) AS items_count
      FROM orders o
      JOIN clients c ON c.id = o.client_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id
      ORDER BY o.updated_at DESC
    `);

    return rows.filter((row) => {
      if (
        !matchesSearch(
          `${row.code} ${row.client_name} ${row.equipment} ${row.defect} ${row.technician_name}`,
          filters.search
        )
      ) {
        return false;
      }
      if (filters.orderStatus && row.order_status !== filters.orderStatus) {
        return false;
      }
      if (filters.approvalStatus && row.approval_status !== filters.approvalStatus) {
        return false;
      }
      if (filters.technicianName && row.technician_name !== filters.technicianName) {
        return false;
      }
      if (filters.clientId && Number(filters.clientId) !== row.client_id) {
        return false;
      }
      return isBetweenDates(row.opened_at, filters.fromDate, filters.toDate);
    });
  }

  function getOrder(orderId) {
    const order = get(
      `
        SELECT
          o.*,
          c.name AS client_name,
          c.phone AS client_phone,
          c.email AS client_email,
          c.document AS client_document,
          c.address AS client_address
        FROM orders o
        JOIN clients c ON c.id = o.client_id
        WHERE o.id = :id
      `,
      { id: orderId }
    );

    if (!order) {
      return null;
    }

    const items = all(
      `
        SELECT
          oi.*,
          ci.stock_quantity AS current_stock
        FROM order_items oi
        JOIN catalog_items ci ON ci.id = oi.catalog_item_id
        WHERE oi.order_id = :orderId
        ORDER BY oi.id ASC
      `,
      { orderId }
    );

    const services = all(
      `
        SELECT *
        FROM order_services
        WHERE order_id = :orderId
        ORDER BY id ASC
      `,
      { orderId }
    );

    const requestedProducts = all(
      `
        SELECT id, product_name, quantity, sale_price, status, purchase_cost, finance_entry_id, purchased_at, denied_at, created_at, updated_at
        FROM order_requested_products
        WHERE order_id = :orderId
        ORDER BY id ASC
      `,
      { orderId }
    );

    return {
      ...order,
      items,
      services,
      requested_products: requestedProducts,
      estimated_total_minutes: services.reduce((total, item) => Math.max(total, Number(item.estimated_minutes || 0)), 0),
      photo_url: order.photo_path ? `/uploads/${order.photo_path}` : ""
    };
  }

  function saveOrder(payload) {
    const existing = payload.id ? getOrder(Number(payload.id)) : null;
    const normalized = normalizeOrderInput(payload);
    const client = get("SELECT id, phone FROM clients WHERE id = :id", { id: normalized.clientId });

    if (!client) {
      throw new Error("Cliente não encontrado.");
    }

    const effectiveOrderStatus = payload.orderStatus ? normalized.orderStatus : existing?.order_status || "ABERTA";
    const effectiveApprovalStatus = normalized.approvalStatus;
    ensureOrderCanAdvance(effectiveOrderStatus, effectiveApprovalStatus);

    const orderDate = normalizeText(payload.openedAt, existing?.opened_at || getLocalDateString());
    const timestamp = nowIso();
    const code = existing?.code ?? createNextOrderCode(orderDate);
    const photoPath = payload.photoUpload
      ? saveOrderPhoto(code, orderDate, payload.photoUpload.base64, payload.photoUpload.name)
      : existing?.photo_path ?? "";

    const preparedItems = normalized.items.map((item) => {
      const catalogItem = get("SELECT * FROM catalog_items WHERE id = :id", { id: item.catalogItemId });
      if (!catalogItem) {
        throw new Error("Item de catálogo não encontrado.");
      }
      return {
        catalogItem,
        quantity: item.quantity,
        unitCost: Number(catalogItem.cost_amount || 0),
        unitPrice: Number(catalogItem.price_amount || 0)
      };
    });

    const preparedServices = normalized.services.map((item) => {
      const service = getService(item.serviceId);
      if (!service) {
        throw new Error("Serviço não encontrado.");
      }
      const quantity = Math.max(1, Number(item.quantity || 1));
      const pricingMode = normalizeText(service.pricing_mode, 'FIXED') || 'FIXED';
      const unitPrice = Number(service.price_amount || 0);
      const additionalUnitPrice = Number(service.additional_price_amount || 0);
      return {
        service,
        quantity,
        pricingMode,
        unitPrice,
        additionalUnitPrice,
        lineTotal: calculateProgressiveLineTotal(pricingMode, unitPrice, additionalUnitPrice, quantity),
        estimatedMinutes: Number(service.estimated_minutes || 0)
      };
    });

    const requestedProducts = normalized.requestedProducts || [];
    const partsSubtotal = preparedItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
    const serviceAmount = preparedServices.reduce((total, item) => total + item.lineTotal, 0);
    const totalEstimatedMinutes = preparedServices.reduce((total, item) => Math.max(total, item.estimatedMinutes), 0);
    const requestedProductsSubtotal = requestedProducts.reduce((total, item) => total + Number(item.salePrice || 0) * Number(item.quantity || 1), 0);
    const quoteAmount = partsSubtotal + serviceAmount + requestedProductsSubtotal;
    const totalAmount = Math.max(0, quoteAmount - Number(normalized.discountAmount || 0));
    const dueDate = normalized.dueDate || existing?.due_date || computeDueDateFromMinutes(totalEstimatedMinutes, orderDate);

    const timestamps = {
      openedAt: orderDate,
      concludedAt:
        effectiveOrderStatus === "CONCLUIDA"
          ? existing?.concluded_at || getLocalDateString()
          : "",
      deliveredAt: effectiveOrderStatus === "CONCLUIDA" ? existing?.delivered_at || getLocalDateString() : "",
      cancelledAt: effectiveOrderStatus === "CANCELADA" ? existing?.cancelled_at || getLocalDateString() : ""
    };

    return transaction(() => {
      if (existing && existing.order_status !== "CANCELADA") {
        restoreStockForOrder(existing.id);
      }

      let orderId = existing?.id ?? 0;
      const orderPayload = {
        clientId: normalized.clientId,
        phoneSnapshot: existing?.phone_snapshot || normalized.phoneSnapshot || client.phone,
        equipment: normalized.equipment,
        defect: normalized.defect,
        extras: normalized.extras,
        photoPath,
        technicianName: existing?.technician_name || "",
        dueDate,
        orderStatus: effectiveOrderStatus,
        approvalStatus: effectiveApprovalStatus,
        quoteAmount,
        preApprovedLimit: payload.preApprovedLimit ?? existing?.pre_approved_limit ?? null,
        actualAmount: payload.actualAmount ?? existing?.actual_amount ?? null,
        serviceAmount,
        discountAmount: normalized.discountAmount,
        totalAmount,
        paymentMethod: normalized.paymentMethod,
        notes: normalized.notes,
        openedAt: timestamps.openedAt,
        concludedAt: timestamps.concludedAt,
        deliveredAt: timestamps.deliveredAt,
        cancelledAt: timestamps.cancelledAt,
        updatedAt: timestamp
      };

      if (existing) {
        run(
          `
            UPDATE orders
            SET client_id = :clientId,
                phone_snapshot = :phoneSnapshot,
                equipment = :equipment,
                defect = :defect,
                extras = :extras,
                photo_path = :photoPath,
                technician_name = :technicianName,
                due_date = :dueDate,
                order_status = :orderStatus,
                approval_status = :approvalStatus,
                quote_amount = :quoteAmount,
                pre_approved_limit = :preApprovedLimit,
                actual_amount = :actualAmount,
                service_amount = :serviceAmount,
                discount_amount = :discountAmount,
                total_amount = :totalAmount,
                payment_method = :paymentMethod,
                notes = :notes,
                opened_at = :openedAt,
                concluded_at = :concludedAt,
                delivered_at = :deliveredAt,
                cancelled_at = :cancelledAt,
                updated_at = :updatedAt
            WHERE id = :id
          `,
          {
            id: existing.id,
            ...orderPayload
          }
        );
        orderId = existing.id;
        run("DELETE FROM order_requested_products WHERE order_id = :orderId", { orderId });
        run("DELETE FROM order_services WHERE order_id = :orderId", { orderId });
        run("DELETE FROM order_items WHERE order_id = :orderId", { orderId });
      } else {
        const result = run(
          `
            INSERT INTO orders (
              code, client_id, phone_snapshot, equipment, defect, extras, photo_path, technician_name, due_date,
              order_status, approval_status, quote_amount, pre_approved_limit, actual_amount,
              service_amount, discount_amount, total_amount, payment_method, notes, opened_at,
              concluded_at, delivered_at, cancelled_at, created_at, updated_at
            )
            VALUES (
              :code, :clientId, :phoneSnapshot, :equipment, :defect, :extras, :photoPath, :technicianName, :dueDate,
              :orderStatus, :approvalStatus, :quoteAmount, :preApprovedLimit, :actualAmount,
              :serviceAmount, :discountAmount, :totalAmount, :paymentMethod, :notes, :openedAt,
              :concludedAt, :deliveredAt, :cancelledAt, :createdAt, :updatedAt
            )
          `,
          {
            code,
            ...orderPayload,
            createdAt: timestamp
          }
        );
        orderId = Number(result.lastInsertRowid);
      }

      for (const item of preparedItems) {
        run(
          `
            INSERT INTO order_items (
              order_id, catalog_item_id, item_name, sku, category, item_condition,
              quantity, unit_cost, unit_price
            )
            VALUES (
              :orderId, :catalogItemId, :itemName, :sku, :category, :itemCondition,
              :quantity, :unitCost, :unitPrice
            )
          `,
          {
            orderId,
            catalogItemId: item.catalogItem.id,
            itemName: item.catalogItem.name,
            sku: item.catalogItem.sku || "",
            category: item.catalogItem.category,
            itemCondition: item.catalogItem.item_condition,
            quantity: item.quantity,
            unitCost: item.unitCost,
            unitPrice: item.unitPrice
          }
        );
      }

      for (const item of preparedServices) {
        run(
          `
            INSERT INTO order_services (
              order_id, service_id, service_name, description, estimated_minutes, quantity, unit_price, line_total
            )
            VALUES (
              :orderId, :serviceId, :serviceName, :description, :estimatedMinutes, :quantity, :unitPrice, :lineTotal
            )
          `,
          {
            orderId,
            serviceId: item.service.id,
            serviceName: item.service.name,
            description: item.service.description || "",
            estimatedMinutes: item.estimatedMinutes,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal
          }
        );
      }

      for (const requestedProduct of requestedProducts) {
        run(
          `
            INSERT INTO order_requested_products (
              order_id, product_name, quantity, sale_price, status, purchase_cost, created_at, updated_at
            )
            VALUES (
              :orderId, :productName, :quantity, :salePrice, :status, :purchaseCost, :createdAt, :updatedAt
            )
          `,
          {
            orderId,
            productName: requestedProduct.name,
            quantity: Number(requestedProduct.quantity || 1),
            salePrice: Number(requestedProduct.salePrice || 0),
            status: normalizeText(requestedProduct.status, 'PENDENTE') || 'PENDENTE',
            purchaseCost: requestedProduct.purchaseCost ?? null,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        );
      }

      if (effectiveOrderStatus !== "CANCELADA") {
        applyStockForOrder(orderId);
      }

      return getOrder(orderId);
    });
  }

  function restoreStockForOrder(orderId) {
    const items = all("SELECT catalog_item_id, quantity FROM order_items WHERE order_id = :orderId", { orderId });
    for (const item of items) {
      run(
        `
          UPDATE catalog_items
          SET stock_quantity = stock_quantity + :quantity,
              updated_at = :updatedAt
          WHERE id = :catalogItemId
        `,
        {
          quantity: item.quantity,
          updatedAt: nowIso(),
          catalogItemId: item.catalog_item_id
        }
      );
    }
  }

  function applyStockForOrder(orderId) {
    const items = all("SELECT catalog_item_id, quantity FROM order_items WHERE order_id = :orderId", { orderId });
    for (const item of items) {
      const stock = get("SELECT stock_quantity FROM catalog_items WHERE id = :id", { id: item.catalog_item_id });
      if (!stock || stock.stock_quantity < item.quantity) {
        throw new Error("Estoque insuficiente para um dos itens da OS.");
      }
      run(
        `
          UPDATE catalog_items
          SET stock_quantity = stock_quantity - :quantity,
              updated_at = :updatedAt
          WHERE id = :catalogItemId
        `,
        {
          quantity: item.quantity,
          updatedAt: nowIso(),
          catalogItemId: item.catalog_item_id
        }
      );
    }
  }

  function createNextOrderCode(orderDate) {
    const { year, month, day } = getLocalDateParts(orderDate);
    const prefix = `BE-${year}-${month}-${day}-`;
    const count = get("SELECT COUNT(*) AS total FROM orders WHERE code LIKE :prefix", { prefix: `${prefix}%` }).total;
    return formatOrderCode(orderDate, count + 1);
  }

  function removeUploadDirectoryByRelativePath(relativePath = "") {
    if (!relativePath) {
      return;
    }

    try {
      rmSync(join(uploadsRoot, dirname(relativePath)), { recursive: true, force: true });
    } catch {
      // Best effort cleanup for local uploads after DB mutation.
    }
  }

  function saveClientPhoto(clientId, base64, fileName = "cliente.jpg") {
    const safeName = normalizeText(fileName, "cliente.jpg").replace(/[^a-zA-Z0-9_.-]/g, "_");
    const extension = extname(safeName) || ".jpg";
    const relativeDir = join("clients", String(clientId));
    const absoluteDir = join(uploadsRoot, relativeDir);
    mkdirSync(absoluteDir, { recursive: true });

    const base64Content = String(base64).includes(",") ? String(base64).split(",").pop() : String(base64);
    const targetFile = join(absoluteDir, `perfil${extension}`);
    writeFileSync(targetFile, Buffer.from(base64Content, "base64"));

    return join(relativeDir, `perfil${extension}`).replaceAll("\\", "/");
  }

  function saveOrderPhoto(orderCode, orderDate, base64, fileName = "foto.jpg") {
    const { year, month } = getLocalDateParts(orderDate);
    const safeName = normalizeText(fileName, "foto.jpg").replace(/[^a-zA-Z0-9_.-]/g, "_");
    const extension = extname(safeName) || ".jpg";
    const relativeDir = join("os", year, month, orderCode);
    const absoluteDir = join(uploadsRoot, relativeDir);
    mkdirSync(absoluteDir, { recursive: true });

    const base64Content = String(base64).includes(",") ? String(base64).split(",").pop() : String(base64);
    const targetFile = join(absoluteDir, `principal${extension}`);
    writeFileSync(targetFile, Buffer.from(base64Content, "base64"));

    return join(relativeDir, `principal${extension}`).replaceAll("\\", "/");
  }

  function listFinanceCategories(entryType = "") {
    const rows = all(`
      SELECT *
      FROM finance_categories
      ORDER BY entry_type ASC, sort_order ASC, name COLLATE NOCASE ASC
    `);

    return rows.filter((row) => {
      if (entryType && row.entry_type !== entryType) {
        return false;
      }
      return Number(row.active || 0) === 1;
    });
  }

  function saveFinanceCategory(payload = {}) {
    const timestamp = nowIso();
    const normalized = {
      id: payload.id ? Number(payload.id) : null,
      entryType: normalizeText(payload.entryType || payload.entry_type),
      name: normalizeText(payload.name),
      active: payload.active === false || Number(payload.active) === 0 ? 0 : 1
    };

    if (!normalized.entryType || !ENTRY_TYPES.some((item) => item.code === normalized.entryType)) {
      throw new Error("Tipo da categoria financeira invalido.");
    }
    if (!normalized.name) {
      throw new Error("Informe o nome da categoria financeira.");
    }

    const duplicate = get(
      "SELECT id FROM finance_categories WHERE entry_type = :entryType AND lower(name) = lower(:name) AND (:id IS NULL OR id != :id)",
      { entryType: normalized.entryType, name: normalized.name, id: normalized.id }
    );
    if (duplicate) {
      throw new Error("Ja existe uma categoria com este nome para o tipo informado.");
    }

    if (normalized.id) {
      run(
        `
          UPDATE finance_categories
          SET entry_type = :entryType,
              name = :name,
              active = :active,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          ...normalized,
          updatedAt: timestamp
        }
      );
      return get("SELECT * FROM finance_categories WHERE id = :id", { id: normalized.id });
    }

    const nextOrder = Number(
      get("SELECT COALESCE(MAX(sort_order), 0) AS total FROM finance_categories WHERE entry_type = :entryType", { entryType: normalized.entryType })?.total || 0
    ) + 1;

    const result = run(
      `
        INSERT INTO finance_categories (entry_type, name, active, sort_order, created_at, updated_at)
        VALUES (:entryType, :name, :active, :sortOrder, :createdAt, :updatedAt)
      `,
      {
        ...normalized,
        sortOrder: nextOrder,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    );

    return get("SELECT * FROM finance_categories WHERE id = :id", { id: Number(result.lastInsertRowid) });
  }

  function deleteFinanceCategory(categoryId) {
    const category = get("SELECT * FROM finance_categories WHERE id = :id", { id: Number(categoryId) });
    if (!category) {
      throw new Error("Categoria financeira nao encontrada.");
    }

    const inUse = Number(
      get(
        "SELECT COUNT(*) AS total FROM finance_entries WHERE entry_type = :entryType AND category = :name",
        { entryType: category.entry_type, name: category.name }
      )?.total || 0
    );
    if (inUse > 0) {
      throw new Error("Categoria financeira ja utilizada em lancamentos e nao pode ser removida.");
    }

    run("DELETE FROM finance_categories WHERE id = :id", { id: category.id });
    return { success: true };
  }

  function reorderFinanceCategories(entryType, ids = []) {
    const normalizedIds = [...new Set((Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter(Boolean))];
    if (!entryType || !normalizedIds.length) {
      throw new Error("Informe o tipo e a nova ordem das categorias financeiras.");
    }

    transaction(() => {
      normalizedIds.forEach((id, index) => {
        run(
          `
            UPDATE finance_categories
            SET sort_order = :sortOrder,
                updated_at = :updatedAt
            WHERE id = :id AND entry_type = :entryType
          `,
          {
            id,
            entryType,
            sortOrder: index + 1,
            updatedAt: nowIso()
          }
        );
      });
    });

    return listFinanceCategories(entryType);
  }
  function listFinanceEntries(filters = {}) {
    const rows = all(`
      SELECT
        f.*,
        o.code AS order_code
      FROM finance_entries f
      LEFT JOIN orders o ON o.id = f.order_id
      ORDER BY f.entry_date DESC, f.id DESC
    `);

    return rows.filter((row) => {
      if (filters.legacySection && normalizeText(filters.legacySection) !== normalizeText(row.legacy_section)) {
        return false;
      }
      if (!matchesSearch(`${row.description} ${row.category} ${row.order_code || ""} ${row.source_sheet || ""} ${row.legacy_section || ""}`, filters.search)) {
        return false;
      }
      if (filters.entryType && row.entry_type !== filters.entryType) {
        return false;
      }
      if (filters.category && row.category !== filters.category) {
        return false;
      }
      if (filters.paymentMethod && row.payment_method !== filters.paymentMethod) {
        return false;
      }
      if (filters.storeId && Number(filters.storeId) !== Number(row.store_id)) {
        return false;
      }
      if (filters.cashAccountId && Number(filters.cashAccountId) !== Number(row.cash_account_id)) {
        return false;
      }
      return isBetweenDates(row.entry_date, filters.fromDate, filters.toDate);
    });
  }

  function saveFinanceEntry(payload) {
    const timestamp = nowIso();
    const normalized = {
      id: payload.id ? Number(payload.id) : null,
      entryType: normalizeText(payload.entryType, "DESPESA") || "DESPESA",
      category: normalizeText(payload.category),
      description: normalizeText(payload.description),
      amount: toNumber(payload.amount) ?? 0,
      entryDate: normalizeText(payload.entryDate, getLocalDateString()),
      paymentMethod: normalizeText(payload.paymentMethod, "NAO_DEFINIDO") || "NAO_DEFINIDO",
      orderId: payload.orderId ? Number(payload.orderId) : null,
      storeId: payload.storeId ? Number(payload.storeId) : null,
      cashAccountId: payload.cashAccountId ? Number(payload.cashAccountId) : null,
      rawPayload: serializeStructuredValue(payload.rawPayload),
      sourceWorkbook: normalizeText(payload.sourceWorkbook || payload.source_workbook),
      sourceSheet: normalizeText(payload.sourceSheet || payload.source_sheet),
      sourceRow: payload.sourceRow !== undefined || payload.source_row !== undefined
        ? Number(payload.sourceRow ?? payload.source_row) || null
        : null,
      legacySection: normalizeText(payload.legacySection || payload.legacy_section)
    };

    if (!normalized.category || !normalized.description || normalized.amount <= 0) {
      throw new Error("Categoria, descricao e valor sao obrigatorios.");
    }

    const validCategory = get(
      "SELECT id FROM finance_categories WHERE entry_type = :entryType AND name = :name AND active = 1",
      { entryType: normalized.entryType, name: normalized.category }
    );
    if (!validCategory) {
      throw new Error("Selecione uma categoria financeira valida para o tipo informado.");
    }

    if (normalized.id) {
      run(
        `
          UPDATE finance_entries
          SET entry_type = :entryType,
              category = :category,
              description = :description,
              amount = :amount,
              entry_date = :entryDate,
              payment_method = :paymentMethod,
              order_id = :orderId,
              store_id = :storeId,
              cash_account_id = :cashAccountId,
              source_workbook = :sourceWorkbook,
              source_sheet = :sourceSheet,
              source_row = :sourceRow,
              legacy_section = :legacySection,
              raw_payload = :rawPayload,
              updated_at = :updatedAt
          WHERE id = :id
        `,
        {
          ...normalized,
          updatedAt: timestamp
        }
      );
      return get("SELECT * FROM finance_entries WHERE id = :id", { id: normalized.id });
    }

    const result = run(
      `
        INSERT INTO finance_entries (
          entry_type, category, description, amount, entry_date, payment_method, order_id,
          store_id, cash_account_id, source_workbook, source_sheet, source_row, legacy_section,
          raw_payload, created_at, updated_at
        )
        VALUES (
          :entryType, :category, :description, :amount, :entryDate, :paymentMethod, :orderId,
          :storeId, :cashAccountId, :sourceWorkbook, :sourceSheet, :sourceRow, :legacySection,
          :rawPayload, :createdAt, :updatedAt
        )
      `,
      (() => {
        const { id: _id, ...insertPayload } = normalized;
        return {
          ...insertPayload,
          createdAt: timestamp,
          updatedAt: timestamp
        };
      })()
    );
    return get("SELECT * FROM finance_entries WHERE id = :id", { id: Number(result.lastInsertRowid) });
  }

  function getDashboardSummary(filters = {}) {
    const orders = listOrders(filters);
    const finance = listFinanceEntries(filters);
    const inventory = listCatalogItems({});
    const clients = listClients({});
    const activeOrders = orders.filter((order) => order.order_status !== "CANCELADA");

    const revenue = activeOrders.reduce((sum, item) => sum + item.total_amount, 0);
    const expense = finance.filter((entry) => entry.entry_type === "DESPESA").reduce((sum, item) => sum + item.amount, 0);

    const groupedStatus = ORDER_STATUSES.map((status) => ({
      label: status.label,
      value: orders.filter((order) => order.order_status === status.code).length
    }));

    const groupedApprovals = APPROVAL_STATUSES.map((status) => ({
      label: status.label,
      value: orders.filter((order) => order.approval_status === status.code).length
    }));

    const groupedStock = CATALOG_CATEGORIES.map((category) => ({
      label: category,
      value: inventory.filter((item) => item.category === category).reduce((sum, item) => sum + item.stock_value, 0)
    })).filter((item) => item.value > 0);

    const groupedTrend = Object.values(
      orders.reduce((accumulator, order) => {
        const key = order.opened_at.slice(0, 7);
        accumulator[key] ??= { label: key, revenue: 0, totalOrders: 0 };
        accumulator[key].revenue += order.total_amount;
        accumulator[key].totalOrders += 1;
        return accumulator;
      }, {})
    ).sort((left, right) => left.label.localeCompare(right.label));

    const lowStockAlerts = inventory
      .filter((item) => item.stock_quantity <= item.min_stock)
      .map((item) => ({
        title: item.name,
        subtitle: `SKU ${item.sku}`,
        tone: "danger",
        value: `Estoque ${item.stock_quantity}/${item.min_stock}`
      }));

    const approvalAlerts = orders
      .filter((order) => order.approval_status === "AGUARDANDO_APROVACAO")
      .map((order) => ({
        title: order.code,
        subtitle: order.client_name,
        tone: "warning",
        value: `Aguardando R$ ${Number(order.actual_amount || 0).toFixed(2)}`
      }));

    return {
      generatedAt: nowIso(),
      kpis: {
        ordersOpen: orders.filter((order) => ["ABERTA", "EM_ANDAMENTO"].includes(order.order_status)).length,
        ordersPendingApproval: orders.filter((order) => order.approval_status === "AGUARDANDO_APROVACAO").length,
        averageTicket: revenue / Math.max(activeOrders.length, 1),
        revenue,
        expense,
        margin: revenue - expense,
        stockValue: inventory.reduce((sum, item) => sum + item.stock_value, 0),
        approvalRate:
          (orders.filter((order) => order.approval_status === "APROVADA").length / Math.max(orders.length, 1)) * 100,
        projectedRevenue90d: revenue * 3
      },
      charts: {
        orderStatus: groupedStatus,
        approvals: groupedApprovals,
        stockByCategory: groupedStock,
        trend: groupedTrend
      },
      topClients: clients
        .sort((left, right) => Number(right.total_spent || 0) - Number(left.total_spent || 0))
        .slice(0, 5),
      alerts: [...approvalAlerts, ...lowStockAlerts].slice(0, 8)
    };
  }

  function getReports(filters = {}) {
    const orders = listOrders(filters);
    const finance = listFinanceEntries(filters);
    const inventory = listCatalogItems(filters);

    return {
      summary: {
        totalOrders: orders.length,
        totalOrderValue: orders.reduce((sum, order) => sum + order.total_amount, 0),
        totalRevenue: finance.filter((entry) => entry.entry_type === "RECEITA").reduce((sum, entry) => sum + entry.amount, 0),
        totalExpenses: finance.filter((entry) => entry.entry_type === "DESPESA").reduce((sum, entry) => sum + entry.amount, 0),
        totalInventoryValue: inventory.reduce((sum, item) => sum + item.stock_value, 0)
      },
      orders,
      finance,
      inventory
    };
  }
}




























