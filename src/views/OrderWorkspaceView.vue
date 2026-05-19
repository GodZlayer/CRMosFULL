<template>
 <AppShell :title="orderView ? `OS ${orderView.code}` : 'OS operacional'" subtitle="Página dedicada da ordem com histórico operacional, anotações e linha do tempo detalhada.">
 <template #actions>
 <button class="btn btn-outline-secondary rounded-pill" @click="goBack">
 <i class="fa-solid fa-arrow-left me-2"></i>
 Voltar
 </button>
 <button class="btn btn-outline-secondary rounded-pill" @click="printOrder" :disabled="!orderView">
 <i class="fa-solid fa-print me-2"></i>
 Imprimir OS
 </button>
 </template>

 <div v-if="orderView" class="d-grid gap-4">
 <div class="hero-banner">
 <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
 <div>
 <div class="small opacity-75 mb-2">Ordem de serviço</div>
 <h2 class="h1 fw-bold mb-1">{{ orderView.code }}</h2>
 <div class="text-white-50">{{ orderView.client_name }} | {{ orderView.equipment }}</div>
 </div>
<div class="d-flex flex-wrap gap-2">
<span class="badge text-bg-light">{{ orderStatusLabel(orderView.order_status) }}</span>
<span class="badge text-bg-warning-subtle text-warning-emphasis">{{ approvalStatusLabel(orderView.approval_status) }}</span>
</div>
</div>
</div>
 <div v-if="isOrderLocked" class="alert alert-warning border-0 rounded-4 shadow-sm mb-0">
  A OS está concluída. Este painel entra em modo somente leitura para manter o fechamento financeiro consistente.
 </div>

 <div class="row g-4">
 <div class="col-md-3">
 <MetricCard title="Total da OS" :value="currency(orderView.total_amount)" hint="Valor consolidado de serviços e peças." icon="fa-solid fa-money-bill-wave" tone="success" />
 </div>
 <div class="col-md-3">
 <MetricCard title="Eventos" :value="timelineData?.events.length || 0" hint="Marcações operacionais registradas na ordem." icon="fa-solid fa-timeline" tone="primary" />
 </div>
 <div class="col-md-3">
 <MetricCard title="Serviços" :value="orderView.services.length" hint="Atividades técnicas já vinculadas ? ordem." icon="fa-solid fa-screwdriver-wrench" tone="warning" />
 </div>
 <div class="col-md-3">
 <MetricCard title="Peças" :value="orderView.items.length" hint="Itens de estoque consumidos pela execução." icon="fa-solid fa-box-open" tone="info" />
 </div>
 </div>

 <div class="row g-4">
 <div class="col-xl-4">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Cliente e aparelho</div>
 <div class="mb-2"><strong>Cliente:</strong> {{ orderView.client_name }}</div>
 <div class="mb-2"><strong>Telefone:</strong> <PhoneLink :phone="orderView.client_phone || orderView.phone_snapshot" fallback="Não informado" /></div>
 <div class="mb-2"><strong>Email:</strong> {{ orderView.client_email || "Não informado" }}</div>
 <div class="mb-2"><strong>Equipamento:</strong> {{ orderView.equipment }}</div>
 <div class="mb-2"><strong>Defeito relatado:</strong> {{ orderView.defect }}</div>
 <div class="mb-2"><strong>Acessórios:</strong> {{ orderView.accessories.length ? orderView.accessories.join(", ") : "Nenhum marcado" }}</div>
 <div v-if="orderView.accessoriesOther" class="mb-2"><strong>Outros acessórios:</strong> {{ orderView.accessoriesOther }}</div>
 <div class="mb-2"><strong>Estado físico:</strong> {{ orderView.extras || "Sem observações físicas" }}</div>
 <div class="mb-3"><strong>Anotações:</strong> {{ orderView.cleanNotes || "Sem anotações adicionais" }}</div>
 <div class="border-top pt-3 mt-3">
<div class="mb-2"><strong>Previsão atual:</strong> {{ dueDateLabel(orderView.due_date) }}</div>
 <label class="form-label fw-semibold required-label">Ajustar previsão</label>
 <div class="d-flex flex-wrap gap-2">
 <input v-model="dueDateForm" type="date" class="form-control rounded-4" style="max-width: 220px" required />
 <button class="btn btn-outline-primary rounded-pill" @click="saveDueDate" :disabled="isOrderLocked || !dueDateForm || loading">
 <i class="fa-solid fa-calendar-check me-2"></i>
 Salvar previsão
 </button>
 </div>
 <div class="small mt-2">A previsão automática pode ser ajustada manualmente depois que a OS já existe.</div>
 </div>
 </div>
 </div>
 <div class="col-xl-4">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Orçamento e aprovação</div>
 <div class="mb-2"><strong>Orçamento calculado:</strong> {{ quoteLabel(calculatedQuoteAmount) }}</div>
 <div class="mb-2"><strong>Orçamento atual:</strong> {{ quoteLabel(orderView.quote_amount) }}</div>
 <div class="mb-2"><strong>Serviços:</strong> {{ currency(orderView.service_amount) }}</div>
 <div class="mb-2"><strong>Total da OS:</strong> {{ currency(orderView.total_amount) }}</div>
 <div class="mb-2"><strong>Aprovação:</strong> {{ approvalStatusLabel(orderView.approval_status) }}</div>
 <div class="mb-2"><strong>Status:</strong> {{ orderStatusLabel(orderView.order_status) }}</div>
 <div class="border-top pt-3 mt-3">
 <label class="form-label fw-semibold required-label">Ajustar orçamento manual</label>
 <div class="d-flex flex-wrap gap-2 align-items-end">
 <input v-model.number="manualQuoteForm" type="number" min="0" step="0.01" class="form-control rounded-4" style="max-width: 220px" required />
 <button class="btn btn-outline-primary rounded-pill" @click="saveManualQuote" :disabled="isOrderLocked || manualQuoteForm === null || manualQuoteForm === undefined || loading || savingQuote">
 <i class="fa-solid fa-money-bill-wave me-2"></i>
 Salvar orçamento
 </button>
 </div>
 <div class="small mt-2">Use este campo para sobrescrever manualmente o orçamento já orçado sem recriar a OS.</div>
 </div>
 </div>
 </div>
 <div class="col-xl-4">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Anexos da OS</div>
 <div v-if="attachmentGroups.length" class="d-grid gap-3 mb-3">
 <div v-for="group in attachmentGroups" :key="group.label" class="d-grid gap-2">
 <div class="small fw-semibold">{{ group.label }}</div>
 <div v-for="attachment in group.items" :key="attachment.id || attachment.file_path" class="rounded-4 border border-secondary-subtle bg-light-subtle p-3">
 <div v-if="!isPdfUrl(attachment.url)" class="text-center">
 <img :src="attachment.url" alt="Anexo da OS" class="img-fluid rounded-4 border" style="max-height: 180px; object-fit: contain;" />
 </div>
 <div v-else class="d-grid gap-3 text-center">
 <div class="rounded-4 border border-secondary-subtle bg-white p-4">
 <i class="fa-solid fa-file-pdf fs-1 text-danger"></i>
 <div class="fw-semibold mt-3">{{ attachment.file_name || "PDF anexado" }}</div>
 </div>
 </div>
 <div class="d-flex justify-content-between align-items-center gap-2 mt-3">
 <div class="small text-body-secondary">{{ attachment.file_name || "Anexo" }}</div>
 <a :href="attachment.url" target="_blank" rel="noreferrer" class="btn btn-outline-secondary rounded-pill">
 <i class="fa-solid fa-up-right-from-square me-2"></i>
 Abrir
 </a>
 </div>
 </div>
 </div>
 </div>
 <div v-else class="rounded-4 border border-secondary-subtle bg-light-subtle p-4 text-center mb-3">
 Nenhum anexo enviado para esta OS.
 </div>
 <div class="border-top pt-3 mt-3 d-grid gap-3">
 <div class="small fw-semibold">Adicionar mais anexos</div>
 <MultiMediaCaptureField
  v-model="attachmentUploads"
  label="Anexos"
  helper="Selecione uma ou mais imagens ou PDFs no mesmo campo."
  :max-per-selection="5"
  :max-total="15"
  :existing-count="orderView.attachments?.length || 0"
 />
 <div v-if="attachmentUploads.length" class="d-grid gap-2">
  <div class="small fw-semibold">Anexos deste envio</div>
  <div v-for="(attachment, index) in attachmentUploads" :key="`${attachment.name}-${index}`" class="rounded-4 border border-secondary-subtle bg-light-subtle p-3">
   <div class="small text-truncate">{{ attachment.name || `Anexo ${index + 1}` }}</div>
  </div>
 </div>
 <div class="d-flex justify-content-end">
 <button type="button" class="btn btn-outline-primary rounded-pill" :disabled="isOrderLocked || !attachmentUploads.length || savingAttachments" @click="saveAttachmentUploads">
   <i class="fa-solid fa-paperclip me-2"></i>
   Salvar anexos
  </button>
 </div>
 </div>
 </div>
 </div>
 </div>

 <div class="row g-4" ref="timelineSection">
 <div class="col-xl-4">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Registrar andamento</div>
 <form class="d-grid gap-3" @submit.prevent="saveTimelineEvent">
 <div>
 <label class="form-label fw-semibold">Tipo do registro</label>
 <select v-model="eventForm.eventType" class="form-select rounded-4">
 <option v-for="type in eventTypeOptions" :key="type.code" :value="type.code">{{ type.label }}</option>
 </select>
 </div>
 <div>
 <label class="form-label fw-semibold required-label">Título</label>
 <input v-model="eventForm.title" class="form-control rounded-4" placeholder="Ex.: Limpeza interna e troca do SSD" required />
 </div>
 <div>
 <label class="form-label fw-semibold">Descrição</label>
 <textarea v-model="eventForm.description" rows="5" class="form-control rounded-4" placeholder="Descreva o que foi feito, contexto, peças usadas e testes executados..."></textarea>
 </div>
 <div>
 <label class="form-label fw-semibold">Data do registro</label>
 <input v-model="eventForm.eventDate" type="date" class="form-control rounded-4" />
 </div>
 <div class="d-flex justify-content-end gap-2">
 <button type="button" class="btn btn-light rounded-pill" :disabled="isOrderLocked" @click="resetEventForm">Limpar</button>
 <button class="btn btn-primary rounded-pill" :disabled="isOrderLocked">
 <i class="fa-solid fa-floppy-disk me-2"></i>
 Registrar evento
 </button>
 </div>
 </form>
 </div>
 </div>
 <div class="col-xl-8">
 <div class="panel-card h-100 d-grid gap-4">
 <div>
 <div class="small fw-semibold mb-3">Linha do tempo da OS</div>
 <TimelineCalendar title="Zoom da ordem" :entries="timelineEntries" @select="noop" />
 </div>
 <div v-if="timelineData?.events.length" class="timeline-list d-grid gap-3">
 <div v-for="event in timelineData.events" :key="event.id" class="timeline-list__item">
 <div class="timeline-list__dot" :style="{ background: event.color }"></div>
 <div>
 <div class="fw-bold">{{ event.title }}</div>
 <div>{{ event.description || "Sem descrição complementar." }}</div>
 <div class="small mt-1">{{ dateLabel(event.event_date) }} | {{ event.actor_name || "Sistema" }}</div>
 </div>
 </div>
 </div>
 <div v-else>Nenhum andamento manual registrado ainda para esta OS.</div>
 </div>
 </div>
 </div>

 <div class="row g-4">
 <div class="col-xl-6">
 <div class="panel-card h-100 d-grid gap-3">
 <div>
 <div class="small fw-semibold mb-3">Peças e produtos</div>
 <div class="row g-2 align-items-end mb-3">
 <div class="col-md-7">
 <label class="form-label fw-semibold">Adicionar do estoque</label>
 <select v-model.number="stockItemForm.catalogItemId" class="form-select rounded-4">
 <option :value="0">Selecione</option>
 <option v-for="item in catalogItems" :key="item.id" :value="item.id">{{ item.name }} | {{ item.sku || 'sem SKU' }} | estoque {{ item.stock_quantity }}</option>
 </select>
 </div>
 <div class="col-md-3">
 <label class="form-label fw-semibold">Qtd</label>
 <input v-model.number="stockItemForm.quantity" type="number" min="1" class="form-control rounded-4" />
 </div>
 <div class="col-md-2">
 <button class="btn btn-outline-primary rounded-pill w-100" :disabled="isOrderLocked || addingStockItem" @click="addStockItem">Adicionar</button>
 </div>
 </div>
 </div>
 <div v-if="orderView.items.length" class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>Produto</th>
 <th>SKU</th>
 <th>Qtd</th>
 <th>Preço</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="item in orderView.items" :key="item.id || `${item.catalog_item_id}-${item.sku}`">
 <td>{{ item.item_name || "Item" }}</td>
 <td>{{ item.sku || "-" }}</td>
 <td>{{ item.quantity }}</td>
 <td>{{ currency(item.unit_price || item.unitPrice) }}</td>
 <td>{{ currency((item.unit_price || item.unitPrice || 0) * Number(item.quantity || 1)) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
 <div v-else>Nenhuma peça vinculada nesta ordem.</div>
 </div>
 </div>
 <div class="col-xl-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Serviços vinculados</div>
 <div v-if="orderView.services.length" class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>Serviço</th>
 <th>Qtd</th>
 <th>Tempo</th>
 <th>Preço</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="service in orderView.services" :key="service.id || `${service.service_id}-${service.service_name}`">
 <td>{{ service.service_name || "Serviço" }}</td>
 <td>{{ service.quantity }}</td>
 <td>{{ minutesLabel((service.estimated_minutes || 0) * Number(service.quantity || 1)) }}</td>
 <td>{{ currency(service.unit_price || service.unitPrice) }}</td>
 <td>{{ currency(service.line_total || service.lineTotal || ((service.unit_price || service.unitPrice || 0) * Number(service.quantity || 1))) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
 <div v-else>Nenhum serviço vinculado nesta ordem.</div>
 </div>
 </div>
 </div>

 <div class="panel-card d-grid gap-3">
 <div>
 <div class="small fw-semibold mb-3">Produtos encomendados</div>
 <div class="row g-2 align-items-end mb-3">
 <div class="col-md-5">
 <label class="form-label fw-semibold">Produto solicitado</label>
 <input v-model="requestedProductForm.name" class="form-control rounded-4" />
 </div>
 <div class="col-md-2">
 <label class="form-label fw-semibold">Qtd</label>
 <input v-model.number="requestedProductForm.quantity" type="number" min="1" class="form-control rounded-4" />
 </div>
 <div class="col-md-3">
 <label class="form-label fw-semibold">Valor de venda</label>
 <input v-model.number="requestedProductForm.salePrice" type="number" min="0" step="0.01" class="form-control rounded-4" />
 </div>
 <div class="col-md-2">
 <button class="btn btn-outline-primary rounded-pill w-100" :disabled="isOrderLocked || addingRequestedProduct" @click="addRequestedProduct">Adicionar</button>
 </div>
 </div>
 </div>
 <div v-if="orderView.requested_products?.length" class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>Produto solicitado</th>
 <th>Qtd</th>
 <th>Venda</th>
 <th>Status</th>
 <th>Registrado em</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="item in orderView.requested_products" :key="item.id || item.product_name || item.name">
 <td>{{ item.product_name || item.name }}</td>
 <td>{{ item.quantity || 1 }}</td>
 <td>{{ currency((item.sale_price || item.salePrice || 0) * (item.quantity || 1)) }}</td>
 <td>{{ item.status || 'PENDENTE' }}</td>
 <td>{{ dateLabel(item.created_at) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
 <div v-else>Nenhum produto encomendado foi registrado nesta ordem.</div>
 </div>
 </div>

 <div v-else-if="!loading" class="panel-card text-center py-5">
 <div class="small fw-semibold mb-2">OS</div>
 <h2 class="h4 fw-bold mb-2">Ordem não encontrada</h2>
 <div class="mb-4">Essa OS pode ter sido removida ou ainda não estar disponível.</div>
 <button class="btn btn-primary rounded-pill" @click="goBack">Voltar para a lista</button>
 </div>
 </AppShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import MultiMediaCaptureField from "../components/MultiMediaCaptureField.vue";
import MetricCard from "../components/MetricCard.vue";
import PhoneLink from "../components/PhoneLink.vue";
import TimelineCalendar from "../components/TimelineCalendar.vue";
import { api } from "../services/api";
import { currency, labelFor } from "../services/format";
import { splitOrderNotes } from "../services/orderNotes";
import { notifyError, notifySuccess } from "../services/ui";
import { useSessionStore } from "../stores/session";
import type { CatalogItem, MediaUploadPayload, OrderTimelinePayload } from "../services/types";

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const loading = ref(false);
const savingQuote = ref(false);
const savingAttachments = ref(false);
const timelineData = ref<OrderTimelinePayload | null>(null);
const catalogItems = ref<CatalogItem[]>([]);
const addingRequestedProduct = ref(false);
const addingStockItem = ref(false);
const timelineSection = ref<HTMLElement | null>(null);
const dueDateForm = ref("");
const manualQuoteForm = ref<number | null>(null);
const attachmentUploads = ref<MediaUploadPayload[]>([]);
const eventTypeOptions = [
 { code: "DIAGNOSTICO", label: "Diagnóstico", color: "#0d6efd" },
 { code: "SERVICO_EXECUTADO", label: "Serviço executado", color: "#198754" },
 { code: "CHECKPOINT", label: "Checkpoint", color: "#fd7e14" },
 { code: "ENTREGA_RETORNO", label: "Entrega ou retorno", color: "#6f42c1" }
];
const eventForm = reactive({
 eventType: "SERVICO_EXECUTADO",
 title: "",
 description: "",
 eventDate: new Date().toISOString().slice(0, 10)
});
const requestedProductForm = reactive({
 name: "",
 quantity: 1,
 salePrice: 0
});
const stockItemForm = reactive({
 catalogItemId: 0,
 quantity: 1
});

const orderView = computed(() => {
 const order = timelineData.value?.order;
 if (!order) {
 return null;
 }
 const parsedNotes = splitOrderNotes(order.notes || "");
 return {
 ...order,
 accessories: parsedNotes.accessories,
 accessoriesOther: parsedNotes.accessoriesOther,
 cleanNotes: parsedNotes.notes
 };
});

const timelineEntries = computed(() =>
 (timelineData.value?.events || []).map((event) => ({
 id: event.id,
 startDate: event.event_date,
 endDate: event.event_date,
 title: event.title,
 subtitle: event.actor_name || "Sistema",
 color: event.color
 }))
);

const calculatedQuoteAmount = computed(() => {
 const order = orderView.value;
 if (!order) {
  return null;
 }
 const itemsTotal = (order.items || []).reduce(
  (total, item) => total + Number(item.unit_price || item.unitPrice || 0) * Number(item.quantity || 1),
  0
 );
 const servicesTotal = (order.services || []).reduce(
  (total, service) => total + Number(service.line_total || service.lineTotal || ((service.unit_price || service.unitPrice || 0) * Number(service.quantity || 1))),
  0
 );
 const requestedTotal = (order.requested_products || []).reduce(
  (total, item) => total + Number(item.sale_price || item.salePrice || 0) * Number(item.quantity || 1),
  0
 );
 return itemsTotal + servicesTotal + requestedTotal;
});

const attachmentGroups = computed(() => {
 const attachments = orderView.value?.attachments || [];
 const groups = new Map<string, typeof attachments>();
 attachments.forEach((attachment, index) => {
  const date = String(attachment.created_at || "").slice(0, 10);
  const label = index === 0 && !date
   ? "Anexo inicial"
   : date
    ? `Anexos de ${dateLabel(date)}`
    : "Anexos";
  const current = groups.get(label) || [];
  current.push(attachment);
  groups.set(label, current);
 });
 return [...groups.entries()].map(([label, items]) => ({ label, items }));
});

function orderStatusLabel(code: string) {
 return labelFor(code, session.meta?.orderStatuses || []);
}

function approvalStatusLabel(code: string) {
 return labelFor(code, session.meta?.approvalStatuses || []);
}

function dateLabel(value: string | null | undefined) {
 if (!value) {
 return "Sem previsão";
 }
 const raw = String(value);
 const dateOnly = raw.slice(0, 10);
 if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
 const [year, month, day] = dateOnly.split("-");
 return `${day}/${month}/${year}`;
 }
 const parsed = new Date(raw);
 if (Number.isNaN(parsed.getTime())) {
 return raw;
 }
 return parsed.toLocaleString("pt-BR");
}

function dueDateLabel(value: string | null | undefined) {
 return value ? dateLabel(value) : "Sem previsão";
}

function quoteLabel(value: number | null | undefined) {
 return value === null || value === undefined ? "Sem orçamento" : currency(value);
}

function minutesLabel(minutes: number) {
 const days = Math.max(0, Math.ceil(Number(minutes || 0) / (8 * 60)));
 return days > 0 ? String(days) + " dia(s)" : "No ato";
}

function isPdfUrl(value: string | null | undefined) {
 const normalized = String(value || "").toLowerCase();
 return normalized.startsWith("data:application/pdf") || normalized.endsWith(".pdf") || normalized.includes(".pdf?");
}

function resetEventForm() {
 Object.assign(eventForm, {
 eventType: "SERVICO_EXECUTADO",
 title: "",
 description: "",
 eventDate: new Date().toISOString().slice(0, 10)
 });
}

async function maybeFocusTimeline() {
 if (route.query.focus !== "timeline") {
 return;
 }
 await nextTick();
 timelineSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadOrder() {
 try {
 loading.value = true;
 const [timelineResponse, catalogResponse] = await Promise.all([
 api.orderTimeline(Number(route.params.id)),
 api.catalog({ activeOnly: true })
 ]);
 timelineData.value = timelineResponse.data;
 catalogItems.value = catalogResponse.data;
 await maybeFocusTimeline();
 } catch (error) {
 timelineData.value = null;
 await notifyError(error);
 } finally {
 loading.value = false;
 }
}

async function saveDueDate() {
 if (!orderView.value || !dueDateForm.value) {
 return;
 }
 try {
 const response = await api.updateOrderDueDate(orderView.value.id, dueDateForm.value);
 if (timelineData.value) {
 timelineData.value = { ...timelineData.value, order: response.data };
 }
 await notifySuccess("Previsão atualizada", "A nova previsão manual foi salva na OS.");
 } catch (error) {
 await notifyError(error);
 }
}

async function saveAttachmentUploads() {
 if (!orderView.value) {
  return;
 }
 const uploads = attachmentUploads.value;
 if (!uploads.length) {
  return;
 }
 try {
  savingAttachments.value = true;
  const response = await api.addOrderAttachments(orderView.value.id, { uploads });
  if (timelineData.value) {
   timelineData.value = { ...timelineData.value, order: response.data };
  }
  attachmentUploads.value = [];
  await notifySuccess("Anexos adicionados", "Os novos arquivos foram vinculados à OS.");
 } catch (error) {
  await notifyError(error);
 } finally {
  savingAttachments.value = false;
 }
}

async function saveManualQuote() {
 if (!orderView.value) {
  return;
 }
 try {
  const quoteAmount = Math.max(0, Number(manualQuoteForm.value ?? 0));
  savingQuote.value = true;
  const response = await api.saveOrder({
   id: orderView.value.id,
   clientId: orderView.value.client_id,
   equipmentName: orderView.value.equipment,
   equipment: orderView.value.equipment,
   orderStatus: orderView.value.order_status,
   approvalStatus: orderView.value.approval_status,
   dueDate: orderView.value.due_date,
   withoutDueDate: !orderView.value.due_date,
   defect: orderView.value.defect,
   extras: orderView.value.extras,
   quoteAmount,
   withoutQuote: false,
   paymentMethod: orderView.value.payment_method,
   notes: orderView.value.notes,
   items: (orderView.value.items || []).map((item) => ({
    catalogItemId: item.catalog_item_id || item.catalogItemId,
    quantity: item.quantity
   })),
   services: (orderView.value.services || []).map((service) => ({
    serviceId: service.service_id || service.serviceId,
    quantity: service.quantity
   })),
   requestedProducts: (orderView.value.requested_products || []).map((item) => ({
    id: item.id,
    name: item.product_name || item.name || "",
    quantity: item.quantity,
    salePrice: item.sale_price || item.salePrice || 0,
    status: item.status
   }))
  });
  if (timelineData.value) {
   timelineData.value = { ...timelineData.value, order: response.data };
  }
  manualQuoteForm.value = Number(response.data.quote_amount || 0);
  await notifySuccess("Orçamento atualizado", "O valor manual da OS foi salvo.");
 } catch (error) {
  await notifyError(error);
 } finally {
  savingQuote.value = false;
 }
}


async function addRequestedProduct() {
 if (!orderView.value) {
 return;
 }
 try {
 if (!requestedProductForm.name.trim()) {
 throw new Error('Informe o produto solicitado.');
 }
 addingRequestedProduct.value = true;
 const response = await api.addOrderRequestedProduct(orderView.value.id, {
 name: requestedProductForm.name,
 quantity: requestedProductForm.quantity,
 salePrice: requestedProductForm.salePrice
 });
 if (timelineData.value) {
 timelineData.value = { ...timelineData.value, order: response.data };
 }
 Object.assign(requestedProductForm, { name: '', quantity: 1, salePrice: 0 });
 await notifySuccess('Produto solicitado adicionado');
 } catch (error) {
 await notifyError(error);
 } finally {
 addingRequestedProduct.value = false;
 }
}

async function addStockItem() {
 if (!orderView.value) {
 return;
 }
 try {
 if (!stockItemForm.catalogItemId) {
 throw new Error('Selecione o produto do estoque.');
 }
 addingStockItem.value = true;
 const response = await api.addOrderStockItem(orderView.value.id, {
 catalogItemId: stockItemForm.catalogItemId,
 quantity: stockItemForm.quantity
 });
 if (timelineData.value) {
 timelineData.value = { ...timelineData.value, order: response.data };
 }
 Object.assign(stockItemForm, { catalogItemId: 0, quantity: 1 });
 await notifySuccess('Produto do estoque adicionado');
 } catch (error) {
 await notifyError(error);
 } finally {
 addingStockItem.value = false;
 }
}

async function saveTimelineEvent() {
 try {
 if (!eventForm.title.trim()) {
 throw new Error("Informe um título para o andamento da OS.");
 }
 const color = eventTypeOptions.find((item) => item.code === eventForm.eventType)?.color || "#0d6efd";
 const response = await api.saveOrderTimelineEvent(Number(route.params.id), {
 title: eventForm.title,
 description: eventForm.description,
 eventType: eventForm.eventType,
 eventDate: eventForm.eventDate,
 color
 });
 timelineData.value = response.data;
 resetEventForm();
 await notifySuccess("Andamento registrado", "A marcação foi adicionada na timeline da OS.");
 await maybeFocusTimeline();
 } catch (error) {
 await notifyError(error);
 }
}

function printOrder() {
 if (!orderView.value) {
 return;
 }
 window.open(`/imprimir/os/${orderView.value.id}`, "_blank");
}

function goBack() {
 if (window.history.length > 1) {
 router.back();
 return;
 }
 router.push("/os");
}

function noop() {
 return undefined;
}

watch(
 () => route.params.id,
 () => {
 loadOrder();
 }
);

watch(
 () => route.query.focus,
 () => {
 maybeFocusTimeline();
 }
);

watch(
 orderView,
 (value) => {
 dueDateForm.value = value?.due_date?.slice(0, 10) || "";
 manualQuoteForm.value = value?.quote_amount ?? calculatedQuoteAmount.value ?? 0;
 attachmentUploads.value = [];
 },
 { immediate: true }
);

onMounted(loadOrder);
</script>
