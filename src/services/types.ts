export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  avatarInitial?: string;
  avatarColor?: string;
}

export interface AdminUser extends User {
  created_at?: string;
  updated_at?: string;
}

export interface CompanyBrand {
  code: string;
  name: string;
  shortName: string;
  appTitle: string;
  siteUrl: string;
  logoUrl: string;
  faviconUrl: string;
  accent: string;
}

export interface StoreContext {
  id: number;
  companyCode: string;
  code: string;
  name: string;
  shortName: string;
}

export interface LookupOption {
  id?: number;
  code: string;
  label: string;
  name?: string;
  tone?: string;
  icon?: string;
}

export interface MediaUploadPayload {
  base64: string;
  name: string;
  mimeType?: string;
}

export interface OrderAttachment {
  id: number;
  file_path: string;
  file_name: string;
  mime_type?: string;
  created_at: string;
  url: string;
}

export interface MetaPayload {
  roles: LookupOption[];
  orderStatuses: LookupOption[];
  approvalStatuses: LookupOption[];
  paymentMethods: LookupOption[];
  itemConditions: LookupOption[];
  entryTypes: LookupOption[];
  catalogCategories: string[];
  catalogSubcategoriesMap: Record<string, string[]>;
  taskStatuses: LookupOption[];
  taskPriorities: LookupOption[];
  taskContactChannels: LookupOption[];
  storeCashAccounts?: LookupOption[];
}

export interface ClientSummary {
  id: number;
  name: string;
  phone: string;
  email: string;
  document: string;
  address: string;
  photo_path?: string;
  photo_url?: string;
  notes: string;
  orders_count: number;
  total_spent: number;
  open_orders: number;
}

export interface ClientDetail extends ClientSummary {
  history: Array<{
    id: number;
    code: string;
    equipment: string;
    order_status: string;
    approval_status: string;
    total_amount: number;
    opened_at: string;
    updated_at: string;
  }>;
}

export interface CatalogItem {
  id: number;
  sku: string;
  name: string;
  brand: string;
  description: string;
  category: string;
  subcategory: string;
  compatibility: string;
  item_condition: string;
  stock_quantity: number;
  min_stock: number;
  cost_amount: number;
  price_amount: number;
  is_complete: number;
  active: number;
  is_store_inventory: number;
  unit_margin: number;
  stock_cost_value: number;
  stock_value: number;
  stock_health: string;
  stock_health_label: string;
  linked_orders_count: number;
  active_orders_count: number;
  total_quantity_used: number;
  open_quantity: number;
  last_order_code: string;
  last_used_at: string;
}

export interface CatalogUsageHistory {
  id: number;
  order_id: number;
  order_code: string;
  client_name: string;
  equipment: string;
  order_status: string;
  approval_status: string;
  technician_name: string;
  opened_at: string;
  updated_at: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  line_total: number;
}

export interface CatalogItemDetail extends CatalogItem {
  usage_history: CatalogUsageHistory[];
  replenishment_history: StockReplenishment[];
  stock_batches: CatalogStockBatch[];
}

export interface CatalogStockBatch {
  id: number;
  catalog_item_id: number;
  source_type: string;
  source_id: number | null;
  quantity: number;
  quantity_remaining: number;
  unit_cost: number;
  unit_price: number;
  notes: string;
  created_at: string;
  updated_at?: string | null;
  replenishment_id?: number | null;
  actor_name?: string | null;
  previous_cost_amount?: number | null;
  previous_price_amount?: number | null;
  remaining_cost_total?: number | null;
  remaining_price_total?: number | null;
}

export interface StockReplenishment {
  id: number;
  catalog_item_id: number;
  quantity: number;
  new_cost_amount: number;
  new_price_amount: number;
  previous_cost_amount: number | null;
  previous_price_amount: number | null;
  notes: string;
  actor_user_id: number | null;
  actor_name: string;
  created_at: string;
  finance_entry_id?: number | null;
  extra_finance_entry_id?: number | null;
  batch_id?: number | null;
  batch_quantity?: number | null;
  batch_quantity_remaining?: number | null;
  batch_unit_cost?: number | null;
  batch_unit_price?: number | null;
}
export interface CatalogDeleteResult {
  success: boolean;
  deletedCount: number;
  deleted: Array<{
    id: number;
    name: string;
    sku: string;
  }>;
  archivedCount?: number;
  archived?: Array<{
    id: number;
    name: string;
    sku: string;
    linkedOrders: number;
    linkedPosSales?: number;
  }>;
  blockedCount: number;
  blocked: Array<{
    id: number;
    name: string;
    sku: string;
    linkedOrders: number;
    linkedPosSales?: number;
  }>;
}

export interface OrderItem {
  id?: number;
  catalog_item_id?: number;
  catalogItemId?: number;
  item_name?: string;
  sku?: string;
  category?: string;
  item_condition?: string;
  quantity: number;
  unit_cost?: number;
  unit_price?: number;
  unitCost?: number;
  unitPrice?: number;
  current_stock?: number;
}
export interface OrderService {
  id?: number;
  service_id?: number;
  serviceId?: number;
  service_name?: string;
  description?: string;
  estimated_minutes?: number;
  quantity: number;
  unit_price?: number;
  unitPrice?: number;
  line_total?: number;
  lineTotal?: number;
}

export interface ServiceCatalogItem {
  id: number;
  name: string;
  description: string;
  price_amount: number;
  pricing_mode?: string;
  additional_price_amount?: number;
  estimated_minutes: number;
  available_in_order: number;
  available_in_pdv: number;
  allow_custom_price: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface RequestedProduct {
  id?: number;
  product_name?: string;
  name?: string;
  quantity?: number;
  sale_price?: number;
  salePrice?: number;
  status?: string;
  purchase_cost?: number | null;
  purchaseCost?: number | null;
  purchase_cash_account_id?: number | null;
  purchaseCashAccountId?: number | null;
  finance_entry_id?: number | null;
  purchased_at?: string;
  denied_at?: string;
  updated_total_amount?: number;
  created_at?: string;
  updated_at?: string;
}

export interface OrderSummary {
  id: number;
  code: string;
  client_id: number;
  client_name: string;
  client_phone: string;
  phone_snapshot: string;
  equipment: string;
  defect: string;
  extras: string;
  photo_path: string;
  technician_name: string;
  due_date: string;
  order_status: string;
  approval_status: string;
  quote_amount: number | null;
  pre_approved_limit: number | null;
  actual_amount: number | null;
  service_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  notes: string;
  opened_at: string;
  concluded_at: string;
  delivered_at: string;
  cancelled_at: string;
  items_count: number;
}

export interface OrderDetail extends OrderSummary {
  client_email: string;
  client_document: string;
  client_address: string;
  photo_url: string;
  attachments: OrderAttachment[];
  items: OrderItem[];
  services: OrderService[];
  requested_products: RequestedProduct[];
  estimated_total_minutes?: number;
}

export interface FinanceCategory {
  id: number;
  entry_type: string;
  name: string;
  active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export interface FinanceEntry {
  id: number;
  entry_type: string;
  category: string;
  description: string;
  amount: number;
  entry_date: string;
  payment_method: string;
  order_id: number | null;
  store_id?: number | null;
  cash_account_id?: number | null;
  cash_account_name?: string;
  cash_account_code?: string;
  finance_entry_id?: number | null;
  replenishment_id?: number | null;
  order_code?: string;
  source_workbook?: string;
  source_sheet?: string;
  source_row?: number | null;
  legacy_section?: string;
  raw_payload?: string;
}

export interface StoreCashAccount {
  id: number;
  store_id: number;
  code: string;
  name: string;
  baseline_amount: number;
  balance_amount: number;
  snapshot_source_workbook: string;
  snapshot_source_sheet: string;
  snapshot_source_row: number | null;
  snapshot_raw_payload: string;
  snapshot_updated_at: string;
  active: number;
  movement_count?: number;
  last_movement_date?: string;
}

export interface StoreCashMovement {
  id: number;
  store_id: number;
  cash_session_id: number | null;
  finance_entry_id: number | null;
  sale_id: number | null;
  cash_account_id: number | null;
  movement_type: string;
  entry_type: string;
  description: string;
  amount: number;
  movement_date: string;
  source_workbook?: string;
  source_sheet?: string;
  source_row?: number | null;
  legacy_section?: string;
  cash_account_name?: string;
  cash_account_code?: string;
  sale_code?: string;
  finance_category?: string;
  finance_payment_method?: string;
  replenishment_id?: number | null;
  raw_payload: string;
  created_at: string;
  updated_at: string;
}

export interface StoreCashTransferPayload {
  fromCashAccountId: number;
  toCashAccountId: number;
  amount: number;
  movementDate?: string;
  notes?: string;
  sourceDescription?: string;
  destinationDescription?: string;
  transferKey?: string;
}

export interface StoreCashTransferResult {
  success: boolean;
  fromAccount: StoreCashAccount;
  toAccount: StoreCashAccount;
}

export interface LegacyImportRow {
  id: number;
  import_run_id: number;
  source_workbook: string;
  source_sheet: string;
  source_row: number;
  entity_type: string;
  entity_id: number | null;
  structured_payload: string;
  raw_payload: string;
  created_at: string;
}

export interface LegacyImportSummary {
  source_workbook: string;
  source_sheet: string;
  entity_count: number;
  last_row: number;
}

export interface CashManagementMetric {
  rowIndex: number;
  prefix?: string;
  label: string;
  rawValue: string;
  value: number | null;
}

export interface CashManagementFutureRow {
  rowIndex: number;
  label: string;
  rawValue: string;
  value: number | null;
  date: string;
}

export interface CashManagementSheet {
  workbookName: string;
  workbookPath: string;
  sheetName: string;
  statusLabel: string;
  topSummary: {
    openingLabel: string;
    openingValueText: string;
    openingValue: number | null;
    openingDate: string;
    differenceLabel: string;
    differenceValueText: string;
    differenceValue: number | null;
    totalLabel: string;
    previousLabel: string;
    previousValueText: string;
    previousValue: number | null;
    currentLabel: string;
    currentValueText: string;
    currentValue: number | null;
    variationValueText: string;
    variationValue: number | null;
  };
  currentBalance: {
    label: string;
    rawValue: string;
    value: number | null;
  };
  balanceRows: CashManagementMetric[];
  typeSummary: {
    title: string;
    rows: CashManagementMetric[];
  };
  futureValues: {
    title: string;
    valueLabel: string;
    dateLabel: string;
    rows: CashManagementFutureRow[];
    mainTotalText: string;
    mainTotal: number | null;
    auxTotalLabels: string[];
    auxTotalTexts: string[];
    auxTotals: number[];
  };
  closingLeftRows: CashManagementMetric[];
  closingRightRows: CashManagementMetric[];
  notes: string[];
}

export interface FinanceWorkbookPayload {
  store: StoreContext;
  accounts: StoreCashAccount[];
  cashManagement?: CashManagementSheet | null;
  ledger: StoreCashMovement[];
  entriesAndExpenses: FinanceEntry[];
  purchases: FinanceEntry[];
  purchaseRequests?: RequestedProduct[];
  lowStockItems?: CatalogItem[];
  importSummary: LegacyImportSummary[];
}

export interface MysqlTransferTableSummary {
  table: string;
  rows: number;
}

export interface MysqlBackupResult {
  databaseName: string;
  tables: MysqlTransferTableSummary[];
  totalRows: number;
  exportedAt: string;
}

export interface MysqlImportResult {
  databaseName: string;
  importedTables: MysqlTransferTableSummary[];
  missingTables: string[];
  totalRows: number;
  importedAt: string;
}

export interface RemoteWorkbookSourceResult {
  fileName: string;
  originalUrl: string;
  resolvedUrl: string;
  size: number;
}

export interface RemoteLegacyImportResult {
  store: StoreContext;
  files: Array<Record<string, unknown>>;
  importedAt: string;
  sources: RemoteWorkbookSourceResult[];
}

export interface DailyTaskChecklistItem {
  id?: number;
  task_id?: number;
  label: string;
  checked: number | boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DailyTaskUpdate {
  id: number;
  task_id: number;
  actor_user_id: number | null;
  actor_name: string;
  message: string;
  created_at: string;
}

export interface DailyTask {
  id: number;
  store_id: number;
  order_id: number | null;
  order_code?: string;
  store_name?: string;
  store_short_name?: string;
  title: string;
  description: string;
  task_date: string;
  status: string;
  priority: string;
  responsible_name: string;
  client_name: string;
  phone: string;
  value_amount: number | null;
  value_label?: string;
  device: string;
  contact_channel: string;
  notes: string;
  source_workbook: string;
  source_sheet: string;
  source_row: number | null;
  legacy_queue_code?: string;
  legacy_queue_label?: string;
  legacy_priority_order?: number | null;
  legacy_status_label?: string;
  legacy_target_date?: string;
  raw_payload: string;
  created_by_user_id: number | null;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  updates?: DailyTaskUpdate[];
  checklist?: DailyTaskChecklistItem[];
}

export interface DailyTaskBoardColumn {
  code: string;
  label: string;
  tone: string;
  tasks: DailyTask[];
}

export interface DailyTaskBoard {
  date: string;
  columns: DailyTaskBoardColumn[];
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  tone: string;
  entity_type: string;
  entity_id: number | null;
  rule_key: string;
  read_at: string;
  resolved_at: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationRule {
  id: number;
  code: string;
  name: string;
  description: string;
  active: number;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: number;
  actor_user_id: number | null;
  actor_name: string;
  actor_role: string;
  entity_type: string;
  entity_id: number | null;
  action: string;
  before_state: string;
  after_state: string;
  context_data: string;
  created_at: string;
}

export interface PerformanceMetric {
  actorUserId: number | null;
  actorName: string;
  actorRole: string;
  totalActions: number;
  ordersCreated: number;
  ordersClosed: number;
  approvalsHandled: number;
  stockAdjustments: number;
  financeMoves: number;
  cashEvents: number;
  pdvSales: number;
  lastActionAt: string;
}

export interface OrderTimelineEvent {
  id: number;
  order_id: number;
  event_type: string;
  title: string;
  description: string;
  color: string;
  event_date: string;
  actor_user_id: number | null;
  actor_name: string;
  created_at: string;
}

export interface OrderTimelinePayload {
  order: OrderDetail;
  events: OrderTimelineEvent[];
}

export interface CalendarEntry {
  id: number;
  code: string;
  title: string;
  subtitle: string;
  startDate: string;
  endDate: string;
  orderStatus: string;
  approvalStatus: string;
  color: string;
  clientName: string;
  technicianName: string;
  totalAmount: number;
}

export interface BarcodeScanResult {
  code: string;
  digitsOnly: string;
  length: number;
  format: string;
}

export interface BarcodeLookupResult {
  code: string;
  title: string;
  description: string;
  externalUrl: string;
  sourceStatus: string;
  cached: boolean;
}

export interface FiscalDocumentItem {
  id: number;
  fiscal_document_id: number;
  line_number: number;
  sku: string;
  barcode: string;
  description: string;
  ncm: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_amount: number;
  matched_catalog_item_id: number | null;
  matched_catalog_name?: string;
  matched_catalog_sku?: string;
  action_status: string;
  action_payload: string;
}

export interface FiscalDocument {
  id: number;
  document_type: string;
  source_type: string;
  access_key: string;
  issuer_name: string;
  issuer_document: string;
  document_number: string;
  document_series: string;
  issued_at: string;
  total_amount: number;
  danfe_url: string;
  xml_payload: string;
  notes: string;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  items: FiscalDocumentItem[];
}

export interface CashSession {
  id: number;
  user_id: number;
  opened_by_user_id?: number | null;
  store_id?: number | null;
  store_name?: string;
  store_short_name?: string;
  operator_name: string;
  opening_amount: number;
  closing_amount: number;
  expected_amount: number;
  notes: string;
  status: string;
  opened_at: string;
  closed_at: string;
  created_at: string;
  updated_at: string;
}

export interface PosSaleItem {
  id: number;
  sale_id: number;
  catalog_item_id: number | null;
  service_catalog_id?: number | null;
  item_type?: string;
  item_name: string;
  sku: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

export interface PosPayment {
  id: number;
  sale_id: number;
  payment_method: string;
  amount: number;
  created_at: string;
}

export interface PosSale {
  id: number;
  code: string;
  cash_session_id: number;
  store_id?: number | null;
  store_name?: string;
  user_id: number;
  client_id: number | null;
  client_name: string;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
  operator_name?: string;
  items: PosSaleItem[];
  payments: PosPayment[];
}

export interface DashboardPayload {
  generatedAt: string;
  kpis: {
    ordersOpen: number;
    ordersPendingApproval: number;
    averageTicket: number;
    revenue: number;
    orderRevenue?: number;
    pdvRevenue?: number;
    anonymousPdvSales?: number;
    anonymousPdvRevenue?: number;
    totalEntries?: number;
    expense: number;
    margin: number;
    stockValue: number;
    approvalRate: number;
    projectedRevenue90d: number;
  };
  charts: {
    orderStatus: Array<{ label: string; value: number }>;
    approvals: Array<{ label: string; value: number }>;
    stockByCategory: Array<{ label: string; value: number }>;
    trend: Array<{ label: string; revenue: number; totalOrders: number; orderRevenue?: number; pdvRevenue?: number; totalSales?: number }>;
  };
  topClients: ClientSummary[];
  alerts: Array<{ title: string; subtitle: string; tone: string; value: string }>;
  notifications?: NotificationItem[];
  performance?: PerformanceMetric[];
}

export interface ReportsPayload {
  summary: {
    totalOrders: number;
    totalOrderValue: number;
    totalRevenue: number;
    totalExpenses: number;
    totalInventoryValue: number;
    totalInventoryUnits?: number;
    totalInventoryItems?: number;
    totalPdvValue?: number;
    totalEntries?: number;
    totalPurchaseExpenses?: number;
    officialCashBalance?: number;
    financeDifference?: number;
  };
  orders: OrderSummary[];
  finance: FinanceEntry[];
  purchases?: FinanceEntry[];
  inventory: CatalogItem[];
  notifications?: NotificationItem[];
  performance?: PerformanceMetric[];
  calendar?: CalendarEntry[];
}

export interface Filters {
  search?: string;
  status?: string;
  orderStatus?: string;
  approvalStatus?: string;
  technicianName?: string;
  clientId?: string | number;
  fromDate?: string;
  toDate?: string;
  category?: string;
  itemCondition?: string;
  lowStockOnly?: boolean | string;
  activeOnly?: boolean | string;
  storeInventoryOnly?: boolean | string;
  entryType?: string;
  paymentMethod?: string;
  unreadOnly?: boolean | string;
  entityType?: string;
  sourceWorkbook?: string;
  sourceSheet?: string;
  excludeSheet?: string;
  legacySection?: string;
  limit?: number | string;
  actorUserId?: string | number;
  userId?: string | number;
  openOnly?: boolean | string;
  storeId?: string | number;
  cashAccountId?: string | number;
  taskDate?: string;
  priority?: string;
  responsible?: string;
  includePendingFromPast?: boolean | string;
  includeBacklog?: boolean | string;
  withOrder?: boolean | string;
  withoutOrder?: boolean | string;
}



