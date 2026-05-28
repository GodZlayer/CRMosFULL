<template>
 <AppShell
  title="Relatorios estrategicos"
  subtitle="Leitura executiva ou tabular com filtros amplos, auditoria e impressao interna.">
  <template #actions>
   <FilterDrawer title="Filtros dos relatorios" @apply="loadReports" @clear="clearFilters">
    <div class="d-grid gap-3">
     <div>
      <label class="form-label fw-semibold">Buscar</label>
      <input
       v-model="filters.search"
       class="form-control rounded-4"
       placeholder="Ordens, PDV, financeiro, estoque ou clientes"
      />
     </div>
     <div class="row g-3">
      <div class="col-md-6">
       <label class="form-label fw-semibold">De</label>
       <input v-model="filters.fromDate" type="date" class="form-control rounded-4" />
      </div>
      <div class="col-md-6">
       <label class="form-label fw-semibold">Ate</label>
       <input v-model="filters.toDate" type="date" class="form-control rounded-4" />
      </div>
     </div>
     <div>
      <label class="form-label fw-semibold">Status OS</label>
      <select v-model="filters.orderStatus" class="form-select rounded-4">
       <option value="">Todos</option>
       <option
        v-for="item in session.meta?.orderStatuses || []"
        :key="item.code"
        :value="item.code">
        {{ item.label }}
       </option>
      </select>
     </div>
     <div>
      <label class="form-label fw-semibold">Aprovacao</label>
      <select v-model="filters.approvalStatus" class="form-select rounded-4">
       <option value="">Todas</option>
       <option
        v-for="item in session.meta?.approvalStatuses || []"
        :key="item.code"
        :value="item.code">
        {{ item.label }}
       </option>
      </select>
     </div>
    </div>
   </FilterDrawer>

   <div class="btn-group">
    <button
     class="btn"
     :class="viewMode === 'detail' ? 'btn-primary' : 'btn-outline-secondary'"
     @click="viewMode = 'detail'">
     Detalhado
    </button>
    <button
     class="btn"
     :class="viewMode === 'table' ? 'btn-primary' : 'btn-outline-secondary'"
     @click="viewMode = 'table'">
     Tabular
    </button>
   </div>

   <button class="btn btn-outline-secondary rounded-pill" @click="printPage">
    <i class="fa-solid fa-print me-2"></i>
    Imprimir
   </button>
  </template>

  <div class="row g-4 mb-4">
   <div class="col-md-6 col-xl-3">
    <MetricCard
     title="Ordens no filtro"
     :value="payload?.summary.totalOrders || 0"
     hint="Volume total de OS retornadas pela consulta."
     icon="fa-solid fa-file-lines"
     tone="primary"
    />
   </div>
   <div class="col-md-6 col-xl-3">
    <MetricCard
     title="Entradas operacionais"
     :value="currency(payload?.summary.totalEntries)"
     :hint="`OS ${currency(payload?.summary.totalOrderValue)} | PDV ${currency(payload?.summary.totalPdvValue)}`"
     icon="fa-solid fa-money-check-dollar"
     tone="success"
    />
   </div>
   <div class="col-md-6 col-xl-3">
    <MetricCard
     title="Despesas"
     :value="currency(payload?.summary.totalExpenses)"
     :hint="`Financeiro oficial ${currency(payload?.summary.totalExpenses)} | Compras de estoque ${currency(payload?.summary.totalPurchaseExpenses)}`"
     icon="fa-solid fa-arrow-trend-down"
     tone="danger"
    />
   </div>
   <div class="col-md-6 col-xl-3">
    <MetricCard
     title="Estoque"
     :value="currency(payload?.summary.totalInventoryValue)"
     :hint="`Estoque real atual: ${Number(payload?.summary.totalInventoryUnits || 0)} unidade(s) em ${Number(payload?.summary.totalInventoryItems || 0)} codigo(s).`"
     icon="fa-solid fa-warehouse"
     tone="warning"
    />
   </div>
  </div>

  <div v-if="viewMode === 'detail'" class="row g-4">
   <div class="col-xl-6">
    <DataTable
     title="Ordens detalhadas"
     eyebrow="OS"
     :rows="payload?.orders || []"
     :columns="orderColumns"
     :allow-csv="true"
     :allow-print="true"
     :print-summary-fields="orderPrintSummaryFields"
     responsive-mode="auto"
    />
   </div>
   <div class="col-xl-6">
    <DataTable
     title="Vendas PDV"
     eyebrow="Entradas de venda"
     :rows="payload?.pdvSales || []"
     :columns="pdvColumns"
     :allow-csv="true"
     :allow-print="true"
     :print-summary-fields="pdvPrintSummaryFields"
     responsive-mode="auto"
    />
   </div>
   <div class="col-xl-6">
    <DataTable
     title="Financeiro oficial"
     eyebrow="Entradas e saidas"
     :rows="payload?.finance || []"
     :columns="financeColumns"
     :allow-csv="true"
     :allow-print="true"
     :print-summary-fields="financePrintSummaryFields"
     responsive-mode="auto"
    />
   </div>
   <div class="col-xl-6">
    <DataTable
     title="Compras e reposicoes"
     eyebrow="Estoque"
     :rows="payload?.purchases || []"
     :columns="purchaseColumns"
     :allow-csv="true"
     :allow-print="true"
     :print-summary-fields="purchasePrintSummaryFields"
     responsive-mode="auto"
    />
   </div>
   <div class="col-xl-12">
    <DataTable
     title="Estoque e inventario"
     eyebrow="Catalogo"
     :rows="payload?.inventory || []"
     :columns="inventoryColumns"
     :allow-csv="true"
     :allow-print="true"
     :print-summary-fields="inventoryPrintSummaryFields"
     responsive-mode="auto"
    />
   </div>
   <div class="col-xl-12">
    <DataTable
     title="Performance por conta"
     eyebrow="Auditoria"
     :rows="payload?.performance || []"
     :columns="performanceColumns"
     :allow-csv="true"
     :allow-print="true"
     :print-summary-fields="performancePrintSummaryFields"
     responsive-mode="auto"
    />
   </div>
  </div>

  <div v-else class="panel-card print-sheet">
   <h2 class="h4 fw-bold mb-3">Resumo tabular para circulacao interna</h2>

   <div class="table-responsive mb-4">
    <table class="table table-striped align-middle">
     <thead>
      <tr>
       <th>Codigo</th>
       <th>Cliente</th>
       <th>Status</th>
       <th>Aprovacao</th>
       <th>Total</th>
      </tr>
     </thead>
     <tbody>
      <tr v-for="order in payload?.orders || []" :key="order.id">
       <td>{{ order.code }}</td>
       <td>{{ order.client_name }}</td>
       <td>{{ order.order_status }}</td>
       <td>{{ order.approval_status }}</td>
       <td>{{ currency(order.total_amount) }}</td>
      </tr>
     </tbody>
     <tfoot>
      <tr class="fw-bold">
       <td colspan="4">Total da impressão</td>
       <td>{{ currency(totalRowsAmount(payload?.orders || [], "total_amount")) }}</td>
      </tr>
     </tfoot>
    </table>
   </div>

   <div class="table-responsive mb-4">
    <table class="table table-sm table-bordered">
     <thead>
      <tr>
       <th>Venda</th>
       <th>Cliente</th>
       <th>Itens vendidos</th>
       <th>Operador</th>
       <th>Subtotal</th>
       <th>Desconto</th>
       <th>Total</th>
      </tr>
     </thead>
     <tbody>
      <tr v-for="sale in payload?.pdvSales || []" :key="sale.id">
       <td>{{ sale.code }}</td>
       <td>{{ sale.client_name }}</td>
       <td>{{ sale.item_summary || "-" }}</td>
       <td>{{ sale.operator_name }}</td>
       <td>{{ currency(sale.subtotal_amount) }}</td>
       <td>{{ currency(sale.discount_amount) }}</td>
       <td>{{ currency(sale.total_amount) }}</td>
      </tr>
     </tbody>
     <tfoot>
      <tr class="fw-bold">
       <td colspan="6">Total da impressão</td>
       <td>{{ currency(totalRowsAmount(payload?.pdvSales || [], "total_amount")) }}</td>
      </tr>
     </tfoot>
    </table>
   </div>

   <div class="table-responsive mb-4">
    <table class="table table-sm table-bordered">
     <caption class="caption-top fw-semibold text-body-secondary">
      Financeiro oficial: entradas e saidas do recorte (excluindo compras de estoque).
     </caption>
     <thead>
     <tr>
       <th>Ação</th>
       <th>Tipo</th>
       <th>Categoria</th>
       <th>Descricao</th>
       <th>Itens vendidos</th>
       <th>Pagamento</th>
       <th>Valor</th>
      </tr>
     </thead>
     <tbody>
      <tr v-for="entry in (payload?.finance || [])" :key="entry.id">
       <td>
        <button
         v-if="canRevertFinanceEntry(entry)"
         class="btn btn-sm btn-outline-danger rounded-pill"
         :disabled="Number(revertingTransactionId || 0) === Number(entry.id || 0)"
         @click="revertFinanceRow(entry)">
         {{ Number(revertingTransactionId || 0) === Number(entry.id || 0) ? "Desfazendo..." : "Reverter" }}
        </button>
        <span v-else>-</span>
       </td>
       <td>{{ entry.entry_type }}</td>
       <td>{{ entry.category }}</td>
       <td>{{ entry.description }}</td>
       <td>{{ entry.item_summary || "-" }}</td>
       <td>{{ entry.cash_account_name || entry.cash_account_code || entry.payment_method || "-" }}</td>
       <td>{{ currency(entry.amount) }}</td>
      </tr>
     </tbody>
     <tfoot>
      <tr class="fw-bold">
       <td colspan="6">Total da impressão</td>
       <td>{{ currency(totalRowsAmount(payload?.finance || [], "amount")) }}</td>
      </tr>
     </tfoot>
    </table>
   </div>

   <div class="table-responsive mb-4">
    <table class="table table-sm table-bordered">
     <caption class="caption-top fw-semibold text-body-secondary">
      Compras e reposicoes: despesas de estoque.
     </caption>
     <thead>
     <tr>
       <th>Ação</th>
       <th>Tipo</th>
       <th>Categoria</th>
       <th>Descricao</th>
       <th>Pagamento</th>
       <th>Valor</th>
      </tr>
     </thead>
     <tbody>
      <tr v-for="entry in (payload?.purchases || [])" :key="`purchase-${entry.id}`">
       <td>
        <button
         v-if="canRevertFinanceEntry(entry)"
         class="btn btn-sm btn-outline-danger rounded-pill"
         :disabled="Number(revertingTransactionId || 0) === Number(entry.id || 0)"
         @click="revertFinanceRow(entry)">
         {{ Number(revertingTransactionId || 0) === Number(entry.id || 0) ? "Desfazendo..." : "Reverter" }}
        </button>
        <span v-else>-</span>
       </td>
       <td>{{ entry.entry_type }}</td>
       <td>{{ entry.category }}</td>
       <td>{{ entry.description }}</td>
       <td>{{ entry.cash_account_name || entry.cash_account_code || entry.payment_method || "-" }}</td>
       <td>{{ currency(entry.amount) }}</td>
      </tr>
     </tbody>
     <tfoot>
      <tr class="fw-bold">
       <td colspan="5">Total da impressão</td>
       <td>{{ currency(totalRowsAmount(payload?.purchases || [], "amount")) }}</td>
      </tr>
     </tfoot>
    </table>
   </div>

   <div class="table-responsive">
    <table class="table table-sm table-striped">
     <thead>
      <tr>
       <th>Conta</th>
       <th>Acoes</th>
       <th>OS criadas</th>
       <th>Fechamentos</th>
       <th>PDV</th>
      </tr>
     </thead>
     <tbody>
      <tr v-for="item in payload?.performance || []" :key="`${item.actorUserId}-${item.actorName}`">
       <td>{{ item.actorName }}</td>
       <td>{{ item.totalActions }}</td>
       <td>{{ item.ordersCreated }}</td>
       <td>{{ item.ordersClosed }}</td>
       <td>{{ item.pdvSales }}</td>
      </tr>
     </tbody>
     <tfoot>
      <tr class="fw-bold">
       <td>Total da impressão</td>
       <td>{{ totalRowsAmount(payload?.performance || [], "totalActions") }}</td>
       <td>{{ totalRowsAmount(payload?.performance || [], "ordersCreated") }}</td>
       <td>{{ totalRowsAmount(payload?.performance || [], "ordersClosed") }}</td>
       <td>{{ totalRowsAmount(payload?.performance || [], "pdvSales") }}</td>
      </tr>
     </tfoot>
    </table>
   </div>
  </div>
 </AppShell>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import DataTable from "../components/DataTable.vue";
import FilterDrawer from "../components/FilterDrawer.vue";
import MetricCard from "../components/MetricCard.vue";
import { api } from "../services/api";
import { currency } from "../services/format";
import type { ReportsPayload } from "../services/types";
import { notifyError, notifySuccess } from "../services/ui";
import { useSessionStore } from "../stores/session";

const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const payload = ref<ReportsPayload | null>(null);
const revertingTransactionId = ref(0);
const filters = reactive({
 search: "",
 fromDate: "",
 toDate: "",
 orderStatus: "",
 approvalStatus: ""
});
const viewMode = ref<"detail" | "table">("detail");

const orderColumns = [
 { title: "Codigo", field: "code" },
 { title: "Cliente", field: "client_name" },
 { title: "Equipamento", field: "equipment" },
 { title: "Status", field: "order_status" },
 { title: "Aprovacao", field: "approval_status" },
 { title: "Total", field: "total_amount", formatter: (cell: any) => currency(cell.getValue()) },
 { title: "ID", field: "id", visible: false },
 { title: "Cliente ID", field: "client_id", visible: false },
 { title: "Telefone", field: "client_phone", visible: false },
 { title: "Telefone snapshot", field: "phone_snapshot", visible: false },
 { title: "Defeito", field: "defect", visible: false, minWidth: 220 },
 { title: "Extras", field: "extras", visible: false },
 { title: "Tecnico", field: "technician_name", visible: false },
 { title: "Previsao", field: "due_date", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Orcamento", field: "quote_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Pre-aprovado", field: "pre_approved_limit", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Valor real", field: "actual_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Servicos", field: "service_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Desconto", field: "discount_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Pagamento", field: "payment_method", visible: false },
 { title: "Observacoes", field: "notes", visible: false, minWidth: 240 },
 { title: "Aberta em", field: "opened_at", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Concluida em", field: "concluded_at", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Entregue em", field: "delivered_at", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Cancelada em", field: "cancelled_at", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Itens", field: "items_count", visible: false },
 { title: "Foto", field: "photo_path", visible: false }
];

const pdvColumns = [
 { title: "Codigo", field: "code", minWidth: 150 },
 { title: "Cliente", field: "client_name", minWidth: 180 },
 { title: "Itens vendidos", field: "item_summary", minWidth: 240 },
 { title: "Operador", field: "operator_name", minWidth: 150 },
 { title: "Subtotal", field: "subtotal_amount", formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Desconto", field: "discount_amount", formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Total", field: "total_amount", formatter: (cell: any) => currency(cell.getValue()) },
 { title: "ID", field: "id", visible: false },
 { title: "Sessao caixa", field: "cash_session_id", visible: false },
 { title: "Loja ID", field: "store_id", visible: false },
 { title: "Usuario ID", field: "user_id", visible: false },
 { title: "Cliente ID", field: "client_id", visible: false },
 { title: "Loja", field: "store_name", visible: false },
 { title: "Loja curta", field: "store_short_name", visible: false },
 { title: "Acrescimo", field: "surcharge_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Pago", field: "paid_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Troco", field: "change_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Pagamento", field: "payment_method", visible: false },
 { title: "Observacoes", field: "notes", visible: false, minWidth: 220 },
 { title: "Criada em", field: "created_at", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Atualizada em", field: "updated_at", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) }
];

function financeAccountLabel(entry: any) {
 return String(entry.cash_account_name || entry.cash_account_code || entry.payment_method || "-");
}

function parseFinancePayload(entry: any) {
 try {
  return JSON.parse(String(entry?.raw_payload || "{}"));
 } catch {
  return {};
 }
}

function canRevertFinanceEntry(entry: any) {
 const financeEntryId = Number(entry.finance_entry_id || entry.id || 0);
 const replenishmentId = Number(entry.replenishment_id || 0);
 if (replenishmentId > 0) {
  return true;
 }
 const rawPayload = parseFinancePayload(entry);
 const source = String(rawPayload.source || rawPayload.origin || "").toUpperCase();
 return financeEntryId > 0 && !["ORDER_COMPLETION", "PDV_PAYMENT"].includes(source);
}

async function revertFinanceRow(entry: any) {
 const confirmed = window.confirm("Reverter esta transação? Se ela estiver ligada a reposição de estoque, o estoque e o caixa também serão revertidos.");
 if (!confirmed) {
  return;
 }
  try {
  revertingTransactionId.value = Number(entry.id || 0);
  await api.revertFinanceTransaction({
   financeEntryId: Number(entry.finance_entry_id || entry.id || 0) || undefined,
   replenishmentId: Number(entry.replenishment_id || 0) || undefined
  });
  await loadReports();
  await notifySuccess("Transação revertida");
 } catch (error) {
  await notifyError(error);
 } finally {
  revertingTransactionId.value = 0;
 }
}

const transactionActionColumn = {
 title: "Ação",
 field: "transaction_actions",
 hozAlign: "center",
 headerSort: false,
 width: 120,
 formatter: (cell: any) => {
  const row = cell.getRow().getData();
  if (!canRevertFinanceEntry(row)) {
   return '<span>-</span>';
  }
  const disabled = Number(revertingTransactionId.value || 0) === Number(row.id || 0);
  return `<button class="btn btn-sm btn-outline-danger rounded-pill action-revert-finance" data-row-action="true" ${disabled ? "disabled" : ""}>${disabled ? "Desfazendo..." : "Reverter"}</button>`;
 },
 cellClick: async (event: MouseEvent, cell: any) => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest(".action-revert-finance")) {
   return;
  }
  event.stopPropagation();
  await revertFinanceRow(cell.getRow().getData());
 }
};

const financeColumns = [
 transactionActionColumn,
 { title: "Tipo", field: "entry_type" },
 { title: "Categoria", field: "category" },
 { title: "Descricao", field: "description" },
 { title: "Itens vendidos", field: "item_summary", minWidth: 240 },
 { title: "Conta", field: "cash_account_name", formatter: (cell: any) => financeAccountLabel(cell.getRow().getData()) },
 { title: "Valor", field: "amount", formatter: (cell: any) => currency(cell.getValue()) },
 { title: "ID", field: "id", visible: false },
 { title: "Data", field: "entry_date", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Pagamento", field: "payment_method", visible: false },
 { title: "OS ID", field: "order_id", visible: false },
 { title: "OS", field: "order_code", visible: false },
 { title: "Loja ID", field: "store_id", visible: false },
 { title: "Conta ID", field: "cash_account_id", visible: false },
 { title: "Codigo conta", field: "cash_account_code", visible: false },
 { title: "Reposicao ID", field: "replenishment_id", visible: false },
 { title: "Financeiro ID", field: "finance_entry_id", visible: false },
 { title: "Arquivo origem", field: "source_workbook", visible: false },
 { title: "Aba origem", field: "source_sheet", visible: false },
 { title: "Linha origem", field: "source_row", visible: false },
 { title: "Secao legado", field: "legacy_section", visible: false },
 { title: "Payload", field: "raw_payload", visible: false, minWidth: 260 }
];

const purchaseColumns = [
 transactionActionColumn,
 { title: "Tipo", field: "entry_type" },
 { title: "Categoria", field: "category" },
 { title: "Descricao", field: "description" },
 { title: "Conta", field: "cash_account_name", formatter: (cell: any) => financeAccountLabel(cell.getRow().getData()) },
 { title: "Valor", field: "amount", formatter: (cell: any) => currency(cell.getValue()) },
 { title: "ID", field: "id", visible: false },
 { title: "Data", field: "entry_date", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Pagamento", field: "payment_method", visible: false },
 { title: "OS ID", field: "order_id", visible: false },
 { title: "OS", field: "order_code", visible: false },
 { title: "Loja ID", field: "store_id", visible: false },
 { title: "Conta ID", field: "cash_account_id", visible: false },
 { title: "Codigo conta", field: "cash_account_code", visible: false },
 { title: "Reposicao ID", field: "replenishment_id", visible: false },
 { title: "Financeiro ID", field: "finance_entry_id", visible: false },
 { title: "Arquivo origem", field: "source_workbook", visible: false },
 { title: "Aba origem", field: "source_sheet", visible: false },
 { title: "Linha origem", field: "source_row", visible: false },
 { title: "Secao legado", field: "legacy_section", visible: false },
 { title: "Payload", field: "raw_payload", visible: false, minWidth: 260 }
];

function formatDateTime(value: unknown) {
 const normalized = String(value || "").trim();
 if (!normalized) {
  return "-";
 }
 const parsed = new Date(normalized);
 if (Number.isNaN(parsed.getTime())) {
  return normalized;
 }
 return parsed.toLocaleString("pt-BR");
}

const inventoryColumns = [
 { title: "SKU", field: "sku" },
 { title: "Nome", field: "name", minWidth: 220 },
 { title: "Data adicao", field: "created_at", formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Ultima alteracao", field: "updated_at", formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Ultima reposicao", field: "last_replenishment_at", formatter: (cell: any) => formatDateTime(cell.getValue()) },
 { title: "Categoria", field: "category" },
 { title: "Condicao", field: "item_condition" },
 { title: "Estoque", field: "stock_quantity" },
 { title: "Valor estoque", field: "stock_value", formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Minimo", field: "min_stock", visible: false },
 { title: "Compra", field: "cost_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Venda", field: "price_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Margem unit.", field: "unit_margin", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Lucro %", field: "profit_percent", visible: false },
 { title: "Saude estoque", field: "stock_health_label", visible: false },
 { title: "Qtd ultima reposicao", field: "last_replenishment_quantity", visible: false },
 { title: "Resp. reposicao", field: "last_replenishment_actor", visible: false },
 { title: "Obs. reposicao", field: "last_replenishment_notes", visible: false, minWidth: 220 },
 { title: "Total reposicoes", field: "replenishment_count", visible: false },
 { title: "Ult. compra ant.", field: "last_previous_cost_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Ult. venda ant.", field: "last_previous_price_amount", visible: false, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "OS vinculadas", field: "linked_orders_count", visible: false },
 { title: "OS ativas", field: "active_orders_count", visible: false },
 { title: "Saida total", field: "total_quantity_used", visible: false },
 { title: "Reservado em OS", field: "open_quantity", visible: false },
 { title: "Ultima OS", field: "last_order_code", visible: false },
 { title: "Ultimo uso", field: "last_used_at", visible: false, formatter: (cell: any) => formatDateTime(cell.getValue()) }
];

const performanceColumns = [
 { title: "Conta", field: "actorName" },
 { title: "Acoes", field: "totalActions", hozAlign: "center" },
 { title: "OS criadas", field: "ordersCreated", hozAlign: "center" },
 { title: "Fechamentos", field: "ordersClosed", hozAlign: "center" },
 { title: "PDV", field: "pdvSales", hozAlign: "center" }
];

const orderPrintSummaryFields = [
 { label: "Total das OS impressas", field: "total_amount", format: "currency" as const }
];

const pdvPrintSummaryFields = [
 { label: "Subtotal impresso", field: "subtotal_amount", format: "currency" as const },
 { label: "Desconto impresso", field: "discount_amount", format: "currency" as const },
 { label: "Total PDV impresso", field: "total_amount", format: "currency" as const }
];

const financePrintSummaryFields = [
 { label: "Total financeiro impresso", field: "amount", format: "currency" as const }
];

const purchasePrintSummaryFields = [
 { label: "Total de compras/reposições impresso", field: "amount", format: "currency" as const }
];

const inventoryPrintSummaryFields = [
 { label: "Unidades impressas", field: "stock_quantity", format: "number" as const },
 { label: "Valor de estoque impresso", field: "stock_value", format: "currency" as const }
];

const performancePrintSummaryFields = [
 { label: "Ações impressas", field: "totalActions", format: "number" as const },
 { label: "OS criadas impressas", field: "ordersCreated", format: "number" as const },
 { label: "Fechamentos impressos", field: "ordersClosed", format: "number" as const },
 { label: "PDV impressos", field: "pdvSales", format: "number" as const }
];

function totalRowsAmount(rows: any[], field: string) {
 return rows.reduce((sum, row) => {
  const value = Number(row?.[field] || 0);
  return Number.isFinite(value) ? sum + value : sum;
 }, 0);
}

function hydrateFromQuery() {
 filters.search = String(route.query.search || "");
 filters.fromDate = String(route.query.fromDate || "");
 filters.toDate = String(route.query.toDate || "");
 filters.orderStatus = String(route.query.orderStatus || "");
 filters.approvalStatus = String(route.query.approvalStatus || "");
 viewMode.value = route.query.view === "table" ? "table" : "detail";
}

function clearFilters() {
 Object.assign(filters, {
  search: "",
  fromDate: "",
  toDate: "",
  orderStatus: "",
  approvalStatus: ""
 });
 loadReports();
}

async function loadReports() {
 try {
  payload.value = await api.reports(filters);
 } catch (error) {
  await notifyError(error);
 }
}

function printPage() {
 window.print();
}

watch(
 () => ({ ...filters, view: viewMode.value }),
 (state) => {
  router.replace({ query: { ...state } });
 },
 { deep: true }
);

watch(
 () => route.query,
 () => {
  hydrateFromQuery();
  loadReports();
 }
);

onMounted(() => {
 hydrateFromQuery();
 loadReports();
});
</script>
