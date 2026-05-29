import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { collectDirectoryEntries, createZip, readZipEntries, writeZipEntriesToDirectory } from "./zip-utils.mjs";

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

      if (method === "GET" && pathname === "/api/webstore/settings") {
        return sendJson(response, 200, { data: buildPublicWebstoreSettings(repo) });
      }

      if (method === "GET" && pathname === "/api/webstore/catalog") {
        const settings = repo.getWebstoreSettings();
        if (!settings.enabled || !settings.showProducts) {
          return sendJson(response, 200, { data: [] });
        }
        const items = repo.listCatalogItems({ activeOnly: "true" })
          .filter((item) => Number(item.active || 0) === 1)
          .filter((item) => Number(item.webstore_visible ?? 1) === 1)
          .filter((item) => String(item.deleted_at || "") === "")
          .filter((item) => String(item.location_type || "ESTOQUE") === "ESTOQUE")
          .filter((item) => !settings.hideOutOfStock || Number(item.stock_quantity || 0) > 0)
          .map((item) => ({
            id: item.id,
            sku: item.sku || "",
            name: item.name,
            brand: item.brand || "",
            description: item.description || "",
            category: item.category || "",
            subcategory: item.subcategory || "",
            item_condition: item.item_condition || "",
            stock_quantity: Number(item.stock_quantity || 0),
            price_amount: Number(item.price_amount || 0),
            photo_url: item.photo_url || "",
            available: Number(item.stock_quantity || 0) > 0
          }));
        return sendJson(response, 200, { data: items });
      }

      if (method === "GET" && pathname === "/api/webstore/services") {
        const settings = repo.getWebstoreSettings();
        if (!settings.enabled || !settings.showServices) {
          return sendJson(response, 200, { data: [] });
        }
        const services = repo.listServices({ activeOnly: "true" })
          .filter((service) => Number(service.active || 0) === 1)
          .filter((service) => Number(service.available_in_order || 0) === 1 || Number(service.available_in_pdv || 0) === 1)
          .map((service) => ({
            id: service.id,
            name: service.name,
            description: service.description || "",
            price_amount: Number(service.price_amount || 0),
            pricing_mode: service.pricing_mode || "FIXED",
            additional_price_amount: Number(service.additional_price_amount || 0),
            estimated_minutes: Number(service.estimated_minutes || 0),
            photo_url: service.photo_url || "",
            available: true
          }));
        return sendJson(response, 200, { data: services });
      }

      if (method === "GET" && pathname === "/api/webstore/best-sellers") {
        return sendJson(response, 200, { data: buildWebstoreBestSellers(repo) });
      }

      if (method === "GET" && pathname === "/api/webstore/google/connect") {
        return sendJson(response, 200, { data: { url: buildWebstoreGoogleConnectUrl(request) } });
      }

      if (method === "GET" && pathname === "/api/webstore/google/callback") {
        const result = await handleWebstoreGoogleCallback(repo, request, searchParams);
        response.writeHead(302, { Location: result.redirectUrl });
        response.end();
        return;
      }

      if (method === "POST" && pathname === "/api/webstore/orders") {
        const body = await readJsonBody(request);
        const result = await createWebstoreOrder(repo, body);
        return sendJson(response, 200, { data: result });
      }

      if (method === "POST" && pathname === "/api/webstore/customers") {
        const body = await readJsonBody(request);
        const result = await createWebstoreCustomer(repo, body);
        return sendJson(response, 200, { data: result });
      }

      if (method === "GET" && pathname === "/api/webstore/confirm-email") {
        const result = confirmWebstoreCustomerEmail(repo, searchParams.get("token") || "");
        return sendJson(response, 200, { data: result });
      }

      const cookies = parseCookies(request.headers.cookie || "");

      if (method === "GET" && pathname === "/api/gmail/callback") {
        const sessionContext = repo.getSessionContext(cookies.crm_session);
        const result = await handleGmailCallback(repo, request, searchParams, sessionContext?.user || null);
        response.writeHead(302, { Location: result.redirectUrl });
        response.end();
        return;
      }

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

      if (method === "GET" && pathname === "/api/admin/webstore-settings") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const settings = repo.getWebstoreSettings();
        return sendJson(response, 200, { data: settings, status: getWebstoreStatus(settings) });
      }

      if (method === "PUT" && pathname === "/api/admin/webstore-settings") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        const saved = repo.saveWebstoreSettings(body);
        return sendJson(response, 200, { data: saved, status: getWebstoreStatus(saved) });
      }

      if (method === "GET" && pathname === "/api/admin/gmail/status") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        return sendJson(response, 200, { data: publicGmailSettings(getGmailSettings(repo)) });
      }

      if (method === "PUT" && pathname === "/api/admin/gmail/settings") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: saveGmailSettings(repo, body, user) });
      }

      if (method === "GET" && pathname === "/api/admin/gmail/connect") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const connectUrl = buildGmailConnectUrl(repo, request, user);
        return sendJson(response, 200, { data: { url: connectUrl } });
      }

      if (method === "POST" && pathname === "/api/admin/gmail/disconnect") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        return sendJson(response, 200, { data: await disconnectGmail(repo, user) });
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

      if (pathname === "/api/catalog/bulk-webstore-visibility" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
        const visible = body.visible === true || Number(body.visible) === 1 ? 1 : 0;
        if (!ids.length) {
          throw new Error("Selecione ao menos um item.");
        }
        const placeholders = ids.map(() => "?").join(",");
        repo.db.prepare(`UPDATE catalog_items SET webstore_visible = ?, updated_at = ? WHERE id IN (${placeholders})`).run(visible, new Date().toISOString(), ...ids);
        return sendJson(response, 200, { success: true, updatedCount: ids.length, visible: Boolean(visible) });
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

      if (pathname.match(/^\/api\/catalog\/replenishments\/\d+$/) && method === "PUT") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.updateCatalogReplenishment(id, { ...body, _actor: user }) });
      }

      if (pathname.match(/^\/api\/catalog\/stock-batches\/\d+$/) && method === "PUT") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const id = Number(pathname.split("/").pop());
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.updateCatalogStockBatch(id, { ...body, _actor: user }) });
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

      if (pathname.match(/^\/api\/tasks\/\d+\/create-order$/) && method === "POST") {
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.createOrderFromTask(id, { ...body, storeId: store?.id || null, _store: store, _actor: user }) });
      }

      if (pathname.match(/^\/api\/tasks\/\d+\/purchase-items$/) && method === "POST") {
        const id = Number(pathname.split("/")[3]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.addTaskPurchaseItem(id, { ...body, storeId: store?.id || null, _store: store, _actor: user }) });
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

      if (pathname === "/api/store-cash/transfers" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.saveStoreCashTransfer({ ...body, storeId: store?.id || null, _store: store, _actor: user }) });
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

      if (pathname === "/api/system-transfer/backup/ods" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        const exported = repo.exportBackupOds({ ...body, _actor: user });
        return sendBinary(response, 200, exported.buffer, {
          "Content-Type": "application/vnd.oasis.opendocument.spreadsheet",
          "Content-Disposition": `attachment; filename="${exported.fileName}"`,
          "Content-Length": exported.buffer.length
        });
      }

      if (pathname === "/api/system-transfer/backup/full-zip" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        const exported = exportFullBackupZip(repo, { ...body, _actor: user }, uploadsRoot);
        return sendBinary(response, 200, exported.buffer, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${exported.fileName}"`,
          "Content-Length": exported.buffer.length
        });
      }

      if (pathname === "/api/system-transfer/import/backup-ods" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.importBackupOds({ ...body, _actor: user }) });
      }

      if (pathname === "/api/system-transfer/import/full-zip" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: importFullBackupZip(repo, { ...body, _actor: user }, uploadsRoot) });
      }

      if (pathname === "/api/system-transfer/export/ods" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        const exported = repo.exportBackupOds({ ...body, storeId: store?.id || null, _store: store, _actor: user });
        return sendBinary(response, 200, exported.buffer, {
          "Content-Type": "application/vnd.oasis.opendocument.spreadsheet",
          "Content-Disposition": `attachment; filename="${exported.fileName}"`,
          "Content-Length": exported.buffer.length
        });
      }

      if (pathname === "/api/system-transfer/import/ods" && method === "POST") {
        ensureRole(user, ["ADMIN", "GERENTE"]);
        const body = await readJsonBody(request);
        return sendJson(response, 200, { data: repo.importOperationalOds({ ...body, _actor: user }) });
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

function parseJsonSetting(value, fallback = {}) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function getAppSetting(repo, key, fallback = {}) {
  const row = repo.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return parseJsonSetting(row?.value, fallback);
}

function saveAppSetting(repo, key, value) {
  repo.db.prepare(`
    INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

function publicGmailSettings(settings = {}) {
  const hasClientId = Boolean(settings.clientId || process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID);
  return {
    email: settings.email || "",
    status: settings.status || "DISCONNECTED",
    connectedAt: settings.connectedAt || "",
    updatedAt: settings.updatedAt || "",
    clientId: hasClientId ? "configured" : "",
    hasRefreshToken: Boolean(settings.refreshToken || process.env.GMAIL_REFRESH_TOKEN)
  };
}

function getGmailSettings(repo) {
  const settings = getAppSetting(repo, "gmail_api_settings", {});
  const defaultClientId = process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID || "";
  const defaultClientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET || "";
  return {
    clientId: normalizeText(defaultClientId || settings.clientId),
    clientSecret: normalizeText(defaultClientSecret || settings.clientSecret),
    email: normalizeText(settings.email || process.env.GMAIL_FROM || process.env.BRASILEXPRESS_EMAIL_FROM),
    accessToken: normalizeText(settings.accessToken || process.env.GMAIL_ACCESS_TOKEN),
    accessTokenExpiresAt: normalizeText(settings.accessTokenExpiresAt),
    refreshToken: normalizeText(settings.refreshToken || process.env.GMAIL_REFRESH_TOKEN),
    status: normalizeText(settings.status, settings.refreshToken || process.env.GMAIL_REFRESH_TOKEN ? "CONNECTED" : "DISCONNECTED"),
    connectedAt: normalizeText(settings.connectedAt),
    updatedAt: normalizeText(settings.updatedAt)
  };
}

function saveGmailSettings(repo, payload = {}, actor = null) {
  const previous = getGmailSettings(repo);
  const keep = (value, fallback) => {
    const normalized = normalizeText(value);
    return normalized || fallback || "";
  };
  const next = {
    clientId: keep(payload.clientId, previous.clientId),
    clientSecret: keep(payload.clientSecret, previous.clientSecret),
    email: keep(payload.email, previous.email),
    accessToken: keep(payload.accessToken, previous.accessToken),
    accessTokenExpiresAt: keep(payload.accessTokenExpiresAt, previous.accessTokenExpiresAt),
    refreshToken: keep(payload.refreshToken, previous.refreshToken),
    status: keep(payload.status, previous.status || "DISCONNECTED"),
    connectedAt: keep(payload.connectedAt, previous.connectedAt),
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.name || ""
  };
  saveAppSetting(repo, "gmail_api_settings", next);
  return publicGmailSettings(next);
}

async function disconnectGmail(repo, actor = null) {
  const previous = getGmailSettings(repo);
  const tokenToRevoke = normalizeText(previous.refreshToken || previous.accessToken);
  let revokeError = "";

  if (tokenToRevoke) {
    try {
      const response = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokenToRevoke })
      });
      if (!response.ok) {
        revokeError = `Google revoke retornou ${response.status}.`;
      }
    } catch (error) {
      revokeError = error instanceof Error ? error.message : "Falha ao revogar token no Google.";
    }
  }

  const next = {
    clientId: previous.clientId,
    clientSecret: previous.clientSecret,
    email: "",
    accessToken: "",
    accessTokenExpiresAt: "",
    refreshToken: "",
    status: "DISCONNECTED",
    connectedAt: "",
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.name || "",
    disconnectError: revokeError
  };
  saveAppSetting(repo, "gmail_api_settings", next);
  return { ...publicGmailSettings(next), revokeError };
}

function gmailRedirectUri(request) {
  const origin = new URL(request.url || "/", "http://localhost:3000").origin;
  return `${origin}/api/gmail/callback`;
}

function googleCredentials() {
  return {
    clientId: normalizeText(process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID),
    clientSecret: normalizeText(process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET)
  };
}

function buildGmailConnectUrl(repo, request, user) {
  const settings = getGmailSettings(repo);
  if (!settings.clientId || !settings.clientSecret) {
    throw new Error("Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente ou na tela Webstore + Gmail API.");
  }
  const redirectUri = gmailRedirectUri(request);
  const state = Buffer.from(JSON.stringify({ userId: user?.id || 0, redirectUri })).toString("base64url");
  const params = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email"
    ].join(" "),
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function buildWebstoreGoogleConnectUrl(request) {
  const { clientId, clientSecret } = googleCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("App Google nao configurado.");
  }
  const redirectUri = `${new URL(request.url || "/", "http://localhost:3002").origin}/api/webstore/google/callback`;
  const state = Buffer.from(JSON.stringify({ redirectUri })).toString("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile"
    ].join(" "),
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function handleWebstoreGoogleCallback(repo, request, searchParams) {
  const code = normalizeText(searchParams.get("code"));
  const state = parseJsonSetting(Buffer.from(normalizeText(searchParams.get("state")), "base64url").toString(), {});
  if (!code) {
    throw new Error("Callback Google invalido.");
  }
  const { clientId, clientSecret } = googleCredentials();
  const redirectUri = state.redirectUri || `${new URL(request.url || "/", "http://localhost:3002").origin}/api/webstore/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code"
    })
  });
  const tokens = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokens.access_token) {
    throw new Error(`Falha ao conectar Google (${tokenResponse.status}).`);
  }
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  const profile = await profileResponse.json().catch(() => ({}));
  const email = normalizeText(profile.email);
  const name = normalizeText(profile.name || email);
  if (!email) {
    throw new Error("A conta Google nao retornou email.");
  }
  const existing = repo.db.prepare("SELECT id, name, email, phone, document, address, notes, photo_path, email_confirmed_at FROM clients WHERE lower(email) = lower(?) LIMIT 1").get(email);
  const client = existing || repo.saveClient({
    name,
    email,
    phone: "PENDENTE",
    document: "",
    address: "",
    notes: "Cliente autenticado pela webstore com Google.",
    emailConfirmedAt: new Date().toISOString(),
    emailConfirmationToken: ""
  });
  const phoneDigits = normalizeText(client.phone).replace(/\D/g, "");
  const needsCompletion = phoneDigits.length < 10;
  const payload = Buffer.from(JSON.stringify({
    id: client.id,
    name: client.name || name,
    email: client.email || email,
    phone: needsCompletion ? "" : client.phone || "",
    document: client.document || "",
    address: client.address || "",
    notes: client.notes || "",
    photoUrl: client.photo_path ? `/uploads/${client.photo_path}` : "",
    googleVerified: true,
    needsCompletion
  })).toString("base64url");
  return { redirectUrl: `/perfil?google=connected&customer=${payload}` };
}

async function handleGmailCallback(repo, request, searchParams, actor = null) {
  const code = normalizeText(searchParams.get("code"));
  const state = parseJsonSetting(Buffer.from(normalizeText(searchParams.get("state")), "base64url").toString(), {});
  if (!code) {
    throw new Error("Callback Gmail invalido.");
  }
  const settings = getGmailSettings(repo);
  const redirectUri = state.redirectUri || gmailRedirectUri(request);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code"
    })
  });
  const tokens = await response.json().catch(() => ({}));
  if (!response.ok || !tokens.access_token) {
    throw new Error(`Falha ao conectar Gmail (${response.status}).`);
  }
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  const profile = await profileResponse.json().catch(() => ({}));
  const email = normalizeText(profile.email || settings.email);
  saveGmailSettings(repo, {
    ...settings,
    email,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
    refreshToken: tokens.refresh_token || settings.refreshToken,
    status: tokens.refresh_token || settings.refreshToken ? "CONNECTED" : "AUTH_REQUIRED",
    connectedAt: new Date().toISOString()
  }, actor);
  return { redirectUrl: "/webstore?gmail=connected" };
}

function insertEmailHistory(repo, payload = {}) {
  const createdAt = new Date().toISOString();
  const result = repo.db.prepare(`
    INSERT INTO crm_email_history (
      source, entity_type, entity_id, client_id, from_email, to_email, cc_email, bcc_email,
      subject, body_text, body_html, status, provider_message_id, error_message, created_at, sent_at
    )
    VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, '', ?, '', '', ?, '')
  `).run(
    normalizeText(payload.source, "CRM"),
    normalizeText(payload.entityType),
    payload.entityId ? Number(payload.entityId) : null,
    payload.clientId ? Number(payload.clientId) : null,
    normalizeText(payload.from),
    normalizeText(payload.to),
    normalizeText(payload.subject),
    normalizeText(payload.text),
    normalizeText(payload.status, "PENDING"),
    createdAt
  );
  return Number(result.lastInsertRowid);
}

function updateEmailHistory(repo, id, payload = {}) {
  repo.db.prepare(`
    UPDATE crm_email_history
    SET status = ?,
        provider_message_id = ?,
        error_message = ?,
        sent_at = ?
    WHERE id = ?
  `).run(
    normalizeText(payload.status),
    normalizeText(payload.providerMessageId),
    normalizeText(payload.errorMessage),
    payload.status === "SENT" ? new Date().toISOString() : "",
    Number(id)
  );
}

async function createWebstoreCustomer(repo, body = {}) {
  const settings = repo.getWebstoreSettings();
  if (!settings.enabled) {
    throw new Error(settings.closedMessage || "Loja fechada no momento.");
  }

  const customer = normalizeWebstoreCustomer(body.customer || body);
  const existingClient = findWebstoreClient(repo, customer);
  const confirmationToken = customer.email && !existingClient?.email_confirmed_at
    ? randomUUID()
    : normalizeText(existingClient?.email_confirmation_token);
  const client = repo.saveClient({
    ...customer,
    id: customer.id || existingClient?.id || null,
    notes: customer.notes || "Cliente criado pela webstore.",
    emailConfirmedAt: normalizeText(existingClient?.email_confirmed_at),
    emailConfirmationToken: confirmationToken,
    photoUpload: normalizePhotoUpload(customer.photoUpload),
    photoPreview: customer.photoPreview || ""
  });

  const emailStatus = await sendWebstoreCustomerEmails(repo, settings, client, {
    type: "customer",
    confirmationUrl: buildCustomerConfirmationUrl(confirmationToken)
  });
  return {
    clientId: client.id,
    name: client.name,
    emailSent: emailStatus.sent,
    emailError: emailStatus.error
  };
}

async function createWebstoreOrder(repo, body = {}) {
  const settings = repo.getWebstoreSettings();
  const storeStatus = getWebstoreStatus(settings);
  if (!settings.enabled || !settings.checkoutEnabled) {
    throw new Error(settings.closedMessage || "Loja fechada no momento.");
  }
  if (!storeStatus.isOpen && !settings.allowCheckoutWhenClosed) {
    throw new Error(settings.closedMessage || "Loja fechada no momento.");
  }

  const customer = normalizeWebstoreCustomer(body.customer || body);
  const customerName = customer.name;
  const phone = customer.phone;
  const email = customer.email;
  const fulfillmentLabel = "Retirada em loja";
  const notes = normalizeText(body.notes);
  const cart = Array.isArray(body.items) ? body.items : [];

  if (!customerName || !phone) {
    throw new Error("Informe nome e telefone para concluir o pedido.");
  }
  if (!cart.length) {
    throw new Error("Adicione ao menos um item ao pedido.");
  }

  const catalog = repo.listCatalogItems({ activeOnly: "true" });
  const services = repo.listServices({ activeOnly: "true" });
  const requestedProducts = [];
  const orderServices = [];

  for (const entry of cart) {
    const type = String(entry.type || entry.itemType || "").toUpperCase();
    const id = Number(entry.id || entry.catalogItemId || entry.serviceId || 0);
    const quantity = Math.max(1, Number.parseInt(String(entry.quantity || 1), 10) || 1);
    if (!id) {
      continue;
    }

    if (type === "SERVICE") {
      const service = services.find((item) => Number(item.id) === id && Number(item.active || 0) === 1);
      if (!service) {
        throw new Error("Um dos servicos selecionados nao esta mais disponivel.");
      }
      orderServices.push({
        serviceId: Number(service.id),
        quantity,
        unitPrice: Number(service.price_amount || 0),
        additionalUnitPrice: Number(service.additional_price_amount || 0),
        pricingMode: service.pricing_mode || "FIXED"
      });
      continue;
    }

    const product = catalog.find((item) => Number(item.id) === id && Number(item.active || 0) === 1);
    if (!product) {
      throw new Error("Um dos produtos selecionados nao esta mais disponivel.");
    }
    if (Number(product.stock_quantity || 0) <= 0) {
      throw new Error(`${product.name} esta sem estoque no momento.`);
    }
    requestedProducts.push({
      name: `${product.name}${product.sku ? ` | SKU ${product.sku}` : ""}`,
      quantity,
      salePrice: Number(product.price_amount || 0),
      status: "PENDENTE"
    });
  }

  if (!requestedProducts.length && !orderServices.length) {
    throw new Error("Nenhum item valido foi encontrado no pedido.");
  }

  const confirmationToken = email ? randomUUID() : "";
  const existingClient = findWebstoreClient(repo, customer);
  const client = repo.saveClient({
    id: customer.id || existingClient?.id || null,
    name: customerName,
    phone,
    email,
    document: customer.document,
    address: "",
    notes: customer.notes || "Cliente criado pela webstore.",
    emailConfirmedAt: normalizeText(existingClient?.email_confirmed_at),
    emailConfirmationToken: confirmationToken,
    photoUpload: normalizePhotoUpload(customer.photoUpload),
    photoPreview: customer.photoPreview || ""
  });

  const order = repo.saveOrder({
    clientId: Number(client.id),
    phoneSnapshot: phone,
    equipmentName: "Pedido webstore",
    equipment: "Pedido webstore",
    defect: "Pedido criado pela webstore",
    extras: fulfillmentLabel,
    dueDate: "",
    orderStatus: "ABERTA",
    approvalStatus: "AGUARDANDO_APROVACAO",
    paymentMethod: "NAO_DEFINIDO",
    notes: [
      "Origem: webstore",
      `Entrega: ${fulfillmentLabel}`,
      email ? `Email: ${email}` : "",
      notes ? `Observacao do cliente: ${notes}` : ""
    ].filter(Boolean).join("\n"),
    services: orderServices,
    requestedProducts
  });

  const emailStatus = await sendWebstoreCustomerEmails(repo, settings, client, {
    type: "order",
    order,
    totalAmount: Number(order.total_amount || 0),
    items: [...requestedProducts, ...orderServices],
    confirmationUrl: buildCustomerConfirmationUrl(confirmationToken)
  });

  return {
    orderId: order.id,
    code: order.code,
    totalAmount: Number(order.total_amount || 0),
    emailSent: emailStatus.sent,
    emailError: emailStatus.error
  };
}

function normalizeWebstoreCustomer(input = {}) {
  const normalized = {
    id: Number(input.id || 0) || null,
    name: normalizeText(input.name),
    phone: normalizeText(input.phone),
    email: normalizeText(input.email),
    document: normalizeText(input.document),
    address: normalizeText(input.address),
    notes: normalizeText(input.notes),
    photoUpload: input.photoUpload || null,
    photoPreview: normalizeText(input.photoPreview)
  };
  if (!normalized.name || !normalized.phone) {
    throw new Error("Nome e telefone do cliente sao obrigatorios.");
  }
  if (normalized.phone.replace(/\D/g, "").length < 10) {
    throw new Error("Informe um telefone real com DDD.");
  }
  return normalized;
}

function findWebstoreClient(repo, customer = {}) {
  if (customer.id) {
    const byId = repo.db.prepare(`
      SELECT id, email_confirmed_at, email_confirmation_token
      FROM clients
      WHERE id = ?
      LIMIT 1
    `).get(Number(customer.id));
    if (byId) return byId;
  }

  if (!customer.email) {
    return null;
  }

  return repo.db.prepare(`
    SELECT id, email_confirmed_at, email_confirmation_token
    FROM clients
    WHERE lower(email) = lower(?)
    ORDER BY id DESC
    LIMIT 1
  `).get(customer.email) || null;
}

function confirmWebstoreCustomerEmail(repo, token = "") {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) {
    throw new Error("Token de confirmacao invalido.");
  }
  const client = repo.db.prepare("SELECT id, name, email FROM clients WHERE email_confirmation_token = ? LIMIT 1").get(normalizedToken);
  if (!client) {
    throw new Error("Token de confirmacao nao encontrado.");
  }
  const confirmedAt = new Date().toISOString();
  repo.db.prepare("UPDATE clients SET email_confirmed_at = ?, email_confirmation_token = '', updated_at = ? WHERE id = ?").run(confirmedAt, confirmedAt, Number(client.id));
  return { clientId: client.id, name: client.name, email: client.email, confirmedAt };
}

function buildCustomerConfirmationUrl(token = "") {
  return token ? `http://localhost:3002/confirmar-email?token=${encodeURIComponent(token)}` : "";
}

function normalizePhotoUpload(upload = null) {
  if (!upload?.base64) {
    return null;
  }
  return {
    base64: String(upload.base64),
    name: normalizeText(upload.name, "cliente-webstore.jpg"),
    mimeType: normalizeText(upload.mimeType, "image/jpeg")
  };
}

async function sendWebstoreCustomerEmails(repo, settings, client, context = {}) {
  const customerEmail = normalizeText(client.email);
  const storeEmail = normalizeText(settings.contactEmail || process.env.BRASILEXPRESS_CONTACT_EMAIL);
  const recipients = [
    customerEmail
      ? {
        to: customerEmail,
        subject: context.type === "order" ? `Pedido ${context.order?.code || ""} recebido` : "Cadastro recebido",
        text: buildCustomerEmailText(settings, client, context)
      }
      : null,
    storeEmail
      ? {
        to: storeEmail,
        subject: context.type === "order" ? `Novo pedido webstore ${context.order?.code || ""}` : "Novo cadastro webstore",
        text: buildStoreEmailText(settings, client, context)
      }
      : null
  ].filter(Boolean);

  if (!recipients.length) {
    return { sent: false, error: "" };
  }

  try {
    for (const message of recipients) {
      await sendGmailMessage(repo, {
        ...message,
        entityType: context.type === "order" ? "ORDER" : "CLIENT",
        entityId: context.order?.id || client.id,
        clientId: client.id,
        source: context.type === "order" ? "WEBSTORE_ORDER" : "WEBSTORE_CUSTOMER"
      });
    }
    return { sent: true, error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar email via Gmail.";
    console.warn(`[webstore:gmail] ${message}`);
    return { sent: false, error: message };
  }
}

function buildCustomerEmailText(settings, client, context = {}) {
  const storeName = settings.storeName || settings.pageTitle || "Brasil Express";
  if (context.type === "order") {
    return [
      `Ola, ${client.name}.`,
      "",
      `Recebemos seu pedido ${context.order?.code || ""} na ${storeName}.`,
      `Total estimado: ${formatCurrency(context.totalAmount || 0)}.`,
      "",
      context.confirmationUrl ? `Confirme sua conta neste link: ${context.confirmationUrl}` : "",
      "Nossa equipe vai confirmar disponibilidade e retirada em loja pelo contato informado.",
      settings.whatsapp ? `WhatsApp: ${settings.whatsapp}` : "",
      settings.address ? `Endereco: ${settings.address}` : ""
    ].filter(Boolean).join("\n");
  }
  return [
    `Ola, ${client.name}.`,
    "",
    `Seu cadastro foi recebido pela ${storeName}.`,
    context.confirmationUrl ? `Confirme sua conta neste link: ${context.confirmationUrl}` : "",
    "Quando precisar, nossa equipe podera localizar seu atendimento pelo telefone informado.",
    settings.whatsapp ? `WhatsApp: ${settings.whatsapp}` : ""
  ].filter(Boolean).join("\n");
}

function buildStoreEmailText(settings, client, context = {}) {
  return [
    context.type === "order" ? `Novo pedido webstore ${context.order?.code || ""}` : "Novo cadastro webstore",
    "",
    `Cliente: ${client.name}`,
    `Telefone: ${client.phone || ""}`,
    `Email: ${client.email || ""}`,
    context.type === "order" ? "Entrega: Retirada em loja" : "",
    context.type === "order" ? `Total estimado: ${formatCurrency(context.totalAmount || 0)}` : ""
  ].filter(Boolean).join("\n");
}

async function sendGmailMessage(repo, { to, subject, text, entityType = "", entityId = null, clientId = null, source = "CRM" }) {
  const settings = getGmailSettings(repo);
  const from = normalizeText(settings.email || process.env.GMAIL_FROM || process.env.GMAIL_USER || process.env.BRASILEXPRESS_EMAIL_FROM);
  const historyId = insertEmailHistory(repo, {
    source,
    entityType,
    entityId,
    clientId,
    from,
    to,
    subject,
    text,
    status: "PENDING"
  });
  const token = await getGmailAccessToken(repo);
  if (!token) {
    const error = "Gmail API nao conectada no CRM.";
    updateEmailHistory(repo, historyId, { status: "ERROR", errorMessage: error });
    throw new Error(error);
  }
  const raw = buildRawEmail({ from, to, subject, text });
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });
  if (!response.ok) {
    const payload = await response.text();
    const error = `Gmail API recusou o envio (${response.status}): ${payload.slice(0, 300)}`;
    updateEmailHistory(repo, historyId, { status: "ERROR", errorMessage: error });
    throw new Error(error);
  }
  const payload = await response.json().catch(() => ({}));
  updateEmailHistory(repo, historyId, { status: "SENT", providerMessageId: payload.id || "" });
}

async function getGmailAccessToken(repo) {
  const settings = getGmailSettings(repo);
  if (process.env.GMAIL_ACCESS_TOKEN) {
    return process.env.GMAIL_ACCESS_TOKEN;
  }
  if (settings.accessToken && settings.accessTokenExpiresAt && Date.parse(settings.accessTokenExpiresAt) > Date.now() + 60000) {
    return settings.accessToken;
  }
  const clientId = normalizeText(settings.clientId || process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID);
  const clientSecret = normalizeText(settings.clientSecret || process.env.GOOGLE_CLIENT_SECRET || process.env.GMAIL_CLIENT_SECRET);
  const refreshToken = normalizeText(settings.refreshToken || process.env.GMAIL_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) {
    return "";
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Nao foi possivel renovar token do Gmail (${response.status}).`);
  }
  const accessToken = String(payload.access_token);
  saveGmailSettings(repo, {
    ...settings,
    accessToken,
    accessTokenExpiresAt: new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString(),
    refreshToken
  });
  return accessToken;
}

function buildRawEmail({ from, to, subject, text }) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(String(subject || ""), "utf8").toString("base64")}?=`;
  const headers = [
    from ? `From: ${from}` : "",
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit"
  ].filter(Boolean);
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${text || ""}`, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function exportFullBackupZip(repo, payload = {}, uploadsRoot) {
  const exportedAt = new Date().toISOString();
  const ods = repo.exportBackupOds({
    ...payload,
    fileName: `backup-crm-${exportedAt.slice(0, 10)}.ods`
  });
  const manifest = {
    kind: "brasil-express-crm-full-backup",
    version: 1,
    exportedAt,
    odsFile: ods.fileName,
    includes: ["backup ODS", "uploads completos", "historico de emails", "arquivos do sistema", "credenciais OAuth/Gmail"]
  };
  const baseEntries = [
    { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
    { name: `data/${ods.fileName}`, data: ods.buffer },
    { name: "secrets/oauth-gmail.json", data: Buffer.from(JSON.stringify(buildFullBackupSecrets(repo, exportedAt), null, 2), "utf8") }
  ];
  const uploadEntries = collectDirectoryEntries(uploadsRoot, "uploads");
  const systemEntries = [
    "package.json",
    "package-lock.json",
    "docker-compose.yml",
    "Dockerfile",
    "Dockerfile.server",
    "Dockerfile.frontend",
    "Dockerfile.webstore",
    "vite.config.ts",
    "vite.webstore.config.ts",
    "index.html",
    "webstore.html"
  ]
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => ({ name: `system/${filePath.replace(/\\/g, "/")}`, data: readFileSync(filePath) }));
  const directoryEntries = ["src", "server", "scripts", "ops", "public"]
    .filter((directory) => existsSync(directory))
    .flatMap((directory) => collectDirectoryEntries(directory, `system/${directory}`))
    .filter((entry) => !entry.name.startsWith("system/server/storage/"));
  return {
    fileName: `backup-crm-completo-${exportedAt.slice(0, 10)}.zip`,
    exportedAt,
    totalRows: ods.totalRows,
    buffer: createZip([...baseEntries, ...uploadEntries, ...systemEntries, ...directoryEntries])
  };
}

function importFullBackupZip(repo, payload = {}, uploadsRoot) {
  const contentBase64 = normalizeText(payload.contentBase64 || payload.content || "");
  if (!contentBase64) {
    throw new Error("Envie um arquivo ZIP para importar.");
  }
  const entries = readZipEntries(Buffer.from(contentBase64, "base64"));
  const odsEntry = entries.find((entry) => entry.name.startsWith("data/") && entry.name.toLowerCase().endsWith(".ods"));
  if (!odsEntry) {
    throw new Error("ZIP sem backup ODS em data/.");
  }
  const summary = repo.importBackupOds({
    fileName: odsEntry.name.split("/").pop(),
    contentBase64: Buffer.from(odsEntry.data).toString("base64"),
    clearExisting: payload.clearExisting !== false,
    _actor: payload._actor || payload.actor
  });
  if (payload.restoreUploads !== false) {
    rmSync(uploadsRoot, { recursive: true, force: true });
    mkdirSync(uploadsRoot, { recursive: true });
    summary.restoredUploads = writeZipEntriesToDirectory(entries, uploadsRoot, "uploads");
  }
  const secretsEntry = entries.find((entry) => entry.name === "secrets/oauth-gmail.json");
  if (secretsEntry && payload.restoreSecrets !== false) {
    summary.restoredSecrets = importFullBackupSecrets(repo, secretsEntry.data, payload._actor || payload.actor);
  }
  summary.zipFileName = payload.fileName || "";
  summary.importedAt = new Date().toISOString();
  return summary;
}

function buildFullBackupSecrets(repo, exportedAt) {
  const gmailSettings = getGmailSettings(repo);
  return {
    kind: "brasil-express-crm-oauth-secrets",
    version: 1,
    exportedAt,
    warning: "Arquivo sensivel. Contem credenciais OAuth, tokens Gmail e segredos usados localmente pelo CRM.",
    environment: {
      GOOGLE_CLIENT_ID: normalizeText(process.env.GOOGLE_CLIENT_ID),
      GOOGLE_CLIENT_SECRET: normalizeText(process.env.GOOGLE_CLIENT_SECRET),
      GMAIL_CLIENT_ID: normalizeText(process.env.GMAIL_CLIENT_ID),
      GMAIL_CLIENT_SECRET: normalizeText(process.env.GMAIL_CLIENT_SECRET),
      GMAIL_REFRESH_TOKEN: normalizeText(process.env.GMAIL_REFRESH_TOKEN),
      GMAIL_ACCESS_TOKEN: normalizeText(process.env.GMAIL_ACCESS_TOKEN),
      GMAIL_FROM: normalizeText(process.env.GMAIL_FROM),
      BRASILEXPRESS_CONTACT_EMAIL: normalizeText(process.env.BRASILEXPRESS_CONTACT_EMAIL)
    },
    gmailApiSettings: {
      clientId: gmailSettings.clientId,
      clientSecret: gmailSettings.clientSecret,
      email: gmailSettings.email,
      accessToken: gmailSettings.accessToken,
      accessTokenExpiresAt: gmailSettings.accessTokenExpiresAt,
      refreshToken: gmailSettings.refreshToken,
      status: gmailSettings.status,
      connectedAt: gmailSettings.connectedAt,
      updatedAt: gmailSettings.updatedAt
    }
  };
}

function importFullBackupSecrets(repo, data, actor = null) {
  const secrets = JSON.parse(Buffer.from(data).toString("utf8"));
  const env = secrets.environment || {};
  const gmail = secrets.gmailApiSettings || {};
  const imported = {
    clientId: normalizeText(gmail.clientId || env.GOOGLE_CLIENT_ID || env.GMAIL_CLIENT_ID),
    clientSecret: normalizeText(gmail.clientSecret || env.GOOGLE_CLIENT_SECRET || env.GMAIL_CLIENT_SECRET),
    email: normalizeText(gmail.email || env.GMAIL_FROM),
    accessToken: normalizeText(gmail.accessToken || env.GMAIL_ACCESS_TOKEN),
    accessTokenExpiresAt: normalizeText(gmail.accessTokenExpiresAt),
    refreshToken: normalizeText(gmail.refreshToken || env.GMAIL_REFRESH_TOKEN),
    status: normalizeText(gmail.status, gmail.refreshToken || env.GMAIL_REFRESH_TOKEN ? "CONNECTED" : "DISCONNECTED"),
    connectedAt: normalizeText(gmail.connectedAt),
    updatedAt: new Date().toISOString(),
    updatedBy: actor?.name || ""
  };
  saveAppSetting(repo, "gmail_api_settings", imported);
  return {
    gmailApiSettings: Boolean(imported.clientId || imported.clientSecret || imported.refreshToken || imported.accessToken || imported.email),
    hasClientId: Boolean(imported.clientId),
    hasClientSecret: Boolean(imported.clientSecret),
    hasRefreshToken: Boolean(imported.refreshToken),
    hasAccessToken: Boolean(imported.accessToken),
    email: imported.email
  };
}

function buildPublicWebstoreSettings(repo) {
  const settings = repo.getWebstoreSettings();
  const status = getWebstoreStatus(settings);
  const realClients = Number(repo.db.prepare("SELECT COUNT(*) AS total FROM clients").get()?.total || 0);
  const realProducts = Number(repo.db.prepare(`
    SELECT COUNT(*) AS total
    FROM catalog_items
    WHERE active = 1
      AND webstore_visible = 1
      AND COALESCE(deleted_at, '') = ''
      AND COALESCE(location_type, 'ESTOQUE') = 'ESTOQUE'
  `).get()?.total || 0);
  const openingYear = Number(settings.companyOpeningYear || 0);
  const years = openingYear ? Math.max(0, new Date().getFullYear() - openingYear) : Number(String(settings.statsYears || "").replace(/\D/g, "")) || 0;
  const clientsTotal = Math.max(0, Number(settings.statsClientsBase || 0)) + realClients;
  return {
    enabled: settings.enabled,
    checkoutEnabled: settings.checkoutEnabled,
    allowCheckoutWhenClosed: settings.allowCheckoutWhenClosed,
    storeName: settings.storeName,
    pageTitle: settings.pageTitle,
    headline: settings.headline,
    logoText: settings.logoText,
    logoImageUrl: settings.logoImageUrl,
    logoMaxHeight: settings.logoMaxHeight,
    heroImageUrl: settings.heroImageUrl,
    showcaseOneImageUrl: settings.showcaseOneImageUrl,
    showcaseTwoImageUrl: settings.showcaseTwoImageUrl,
    showcaseThreeImageUrl: settings.showcaseThreeImageUrl,
    subtitle: settings.subtitle,
    closedMessage: settings.closedMessage,
    offlineMessage: settings.offlineMessage,
    whatsapp: settings.whatsapp,
    googleBusinessUrl: settings.googleBusinessUrl,
    googleMapsUrl: settings.googleMapsUrl,
    homepageEnabled: settings.homepageEnabled,
    heroTitle: settings.heroTitle,
    heroSubtitle: settings.heroSubtitle,
    heroCtaLabel: settings.heroCtaLabel,
    servicesTitle: settings.servicesTitle,
    bestSellersTitle: settings.bestSellersTitle,
    aboutTitle: settings.aboutTitle,
    aboutText: settings.aboutText,
    statsYears: String(years),
    statsYearsLabel: settings.statsYearsLabel,
    statsClients: String(clientsTotal),
    statsClientsLabel: settings.statsClientsLabel,
    companyOpeningYear: settings.companyOpeningYear,
    statsClientsBase: settings.statsClientsBase,
    realClients,
    realShowcaseItems: realProducts,
    differentiatorsTitle: settings.differentiatorsTitle,
    differentiatorOneTitle: settings.differentiatorOneTitle,
    differentiatorOneText: settings.differentiatorOneText,
    differentiatorTwoTitle: settings.differentiatorTwoTitle,
    differentiatorTwoText: settings.differentiatorTwoText,
    differentiatorThreeTitle: settings.differentiatorThreeTitle,
    differentiatorThreeText: settings.differentiatorThreeText,
    reviewsTitle: settings.reviewsTitle,
    reviewsSubtitle: settings.reviewsSubtitle,
    googleReviewOneName: settings.googleReviewOneName,
    googleReviewOneText: settings.googleReviewOneText,
    googleReviewTwoName: settings.googleReviewTwoName,
    googleReviewTwoText: settings.googleReviewTwoText,
    googleReviewThreeName: settings.googleReviewThreeName,
    googleReviewThreeText: settings.googleReviewThreeText,
    ctaTitle: settings.ctaTitle,
    ctaText: settings.ctaText,
    locationTitle: settings.locationTitle,
    address: settings.address,
    businessHoursText: settings.businessHoursText,
    city: settings.city,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    featuredCategoriesLimit: settings.featuredCategoriesLimit,
    bestSellersLimit: settings.bestSellersLimit,
    heroGradientFromColor: settings.heroGradientFromColor,
    heroGradientToColor: settings.heroGradientToColor,
    heroGradientAngle: settings.heroGradientAngle,
    surfaceGradientFromColor: settings.surfaceGradientFromColor,
    surfaceGradientToColor: settings.surfaceGradientToColor,
    surfaceGradientAngle: settings.surfaceGradientAngle,
    darkGradientFromColor: settings.darkGradientFromColor,
    darkGradientToColor: settings.darkGradientToColor,
    darkGradientAngle: settings.darkGradientAngle,
    heroImageX: settings.heroImageX,
    heroImageY: settings.heroImageY,
    heroImageZ: settings.heroImageZ,
    showcaseOneImageX: settings.showcaseOneImageX,
    showcaseOneImageY: settings.showcaseOneImageY,
    showcaseOneImageZ: settings.showcaseOneImageZ,
    showcaseTwoImageX: settings.showcaseTwoImageX,
    showcaseTwoImageY: settings.showcaseTwoImageY,
    showcaseTwoImageZ: settings.showcaseTwoImageZ,
    themePrimaryColor: settings.themePrimaryColor,
    themeTextColor: settings.themeTextColor,
    themeMutedColor: settings.themeMutedColor,
    themeBackgroundColor: settings.themeBackgroundColor,
    themeSurfaceColor: settings.themeSurfaceColor,
    themeLineColor: settings.themeLineColor,
    themeAccentColor: settings.themeAccentColor,
    themeDarkColor: settings.themeDarkColor,
    themeFooterColor: settings.themeFooterColor,
    heroTitleSize: settings.heroTitleSize,
    heroSubtitleSize: settings.heroSubtitleSize,
    sectionTitleSize: settings.sectionTitleSize,
    bodyTextSize: settings.bodyTextSize,
    cardTitleSize: settings.cardTitleSize,
    navTextSize: settings.navTextSize,
    businessHours: settings.businessHours,
    openDays: settings.openDays,
    openTime: settings.openTime,
    closeTime: settings.closeTime,
    showProducts: settings.showProducts,
    showServices: settings.showServices,
    hideOutOfStock: settings.hideOutOfStock,
    status
  };
}

function buildWebstoreBestSellers(repo) {
  const settings = repo.getWebstoreSettings();
  const limit = 3;
  const db = repo.db;
  if (!db?.prepare) {
    return [];
  }
  const tableExists = (name) => Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  const productTotals = new Map();
  const serviceTotals = new Map();

  if (tableExists("order_items")) {
    for (const row of db.prepare(`
      SELECT oi.catalog_item_id AS id, SUM(oi.quantity) AS total, MAX(COALESCE(o.concluded_at, o.updated_at, o.opened_at, '')) AS last_sold_at
      FROM order_items oi
      LEFT JOIN orders o ON o.id = oi.order_id
      GROUP BY oi.catalog_item_id
    `).all()) {
      const id = Number(row.id);
      const current = productTotals.get(id) || { total: 0, lastSoldAt: "" };
      productTotals.set(id, { total: current.total + Number(row.total || 0), lastSoldAt: maxTextDate(current.lastSoldAt, row.last_sold_at) });
    }
  }
  if (tableExists("pos_sale_items")) {
    for (const row of db.prepare(`
      SELECT psi.catalog_item_id AS id, SUM(psi.quantity) AS total, MAX(COALESCE(ps.created_at, psi.created_at, '')) AS last_sold_at
      FROM pos_sale_items psi
      LEFT JOIN pos_sales ps ON ps.id = psi.sale_id
      WHERE psi.catalog_item_id IS NOT NULL
      GROUP BY psi.catalog_item_id
    `).all()) {
      const id = Number(row.id);
      const current = productTotals.get(id) || { total: 0, lastSoldAt: "" };
      productTotals.set(id, { total: current.total + Number(row.total || 0), lastSoldAt: maxTextDate(current.lastSoldAt, row.last_sold_at) });
    }
    for (const row of db.prepare(`
      SELECT psi.service_catalog_id AS id, SUM(psi.quantity) AS total, MAX(COALESCE(ps.created_at, psi.created_at, '')) AS last_sold_at
      FROM pos_sale_items psi
      LEFT JOIN pos_sales ps ON ps.id = psi.sale_id
      WHERE psi.service_catalog_id IS NOT NULL
      GROUP BY psi.service_catalog_id
    `).all()) {
      const id = Number(row.id);
      const current = serviceTotals.get(id) || { total: 0, lastSoldAt: "" };
      serviceTotals.set(id, { total: current.total + Number(row.total || 0), lastSoldAt: maxTextDate(current.lastSoldAt, row.last_sold_at) });
    }
  }
  if (tableExists("order_services")) {
    for (const row of db.prepare(`
      SELECT os.service_id AS id, SUM(os.quantity) AS total, MAX(COALESCE(o.concluded_at, o.updated_at, o.opened_at, '')) AS last_sold_at
      FROM order_services os
      LEFT JOIN orders o ON o.id = os.order_id
      GROUP BY os.service_id
    `).all()) {
      const id = Number(row.id);
      const current = serviceTotals.get(id) || { total: 0, lastSoldAt: "" };
      serviceTotals.set(id, { total: current.total + Number(row.total || 0), lastSoldAt: maxTextDate(current.lastSoldAt, row.last_sold_at) });
    }
  }

  const products = repo.listCatalogItems({ activeOnly: "true" })
    .filter((item) => Number(item.active || 0) === 1)
    .filter((item) => Number(item.webstore_visible ?? 1) === 1)
    .filter((item) => String(item.deleted_at || "") === "")
    .map((item) => ({
      id: item.id,
      type: "product",
      name: item.name,
      category: item.category || "",
      description: item.description || item.brand || "",
      photo_url: item.photo_url || "",
      price_amount: Number(item.price_amount || 0),
      sold_quantity: Number(productTotals.get(Number(item.id))?.total || 0),
      last_sold_at: productTotals.get(Number(item.id))?.lastSoldAt || ""
    }));
  const services = repo.listServices({ activeOnly: "true" })
    .filter((service) => Number(service.active || 0) === 1)
    .map((service) => ({
      id: service.id,
      type: "service",
      name: service.name,
      category: "Serviços",
      description: service.description || "",
      photo_url: service.photo_url || "",
      price_amount: Number(service.price_amount || 0),
      sold_quantity: Number(serviceTotals.get(Number(service.id))?.total || 0),
      last_sold_at: serviceTotals.get(Number(service.id))?.lastSoldAt || ""
    }));

  return [...products, ...services]
    .filter((item) => item.sold_quantity > 0)
    .sort((a, b) => b.sold_quantity - a.sold_quantity || String(b.last_sold_at || "").localeCompare(String(a.last_sold_at || "")) || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, limit);
}

function maxTextDate(a = "", b = "") {
  return String(b || "") > String(a || "") ? String(b || "") : String(a || "");
}

function getWebstoreStatus(settings = {}) {
  const enabled = settings.enabled !== false;
  if (!enabled) {
    return { isOpen: false, reason: "disabled", label: "Loja fechada" };
  }
  if (!settings.respectBusinessHours) {
    return { isOpen: true, reason: "manual", label: "Loja aberta" };
  }

  const now = getZonedDateParts(settings.timezone || "America/Sao_Paulo");
  const currentMinutes = now.hour * 60 + now.minute;
  const dailyHours = Array.isArray(settings.businessHours)
    ? settings.businessHours.find((item) => Number(item?.day) === now.weekday)
    : null;
  const openMinutes = timeToMinutes(dailyHours?.openTime || settings.openTime || "09:00");
  const closeMinutes = timeToMinutes(dailyHours?.closeTime || settings.closeTime || "18:00");
  const openDays = Array.isArray(settings.openDays) ? settings.openDays.map(Number) : [1, 2, 3, 4, 5, 6];
  const dayAllowed = dailyHours ? dailyHours.enabled !== false && Number(dailyHours.enabled) !== 0 : openDays.includes(now.weekday);
  const timeAllowed = closeMinutes >= openMinutes
    ? currentMinutes >= openMinutes && currentMinutes < closeMinutes
    : currentMinutes >= openMinutes || currentMinutes < closeMinutes;

  return {
    isOpen: Boolean(dayAllowed && timeAllowed),
    reason: dayAllowed ? "schedule" : "closed_day",
    label: dayAllowed && timeAllowed ? "Loja aberta" : "Loja fechada",
    currentTime: `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`,
    openTime: dailyHours?.openTime || settings.openTime || "09:00",
    closeTime: dailyHours?.closeTime || settings.closeTime || "18:00"
  };
}

function getZonedDateParts(timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdays[parts.weekday] ?? 0,
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0)
  };
}

function timeToMinutes(value) {
  const [hour, minute] = String(value || "00:00").split(":").map((part) => Number.parseInt(part, 10) || 0);
  return Math.max(0, Math.min(23, hour)) * 60 + Math.max(0, Math.min(59, minute));
}

function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
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

function sendBinary(response, statusCode, body, headers = {}) {
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
