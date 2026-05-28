<template>
  <AppShell
    title="PDV interno"
    subtitle="Caixa por loja, venda com cliente cadastrado ou sem cadastro, baixa de estoque e cupom nao fiscal 80mm.">
    <template #actions>
    </template>

    <div class="row g-4 mb-4">
      <div class="col-md-4">
        <MetricCard
          title="Caixa atual"
          :value="activeSession ? 'Aberto' : 'Fechado'"
          hint="Abertura e fechamento sao automaticos. O PDV usa o saldo ja registrado nas contas da loja."
          icon="fa-solid fa-cash-register"
          :tone="activeSession ? 'success' : 'secondary'"
        />
      </div>
      <div class="col-md-4">
        <MetricCard
          title="Vendas deste caixa"
          :value="sessionSales.length"
          hint="Quantidade de vendas registradas durante o caixa que esta aberto agora."
          icon="fa-solid fa-receipt"
          tone="primary"
        />
      </div>
      <div class="col-md-4">
        <MetricCard
          title="Volume deste caixa"
          :value="currency(totalSales)"
          hint="Total bruto das vendas registradas dentro do caixa aberto."
          icon="fa-solid fa-money-bill-wave"
          tone="warning"
        />
      </div>
    </div>

    <div class="row g-4">
      <div class="col-12">
        <div class="panel-card d-grid gap-4">
          <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
            <div>
              <div class="small fw-semibold">Caixa da loja</div>
              <h3 class="h5 fw-bold mb-1">
                {{
                  activeSession
                    ? `Caixa #${activeSession.id} aberto para ${session.store?.shortName || session.store?.name || "a loja"}`
                    : "Abra o caixa da loja para vender"
                }}
              </h3>
              <p class="mb-0">
                O PDV aceita cliente cadastrado, cadastro no fluxo ou cliente sem cadastro. A abertura e o fechamento
                usam os valores automaticos que o sistema ja registrou.
              </p>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <button v-if="!activeSession" class="btn btn-primary rounded-pill" @click="promptOpenSession">
                <i class="fa-solid fa-lock-open me-2"></i>
                Abrir caixa
              </button>
              <button v-else class="btn btn-outline-danger rounded-pill" @click="promptCloseSession">
                <i class="fa-solid fa-lock me-2"></i>
                Fechar caixa
              </button>
            </div>
          </div>

          <div class="panel-card bg-light-subtle border border-secondary-subtle">
            <div class="btn-group w-100 mb-3" role="group">
              <input
                id="pdv-client-existing"
                v-model="clientMode"
                type="radio"
                class="btn-check"
                name="pdv-client-mode"
                value="existing"
              />
              <label class="btn btn-outline-primary rounded-start-pill" for="pdv-client-existing">Cliente cadastrado</label>
              <input
                id="pdv-client-guest"
                v-model="clientMode"
                type="radio"
                class="btn-check"
                name="pdv-client-mode"
                value="guest"
              />
              <label class="btn btn-outline-primary" for="pdv-client-guest">Sem cadastro</label>
              <input
                id="pdv-client-new"
                v-model="clientMode"
                type="radio"
                class="btn-check"
                name="pdv-client-mode"
                value="new"
              />
              <label class="btn btn-outline-primary rounded-end-pill" for="pdv-client-new">Cadastrar no fluxo</label>
            </div>

            <div class="row g-3">
              <div v-if="clientMode === 'existing'" class="col-12">
                <ClientLookupField v-model="saleForm.clientId" :clients="clients" />
              </div>
              <div v-else-if="clientMode === 'guest'" class="col-12">
                <div class="form-control rounded-4 bg-body-tertiary">
                  Venda avulsa para <strong>cliente sem cadastro</strong>. O CRM vai registrar essa venda como cliente nao
                  identificado.
                </div>
              </div>
              <template v-else>
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Nome do cliente</label>
                  <input v-model="newClient.name" class="form-control rounded-4" />
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Telefone do cliente</label>
                  <input v-model="newClient.phone" class="form-control rounded-4" />
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Email</label>
                  <input v-model="newClient.email" type="email" class="form-control rounded-4" />
                </div>
                <div class="col-md-6">
                  <label class="form-label fw-semibold">Documento</label>
                  <input v-model="newClient.document" class="form-control rounded-4" />
                </div>
                <div class="col-12">
                  <label class="form-label fw-semibold">Endereco</label>
                  <input v-model="newClient.address" class="form-control rounded-4" />
                </div>
              </template>
            </div>

            <div v-if="selectedClientSummary" class="mt-3 d-flex flex-wrap gap-2 align-items-center">
              <span class="be-badge text-bg-light border">
                <i class="fa-solid fa-user"></i>
                {{ selectedClientSummary.name }}
              </span>
              <span class="be-badge text-bg-light border">
                <i class="fa-solid fa-phone"></i>
                {{ selectedClientSummary.phone || "Telefone nao informado" }}
              </span>
            </div>
          </div>

          <div class="d-grid gap-3">
            <div class="d-flex justify-content-between align-items-center gap-3 flex-wrap">
              <div>
                <div class="small fw-semibold">Carrinho</div>
                <h4 class="h6 fw-bold mb-0">Itens da venda</h4>
              </div>
              <div class="d-flex flex-wrap gap-2 align-items-center">
                <span class="be-badge text-bg-light border">
                  <i class="fa-solid fa-cart-shopping"></i>
                  {{ validCartItems.length }} item(ns) valido(s)
                </span>
                <button class="btn btn-outline-secondary rounded-pill" @click="addProductRow">
                  <i class="fa-solid fa-plus me-2"></i>
                  Adicionar produto
                </button>
                <button class="btn btn-outline-primary rounded-pill" @click="addServiceRow">
                  <i class="fa-solid fa-screwdriver-wrench me-2"></i>
                  Adicionar serviço
                </button>
              </div>
            </div>

            <div
              v-for="(item, index) in saleForm.items"
              :key="index"
              class="panel-card bg-light-subtle border border-secondary-subtle">
              <div class="row g-3 align-items-end">
                <div class="col-lg-2">
                  <label class="form-label fw-semibold">Tipo</label>
                  <select v-model="item.itemType" class="form-select rounded-4" @change="switchCartItemType(index)">
                    <option value="PRODUCT">Produto</option>
                    <option value="SERVICE">Serviço</option>
                  </select>
                </div>
                <div class="col-lg-4" v-if="item.itemType === 'PRODUCT'">
                  <CatalogItemLookupField
                    :model-value="item.catalogItemId"
                    :search-term="item.searchTerm"
                    :items="catalogItems"
                    label="Produto"
                    @update:modelValue="handleCatalogSelection(index, $event)"
                    @update:searchTerm="item.searchTerm = $event"
                  />
                </div>
                <div class="col-lg-4" v-else>
                  <label class="form-label fw-semibold">Serviço</label>
                  <select v-model.number="item.serviceCatalogId" class="form-select rounded-4" @change="handleServiceSelection(index, item.serviceCatalogId)">
                    <option :value="0">Selecione</option>
                    <option :value="CUSTOM_SERVICE_ID">{{ customServiceLabel }} (valor definido no PDV)</option>
                    <option v-for="service in pdvServices" :key="service.id" :value="service.id">
                      {{ service.name }} | {{ currency(service.price_amount) }} | {{ serviceDurationLabel(service.estimated_minutes) }}
                    </option>
                  </select>
                </div>
                <div v-if="isCustomServiceItem(item)" class="col-lg-3">
                  <label class="form-label fw-semibold">Nome do serviço</label>
                  <input v-model="item.customServiceName" class="form-control rounded-4" placeholder="{{ customServiceLabel }}" />
                </div>
                <div class="col-lg-2">
                  <label class="form-label fw-semibold">Qtd</label>
                  <input v-model.number="item.quantity" type="number" min="1" class="form-control rounded-4" />
                </div>
                <div class="col-lg-2">
                  <label class="form-label fw-semibold">Preco</label>
                  <div v-if="item.itemType === 'SERVICE' && item.allowCustomPrice">
                    <input v-model.number="item.unitPrice" type="number" min="0" step="0.01" class="form-control rounded-4" />
                    <div class="small mt-1">Valor especial para este serviço.</div>
                  </div>
                  <div v-else class="form-control rounded-4 bg-body-tertiary">{{ currency(item.unitPrice) }}</div>
                </div>
                <div class="col-lg-2">
                  <div class="small fw-semibold">Total</div>
                  <div class="fw-bold">{{ currency(calculateCartLineTotal(item)) }}</div>
                </div>
                <div class="col-lg-2 text-end">
                  <button class="btn btn-outline-danger rounded-pill w-100" @click="removeCartRow(index)">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label fw-semibold">Modo de desconto</label>
              <select v-model="saleForm.discountMode" class="form-select rounded-4">
                <option value="AMOUNT">Valor</option>
                <option value="PERCENT">Percentual</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">Desconto</label>
              <input
                v-model.number="saleForm.discountValue"
                type="number"
                step="0.01"
                min="0"
                class="form-control rounded-4"
              />
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">Conta de recebimento</label>
              <select v-model="saleForm.paymentMethod" class="form-select rounded-4">
                <option v-for="method in paymentMethodOptions" :key="method.code" :value="method.code">
                  {{ method.label }}
                </option>
              </select>
            </div>
            <div class="col-12">
              <label class="form-label fw-semibold">Observacoes</label>
              <textarea
                v-model="saleForm.notes"
                rows="2"
                class="form-control rounded-4"
                placeholder="Entrega, referencia do caixa, observacoes do atendimento..."></textarea>
            </div>
          </div>

          <div class="row g-3 align-items-center">
            <div class="col-md-3">
              <div class="small fw-semibold mb-1">Subtotal</div>
              <div class="fs-5 fw-bold">{{ currency(subtotal) }}</div>
            </div>
            <div class="col-md-3">
              <div class="small fw-semibold mb-1">Desconto</div>
              <div class="fs-5 fw-bold">
                {{
                  saleForm.discountMode === "PERCENT"
                    ? `${Number(saleForm.discountValue || 0).toFixed(2)}%`
                    : currency(saleForm.discountValue)
                }}
              </div>
            </div>
            <div class="col-md-3">
              <div class="small fw-semibold mb-1">Desconto final</div>
              <div class="fs-5 fw-bold">{{ currency(discountAmount) }}</div>
            </div>
            <div class="col-md-3 text-md-end">
              <div class="small fw-semibold mb-1">Total final</div>
              <div class="fs-3 fw-bold text-success">{{ currency(totalCart) }}</div>
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div class="small">
              Preco dos itens vem direto do cadastro. Fora do cadastro do produto, so o desconto altera o valor final da
              venda.
            </div>
            <button class="btn btn-success rounded-pill" :disabled="!canSubmitSale" @click="saveSale">
              <i class="fa-solid fa-receipt me-2"></i>
              Fechar venda
            </button>
          </div>
        </div>
      </div>

      <div class="col-12">
        <div class="panel-card d-grid gap-3">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <div class="small fw-semibold">Caixa aberto</div>
              <h3 class="h5 fw-bold mb-1">Vendas deste caixa</h3>
              <p class="mb-0">
                Aqui ficam so as vendas feitas durante a sessao aberta agora, para voce acompanhar o caixa sem misturar
                historico antigo.
              </p>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <span class="be-badge text-bg-light border">
                <i class="fa-solid fa-receipt"></i>
                {{ sessionSales.length }} venda(s)
              </span>
              <span class="be-badge text-bg-light border">
                <i class="fa-solid fa-money-bill-wave"></i>
                {{ currency(totalSales) }}
              </span>
            </div>
          </div>

          <div v-if="!activeSession" class="form-control rounded-4 bg-body-tertiary">
            Abra o caixa da loja para acompanhar aqui a lista das vendas do turno atual.
          </div>

          <div v-else-if="!sessionSales.length" class="form-control rounded-4 bg-body-tertiary">
            Ainda nao existe nenhuma venda registrada neste caixa aberto.
          </div>

          <div v-else class="d-grid gap-2">
            <div
              v-for="sale in sessionSales"
              :key="sale.id"
              class="panel-card bg-light-subtle border border-secondary-subtle">
              <div class="d-flex justify-content-between align-items-start flex-wrap gap-3">
                <div class="d-grid gap-1">
                  <div class="d-flex align-items-center flex-wrap gap-2">
                    <span class="fw-bold">{{ sale.code }}</span>
                    <span class="be-badge text-bg-light border">
                      <i class="fa-solid fa-clock"></i>
                      {{ formatSaleTime(sale.created_at) }}
                    </span>
                    <span v-if="Number(sale.client_id || 0) <= 0" class="be-badge text-bg-warning-subtle border border-warning-subtle">
                      Sem cadastro
                    </span>
                  </div>
                  <div>
                    {{ sale.client_name || "Cliente sem cadastro" }}
                  </div>
                  <div v-if="sale.items?.length" class="d-flex flex-wrap gap-2 mt-1">
                    <span
                      v-for="item in sale.items"
                      :key="item.id"
                      class="be-badge text-bg-light border">
                      <i :class="saleItemIcon(item)"></i>
                      {{ saleItemLabel(item) }}
                    </span>
                  </div>
                  <div v-else class="small text-body-secondary">
                    Itens nao carregados para esta venda.
                  </div>
                </div>

                <div class="d-flex align-items-center gap-3 flex-wrap">
                  <div class="text-end">
                    <div class="small fw-semibold">Total</div>
                    <div class="fw-bold text-success">{{ currency(sale.total_amount) }}</div>
                  </div>
                  <button class="btn btn-outline-primary rounded-pill" @click="printSale(sale.id)">
                    <i class="fa-solid fa-print me-2"></i>
                    Imprimir
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import AppShell from "../components/AppShell.vue";
import CatalogItemLookupField from "../components/CatalogItemLookupField.vue";
import ClientLookupField from "../components/ClientLookupField.vue";
import MetricCard from "../components/MetricCard.vue";
import { api } from "../services/api";
import { currency } from "../services/format";
import { notifyError, notifySuccess } from "../services/ui";
import { useSessionStore } from "../stores/session";
import type { CashSession, CatalogItem, ClientSummary, PosSale, ServiceCatalogItem } from "../services/types";

const session = useSessionStore();
const CUSTOM_SERVICE_ID = -1;
const customServiceLabel = "Serviço único";
const catalogItems = ref<CatalogItem[]>([]);
const pdvServices = ref<ServiceCatalogItem[]>([]);
const clients = ref<ClientSummary[]>([]);
const cashSessions = ref<CashSession[]>([]);
const sales = ref<PosSale[]>([]);
const clientMode = ref<"existing" | "guest" | "new">("existing");

const fallbackPaymentMethods = [
  { code: "CC_PIX_PJ_MAQ_VERM", label: "C/C pix PJ e maq verm" },
  { code: "MAQ_AMARELA_PIX_CEL", label: "Maq Amarela/pix cel" },
  { code: "CAIXINHA_LOJA", label: "Caixinha loja" },
  { code: "R_COM_DENIO", label: "R$ com Denio" },
  { code: "ARTHUR", label: "Arthur" },
  { code: "BOLETOS", label: "boletos" }
];

const saleForm = reactive({
  clientId: 0,
  discountMode: "AMOUNT",
  discountValue: 0,
  paymentMethod: "CAIXINHA_LOJA",
  notes: "",
  items: [{ itemType: "PRODUCT", catalogItemId: 0, serviceCatalogId: 0, quantity: 1, unitPrice: 0, searchTerm: "", allowCustomPrice: false, customServiceName: "" }]
});

const newClient = reactive({
  name: "",
  phone: "",
  email: "",
  document: "",
  address: "",
  notes: ""
});

const activeSession = computed(
  () => cashSessions.value.find((item) => item.status === "OPEN" && item.store_id === session.store?.id) || null
);

const sessionSales = computed(() => {
  if (!activeSession.value) {
    return [];
  }
  return sales.value.filter((sale) => Number(sale.cash_session_id) === Number(activeSession.value?.id));
});

const validCartItems = computed(() =>
  saleForm.items.filter((item) => {
    const hasTarget =
      item.itemType === "SERVICE"
        ? Number(item.serviceCatalogId) > 0 || (isCustomServiceItem(item) && String(item.customServiceName || "").trim())
        : Number(item.catalogItemId) > 0;
    return hasTarget && Number(item.quantity) > 0;
  })
);


function isCustomServiceItem(item: Record<string, unknown>) {
  return item.itemType === "SERVICE" && Number(item.serviceCatalogId) === CUSTOM_SERVICE_ID;
}


function calculateCartLineTotal(item: Record<string, any>) {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const basePrice = Math.max(0, Number(item.unitPrice || 0));
  if (item.itemType !== 'SERVICE' || isCustomServiceItem(item)) {
    return basePrice * quantity;
  }
  const service = pdvServices.value.find((entry) => entry.id === Number(item.serviceCatalogId));
  if (!service) {
    return basePrice * quantity;
  }
  const pricingMode = String(service.pricing_mode || 'FIXED');
  const additionalPrice = Math.max(0, Number(service.additional_price_amount || 0));
  if (pricingMode === 'PROGRESSIVE') {
    return basePrice + Math.max(0, quantity - 1) * additionalPrice;
  }
  return basePrice * quantity;
}

const selectedClientSummary = computed(() => {
  if (clientMode.value === "existing") {
    return clients.value.find((client) => client.id === Number(saleForm.clientId)) || null;
  }
  if (clientMode.value === "guest") {
    return {
      id: 0,
      name: "Cliente sem cadastro",
      phone: ""
    };
  }
  if (!newClient.name.trim() && !newClient.phone.trim()) {
    return null;
  }
  return {
    id: 0,
    name: newClient.name.trim() || "Novo cliente",
    phone: newClient.phone.trim()
  };
});

const subtotal = computed(() =>
  saleForm.items.reduce((sum, item) => sum + calculateCartLineTotal(item), 0)
);

const discountAmount = computed(() =>
  saleForm.discountMode === "PERCENT"
    ? Math.min(subtotal.value, subtotal.value * (Number(saleForm.discountValue || 0) / 100))
    : Math.min(subtotal.value, Number(saleForm.discountValue || 0))
);

const totalCart = computed(() => Math.max(0, subtotal.value - discountAmount.value));
const totalSales = computed(() => sessionSales.value.reduce((sum, item) => sum + Number(item.total_amount || 0), 0));

const paymentMethodOptions = computed(() => {
  const base = session.meta?.paymentMethods?.length ? session.meta.paymentMethods : fallbackPaymentMethods;
  return base.some((item) => item.code === saleForm.paymentMethod)
    ? base
    : [...base, { code: saleForm.paymentMethod, label: saleForm.paymentMethod }];
});

const canSubmitSale = computed(() => {
  if (!activeSession.value || !validCartItems.value.length || totalCart.value <= 0) {
    return false;
  }
  if (clientMode.value === "existing") {
    return Number(saleForm.clientId) > 0;
  }
  if (clientMode.value === "guest") {
    return true;
  }
  return Boolean(newClient.name.trim() && newClient.phone.trim());
});

function resetNewClient() {
  Object.assign(newClient, {
    name: "",
    phone: "",
    email: "",
    document: "",
    address: "",
    notes: ""
  });
}

function resetSaleForm() {
  Object.assign(saleForm, {
    clientId: 0,
    discountMode: "AMOUNT",
    discountValue: 0,
    paymentMethod: "CAIXINHA_LOJA",
    notes: "",
    items: [{ itemType: "PRODUCT", catalogItemId: 0, serviceCatalogId: 0, quantity: 1, unitPrice: 0, searchTerm: "", allowCustomPrice: false, customServiceName: "" }]
  });
  clientMode.value = "existing";
  resetNewClient();
}

function addProductRow() {
  saleForm.items.push({ itemType: "PRODUCT", catalogItemId: 0, serviceCatalogId: 0, quantity: 1, unitPrice: 0, searchTerm: "", allowCustomPrice: false, customServiceName: "" });
}

function addServiceRow() {
  saleForm.items.push({ itemType: "SERVICE", catalogItemId: 0, serviceCatalogId: CUSTOM_SERVICE_ID, quantity: 1, unitPrice: 0, searchTerm: "", allowCustomPrice: true, customServiceName: customServiceLabel });
}

function removeCartRow(index: number) {
  saleForm.items.splice(index, 1);
  if (saleForm.items.length === 0) {
    addProductRow();
  }
}

function catalogItemSearchLabel(item: CatalogItem) {
  return [item.name, item.brand, item.sku].filter(Boolean).join(" | ");
}

function syncCartItem(index: number) {
  const line = saleForm.items[index];
  if (line.itemType === "SERVICE") {
    if (Number(line.serviceCatalogId) === CUSTOM_SERVICE_ID) {
      line.allowCustomPrice = true;
      line.customServiceName = String(line.customServiceName || "").trim() || customServiceLabel;
      line.unitPrice = Number(line.unitPrice || 0);
      line.searchTerm = line.customServiceName;
      return;
    }
    const service = pdvServices.value.find((item) => item.id === Number(line.serviceCatalogId));
    if (!service) {
      line.allowCustomPrice = false;
      line.customServiceName = "";
      line.unitPrice = 0;
      line.searchTerm = "";
      return;
    }
    line.allowCustomPrice = Boolean(Number(service.allow_custom_price || 0));
    line.customServiceName = "";
    line.unitPrice = Number(service.price_amount || 0);
    line.searchTerm = service.name || "";
    return;
  }
  const catalogItem = catalogItems.value.find((item) => item.id === Number(line.catalogItemId));
  if (!catalogItem) {
    line.allowCustomPrice = false;
    line.customServiceName = "";
    line.unitPrice = 0;
    line.searchTerm = "";
    return;
  }
  line.customServiceName = "";
  line.allowCustomPrice = false;
  line.unitPrice = Number(catalogItem.price_amount || 0);
  line.searchTerm = catalogItemSearchLabel(catalogItem);
}

function handleCatalogSelection(index: number, catalogItemId: number) {
  saleForm.items[index].itemType = "PRODUCT";
  saleForm.items[index].catalogItemId = Number(catalogItemId || 0);
  saleForm.items[index].serviceCatalogId = 0;
  syncCartItem(index);
}

function handleServiceSelection(index: number, serviceCatalogId: number) {
  saleForm.items[index].itemType = "SERVICE";
  saleForm.items[index].serviceCatalogId = Number(serviceCatalogId || 0);
  saleForm.items[index].catalogItemId = 0;
  syncCartItem(index);
}

function switchCartItemType(index: number) {
  const item = saleForm.items[index];
  if (item.itemType === "SERVICE") {
    item.catalogItemId = 0;
  } else {
    item.serviceCatalogId = 0;
  }
  item.unitPrice = 0;
  item.searchTerm = "";
  item.allowCustomPrice = false;
  item.customServiceName = "";
}

function serviceDurationLabel(minutes: number) {
  const days = Math.max(0, Math.ceil(Number(minutes || 0) / (8 * 60)));
  return days > 0 ? `${days} dia(s)` : "No ato";
}

function formatSaleTime(value: string) {
  const match = String(value || "").match(/T(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }
  return String(value || "").slice(11, 16) || "sem hora";
}

function saleItemIcon(item: { item_type?: string }) {
  return String(item.item_type || "").toUpperCase() === "SERVICE"
    ? "fa-solid fa-screwdriver-wrench"
    : "fa-solid fa-box";
}

function saleItemLabel(item: { item_name?: string; quantity?: number }) {
  const quantity = Number(item.quantity || 0);
  const quantityLabel = quantity > 1 ? `${quantity}x ` : "";
  return `${quantityLabel}${item.item_name || "Item vendido"}`;
}

function printSale(saleId: number) {
  window.open(`/imprimir/pdv/${saleId}`, "_blank");
}

async function loadPage() {
  try {
    const [catalogResponse, servicesResponse, clientsResponse, sessionsResponse, salesResponse] = await Promise.all([
      api.catalog({ activeOnly: true }),
      api.services({ activeOnly: true, availableInPdv: true }),
      api.clients(),
      api.cashSessions(),
      api.posSales()
    ]);
    catalogItems.value = catalogResponse.data.filter((item) => Number(item.active) === 1);
    pdvServices.value = servicesResponse.data.filter((item) => Number(item.active) === 1 && Number(item.available_in_pdv) === 1);
    clients.value = clientsResponse.data;
    cashSessions.value = sessionsResponse.data;
    sales.value = salesResponse.data;
  } catch (error) {
    await notifyError(error);
  }
}

async function promptOpenSession() {
  const result = window.Swal
    ? await window.Swal.fire({
        title: "Abrir caixa",
        html: `
          <div class="text-start small">
            <div class="mb-2">Loja: ${session.store?.shortName || session.store?.name || "-"}</div>
            <div>O sistema vai abrir o caixa usando automaticamente o saldo atual ja registrado nas contas da loja.</div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Abrir automaticamente",
        cancelButtonText: "Cancelar"
      })
    : { isConfirmed: true };

  if (!result.isConfirmed) {
    return;
  }

  try {
    await api.openCashSession({});
    await loadPage();
    await notifySuccess("Caixa aberto");
  } catch (error) {
    await notifyError(error);
  }
}

async function promptCloseSession() {
  if (!activeSession.value) {
    return;
  }

  const result = window.Swal
    ? await window.Swal.fire({
        title: `Fechar caixa #${activeSession.value.id} da loja?`,
        html: `
          <div class="text-start small">
            O sistema vai fechar o caixa com base nas vendas e movimentacoes ja registradas durante o dia, sem pedir
            conferencia manual de valor.
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Fechar automaticamente",
        cancelButtonText: "Cancelar"
      })
    : { isConfirmed: true };

  if (!result.isConfirmed) {
    return;
  }

  try {
    await api.closeCashSession(activeSession.value.id, {});
    await loadPage();
    await notifySuccess("Caixa fechado");
  } catch (error) {
    await notifyError(error);
  }
}

async function saveSale() {
  try {
    if (!activeSession.value) {
      throw new Error("Abra um caixa antes de fechar a venda.");
    }
    if (!validCartItems.value.length) {
      throw new Error("Adicione ao menos um item valido no carrinho.");
    }
    if (totalCart.value <= 0) {
      throw new Error("O total da venda precisa ser maior que zero.");
    }
    if (clientMode.value === "existing" && !saleForm.clientId) {
      throw new Error("Selecione um cliente para finalizar a venda.");
    }
    if (clientMode.value === "new" && (!newClient.name.trim() || !newClient.phone.trim())) {
      throw new Error("Nome e telefone do cliente sao obrigatorios.");
    }

    let clientId: number | null = saleForm.clientId || null;
    let clientName = "";

    if (clientMode.value === "new") {
      const createdClient = await api.saveClient({
        name: newClient.name,
        phone: newClient.phone,
        email: newClient.email,
        document: newClient.document,
        address: newClient.address,
        notes: newClient.notes
      });
      clientId = createdClient.data.id;
      clientName = createdClient.data.name;
    } else if (clientMode.value === "guest") {
      clientId = null;
      clientName = "Cliente sem cadastro";
    }

    const response = await api.createPosSale({
      cashSessionId: activeSession.value.id,
      clientId,
      clientName,
      discountMode: saleForm.discountMode,
      discountValue: saleForm.discountValue,
      paymentMethod: saleForm.paymentMethod,
      notes: saleForm.notes,
      items: validCartItems.value.map((item) => ({
        itemType: item.itemType,
        catalogItemId: item.itemType === "PRODUCT" ? item.catalogItemId : null,
        serviceCatalogId: item.itemType === "SERVICE" ? item.serviceCatalogId : null,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice || 0),
        customServiceName: isCustomServiceItem(item) ? item.customServiceName : null
      })),
      payments: [
        {
          paymentMethod: saleForm.paymentMethod,
          amount: totalCart.value
        }
      ]
    });

    resetSaleForm();
    await loadPage();
    printSale(response.data.id);
    await notifySuccess("Venda registrada no PDV");
  } catch (error) {
    await notifyError(error);
  }
}

watch(clientMode, (mode) => {
  if (mode === "new") {
    saleForm.clientId = 0;
    return;
  }
  if (mode === "guest") {
    saleForm.clientId = 0;
    resetNewClient();
    return;
  }
  resetNewClient();
});

onMounted(loadPage);
</script>
