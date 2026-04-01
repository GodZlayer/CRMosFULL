import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { createAppRepository } from "../server/app-repository.mjs";
import { repairMojibake } from "./text-repair.mjs";

const DEFAULT_DB_PATH = resolve(process.cwd(), "server", "storage", "database", "crm.sqlite");
const DEFAULT_UPLOADS_ROOT = resolve(process.cwd(), "server", "storage", "uploads");
const DEFAULT_OUTPUT_DIR = resolve(process.cwd(), "server", "storage", "imports");
const DEFAULT_SAMPLE_LIMIT = 3;

const COLLECTIONS = {
  clients: ["clients", "clientes", "customers"],
  catalogItems: ["catalogItems", "catalogo", "produtos", "estoque"],
  services: ["services", "servicos"],
  orders: ["orders", "os", "ordensServico", "ordens_servico"],
  financeEntries: ["financeEntries", "financeiro", "lancamentos"]
};

const SUBCOLLECTIONS = {
  orderItems: ["items", "orderItems", "produtos", "pecas"],
  orderServices: ["services", "servicos", "orderServices"],
  requestedProducts: ["requestedProducts", "encomendas", "produtosEncomendados"]
};

const FIELDS = {
  clients: {
    name: ["name", "nome"],
    phone: ["phone", "telefone", "celular", "whatsapp"],
    email: ["email"],
    document: ["document", "documento", "cpf", "cnpj"],
    address: ["address", "endereco"],
    notes: ["notes", "observacoes", "obs"],
    createdAt: ["createdAt", "created_at"],
    updatedAt: ["updatedAt", "updated_at"]
  },
  catalogItems: {
    sku: ["sku", "barcode", "ean"],
    name: ["name", "nome", "title"],
    category: ["category", "categoria"],
    subcategory: ["subcategory", "subcategoria"],
    description: ["description", "descricao"],
    itemCondition: ["itemCondition", "item_condition", "condition", "condicao"],
    stockQuantity: ["stockQuantity", "stock_quantity", "quantity", "quantidade", "estoque"],
    minStock: ["minStock", "min_stock", "estoqueMinimo"],
    costAmount: ["costAmount", "cost_amount", "valorCompra", "custo"],
    priceAmount: ["priceAmount", "price_amount", "valorVenda", "preco"],
    active: ["active", "ativo"],
    locationType: ["locationType", "location_type", "destino"],
    isStoreInventory: ["isStoreInventory", "is_store_inventory", "inventario"],
    createdAt: ["createdAt", "created_at"],
    updatedAt: ["updatedAt", "updated_at"]
  },
  services: {
    name: ["name", "nome", "title"],
    description: ["description", "descricao"],
    priceAmount: ["priceAmount", "price_amount", "price", "valor", "preco"],
    estimatedMinutes: ["estimatedMinutes", "estimated_minutes", "tempoMinimo"],
    active: ["active", "ativo"],
    createdAt: ["createdAt", "created_at"],
    updatedAt: ["updatedAt", "updated_at"]
  },
  orders: {
    clientRef: ["clientId", "client_id", "clientRef", "clienteId", "cliente.id", "client.id"],
    clientName: ["clientName", "client_name", "clienteNome", "client.name", "cliente.name"],
    clientPhone: ["clientPhone", "client_phone", "clienteTelefone", "client.phone", "cliente.phone"],
    equipmentName: ["equipmentName", "equipment", "equipamento"],
    accessories: ["accessories", "acessorios"],
    accessoriesOther: ["accessoriesOther", "acessoriosOutros"],
    defect: ["defect", "defeito", "defeitoRelatado"],
    extras: ["extras", "estadoFisico", "estado_fisico", "physicalState"],
    preApproved: ["preApproved", "pre_approved"],
    approvalStatus: ["approvalStatus", "approval_status", "statusAprovacao"],
    orderStatus: ["orderStatus", "order_status", "status"],
    dueDate: ["dueDate", "due_date", "previsao"],
    openedAt: ["openedAt", "opened_at", "dataAbertura"],
    actualAmount: ["actualAmount", "actual_amount", "valorReal"],
    discountAmount: ["discountAmount", "discount_amount", "desconto"],
    paymentMethod: ["paymentMethod", "payment_method", "formaPagamento"],
    notes: ["notes", "observacoes", "obs"],
    code: ["code", "codigo"],
    items: ["items", "produtos", "pecas"],
    services: ["services", "servicos"],
    requestedProducts: ["requestedProducts", "encomendas", "produtosEncomendados"],
    createdAt: ["createdAt", "created_at"],
    updatedAt: ["updatedAt", "updated_at"],
    concludedAt: ["concludedAt", "concluded_at"],
    deliveredAt: ["deliveredAt", "delivered_at"],
    cancelledAt: ["cancelledAt", "cancelled_at"]
  },
  orderItems: {
    catalogRef: ["catalogItemId", "catalog_item_id", "itemId", "item.id", "productId", "product.id"],
    sku: ["sku", "itemSku", "productSku"],
    name: ["name", "nome", "itemName", "productName"],
    quantity: ["quantity", "quantidade", "qty"]
  },
  orderServices: {
    serviceRef: ["serviceId", "service_id", "servicoId", "service.id"],
    name: ["name", "nome", "serviceName"]
  },
  financeEntries: {
    entryType: ["entryType", "entry_type", "tipo"],
    category: ["category", "categoria"],
    description: ["description", "descricao", "desc"],
    amount: ["amount", "valor"],
    entryDate: ["entryDate", "entry_date", "date", "data"],
    paymentMethod: ["paymentMethod", "payment_method", "formaPagamento"],
    orderRef: ["orderId", "order_id", "orderRef", "osId", "os.id", "codigoOS"],
    createdAt: ["createdAt", "created_at"],
    updatedAt: ["updatedAt", "updated_at"]
  }
};

const ENUMS = {
  orderStatus: buildEnumMap({ ABERTA: ["ABERTA", "ABERTO", "OPEN"], EM_ANDAMENTO: ["EM_ANDAMENTO", "EM ANDAMENTO", "IN_PROGRESS"], CONCLUIDA: ["CONCLUIDA", "CONCLU�DA", "ENTREGUE", "ENTREGUE_FECHADA", "CLOSED"], CANCELADA: ["CANCELADA", "CANCELADO", "CANCELLED"] }),
  approvalStatus: buildEnumMap({ PRE_APROVADA: ["PRE_APROVADA", "PR�-APROVADA", "PRE APPROVED"], APROVADA: ["APROVADA", "APPROVED"], AGUARDANDO_APROVACAO: ["AGUARDANDO_APROVACAO", "AGUARDANDO APROVA��O", "PENDING"], REJEITADA: ["REJEITADA", "REJECTED"] }),
  itemCondition: buildEnumMap({ NOVA: ["NOVA", "NOVO", "NEW"], SEMINOVA: ["SEMINOVA", "SEMI-NOVA"], USADA: ["USADA", "USADO", "USED"] }),
  locationType: buildEnumMap({ ESTOQUE: ["ESTOQUE", "STOCK"], INVENTARIO: ["INVENTARIO", "INVENT�RIO", "INVENTORY"] }),
  entryType: buildEnumMap({ RECEITA: ["RECEITA", "REVENUE", "INCOME", "ENTRADA"], DESPESA: ["DESPESA", "EXPENSE", "SAIDA", "SA�DA"] }),
  paymentMethod: buildEnumMap({ NAO_DEFINIDO: ["NAO_DEFINIDO", "N�O DEFINIDO", "UNDEFINED"], PIX: ["PIX"], DINHEIRO: ["DINHEIRO", "CASH"], CARTAO: ["CARTAO", "CART�O", "CARD"], BOLETO: ["BOLETO"], TRANSFERENCIA: ["TRANSFERENCIA", "TRANSFER�NCIA", "BANK_TRANSFER"] })
};

const HELP = `Uso:\n  node --experimental-sqlite scripts/migrate-firestore.mjs inspect --service-account caminho.json\n  node --experimental-sqlite scripts/migrate-firestore.mjs migrate --service-account caminho.json --mapping scripts/firestore-mapping.example.json\n\nOpcoes:\n  --service-account <arquivo>\n  --project-id <id>\n  --mapping <arquivo>\n  --output <arquivo>\n  --db-path <arquivo>\n  --uploads-root <pasta>\n  --actor-email <email>\n  --sample-limit <n>\n  --allow-nonempty\n  --clear-first\n  --help`;

async function main() {
  const { mode, options } = parseArgs(process.argv.slice(2));
  if (!mode || options.help) {
    console.log(HELP);
    return;
  }

  const firestore = await connectFirestore(options);
  if (mode === "inspect") {
    const result = await inspectFirestore(firestore, Number.parseInt(String(options.sampleLimit || DEFAULT_SAMPLE_LIMIT), 10) || DEFAULT_SAMPLE_LIMIT, options.output);
    console.log(`Inspecao concluida: ${result.outputPath}`);
    return;
  }

  if (mode !== "migrate") {
    throw new Error(`Modo invalido: ${mode}`);
  }

  if (!options.mapping) {
    throw new Error("Informe --mapping para executar a migracao.");
  }

  const mappingPath = resolve(process.cwd(), options.mapping);
  if (!existsSync(mappingPath)) {
    throw new Error(`Arquivo de mapeamento nao encontrado: ${mappingPath}`);
  }

  const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  const result = await migrateFirestore(firestore, mapping, options);
  console.log(`Migracao concluida: ${result.outputPath}`);
  console.log(JSON.stringify(result.summary, null, 2));
}

function parseArgs(argv) {
  const options = {};
  let mode = "";
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    if (!mode && !token.startsWith("--")) {
      mode = token;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { mode, options };
}

async function connectFirestore(options) {
  const serviceAccountPath = options.serviceAccount
    ? resolve(process.cwd(), options.serviceAccount)
    : process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : "";
  if (!serviceAccountPath || !existsSync(serviceAccountPath)) {
    throw new Error("Service account nao encontrado. Use --service-account caminho.json ou GOOGLE_APPLICATION_CREDENTIALS.");
  }

  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount), projectId: options.projectId || serviceAccount.project_id });
  return {
    db: getFirestore(app),
    projectId: options.projectId || serviceAccount.project_id,
    serviceAccountPath
  };
}

async function inspectFirestore(firestore, sampleLimit, requestedOutput) {
  const collections = await firestore.db.listCollections();
  const summary = {
    inspectedAt: new Date().toISOString(),
    projectId: firestore.projectId,
    collections: []
  };

  for (const collection of collections) {
    let totalDocuments = null;
    try {
      totalDocuments = Number((await collection.count().get()).data().count || 0);
    } catch {
      totalDocuments = null;
    }
    const sampleSnapshot = await collection.limit(Math.max(1, sampleLimit)).get();
    const samples = [];
    for (const doc of sampleSnapshot.docs) {
      const subcollections = await doc.ref.listCollections();
      samples.push({
        id: doc.id,
        fields: Object.keys(normalizeValue(doc.data())),
        subcollections: subcollections.map((item) => item.id),
        sample: normalizeValue(doc.data())
      });
    }
    summary.collections.push({ name: collection.id, totalDocuments, samples });
  }

  const outputPath = resolveOutputPath(requestedOutput, "firestore-inspect");
  writeJson(outputPath, summary);
  return { outputPath, summary };
}
async function migrateFirestore(firestore, mapping, options) {
  const repo = createAppRepository({
    seedDemo: false,
    dbPath: options.dbPath ? resolve(process.cwd(), options.dbPath) : DEFAULT_DB_PATH,
    uploadsRoot: options.uploadsRoot ? resolve(process.cwd(), options.uploadsRoot) : DEFAULT_UPLOADS_ROOT
  });

  try {
    const counts = {
      clients: repo.listClients({}).length,
      catalogItems: repo.listCatalogItems({}).length,
      services: repo.listServices({}).length,
      orders: repo.listOrders({}).length,
      financeEntries: repo.listFinanceEntries({}).length
    };

    if (options.clearFirst) {
      repo.clearBusinessData();
    } else if (!options.allowNonEmpty && Object.values(counts).some((value) => value > 0)) {
      throw new Error(`O banco de destino ja possui dados: ${JSON.stringify(counts)}. Use --allow-nonempty ou --clear-first.`);
    }

    const actor = options.actorEmail ? getActorByEmail(repo, options.actorEmail) : null;
    const collectionNames = new Set((await firestore.db.listCollections()).map((item) => item.id));
    const context = {
      repo,
      firestore,
      mapping,
      actor,
      collectionNames,
      warnings: [],
      created: { clients: 0, catalogItems: 0, services: 0, orders: 0, financeEntries: 0, financeCategories: 0 },
      skipped: { clients: 0, catalogItems: 0, services: 0, orders: 0, financeEntries: 0 },
      refs: { clients: new Map(), catalogItems: new Map(), services: new Map(), orders: new Map(), financeCategories: new Map() }
    };

    await importClients(context);
    await importCatalogItems(context);
    await importServices(context);
    await importOrders(context);
    await importFinanceEntries(context);

    const summary = {
      projectId: firestore.projectId,
      migratedAt: new Date().toISOString(),
      created: context.created,
      skipped: context.skipped,
      warnings: context.warnings
    };
    const outputPath = resolveOutputPath(options.output, "firestore-migrate");
    writeJson(outputPath, summary);
    return { outputPath, summary };
  } finally {
    repo.close();
  }
}

async function importClients(context) {
  for (const doc of await loadRootDocs(context, "clients")) {
    const payload = {
      name: readString(doc.data, context.mapping, "clients", "name"),
      phone: readString(doc.data, context.mapping, "clients", "phone"),
      email: readString(doc.data, context.mapping, "clients", "email"),
      document: readString(doc.data, context.mapping, "clients", "document"),
      address: readString(doc.data, context.mapping, "clients", "address"),
      notes: readString(doc.data, context.mapping, "clients", "notes"),
      _actor: context.actor
    };
    if (!payload.name || !payload.phone) {
      context.skipped.clients += 1;
      context.warnings.push(`Cliente ${doc.id} ignorado por falta de nome ou telefone.`);
      continue;
    }
    const created = context.repo.saveClient(payload);
    touchRecord(context.repo, "clients", created.id, readDateTime(doc.data, context.mapping, "clients", "createdAt"), readDateTime(doc.data, context.mapping, "clients", "updatedAt"));
    registerRef(context.refs.clients, doc.id, created.id, [payload.name, payload.phone]);
    context.created.clients += 1;
  }
}

async function importCatalogItems(context) {
  for (const doc of await loadRootDocs(context, "catalogItems")) {
    const data = doc.data;
    const payload = {
      sku: emptyToNull(readString(data, context.mapping, "catalogItems", "sku")),
      name: readString(data, context.mapping, "catalogItems", "name"),
      category: readString(data, context.mapping, "catalogItems", "category"),
      subcategory: readString(data, context.mapping, "catalogItems", "subcategory"),
      description: resolveCatalogDescription(data, context.mapping),
      itemCondition: resolveCatalogCondition(data, context.mapping),
      stockQuantity: readNumber(data, context.mapping, "catalogItems", "stockQuantity", 0),
      minStock: readNumber(data, context.mapping, "catalogItems", "minStock", 0),
      costAmount: readNumber(data, context.mapping, "catalogItems", "costAmount", 0),
      priceAmount: readNumber(data, context.mapping, "catalogItems", "priceAmount", 0),
      active: readBoolean(data, context.mapping, "catalogItems", "active", true),
      locationType: resolveLocationType(data, context.mapping),
      _actor: context.actor
    };
    if (!payload.name || !payload.category) {
      context.skipped.catalogItems += 1;
      context.warnings.push(`Item ${doc.id} ignorado por falta de nome ou categoria.`);
      continue;
    }
    const created = context.repo.saveCatalogItem(payload);
    touchRecord(context.repo, "catalog_items", created.id, readDateTime(data, context.mapping, "catalogItems", "createdAt"), readDateTime(data, context.mapping, "catalogItems", "updatedAt"));
    registerRef(context.refs.catalogItems, doc.id, created.id, [payload.sku, payload.name]);
    context.created.catalogItems += 1;
  }
}

async function importServices(context) {
  for (const doc of await loadRootDocs(context, "services")) {
    const data = doc.data;
    const payload = {
      name: readString(data, context.mapping, "services", "name"),
      description: readString(data, context.mapping, "services", "description"),
      priceAmount: readNumber(data, context.mapping, "services", "priceAmount", 0),
      estimatedMinutes: readNumber(data, context.mapping, "services", "estimatedMinutes", 0),
      active: readBoolean(data, context.mapping, "services", "active", true),
      _actor: context.actor
    };
    if (!payload.name) {
      context.skipped.services += 1;
      context.warnings.push(`Servico ${doc.id} ignorado por falta de nome.`);
      continue;
    }
    const created = context.repo.saveService(payload);
    touchRecord(context.repo, "service_catalog", created.id, readDateTime(data, context.mapping, "services", "createdAt"), readDateTime(data, context.mapping, "services", "updatedAt"));
    registerRef(context.refs.services, doc.id, created.id, [payload.name]);
    context.created.services += 1;
  }
}

async function importOrders(context) {
  for (const doc of await loadRootDocs(context, "orders")) {
    const data = doc.data;
    const clientId = resolveOrderClient(context, doc.id, data);
    if (!clientId) {
      context.skipped.orders += 1;
      context.warnings.push(`OS ${doc.id} ignorada por nao resolver cliente.`);
      continue;
    }

    const inlineItems = readArray(data, context.mapping, "orders", "items");
    const inlineServices = readArray(data, context.mapping, "orders", "services");
    const inlineRequestedProducts = normalizeList(readValue(data, fieldSpec(context.mapping, "orders", "requestedProducts")));
    const items = buildOrderItems(context, inlineItems.length ? inlineItems : await loadChildDocs(doc.ref, SUBCOLLECTIONS.orderItems), doc.id);
    const services = buildOrderServices(context, inlineServices.length ? inlineServices : await loadChildDocs(doc.ref, SUBCOLLECTIONS.orderServices), doc.id);
    const requestedProducts = (inlineRequestedProducts.length ? inlineRequestedProducts : await loadChildDocs(doc.ref, SUBCOLLECTIONS.requestedProducts)).map((item) => ({ name: typeof item === "string" ? item.trim() : readString(item, {}, "requestedProducts", "name", ["name", "nome", "productName"]) })).filter((item) => item.name);

    const payload = {
      clientId,
      equipmentName: readString(data, context.mapping, "orders", "equipmentName"),
      accessories: resolveAccessories(readValue(data, fieldSpec(context.mapping, "orders", "accessories")), readString(data, context.mapping, "orders", "accessoriesOther")),
      accessoriesOther: readString(data, context.mapping, "orders", "accessoriesOther"),
      defect: readString(data, context.mapping, "orders", "defect"),
      extras: readString(data, context.mapping, "orders", "extras"),
      preApproved: readBoolean(data, context.mapping, "orders", "preApproved", false),
      approvalStatus: normalizeEnum(readValue(data, fieldSpec(context.mapping, "orders", "approvalStatus")), ENUMS.approvalStatus, "AGUARDANDO_APROVACAO"),
      orderStatus: normalizeEnum(readValue(data, fieldSpec(context.mapping, "orders", "orderStatus")), ENUMS.orderStatus, "ABERTA"),
      paymentMethod: normalizeEnum(readValue(data, fieldSpec(context.mapping, "orders", "paymentMethod")), ENUMS.paymentMethod, "NAO_DEFINIDO"),
      dueDate: readDateOnly(data, context.mapping, "orders", "dueDate"),
      openedAt: readDateOnly(data, context.mapping, "orders", "openedAt"),
      actualAmount: readNumber(data, context.mapping, "orders", "actualAmount", 0),
      discountAmount: readNumber(data, context.mapping, "orders", "discountAmount", 0),
      notes: readString(data, context.mapping, "orders", "notes"),
      items,
      services,
      requestedProducts,
      _actor: context.actor
    };

    if (!payload.equipmentName || !payload.defect) {
      context.skipped.orders += 1;
      context.warnings.push(`OS ${doc.id} ignorada por falta de equipamento ou defeito.`);
      continue;
    }

    const created = context.repo.saveOrder(payload);
    updateOrderFields(context.repo, created.id, {
      code: readString(data, context.mapping, "orders", "code"),
      openedAt: payload.openedAt,
      concludedAt: readDateOnly(data, context.mapping, "orders", "concludedAt"),
      deliveredAt: readDateOnly(data, context.mapping, "orders", "deliveredAt"),
      cancelledAt: readDateOnly(data, context.mapping, "orders", "cancelledAt"),
      actualAmount: payload.actualAmount,
      createdAt: readDateTime(data, context.mapping, "orders", "createdAt"),
      updatedAt: readDateTime(data, context.mapping, "orders", "updatedAt")
    }, context.warnings);
    registerRef(context.refs.orders, doc.id, created.id, [created.code, readString(data, context.mapping, "orders", "code")]);
    context.created.orders += 1;
  }
}

async function importFinanceEntries(context) {
  for (const doc of await loadRootDocs(context, "financeEntries")) {
    const data = doc.data;
    const entryType = normalizeEnum(readValue(data, fieldSpec(context.mapping, "financeEntries", "entryType")), ENUMS.entryType, "DESPESA");
    const category = readString(data, context.mapping, "financeEntries", "category");
    const description = readString(data, context.mapping, "financeEntries", "description");
    const amount = readNumber(data, context.mapping, "financeEntries", "amount", 0);
    if (!category || !description || amount <= 0) {
      context.skipped.financeEntries += 1;
      context.warnings.push(`Lancamento ${doc.id} ignorado por falta de categoria, descricao ou valor.`);
      continue;
    }
    ensureFinanceCategory(context, entryType, category);
    const created = context.repo.saveFinanceEntry({
      entryType,
      category,
      description,
      amount,
      entryDate: readDateOnly(data, context.mapping, "financeEntries", "entryDate"),
      paymentMethod: normalizeEnum(readValue(data, fieldSpec(context.mapping, "financeEntries", "paymentMethod")), ENUMS.paymentMethod, "NAO_DEFINIDO"),
      orderId: resolveOrderRef(context, readValue(data, fieldSpec(context.mapping, "financeEntries", "orderRef"))),
      _actor: context.actor
    });
    touchRecord(context.repo, "finance_entries", created.id, readDateTime(data, context.mapping, "financeEntries", "createdAt"), readDateTime(data, context.mapping, "financeEntries", "updatedAt"));
    context.created.financeEntries += 1;
  }
}
function getActorByEmail(repo, email) {
  const actor = repo.db.prepare("SELECT id, name, email, role FROM users WHERE lower(email) = lower(:email) LIMIT 1").get({ email: String(email || "").trim() });
  if (!actor) throw new Error(`Usuario local nao encontrado para --actor-email: ${email}`);
  return actor;
}

function ensureFinanceCategory(context, entryType, categoryName) {
  const key = `${entryType}:${categoryName.toLowerCase()}`;
  if (context.refs.financeCategories.has(key)) return context.refs.financeCategories.get(key);
  const existing = context.repo.listFinanceCategories(entryType).find((item) => String(item.name || "").toLowerCase() === categoryName.toLowerCase());
  if (existing) {
    context.refs.financeCategories.set(key, existing.id);
    return existing.id;
  }
  const created = context.repo.saveFinanceCategory({ entryType, name: categoryName, active: true, _actor: context.actor });
  context.refs.financeCategories.set(key, created.id);
  context.created.financeCategories += 1;
  return created.id;
}

function resolveOrderClient(context, orderDocId, data) {
  const ref = resolveClientRef(context, readValue(data, fieldSpec(context.mapping, "orders", "clientRef")));
  if (ref) return ref;
  const name = readString(data, context.mapping, "orders", "clientName");
  const phone = readString(data, context.mapping, "orders", "clientPhone");
  if (!name || !phone) return null;
  const existing = context.repo.listClients({}).find((item) => String(item.name || "").trim().toLowerCase() === name.toLowerCase() && String(item.phone || "").trim() === phone);
  if (existing) return existing.id;
  const created = context.repo.saveClient({ name, phone, _actor: context.actor, notes: `Cliente criado automaticamente na migracao da OS ${orderDocId}.` });
  context.created.clients += 1;
  return created.id;
}

function buildOrderItems(context, sourceItems, orderDocId) {
  const result = [];
  for (const item of sourceItems) {
    const record = normalizeValue(item);
    const catalogItemId = resolveCatalogItemRef(context, record);
    if (!catalogItemId) {
      context.warnings.push(`OS ${orderDocId}: item ignorado por nao resolver catalogo.`);
      continue;
    }
    result.push({ catalogItemId, quantity: Math.max(1, Math.trunc(readNumber(record, context.mapping, "orderItems", "quantity", 1))) });
  }
  return result;
}

function buildOrderServices(context, sourceServices, orderDocId) {
  const result = [];
  const seen = new Set();
  for (const item of sourceServices) {
    const record = normalizeValue(item);
    const serviceId = resolveServiceRef(context, record);
    if (!serviceId) {
      context.warnings.push(`OS ${orderDocId}: servico ignorado por nao resolver catalogo de servicos.`);
      continue;
    }
    if (seen.has(serviceId)) continue;
    seen.add(serviceId);
    result.push({ serviceId });
  }
  return result;
}

function resolveClientRef(context, rawValue) {
  const key = refKey(rawValue);
  if (!key) return null;
  return context.refs.clients.get(key) || context.refs.clients.get(`search:${key}`) || null;
}

function resolveCatalogItemRef(context, record) {
  const direct = refKey(readValue(record, fieldSpec(context.mapping, "orderItems", "catalogRef")));
  if (direct && context.refs.catalogItems.has(direct)) return context.refs.catalogItems.get(direct);
  const sku = readString(record, context.mapping, "orderItems", "sku");
  if (sku) {
    const mapped = context.refs.catalogItems.get(`search:${sku.toLowerCase()}`);
    if (mapped) return mapped;
    const existing = context.repo.listCatalogItems({}).find((item) => String(item.sku || "").toLowerCase() === sku.toLowerCase());
    if (existing) return existing.id;
  }
  const name = readString(record, context.mapping, "orderItems", "name");
  if (name) {
    const mapped = context.refs.catalogItems.get(`search:${name.toLowerCase()}`);
    if (mapped) return mapped;
    const existing = context.repo.listCatalogItems({}).find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
  }
  return null;
}

function resolveServiceRef(context, record) {
  const direct = refKey(readValue(record, fieldSpec(context.mapping, "orderServices", "serviceRef")));
  if (direct && context.refs.services.has(direct)) return context.refs.services.get(direct);
  const name = readString(record, context.mapping, "orderServices", "name");
  if (!name) return null;
  const mapped = context.refs.services.get(`search:${name.toLowerCase()}`);
  if (mapped) return mapped;
  const existing = context.repo.listServices({}).find((item) => String(item.name || "").toLowerCase() === name.toLowerCase());
  return existing?.id || null;
}

function resolveOrderRef(context, rawValue) {
  const key = refKey(rawValue);
  if (!key) return null;
  return context.refs.orders.get(key) || context.refs.orders.get(`search:${key}`) || context.repo.listOrders({}).find((item) => String(item.code || "").toLowerCase() === key)?.id || null;
}

function resolveLocationType(data, mapping) {
  const direct = normalizeEnum(readValue(data, fieldSpec(mapping, "catalogItems", "locationType")), ENUMS.locationType, "");
  if (direct) return direct;
  return readBoolean(data, mapping, "catalogItems", "isStoreInventory", false) ? "INVENTARIO" : "ESTOQUE";
}

function resolveCatalogCondition(data, mapping) {
  const direct = normalizeEnum(readValue(data, fieldSpec(mapping, "catalogItems", "itemCondition")), ENUMS.itemCondition, "");
  if (direct) return direct;
  const usedFlag = readValue(data, ["usado", "used"]);
  if (usedFlag === true || usedFlag === 1 || String(usedFlag || "").toLowerCase() === "true") {
    return "USADA";
  }
  const categoryName = String(readValue(data, ["categoriaNome", "categoria_nome", "categoryName"]) || "").toLowerCase();
  if (categoryName.includes("usad")) return "USADA";
  if (categoryName.includes("semi")) return "SEMINOVA";
  return "NOVA";
}

function resolveCatalogDescription(data, mapping) {
  const direct = readString(data, mapping, "catalogItems", "description");
  if (direct) return direct;
  const parts = [
    readString(data, {}, "catalogItems", "description", ["marca", "brand"]),
    readString(data, {}, "catalogItems", "description", ["observacoes", "observa��o", "obs", "notes"])
  ].filter(Boolean);
  return parts.join(' | ');
}

function resolveAccessories(value, accessoriesOther) {
  const list = [...new Set(normalizeList(value).map((item) => String(item).trim()).filter(Boolean))];
  if (!list.length) return ["Sem acessorios"];
  if (accessoriesOther && !list.includes("Outro")) list.push("Outro");
  return list;
}

async function loadRootDocs(context, entityKey) {
  const collectionName = resolveCollectionName(context.mapping, context.collectionNames, entityKey);
  if (!collectionName) return [];
  const snapshot = await context.firestore.db.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ref: doc.ref, data: normalizeValue(doc.data()) }));
}

async function loadChildDocs(docRef, candidates) {
  const available = await docRef.listCollections();
  const names = new Set(available.map((item) => item.id));
  let chosen = "";
  for (const candidate of candidates) {
    if (names.has(candidate)) {
      chosen = candidate;
      break;
    }
  }
  if (!chosen) return [];
  const collection = available.find((item) => item.id === chosen);
  const snapshot = await collection.get();
  return snapshot.docs.map((doc) => normalizeValue(doc.data()));
}

function resolveCollectionName(mapping, available, entityKey) {
  const configured = asArray(mapping?.collections?.[entityKey]);
  const candidates = configured.length ? configured : COLLECTIONS[entityKey] || [];
  for (const name of candidates) {
    if (available.has(name)) return name;
  }
  return candidates[0] || "";
}

function fieldSpec(mapping, entityKey, fieldKey) {
  return mapping?.fields?.[entityKey]?.[fieldKey] || FIELDS[entityKey]?.[fieldKey] || [];
}

function readValue(record, spec) {
  for (const path of asArray(spec)) {
    const value = getByPath(record, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function readString(record, mapping, entityKey, fieldKey, fallbackSpec = null) {
  const value = readValue(record, fallbackSpec || fieldSpec(mapping, entityKey, fieldKey));
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return repairMojibake(value).trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function readNumber(record, mapping, entityKey, fieldKey, fallback = 0) {
  const value = readValue(record, fieldSpec(mapping, entityKey, fieldKey));
  const parsed = parseNumber(value);
  return parsed === null ? fallback : parsed;
}

function readBoolean(record, mapping, entityKey, fieldKey, fallback = false) {
  const value = readValue(record, fieldSpec(mapping, entityKey, fieldKey));
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "TRUE", "SIM", "YES", "ATIVO"].includes(normalizeToken(value));
}

function readArray(record, mapping, entityKey, fieldKey) {
  return normalizeList(readValue(record, fieldSpec(mapping, entityKey, fieldKey)));
}

function readDateTime(record, mapping, entityKey, fieldKey) {
  return toIsoDateTime(readValue(record, fieldSpec(mapping, entityKey, fieldKey)));
}

function readDateOnly(record, mapping, entityKey, fieldKey) {
  return toIsoDate(readValue(record, fieldSpec(mapping, entityKey, fieldKey)));
}

function getByPath(record, path) {
  const segments = String(path || "").split(".");
  let current = record;
  for (const segment of segments) {
    if (!segment) continue;
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

function normalizeValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return repairMojibake(value);
  if (typeof value === "object") {
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (typeof value.id === "string" && typeof value.path === "string") return { id: value.id, path: value.path };
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry)]));
  }
  return value;
}

function normalizeList(value) {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return repairMojibake(value).split(/[;,|]/g).map((item) => repairMojibake(item).trim()).filter(Boolean);
  return [value];
}

function refKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.includes("/")) return trimmed.split("/").filter(Boolean).pop().toLowerCase();
    return trimmed.toLowerCase();
  }
  if (typeof value === "object") {
    if (typeof value.id === "string") return value.id.toLowerCase();
    if (typeof value.path === "string") return value.path.split("/").filter(Boolean).pop().toLowerCase();
  }
  return "";
}

function registerRef(map, sourceId, localId, searchTerms = []) {
  map.set(String(sourceId).toLowerCase(), Number(localId));
  for (const term of searchTerms) {
    if (!term) continue;
    map.set(`search:${String(term).trim().toLowerCase()}`, Number(localId));
  }
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDateTime(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value > 1000000000000 ? value : value * 1000).toISOString();
  const text = String(value).trim();
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, day, month, year, hour = "12", minute = "00", second = "00"] = br;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`).toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function toIsoDate(value) {
  const iso = toIsoDateTime(value);
  if (iso) return iso.slice(0, 10);
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeEnum(value, map, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  return map[normalizeToken(String(value))] || fallback;
}

function normalizeToken(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

function buildEnumMap(definition) {
  const map = {};
  for (const [canonical, aliases] of Object.entries(definition)) {
    for (const alias of aliases) map[normalizeToken(alias)] = canonical;
  }
  return map;
}

function touchRecord(repo, table, id, createdAt, updatedAt) {
  const safeCreatedAt = createdAt || updatedAt || new Date().toISOString();
  const safeUpdatedAt = updatedAt || createdAt || safeCreatedAt;
  repo.db.prepare(`UPDATE ${table} SET created_at = :createdAt, updated_at = :updatedAt WHERE id = :id`).run({ id: Number(id), createdAt: safeCreatedAt, updatedAt: safeUpdatedAt });
}

function updateOrderFields(repo, orderId, payload, warnings) {
  const current = repo.getOrder(orderId);
  if (!current) return;
  let code = payload.code || current.code;
  if (payload.code && payload.code !== current.code) {
    const duplicate = repo.db.prepare("SELECT id FROM orders WHERE code = :code AND id != :id LIMIT 1").get({ code: payload.code, id: orderId });
    if (duplicate) {
      warnings.push(`OS ${orderId}: codigo ${payload.code} nao foi aplicado porque ja existe na base.`);
      code = current.code;
    }
  }
  repo.db.prepare(`UPDATE orders SET code = :code, opened_at = COALESCE(NULLIF(:openedAt, ''), opened_at), concluded_at = COALESCE(NULLIF(:concludedAt, ''), concluded_at), delivered_at = COALESCE(NULLIF(:deliveredAt, ''), delivered_at), cancelled_at = COALESCE(NULLIF(:cancelledAt, ''), cancelled_at), actual_amount = CASE WHEN :actualAmount IS NULL THEN actual_amount ELSE :actualAmount END, created_at = COALESCE(NULLIF(:createdAt, ''), created_at), updated_at = COALESCE(NULLIF(:updatedAt, ''), updated_at) WHERE id = :id`).run({ id: Number(orderId), code, openedAt: payload.openedAt || "", concludedAt: payload.concludedAt || "", deliveredAt: payload.deliveredAt || payload.concludedAt || "", cancelledAt: payload.cancelledAt || "", actualAmount: Number.isFinite(Number(payload.actualAmount)) ? Number(payload.actualAmount) : null, createdAt: payload.createdAt || "", updatedAt: payload.updatedAt || payload.createdAt || "" });
}

function emptyToNull(value) {
  return value ? value : null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function resolveOutputPath(requestedPath, prefix) {
  mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true });
  if (requestedPath) {
    const resolved = resolve(process.cwd(), requestedPath);
    mkdirSync(dirname(resolved), { recursive: true });
    return resolved;
  }
  return join(DEFAULT_OUTPUT_DIR, `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
}

function writeJson(filePath, payload) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});





