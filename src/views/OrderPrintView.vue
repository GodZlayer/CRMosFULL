<template>
 <div class="print-sheet">
 <div class="d-flex justify-content-between align-items-start gap-3 mb-4 no-print">
 <div>
 <div class="small fw-semibold">Impressao de OS</div>
 <h1 class="h3 fw-bold mb-0">{{ order?.code }}</h1>
 </div>
 <div class="table-actions">
 <button class="btn btn-light rounded-pill" @click="closeWindow">
 <i class="fa-solid fa-arrow-left me-2"></i>
 Fechar
 </button>
 <button class="btn btn-primary rounded-pill" @click="printWindow">
 <i class="fa-solid fa-print me-2"></i>
 Imprimir
 </button>
 </div>
 </div>

 <div v-if="order" class="panel-card">
 <div class="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
 <div>
 <div class="small fw-semibold">Brasil Express CRM</div>
 <h2 class="h3 fw-bold mb-1">Ordem de Serviço</h2>
 <div>Controle técnico e comercial da manutencao</div>
 </div>
 <div class="text-end">
 <div class="fw-semibold">{{ order.code }}</div>
 <div>Abertura {{ order.opened_at }}</div>
 <div>Status {{ order.order_status }}</div>
 </div>
 </div>

 <div class="row g-4 mb-4">
 <div class="col-lg-6">
 <div class="border rounded-4 p-3 h-100">
 <div class="small fw-semibold mb-2">Cliente</div>
 <div><strong>Nome:</strong> {{ order.client_name }}</div>
 <div><strong>Telefone:</strong> {{ order.client_phone || order.phone_snapshot || 'Não informado' }}</div>
 <div><strong>Email:</strong> {{ order.client_email || 'Não informado' }}</div>
 <div><strong>Documento:</strong> {{ order.client_document || 'Não informado' }}</div>
 <div><strong>Endereço:</strong> {{ order.client_address || 'Não informado' }}</div>
 </div>
 </div>
 <div class="col-lg-6">
 <div class="border rounded-4 p-3 h-100">
 <div class="small fw-semibold mb-2">Aprovação do orcamento</div>
 <div><strong>Status da OS:</strong> {{ order.order_status }}</div>
 <div><strong>Status aprovação:</strong> {{ order.approval_status }}</div>
 <div><strong>Orçamento:</strong> {{ currency(order.quote_amount) }}</div>
 <div><strong>Teto pre-aprovado:</strong> {{ currency(order.pre_approved_limit) }}</div>
 <div><strong>Valor real:</strong> {{ currency(order.actual_amount) }}</div>
 <div><strong>Pagamento:</strong> {{ order.payment_method }}</div>
 </div>
 </div>
 </div>

 <div class="row g-4 mb-4">
 <div class="col-lg-8">
 <div class="border rounded-4 p-3 h-100">
 <div class="small fw-semibold mb-2">Aparelho e serviço</div>
 <div class="mb-2"><strong>Equipamento:</strong> {{ order.equipment }}</div>
 <div class="mb-2"><strong>Defeito:</strong> {{ order.defect }}</div>
          <div class="mb-2"><strong>Acessórios:</strong> {{ parsedNotes.accessories.length ? parsedNotes.accessories.join(', ') : 'Nenhum acessório marcado' }}</div>
 <div v-if="parsedNotes.accessoriesOther" class="mb-2"><strong>Outros acessórios:</strong> {{ parsedNotes.accessoriesOther }}</div>
 <div class="mb-2"><strong>Extras:</strong> {{ order.extras || 'Sem extras informados' }}</div>
 <div class="mb-2"><strong>Observacoes:</strong> {{ parsedNotes.notes || 'Sem observacoes' }}</div>
 </div>
 </div>
 <div class="col-lg-4">
 <div class="border rounded-4 p-3 h-100">
 <div class="small fw-semibold mb-2">Anexo principal</div>
 <img v-if="order.photo_url && !isPdfUrl(order.photo_url)" :src="order.photo_url" class="img-fluid rounded-4 border" alt="Foto do aparelho" />
 <div v-else-if="order.photo_url">
 PDF anexado. Abra o documento original para visualizacao completa.
 </div>
 <div v-else>Nenhum anexo enviado.</div>
 </div>
 </div>
 </div>

 <div class="border rounded-4 p-3 mb-4">
 <div class="small fw-semibold mb-2">Peças e produtos</div>
 <div v-if="order.items.length" class="table-responsive mb-4">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>Item</th>
 <th>SKU</th>
 <th>Qtd</th>
 <th>Preço unitário</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="item in order.items" :key="item.id || `${item.catalog_item_id}-${item.sku}`">
 <td>{{ item.item_name || 'Item' }}</td>
 <td>{{ item.sku || '-' }}</td>
 <td>{{ item.quantity }}</td>
 <td>{{ currency(item.unit_price || item.unitPrice) }}</td>
 <td>{{ currency((item.unit_price || item.unitPrice || 0) * Number(item.quantity || 1)) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
 <div v-else class="mb-4">Nenhum item vinculado.</div>

 <div class="small fw-semibold mb-2">Serviços</div>
 <div v-if="order.services.length" class="table-responsive">
 <table class="table align-middle mb-0">
 <thead>
 <tr>
 <th>Serviço</th>
 <th>Qtd</th>
 <th>Prazo</th>
 <th>Preço unitário</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="service in order.services" :key="service.id || `${service.service_id}-${service.service_name}`">
 <td>{{ service.service_name || 'Serviço' }}</td>
 <td>{{ service.quantity }}</td>
 <td>{{ minutesLabel((service.estimated_minutes || 0) * Number(service.quantity || 1)) }}</td>
 <td>{{ currency(service.unit_price || service.unitPrice) }}</td>
 <td>{{ currency((service.unit_price || service.unitPrice || 0) * Number(service.quantity || 1)) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
 <div v-else>Nenhum serviço vinculado.</div>
 </div>

 <div class="row g-4">
 <div class="col-lg-6">
 <div class="border rounded-4 p-3">
 <div class="small fw-semibold mb-2">Totais</div>
 <div class="d-flex justify-content-between mb-2">
 <span>Serviços</span>
 <strong>{{ currency(order.service_amount) }}</strong>
 </div>
 <div class="d-flex justify-content-between mb-2">
 <span>Prazo previsto</span>
 <strong>{{ minutesLabel(order.estimated_total_minutes || 0) }}</strong>
 </div>
 <div class="d-flex justify-content-between mb-2">
 <span>Desconto</span>
 <strong>{{ currency(order.discount_amount) }}</strong>
 </div>
 <div class="d-flex justify-content-between fs-5">
 <span>Total final</span>
 <strong>{{ currency(order.total_amount) }}</strong>
 </div>
 </div>
 </div>
 <div class="col-lg-6">
 <div class="border rounded-4 p-3 h-100 d-flex flex-column justify-content-end">
 <div class="border-top pt-5 mt-5 text-center">
 Assinatura do cliente
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../services/api";
import { currency } from "../services/format";
import { splitOrderNotes } from "../services/orderNotes";
import { notifyError } from "../services/ui";
import type { OrderDetail } from "../services/types";

const route = useRoute();
const order = ref<OrderDetail | null>(null);

const parsedNotes = computed(() => splitOrderNotes(order.value?.notes || ""));

function isPdfUrl(value: string | null | undefined) {
 const normalized = String(value || "").toLowerCase();
 return normalized.startsWith("data:application/pdf") || normalized.endsWith(".pdf") || normalized.includes(".pdf?");
}

function minutesLabel(minutes: number) {
 const days = Math.max(0, Math.ceil(Number(minutes || 0) / (8 * 60)));
 return days > 0 ? String(days) + " dia(s)" : "No ato";
}

function closeWindow() {
 window.close();
}

function printWindow() {
 window.print();
}

onMounted(async () => {
 try {
 const response = await api.order(Number(route.params.id));
 order.value = response.data;
 } catch (error) {
 await notifyError(error);
 }
});
</script>

<style scoped>
.print-sheet {
 font-family: "Times New Roman", Times, serif;
 font-size: 25px;
 line-height: 1.4;
 font-weight: 500;
}

.print-sheet .small {
 font-size: 22px;
}

.print-sheet .fw-semibold,
.print-sheet .fw-bold,
.print-sheet strong,
.print-sheet th {
 font-weight: 700 !important;
}

@media print {
 .print-sheet {
  font-family: "Times New Roman", Times, serif;
  font-size: 25px;
  line-height: 1.4;
  font-weight: 500;
 }

 .print-sheet .small {
  font-size: 22px;
 }
}
</style>
