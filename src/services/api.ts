import type {
  AdminUser,
  AutomationRule,
  BarcodeLookupResult,
  BarcodeScanResult,
  CalendarEntry,
  CatalogDeleteResult,
  CatalogItem,
  CatalogItemDetail,
  CashSession,
  DailyTask,
  DailyTaskBoard,
  ServiceCatalogItem,
  ClientDetail,
  ClientSummary,
  CompanyBrand,
  DashboardPayload,
  Filters,
  FinanceWorkbookPayload,
  FinanceEntry,
  FinanceCategory,
  FiscalDocument,
  GmailApiSettings,
  LegacyImportRow,
  LegacyImportSummary,
  MediaUploadPayload,
  MysqlBackupResult,
  MysqlImportResult,
  MetaPayload,
  NotificationItem,
  OrderDetail,
  OrderSummary,
  OrderTimelinePayload,
  RequestedProduct,
  PerformanceMetric,
  PosSale,
  ReportsPayload,
  RemoteLegacyImportResult,
  StoreCashAccount,
  StoreCashTransferPayload,
  StoreCashTransferResult,
  StoreContext,
  User,
  WebstoreSettings,
  WebstoreStatus
} from "./types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {})
      },
      ...options
    });
  } catch {
    throw new Error("Falha de conexao com a API local. Reinicie o `npm run dev` e tente novamente.");
  }

  const rawBody = await response.text();
  let payload: Record<string, any> = {};

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      if (!response.ok) {
        throw new Error(`A API respondeu com erro ${response.status}, mas sem JSON valido.`);
      }
      throw new Error("A API local respondeu em formato inesperado. Reinicie o `npm run dev` e tente novamente.");
    }
  }

  if (!response.ok) {
    throw new Error(String(payload.message || `Falha na requisicao (${response.status}).`));
  }

  return payload as T;
}

function toQuery(filters: Filters = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export interface SessionPayload {
  user: User | null;
  company: CompanyBrand | null;
  store: StoreContext | null;
  profiles: User[];
  meta: MetaPayload;
}

export const api = {
  login(email: string, password: string) {
    return request<SessionPayload>("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  logout() {
    return request<{ ok: boolean }>("/api/logout", {
      method: "POST",
      body: JSON.stringify({})
    });
  },
  me() {
    return request<{ user: User | null; company: CompanyBrand | null; store: StoreContext | null; profiles: User[] }>("/api/me");
  },
  meta() {
    return request<SessionPayload>("/api/meta");
  },
  profiles() {
    return request<{ data: User[]; company: CompanyBrand | null; store: StoreContext | null; user: User | null }>("/api/profiles");
  },
  adminUsers() {
    return request<{ data: AdminUser[] }>("/api/admin/users");
  },
  saveAdminUser(payload: Partial<AdminUser> & { password?: string }) {
    const id = payload.id ? Number(payload.id) : undefined;
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/admin/users/${id}` : "/api/admin/users";
    const body = { ...payload };
    if (!id) {
      delete body.id;
    }
    return request<{ data: AdminUser }>(url, {
      method,
      body: JSON.stringify(body)
    });
  },
  deleteAdminUser(id: number) {
    return request<{ success: boolean }>(`/api/admin/users/${id}`, {
      method: "DELETE"
    });
  },
  selectProfile(profileId: number) {
    return request<SessionPayload>("/api/profile/select", {
      method: "POST",
      body: JSON.stringify({ profileId })
    });
  },
  dashboard(filters: Filters = {}) {
    return request<DashboardPayload>(`/api/dashboard${toQuery(filters)}`);
  },
  reports(filters: Filters = {}) {
    return request<ReportsPayload>(`/api/reports${toQuery(filters)}`);
  },
  notifications(filters: Filters = {}) {
    return request<{ data: NotificationItem[] }>(`/api/notifications${toQuery(filters)}`);
  },
  markNotificationRead(id: number) {
    return request<{ data: NotificationItem }>(`/api/notifications/${id}/read`, {
      method: "POST",
      body: JSON.stringify({})
    });
  },
  automationRules() {
    return request<{ data: AutomationRule[] }>("/api/automation-rules");
  },
  saveAutomationRule(payload: Partial<AutomationRule> & { config?: Record<string, unknown> }) {
    return request<{ data: AutomationRule }>("/api/automation-rules", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  deleteAutomationRule(id: number) {
    return request<{ success: boolean }>(`/api/automation-rules/${id}`, {
      method: "DELETE"
    });
  },
  webstoreSettings() {
    return request<{ data: WebstoreSettings; status: WebstoreStatus }>("/api/admin/webstore-settings");
  },
  saveWebstoreSettings(payload: Partial<WebstoreSettings>) {
    return request<{ data: WebstoreSettings; status: WebstoreStatus }>("/api/admin/webstore-settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  gmailStatus() {
    return request<{ data: GmailApiSettings }>("/api/admin/gmail/status");
  },
  saveGmailSettings(payload: Partial<GmailApiSettings> & { clientSecret?: string }) {
    return request<{ data: GmailApiSettings }>("/api/admin/gmail/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  gmailConnect() {
    return request<{ data: { url: string } }>("/api/admin/gmail/connect");
  },
  gmailDisconnect() {
    return request<{ data: GmailApiSettings & { revokeError?: string } }>("/api/admin/gmail/disconnect", {
      method: "POST"
    });
  },
  auditLogs(filters: Filters = {}) {
    return request<{ data: any[] }>(`/api/audit-logs${toQuery(filters)}`);
  },
  performance(filters: Filters = {}) {
    return request<{ data: PerformanceMetric[] }>(`/api/performance${toQuery(filters)}`);
  },
  calendar(filters: Filters = {}) {
    return request<{ data: CalendarEntry[] }>(`/api/calendar${toQuery(filters)}`);
  },
  scanBarcode(payload: { code?: string; manualCode?: string; text?: string }) {
    return request<{ data: BarcodeScanResult }>("/api/barcodes/scan", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  lookupBarcode(code: string) {
    return request<{ data: BarcodeLookupResult }>("/api/barcodes/lookup", {
      method: "POST",
      body: JSON.stringify({ code })
    });
  },
  clients(filters: Filters = {}) {
    return request<{ data: ClientSummary[] }>(`/api/clients${toQuery(filters)}`);
  },
  client(id: number) {
    return request<{ data: ClientDetail }>(`/api/clients/${id}`);
  },
  saveClient(payload: Partial<ClientSummary> & { photoUpload?: MediaUploadPayload | null; photoPreview?: string }) {
    const id = payload.id ? Number(payload.id) : undefined;
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/clients/${id}` : "/api/clients";
    const body = { ...payload } as Partial<ClientSummary>;
    if (!id) {
      delete body.id;
    }
    return request<{ data: ClientDetail }>(url, {
      method,
      body: JSON.stringify(body)
    });
  },
  deleteClient(id: number) {
    return request<{ success: boolean; deletedOrders: number }>(`/api/clients/${id}`, {
      method: "DELETE"
    });
  },
  catalog(filters: Filters = {}) {
    return request<{ data: CatalogItem[] }>(`/api/catalog${toQuery(filters)}`);
  },
  catalogItem(id: number) {
    return request<{ data: CatalogItemDetail }>(`/api/catalog/${id}`);
  },
  saveCatalog(payload: Partial<CatalogItem> & { photoUpload?: MediaUploadPayload | null; photoPreview?: string }) {
    const id = payload.id ? Number(payload.id) : undefined;
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/catalog/${id}` : "/api/catalog";
    const body = { ...payload } as Partial<CatalogItem>;
    if (!id) {
      delete body.id;
    }
    return request<{ data: CatalogItem }>(url, {
      method,
      body: JSON.stringify(body)
    });
  },
  deleteCatalog(id: number) {
    return request<CatalogDeleteResult>(`/api/catalog/${id}`, {
      method: "DELETE"
    });
  },
  deleteCatalogBatch(ids: number[]) {
    return request<CatalogDeleteResult>("/api/catalog/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids })
    });
  },
  updateCatalogWebstoreVisibility(ids: number[], visible: boolean) {
    return request<{ success: boolean; updatedCount: number; visible: boolean }>("/api/catalog/bulk-webstore-visibility", {
      method: "POST",
      body: JSON.stringify({ ids, visible })
    });
  },
  saveCatalogBatch(items: Partial<CatalogItem>[]) {
    return request<{ data: CatalogItemDetail[] }>("/api/catalog/bulk-create", {
      method: "POST",
      body: JSON.stringify({ items })
    });
  },
  replenishCatalog(id: number, payload: { quantity: number; costAmount: number; priceAmount: number; notes?: string; additionalCost?: number; generateFinanceEntry?: boolean; cashAccountId?: number }) {
    return request<{ data: CatalogItemDetail }>(`/api/catalog/${id}/replenish`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  replenishCatalogBatch(items: Array<{ id: number; quantity: number; costAmount: number; priceAmount: number; notes?: string; additionalCost?: number; generateFinanceEntry?: boolean; cashAccountId?: number }>) {
    return request<{ data: CatalogItemDetail[] }>("/api/catalog/replenish-batch", {
      method: "POST",
      body: JSON.stringify({ items })
    });
  },
  revertCatalogReplenishment(id: number) {
    return request<{ data: CatalogItemDetail }>("/api/catalog/replenishments/" + id, {
      method: "DELETE"
    });
  },
  updateCatalogReplenishment(id: number, payload: { costAmount: number; priceAmount: number; notes?: string }) {
    return request<{ data: CatalogItemDetail }>("/api/catalog/replenishments/" + id, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  updateCatalogStockBatch(id: number, payload: { costAmount: number; priceAmount: number; notes?: string }) {
    return request<{ data: CatalogItemDetail }>("/api/catalog/stock-batches/" + id, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },
  services(filters: Filters = {}) {
    return request<{ data: ServiceCatalogItem[] }>(`/api/services${toQuery(filters)}`);
  },
  service(id: number) {
    return request<{ data: ServiceCatalogItem }>(`/api/services/${id}`);
  },
  saveService(payload: Partial<ServiceCatalogItem> & { photoUpload?: MediaUploadPayload | null; photoPreview?: string }) {
    const id = payload.id ? Number(payload.id) : undefined;
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/services/${id}` : "/api/services";
    const body = { ...payload } as Partial<ServiceCatalogItem>;
    if (!id) {
      delete body.id;
    }
    return request<{ data: ServiceCatalogItem }>(url, {
      method,
      body: JSON.stringify(body)
    });
  },
  deleteService(id: number) {
    return request<{ success: boolean }>(`/api/services/${id}`, {
      method: "DELETE"
    });
  },
  orders(filters: Filters = {}) {
    return request<{ data: OrderSummary[] }>(`/api/orders${toQuery(filters)}`);
  },
  order(id: number) {
    return request<{ data: OrderDetail }>(`/api/orders/${id}`);
  },
  orderTimeline(id: number) {
    return request<{ data: OrderTimelinePayload }>(`/api/orders/${id}/timeline`);
  },
  saveOrderTimelineEvent(
    id: number,
    payload: { title: string; description?: string; eventType?: string; eventDate?: string; color?: string }
  ) {
    return request<{ data: OrderTimelinePayload }>(`/api/orders/${id}/timeline`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  deleteOrder(id: number) {
    return request<{ success: boolean }>(`/api/orders/${id}`, {
      method: "DELETE"
    });
  },
  saveOrder(payload: Record<string, unknown>) {
    const method = payload.id ? "PUT" : "POST";
    const url = payload.id ? `/api/orders/${payload.id}` : "/api/orders";
    return request<{ data: OrderDetail }>(url, {
      method,
      body: JSON.stringify(payload)
    });
  },
  updateOrderDueDate(id: number, dueDate: string) {
    return request<{ data: OrderDetail }>(`/api/orders/${id}/due-date`, {
      method: "POST",
      body: JSON.stringify({ dueDate })
    });
  },
  addOrderRequestedProduct(id: number, payload: { name: string; quantity?: number; salePrice?: number }) {
    return request<{ data: OrderDetail }>(`/api/orders/${id}/requested-products`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  addOrderStockItem(id: number, payload: { catalogItemId: number; quantity: number }) {
    return request<{ data: OrderDetail }>(`/api/orders/${id}/items`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  addOrderAttachments(id: number, payload: { uploads: MediaUploadPayload[] }) {
    return request<{ data: OrderDetail }>(`/api/orders/${id}/attachments`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  currentStore() {
    return request<{ data: StoreContext | null }>("/api/stores/current");
  },
  tasks(filters: Filters = {}) {
    return request<{ data: DailyTask[] }>(`/api/tasks${toQuery(filters)}`);
  },
  taskBoard(filters: Filters = {}) {
    return request<{ data: DailyTaskBoard }>(`/api/tasks/board${toQuery(filters)}`);
  },
  task(id: number) {
    return request<{ data: DailyTask }>(`/api/tasks/${id}`);
  },
  saveTask(payload: Record<string, unknown>) {
    const method = payload.id ? "PUT" : "POST";
    const url = payload.id ? `/api/tasks/${payload.id}` : "/api/tasks";
    return request<{ data: DailyTask }>(url, {
      method,
      body: JSON.stringify(payload)
    });
  },
  deleteTask(id: number) {
    return request<{ success: boolean }>(`/api/tasks/${id}`, {
      method: "DELETE"
    });
  },
  saveTaskUpdate(id: number, payload: Record<string, unknown>) {
    return request<{ data: DailyTask }>(`/api/tasks/${id}/updates`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  createOrderFromTask(id: number, payload: Record<string, unknown> = {}) {
    return request<{ data: { task: DailyTask; order: OrderDetail; created: boolean } }>(`/api/tasks/${id}/create-order`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  addTaskPurchaseItem(id: number, payload: Record<string, unknown>) {
    return request<{ data: { task: DailyTask; order: OrderDetail } }>(`/api/tasks/${id}/purchase-items`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  financeCategories(entryType = "") {
    return request<{ data: FinanceCategory[] }>(`/api/finance-categories${entryType ? `?entryType=${encodeURIComponent(entryType)}` : ""}`);
  },
  saveFinanceCategory(payload: Partial<FinanceCategory>) {
    const id = payload.id ? Number(payload.id) : undefined;
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/finance-categories/${id}` : "/api/finance-categories";
    const body = { ...payload } as Partial<FinanceCategory>;
    if (!id) {
      delete body.id;
    }
    return request<{ data: FinanceCategory }>(url, {
      method,
      body: JSON.stringify(body)
    });
  },
  deleteFinanceCategory(id: number) {
    return request<{ success: boolean }>(`/api/finance-categories/${id}`, {
      method: "DELETE"
    });
  },
  reorderFinanceCategories(entryType: string, ids: number[]) {
    return request<{ data: FinanceCategory[] }>("/api/finance-categories/reorder", {
      method: "POST",
      body: JSON.stringify({ entryType, ids })
    });
  },
  finance(filters: Filters = {}) {
    return request<{ data: FinanceEntry[] }>(`/api/finance${toQuery(filters)}`);
  },
  financeWorkbook(filters: Filters = {}) {
    return request<{ data: FinanceWorkbookPayload }>(`/api/finance/workbook-view${toQuery(filters)}`);
  },
  purchaseRequests(filters: Filters = {}) {
    return request<{ data: RequestedProduct[] }>(`/api/finance/purchases/requests${toQuery(filters)}`);
  },
  lowStockPurchaseItems(filters: Filters = {}) {
    return request<{ data: CatalogItem[] }>(`/api/finance/purchases/low-stock${toQuery(filters)}`);
  },
  confirmRequestedProductPurchase(id: number, payload: { costAmount: number; paymentMethod?: string; cashAccountId?: number | null }) {
    return request<{ data: { order: OrderDetail; financeEntry: FinanceEntry; request: RequestedProduct } }>(`/api/finance/purchases/requests/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  denyRequestedProductPurchase(id: number) {
    return request<{ data: OrderDetail }>(`/api/finance/purchases/requests/${id}/deny`, {
      method: "POST",
      body: JSON.stringify({})
    });
  },
  saveFinance(payload: Partial<FinanceEntry>) {
    const id = payload.id ? Number(payload.id) : undefined;
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/finance/${id}` : "/api/finance";
    const body = { ...payload } as Partial<FinanceEntry>;
    if (!id) {
      delete body.id;
    }
    return request<{ data: FinanceEntry }>(url, {
      method,
      body: JSON.stringify(body)
    });
  },
  deleteFinance(id: number) {
    return request<{ success: boolean }>(`/api/finance/${id}`, {
      method: "DELETE"
    });
  },
  revertFinanceTransaction(payload: { financeEntryId?: number; replenishmentId?: number }) {
    return request<{ data: Record<string, unknown> }>("/api/finance/revert", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  fiscalDocuments(filters: Filters = {}) {
    return request<{ data: FiscalDocument[] }>(`/api/fiscal-documents${toQuery(filters)}`);
  },
  fiscalDocument(id: number) {
    return request<{ data: FiscalDocument }>(`/api/fiscal-documents/${id}`);
  },
  saveFiscalDocument(payload: Record<string, unknown>) {
    return request<{ data: FiscalDocument }>("/api/fiscal-documents", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  applyFiscalDocumentActions(id: number, actions: Record<string, unknown>[]) {
    return request<{ success: boolean; data: FiscalDocument }>(`/api/fiscal-documents/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({ actions })
    });
  },
  storeCashAccounts() {
    return request<{ data: StoreCashAccount[] }>("/api/store-cash/accounts");
  },
  saveStoreCashAccount(payload: Partial<StoreCashAccount>) {
    const id = payload.id ? Number(payload.id) : undefined;
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/store-cash/accounts/${id}` : "/api/store-cash/accounts";
    const body = { ...payload };
    if (!id) {
      delete body.id;
    }
    return request<{ data: StoreCashAccount }>(url, {
      method,
      body: JSON.stringify(body)
    });
  },
  deleteStoreCashAccount(id: number) {
    return request<{ success: boolean; archived?: boolean }>(`/api/store-cash/accounts/${id}`, {
      method: "DELETE"
    });
  },
  storeCashMovements(filters: Filters = {}) {
    return request<{ data: any[] }>(`/api/store-cash/movements${toQuery(filters)}`);
  },
  saveStoreCashMovement(payload: Record<string, unknown>) {
    return request<{ data: any }>("/api/store-cash/movements", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  transferStoreCash(payload: StoreCashTransferPayload) {
    return request<{ data: StoreCashTransferResult }>("/api/store-cash/transfers", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  cashSessions(filters: Filters = {}) {
    return request<{ data: CashSession[] }>(`/api/pdv/sessions${toQuery(filters)}`);
  },
  openCashSession(payload: Record<string, unknown>) {
    return request<{ data: CashSession }>("/api/pdv/sessions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  closeCashSession(id: number, payload: Record<string, unknown> = {}) {
    return request<{ data: CashSession }>(`/api/pdv/sessions/${id}/close`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  posSales(filters: Filters = {}) {
    return request<{ data: PosSale[] }>(`/api/pdv/sales${toQuery(filters)}`);
  },
  posSale(id: number) {
    return request<{ data: PosSale }>(`/api/pdv/sales/${id}`);
  },
  createPosSale(payload: Record<string, unknown>) {
    return request<{ data: PosSale }>("/api/pdv/sales", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  importLegacyOds(payload: { files?: string[] }) {
    return request<{ data: Record<string, unknown> }>("/api/import/legacy-ods", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  backupToMysql(payload: Record<string, unknown>) {
    return request<{ data: MysqlBackupResult }>("/api/system-transfer/backup/mysql", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  async downloadMysqlDump(payload: Record<string, unknown>) {
    const response = await fetch("/api/system-transfer/backup/mysql-dump", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        throw new Error(String(parsed.message || "Falha ao gerar dump MySQL."));
      } catch {
        throw new Error(text || "Falha ao gerar dump MySQL.");
      }
    }
    return {
      blob: await response.blob(),
      fileName: response.headers.get("Content-Disposition")?.match(/filename=\"?([^"]+)\"?/)?.[1] || "crm.mysql.sql"
    };
  },
  async downloadOperationalOds(payload: Record<string, unknown> = {}) {
    const response = await fetch("/api/system-transfer/export/ods", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        throw new Error(String(parsed.message || "Falha ao gerar exportacao ODS."));
      } catch {
        throw new Error(text || "Falha ao gerar exportacao ODS.");
      }
    }
    return {
      blob: await response.blob(),
      fileName: response.headers.get("Content-Disposition")?.match(/filename=\"?([^"]+)\"?/)?.[1] || "backup-crm.ods"
    };
  },
  async downloadFullBackupZip(payload: Record<string, unknown> = {}) {
    const response = await fetch("/api/system-transfer/backup/full-zip", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        throw new Error(String(parsed.message || "Falha ao gerar backup ZIP."));
      } catch {
        throw new Error(text || "Falha ao gerar backup ZIP.");
      }
    }
    return {
      blob: await response.blob(),
      fileName: response.headers.get("Content-Disposition")?.match(/filename=\"?([^"]+)\"?/)?.[1] || "backup-crm-completo.zip"
    };
  },
  importOperationalOds(payload: Record<string, unknown>) {
    return request<{ data: Record<string, unknown> }>("/api/system-transfer/import/ods", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  importFullBackupZip(payload: Record<string, unknown>) {
    return request<{ data: Record<string, unknown> }>("/api/system-transfer/import/full-zip", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  importFromMysql(payload: Record<string, unknown>) {
    return request<{ data: MysqlImportResult }>("/api/system-transfer/import/mysql", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  importFromGoogleLinks(payload: Record<string, unknown>) {
    return request<{ data: RemoteLegacyImportResult }>("/api/system-transfer/import/google-links", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  legacyImportRows(filters: Filters = {}) {
    return request<{ data: LegacyImportRow[] }>(`/api/legacy-import-rows${toQuery(filters)}`);
  },
  legacyImportSummary(filters: Filters = {}) {
    return request<{ data: LegacyImportSummary[] }>(`/api/legacy-import-rows/summary${toQuery(filters)}`);
  }
};
