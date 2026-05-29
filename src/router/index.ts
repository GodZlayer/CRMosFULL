import { createRouter, createWebHistory } from "vue-router";
import LoginView from "../views/LoginView.vue";
import ClientsView from "../views/ClientsView.vue";
import OrdersView from "../views/OrdersView.vue";
import OrderWorkspaceView from "../views/OrderWorkspaceView.vue";
import CalendarView from "../views/CalendarView.vue";
import TasksView from "../views/TasksView.vue";
import CatalogView from "../views/CatalogView.vue";
import InventoryView from "../views/InventoryView.vue";
import ServicesView from "../views/ServicesView.vue";
import FinanceView from "../views/FinanceView.vue";
import PurchasesView from "../views/PurchasesView.vue";
import ReportsView from "../views/ReportsView.vue";
import PdvView from "../views/PdvView.vue";
import WebstoreSettingsView from "../views/WebstoreSettingsView.vue";
import BackupImportView from "../views/BackupImportView.vue";
import OrderPrintView from "../views/OrderPrintView.vue";
import PdvPrintView from "../views/PdvPrintView.vue";
import { useSessionStore } from "../stores/session";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginView, meta: { public: true } },
    { path: "/", redirect: "/financeiro" },
    { path: "/dashboard", redirect: "/financeiro" },
    { path: "/clientes", name: "clientes", component: ClientsView },
    { path: "/os", name: "os", component: OrdersView, meta: { navGroup: "operations", navSection: "os" } },
    { path: "/os/:id", name: "os-detalhe", component: OrderWorkspaceView },
    { path: "/calendario", name: "calendario", component: CalendarView, meta: { navGroup: "agenda", navSection: "calendario" } },
    { path: "/tarefas", name: "tarefas", component: TasksView, meta: { navGroup: "agenda", navSection: "tarefas" } },
    { path: "/catalogo", name: "catalogo", component: CatalogView, meta: { navGroup: "inventory", navSection: "catalogo" } },
    { path: "/inventario", name: "inventario", component: InventoryView, meta: { navGroup: "inventory", navSection: "inventario" } },
    { path: "/servicos", name: "servicos", component: ServicesView, meta: { navGroup: "inventory", navSection: "servicos" } },
    { path: "/financeiro", name: "financeiro", component: FinanceView, meta: { navGroup: "finance", navSection: "financeiro" } },
    { path: "/compras", name: "compras", component: PurchasesView, meta: { navGroup: "finance", navSection: "compras" } },
    { path: "/backup-importacao", name: "backup-importacao", component: BackupImportView },
    { path: "/relatorios", name: "relatorios", component: ReportsView, meta: { navGroup: "finance", navSection: "relatorios" } },
    { path: "/pdv", name: "pdv", component: PdvView, meta: { navGroup: "operations", navSection: "pdv" } },
    { path: "/webstore", name: "webstore", component: WebstoreSettingsView, meta: { navGroup: "webstore", navSection: "webstore" } },
    { path: "/imprimir/os/:id", name: "imprimir-os", component: OrderPrintView },
    { path: "/imprimir/pdv/:id", name: "imprimir-pdv", component: PdvPrintView }
  ]
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  await session.bootstrap();

  if (to.meta.public && session.isAuthenticated) {
    return "/financeiro";
  }

  if (!to.meta.public && !session.isAuthenticated) {
    return "/login";
  }

  return true;
});

export default router;






