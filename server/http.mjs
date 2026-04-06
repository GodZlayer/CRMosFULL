import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".xml": "application/xml"
};

export function createApiServer(repo, options = {}) {
  const uploadsRoot = options.uploadsRoot ?? join(process.cwd(), "server", "storage", "uploads");

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const { pathname, searchParams } = url;
      const method = request.method || "GET";

      if (pathname.startsWith("/uploads/")) {
        return serveUpload(pathname, response, uploadsRoot);
      }

      if (!pathname.startsWith("/api/")) {
        return sendJson(response, 404, { message: "Rota nao encontrada." });
      }

      if (method === "GET" && pathname === "/api/health") {
        return sendJson(response, 200, { ok: true });
      }

      const cookies = parseCookies(request.headers.cookie || "");

      if (method === "POST" && pathname === "/api/login") {
        const body = await readJsonBody(request);
        const auth = repo.authenticateCompany(body.email, body.password);
        if (!auth) {
          return sendJson(response, 401, { message: "Credenciais da empresa invalidas." });
        }
        const token = repo.createCompanySession(auth.company.code);
        response.setHeader("Set-Cookie", createSessionCookie(token));
        return sendJson(response, 200, { company: auth.company, store: auth.store, profiles: auth.profiles, user: null, meta: repo.getMeta() });
      }

      if (method === "POST" && pathname === "/api/logout") {
        if (cookies.crm_session) {
          repo.destroyCompanySession(cookies.crm_session);
        }
        response.setHeader("Set-Cookie", createSessionCookie("", { expires: "Thu, 01 Jan 1970 00:00:00 GMT" }));
        return sendJson(response, 200, { ok: true });
      }

      const sessionContext = repo.getSessionContext(cookies.crm_session);
      if (!sessionContext) {
        return sendJson(response, 401, { message: "Sessao da empresa expirada ou invalida." });
      }

      const { company, store, profiles, user } = sessionContext;

      if (method === "GET" && pathname === "/api/me") {
        return sendJson(response, 200, { user, company, store, profiles });
      }

      if (method === "GET" && pathname === "/api/meta") {
        return sendJson(response, 200, { meta: repo.getMeta(), user, company, store, profiles });
      }

      if (method === "GET" && pathname === "/api/profiles") {
        return sendJson(response, 200, { data: profiles, company, store, user });
      }

      if (method === "GET" && pathname === "/api/admin/users") {
        return sendJson(response, 200, { data: repo.listAdminUsers() });
      }

      if (method === "POST" && pathname === "/api/admin/users") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveAdminUser({ ...body, _actor: user }) });
      }

      if (pathname.match(/^\/api\/admin\/users\/\d+$/) && method === "PUT") {
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveAdminUser({ ...body, id, _actor: user }) });
      }

      if (pathname.match(/^\/api\/admin\/users\/\d+$/) && method === "DELETE") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteAdminUser(id, { actor: user }));
      }

      if (method === "POST" && pathname === "/api/profile/select") {
        const body = await readJsonBody(request);
        const updated = repo.selectProfile(cookies.crm_session, Number(body.profileId));
        return sendJson(response, 200, { meta: repo.getMeta(), user: updated.user, company: updated.company, store: updated.store, profiles: updated.profiles });
      }

      if (!user) {
        return sendJson(response, 409, { message: "Selecione um perfil antes de acessar o CRM interno." });
      }

      if (method === "GET" && pathname === "/api/stores/current") {
        return sendJson(response, 200, { data: store });
      }

      if (method === "GET" && pathname === "/api/dashboard") {
        return sendJson(response, 200, repo.getDashboardSummary({ ...queryToObject(searchParams), storeId: store?.id || "" }));
      }

      if (method === "GET" && pathname === "/api/reports") {
        return sendJson(response, 200, repo.getReports({ ...queryToObject(searchParams), storeId: store?.id || "" }));
      }

      if (method === "GET" && pathname === "/api/notifications") {
        return sendJson(response, 200, { data: repo.listNotifications(queryToObject(searchParams)) });
      }

      if (pathname.match(/^\/api\/notifications\/\d+\/read$/) && method === "POST") {
        const id = Number(pathname.split("/")[3]);
        return sendJson(response, 200, { data: repo.markNotificationRead(id, user) });
      }

      if (method === "GET" && pathname === "/api/automation-rules") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        return sendJson(response, 200, { data: repo.listAutomationRules() });
      }

      if (method === "POST" && pathname === "/api/automation-rules") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveAutomationRule({ ...body, _actor: user }) });
      }

      if (pathname.match(/^\/api\/automation-rules\/\d+$/) && method === "DELETE") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteAutomationRule(id, { actor: user }));
      }

      if (method === "GET" && pathname === "/api/audit-logs") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        return sendJson(response, 200, { data: repo.listAuditLogs(queryToObject(searchParams)) });
      }

      if (method === "GET" && pathname === "/api/performance") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        return sendJson(response, 200, { data: repo.getPerformanceMetrics(queryToObject(searchParams)) });
      }

      if (method === "GET" && pathname === "/api/calendar") {
        return sendJson(response, 200, { data: repo.listCalendarEntries(queryToObject(searchParams)) });
      }

      if (method === "POST" && pathname === "/api/barcodes/scan") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.scanBarcodeInput(body) });
      }

      if (method === "POST" && pathname === "/api/barcodes/lookup") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: await repo.lookupBarcode(body.code) });
      }

      if (pathname === "/api/clients" && method === "GET") {
        return sendJson(response, 200, { data: repo.listClients(queryToObject(searchParams)) });
      }

      if (pathname === "/api/clients" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveClient({ ...body, _actor: user }) });
      }

      if (pathname.match(/^\/api\/clients\/\d+$/) && method === "GET") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, { data: repo.getClient(id) });
      }

      if (pathname.match(/^\/api\/clients\/\d+$/) && method === "PUT") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE"]);
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveClient({ ...body, id, _actor: user }) });
      }

      if (pathname.match(/^\/api\/clients\/\d+$/) && method === "DELETE") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE"]);
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteClient(id, { actor: user }));
      }

      if (pathname === "/api/catalog" && method === "GET") {
        return sendJson(response, 200, { data: repo.listCatalogItems(queryToObject(searchParams)) });
      }

      if (pathname === "/api/catalog" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveCatalogItem({ ...body, _actor: user }) });
      }

      if (pathname.match(/^\/api\/catalog\/\d+$/) && method === "GET") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, { data: repo.getCatalogItem(id) });
      }

      if (pathname === "/api/catalog/bulk-delete" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, repo.deleteCatalogItems(body.ids, { actor: user }));
      }

      if (pathname === "/api/catalog/bulk-create" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveCatalogBatch(body.items || [], { _actor: user, _store: store }) });
      }

      if (pathname.match(/^\/api\/catalog\/\d+$/) && method === "PUT") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveCatalogItem({ ...body, id, _actor: user }) });
      }

      if (pathname.match(/^\/api\/catalog\/\d+$/) && method === "DELETE") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteCatalogItems([id], { actor: user }));
      }

      if (pathname.match(/^\/api\/catalog\/\d+\/replenish$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.replenishCatalogItem(id, { ...body, _actor: user }) });
      }

      if (pathname === "/api/catalog/replenish-batch" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.replenishCatalogBatch(body.items || [], { _actor: user }) });
      }

      if (pathname.match(/^\/api\/catalog\/replenishments\/\d+$/) && method === "DELETE") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, { data: repo.revertCatalogReplenishment(id, { actor: user }) });
      }
      if (pathname === "/api/services" && method === "GET") {
        return sendJson(response, 200, { data: repo.listServices(queryToObject(searchParams)) });
      }

      if (pathname === "/api/services" && method === "POST") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveService({ ...body, _actor: user }) });
      }

      if (pathname.match(/^\/api\/services\/\d+$/) && method === "GET") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, { data: repo.getService(id) });
      }

      if (pathname.match(/^\/api\/services\/\d+$/) && method === "PUT") {
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveService({ ...body, id, _actor: user }) });
      }

      if (pathname.match(/^\/api\/services\/\d+$/) && method === "DELETE") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteService(id, { actor: user }));
      }

      if (pathname === "/api/orders" && method === "GET") {
        return sendJson(response, 200, { data: repo.listOrders(queryToObject(searchParams)) });
      }

      if (pathname === "/api/orders" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE", "TECNICO"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveOrder({ ...body, _actor: user }) });
      }

      if (pathname.match(/^\/api\/orders\/\d+$/) && method === "GET") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, { data: repo.getOrder(id) });
      }

      if (pathname.match(/^\/api\/orders\/\d+\/timeline$/) && method === "GET") {
        const id = Number(pathname.split("/")[3]);
        return sendJson(response, 200, { data: repo.getOrderTimeline(id) });
      }

      if (pathname.match(/^\/api\/orders\/\d+\/timeline$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE", "TECNICO"]);
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveOrderTimelineEvent(id, { ...body, _actor: user }) });
      }

      if (pathname.match(/^\/api\/orders\/\d+\/due-date$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE", "TECNICO"]);
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.updateOrderDueDate(id, body.dueDate, user) });
      }

      if (pathname.match(/^\/api\/orders\/\d+\/requested-products$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE", "TECNICO"]);
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.addOrderRequestedProduct(id, { ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/orders\/\d+\/items$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE", "TECNICO"]);
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.addOrderStockItem(id, { ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/orders\/\d+\/attachments$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE", "TECNICO"]);
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.addOrderAttachments(id, body.uploads || []) });
      }

      if (pathname.match(/^\/api\/orders\/\d+$/) && method === "PUT") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE", "TECNICO"]);
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveOrder({ ...body, id, _actor: user }) });
      }

      if (pathname.match(/^\/api\/orders\/\d+$/) && method === "DELETE") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE", "TECNICO"]);
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteOrder(id, { actor: user }));
      }

      if (pathname === "/api/tasks/board" && method === "GET") {
        return sendJson(response, 200, { data: repo.getTaskBoard({ ...queryToObject(searchParams), storeId: store?.id || "" }) });
      }

      if (pathname === "/api/tasks" && method === "GET") {
        return sendJson(response, 200, { data: repo.listTasks({ ...queryToObject(searchParams), storeId: store?.id || "" }) });
      }

      if (pathname === "/api/tasks" && method === "POST") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveTask({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/tasks\/\d+$/) && method === "GET") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, { data: repo.getTask(id) });
      }

      if (pathname.match(/^\/api\/tasks\/\d+$/) && method === "PUT") {
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveTask({ ...body, id, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/tasks\/\d+$/) && method === "DELETE") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteTask(id, { actor: user }));
      }

      if (pathname.match(/^\/api\/tasks\/\d+\/updates$/) && method === "POST") {
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveTaskUpdate(id, { ...body, _actor: user }) });
      }

      if (pathname === "/api/finance-categories" && method === "GET") {
        return sendJson(response, 200, { data: repo.listFinanceCategories(searchParams.get("entryType") || "") });
      }

      if (pathname === "/api/finance-categories" && method === "POST") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveFinanceCategory({ ...body, _actor: user }) });
      }

      if (pathname === "/api/finance-categories/reorder" && method === "POST") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.reorderFinanceCategories(body.entryType, body.ids || [], { actor: user }) });
      }

      if (pathname.match(/^\/api\/finance-categories\/\d+$/) && method === "PUT") {
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveFinanceCategory({ ...body, id, _actor: user }) });
      }

      if (pathname.match(/^\/api\/finance-categories\/\d+$/) && method === "DELETE") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteFinanceCategory(id, { actor: user }));
      }

      if (pathname === "/api/finance" && method === "GET") {
        return sendJson(response, 200, { data: repo.listFinanceEntries({ ...queryToObject(searchParams), storeId: store?.id || "" }) });
      }

      if (pathname === "/api/finance" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveFinanceEntry({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/finance\/\d+$/) && method === "PUT") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveFinanceEntry({ ...body, id, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/finance\/\d+$/) && method === "DELETE") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteFinanceEntry(id, { actor: user }));
      }
      if (pathname === "/api/finance/revert" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.revertFinancialTransaction({ ...body, _actor: user }) });
      }

      if (pathname === "/api/finance/workbook-view" && method === "GET") {
        return sendJson(response, 200, { data: repo.getFinanceWorkbookView({ ...queryToObject(searchParams), storeId: store?.id || "", _store: store }) });
      }

      if (pathname === "/api/finance/purchases/requests" && method === "GET") {
        return sendJson(response, 200, { data: repo.listPurchaseRequests({ ...queryToObject(searchParams), storeId: store?.id || "", _store: store }) });
      }

      if (pathname === "/api/finance/purchases/low-stock" && method === "GET") {
        return sendJson(response, 200, { data: repo.listLowStockPurchaseItems({ ...queryToObject(searchParams), storeId: store?.id || "", _store: store }) });
      }

      if (pathname.match(/^\/api\/finance\/purchases\/requests\/\d+\/confirm$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/")[5]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.confirmRequestedProductPurchase(id, { ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/finance\/purchases\/requests\/\d+\/deny$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/")[5]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.denyRequestedProductPurchase(id, { ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname === "/api/fiscal-documents" && method === "GET") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        return sendJson(response, 200, { data: repo.listFiscalDocuments(queryToObject(searchParams)) });
      }

      if (pathname === "/api/fiscal-documents" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveFiscalDocument({ ...body, _actor: user }) });
      }

      if (pathname.match(/^\/api\/fiscal-documents\/\d+$/) && method === "GET") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, { data: repo.getFiscalDocument(id) });
      }

      if (pathname.match(/^\/api\/fiscal-documents\/\d+\/apply$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, repo.applyFiscalDocumentActions(id, { ...body, _actor: user }));
      }

      if (pathname === "/api/store-cash/accounts" && method === "GET") {
        return sendJson(response, 200, { data: repo.listStoreCashAccounts(store?.id || 0) });
      }

      if (pathname === "/api/store-cash/accounts" && method === "POST") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveStoreCashAccount({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/store-cash\/accounts\/\d+$/) && method === "PUT") {
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveStoreCashAccount({ ...body, id, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/store-cash\/accounts\/\d+$/) && method === "DELETE") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, repo.deleteStoreCashAccount(id, { storeId: store?.id || null, _store: store, actor: user }));
      }

      if (pathname === "/api/store-cash/movements" && method === "GET") {
        return sendJson(response, 200, { data: repo.listStoreCashMovements({ ...queryToObject(searchParams), storeId: store?.id || "" }) });
      }

      if (pathname === "/api/store-cash/movements" && method === "POST") {
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveStoreCashMovement({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname === "/api/store-cash/sessions" && method === "GET") {
        return sendJson(response, 200, { data: repo.listCashSessions({ ...queryToObject(searchParams), storeId: store?.id || "" }) });
      }

      if (pathname === "/api/store-cash/sessions/open" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.openCashSession({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/store-cash\/sessions\/\d+\/close$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE"]);
        const id = Number(pathname.split("/")[4]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.closeCashSession(id, { ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname === "/api/pdv/sessions" && method === "GET") {
        return sendJson(response, 200, { data: repo.listCashSessions({ ...queryToObject(searchParams), storeId: store?.id || "" }) });
      }

      if (pathname === "/api/pdv/sessions" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.openCashSession({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/pdv\/sessions\/\d+\/close$/) && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE"]);
        const id = Number(pathname.split("/")[4]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.closeCashSession(id, { ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname === "/api/pdv/sales" && method === "GET") {
        return sendJson(response, 200, { data: repo.listPosSales({ ...queryToObject(searchParams), storeId: store?.id || "" }) });
      }

      if (pathname === "/api/pdv/sales" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE", "ATENDENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.createPosSale({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/pdv\/sales\/\d+$/) && method === "GET") {
        const id = Number(pathname.split("/").pop());
        return sendJson(response, 200, { data: repo.getPosSale(id) });
      }

      if (pathname === "/api/import/legacy-ods" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.importLegacyOds({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname === "/api/system-transfer/backup/mysql" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: await repo.backupToMysql({ ...body, _actor: user }) });
      }

      if (pathname === "/api/system-transfer/backup/mysql-dump" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        const dump = repo.createMysqlDump({ ...body, _actor: user });
        return sendText(response, 200, dump.sql, {
          "Content-Type": "application/sql; charset=utf-8",
          "Content-Disposition": `attachment; filename="${dump.fileName}"`
        });
      }

      if (pathname === "/api/system-transfer/import/mysql" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: await repo.importFromMysql({ ...body, _actor: user }) });
      }

      if (pathname === "/api/system-transfer/import/google-links" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: await repo.importLegacyOdsFromLinks({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname === "/api/legacy-import-rows" && method === "GET") {
        return sendJson(response, 200, { data: repo.listLegacyImportRows(queryToObject(searchParams)) });
      }

      if (pathname === "/api/legacy-import-rows/summary" && method === "GET") {
        return sendJson(response, 200, { data: repo.getLegacyImportSummary(queryToObject(searchParams)) });
      }

      return sendJson(response, 404, { message: "Rota nao encontrada." });
    } catch (error) {
      return sendJson(response, 400, { message: error instanceof Error ? error.message : "Erro inesperado." });
    }
  });
}

function ensureRole() {
  return true;
}

function queryToObject(searchParams) {
  return Object.fromEntries(searchParams.entries());
}

function parseCookies(header) {
  return header.split(";").reduce((cookies, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) {
      return cookies;
    }
    cookies[key] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
}

function createSessionCookie(token, options = {}) {
  const attributes = [`crm_session=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (options.expires) {
    attributes.push(`Expires=${options.expires}`);
  }
  return attributes.join("; ");
}

async function readJsonBody(request) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of request) {
    totalLength += chunk.length;
    if (totalLength > 15 * 1024 * 1024) {
      throw new Error("Payload excedeu o limite de 15MB.");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, headers);
  response.end(body);
}

function serveUpload(pathname, response, uploadsRoot) {
  const relativePath = pathname.replace("/uploads/", "");
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolutePath = join(uploadsRoot, safePath);
  const stats = statSync(absolutePath, { throwIfNoEntry: false });

  if (!stats || !stats.isFile()) {
    return sendJson(response, 404, { message: "Arquivo nao encontrado." });
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(absolutePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": stats.size
  });
  createReadStream(absolutePath).pipe(response);
}


