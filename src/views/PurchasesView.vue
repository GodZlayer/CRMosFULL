<template>
  <AppShell title="Compras" subtitle="Pedidos de compra da OS e reposição de estoque da loja.">
    <section v-if="workbook" class="d-grid gap-4">
      <div class="panel-card d-grid gap-4">
        <div>
          <div class="small fw-semibold mb-2">Compras da OS</div>
          <h3 class="h5 fw-bold mb-0">Produtos solicitados</h3>
        </div>
        <div v-if="purchaseRequests.length" class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>OS</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Qtd</th>
                <th>Venda</th>
                <th>Custo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in purchaseRequests" :key="item.id">
                <td>{{ item.order_code }}</td>
                <td>{{ item.client_name }}</td>
                <td>{{ item.product_name || item.name }}</td>
                <td>{{ item.quantity || 1 }}</td>
                <td>{{ money((item.sale_price || item.salePrice || 0) * (item.quantity || 1)) }}</td>
                <td style="min-width: 160px;"><input v-model.number="purchaseRequestCosts[item.id]" type="number" min="0" step="0.01" class="form-control rounded-4" /></td>
                <td>
                  <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline-success rounded-pill" @click="confirmPurchaseRequest(item)">Comprar</button>
                    <button class="btn btn-sm btn-outline-danger rounded-pill" @click="denyPurchaseRequest(item)">Negar</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else>Nenhum produto solicitado pendente.</div>
      </div>

      <div class="panel-card d-grid gap-4">
        <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          <div>
            <div class="small fw-semibold mb-2">Reposição</div>
            <h3 class="h5 fw-bold mb-0">Estoque no mínimo ou abaixo</h3>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-secondary rounded-pill" :disabled="batchProcessingLowStock" @click="resetLowStockBatch">Cancelar lote</button>
            <button class="btn btn-primary rounded-pill" :disabled="batchProcessingLowStock" @click="replenishLowStockBatch">{{ batchProcessingLowStock ? "Confirmando..." : "Confirmar reposição em massa" }}</button>
          </div>
        </div>
        <div v-if="lowStockItems.length" class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Atual</th>
                <th>Mínimo</th>
                <th>Comprar</th>
                <th>Custo</th>
                <th>Venda</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in lowStockItems" :key="item.id">
                <td>{{ item.name }}</td>
                <td>{{ item.sku || '-' }}</td>
                <td>{{ item.stock_quantity }}</td>
                <td>{{ item.min_stock }}</td>
                <td style="min-width: 120px;"><input v-model.number="lowStockDraft[item.id].quantity" type="number" min="1" class="form-control rounded-4" /></td>
                <td style="min-width: 160px;"><input v-model.number="lowStockDraft[item.id].costAmount" type="number" min="0" step="0.01" class="form-control rounded-4" /></td>
                <td style="min-width: 160px;"><input v-model.number="lowStockDraft[item.id].priceAmount" type="number" min="0" step="0.01" class="form-control rounded-4" /></td>
                <td>
                  <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline-success rounded-pill" :disabled="processingLowStockIds[item.id]" @click="replenishLowStockItem(item)">{{ processingLowStockIds[item.id] ? "Confirmando..." : "Confirmar" }}</button>
                    <button class="btn btn-sm btn-outline-secondary rounded-pill" :disabled="processingLowStockIds[item.id]" @click="resetLowStockItem(item)">Cancelar</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else>Nenhum item abaixo do mínimo.</div>
      </div>
    </section>

    <section v-else class="panel-card">
      <div>Não foi possível carregar as compras da loja.</div>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import { api } from "../services/api";
import { currency } from "../services/format";
import { notifyError, notifySuccess } from "../services/ui";
import type { FinanceWorkbookPayload } from "../services/types";

const workbook = ref<FinanceWorkbookPayload | null>(null);
const loading = ref(false);
const purchaseRequestCosts = reactive<Record<number, number>>({});
const lowStockDraft = reactive<Record<number, { quantity: number; costAmount: number; priceAmount: number }>>({});
const processingLowStockIds = reactive<Record<number, boolean>>({});
const batchProcessingLowStock = ref(false);

const purchaseRequests = computed<any[]>(() => workbook.value?.purchaseRequests || []);
const lowStockItems = computed<any[]>(() => workbook.value?.lowStockItems || []);

function money(value: number | null | undefined) {
  return currency(Number(value || 0));
}

function buildLowStockDraft(item: any) {
  return {
    quantity: Math.max(1, Number(item.min_stock || 0) - Number(item.stock_quantity || 0) || 1),
    costAmount: Number(item.cost_amount || 0),
    priceAmount: Number(item.price_amount || 0)
  };
}

function syncPurchaseDrafts() {
  for (const item of purchaseRequests.value) {
    if (purchaseRequestCosts[item.id] === undefined) {
      purchaseRequestCosts[item.id] = Number(item.purchase_cost || 0);
    }
  }
  for (const item of lowStockItems.value) {
    if (!lowStockDraft[item.id]) {
      lowStockDraft[item.id] = buildLowStockDraft(item);
    }
  }
}

async function confirmPurchaseRequest(item: any) {
  try {
    const costAmount = Number(purchaseRequestCosts[item.id] || 0);
    if (costAmount <= 0) {
      throw new Error("Informe o custo da compra.");
    }
    await api.confirmRequestedProductPurchase(Number(item.id), { costAmount });
    await loadWorkbook();
    await notifySuccess("Compra confirmada");
  } catch (error) {
    await notifyError(error);
  }
}

async function denyPurchaseRequest(item: any) {
  try {
    await api.denyRequestedProductPurchase(Number(item.id));
    await loadWorkbook();
    await notifySuccess("Produto solicitado negado");
  } catch (error) {
    await notifyError(error);
  }
}

function resetLowStockItem(item: any) {
  lowStockDraft[item.id] = buildLowStockDraft(item);
}

function resetLowStockBatch() {
  for (const item of lowStockItems.value) {
    resetLowStockItem(item);
  }
}

async function replenishLowStockItem(item: any) {
  try {
    const draft = lowStockDraft[item.id];
    const quantity = Number(draft?.quantity || 0);
    const costAmount = Number(draft?.costAmount || 0);
    const priceAmount = Number(draft?.priceAmount || 0);
    if (quantity <= 0) {
      throw new Error("Informe uma quantidade maior que zero.");
    }
    if (costAmount < 0 || priceAmount < 0) {
      throw new Error("Custo e venda não podem ser negativos.");
    }
    processingLowStockIds[item.id] = true;
    await api.replenishCatalog(Number(item.id), { quantity, costAmount, priceAmount });
    await loadWorkbook();
    await notifySuccess("Reposição confirmada");
  } catch (error) {
    await notifyError(error);
  } finally {
    processingLowStockIds[item.id] = false;
  }
}

async function replenishLowStockBatch() {
  try {
    batchProcessingLowStock.value = true;
    const items = lowStockItems.value.map((item) => ({
      id: Number(item.id),
      quantity: Number(lowStockDraft[item.id]?.quantity || 0),
      costAmount: Number(lowStockDraft[item.id]?.costAmount || 0),
      priceAmount: Number(lowStockDraft[item.id]?.priceAmount || 0)
    })).filter((item) => item.quantity > 0 && item.costAmount >= 0 && item.priceAmount >= 0);
    if (!items.length) {
      throw new Error("Nenhum item válido para reposição.");
    }
    await api.replenishCatalogBatch(items);
    await loadWorkbook();
    await notifySuccess("Reposição em massa concluída");
  } catch (error) {
    await notifyError(error);
  } finally {
    batchProcessingLowStock.value = false;
  }
}

async function loadWorkbook() {
  try {
    loading.value = true;
    const workbookResponse = await api.financeWorkbook();
    workbook.value = workbookResponse.data;
    syncPurchaseDrafts();
  } catch (error) {
    await notifyError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(loadWorkbook);
</script>
