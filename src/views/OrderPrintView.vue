<template>
 <div ref="printSheetRef" class="print-sheet" :style="printSheetStyle">
 <div class="d-flex justify-content-between align-items-start gap-3 mb-4 no-print">
 <div>
 <div class="small fw-semibold">Impressao de OS</div>
 <h1 class="h3 fw-bold mb-0">{{ order?.code }}</h1>
 </div>
 <div class="d-grid gap-2">
 <label class="form-check d-flex align-items-center justify-content-end gap-2 mb-0">
 <input v-model="includeClientCopy" class="form-check-input" type="checkbox" />
 <span class="fw-semibold">Via cliente</span>
 </label>
 <label class="d-grid gap-1 mb-0">
 <span class="small fw-semibold">Tamanho geral da fonte</span>
 <select v-model="fontPreset" class="form-select form-select-sm rounded-4">
 <option value="compact">Compacta</option>
 <option value="normal">Normal</option>
 <option value="large">Grande</option>
 </select>
 </label>
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
 </div>

<div v-if="order">
<div v-if="includeClientCopy" class="order-print-double">
<section class="panel-card order-slip order-print-double__half">
 <div class="print-watermark" aria-hidden="true">
 <img :src="PRINT_LOGO_URL" alt="" class="print-watermark__logo" />
 </div>
 <div class="copy-meta">Via da loja</div>
 <div class="compact-top">
 <div class="compact-grid">
 <div><strong>OS:</strong> {{ order.code }}</div>
 <div><strong>Abertura:</strong> {{ dateLabel(order.opened_at) }}</div>
 <div><strong>Cliente:</strong> {{ order.client_name }}</div>
 <div><strong>Telefone:</strong> {{ order.client_phone || order.phone_snapshot || "Não informado" }}</div>
 <div><strong>Documento:</strong> {{ order.client_document || "Não informado" }}</div>
 <div><strong>Previsão:</strong> {{ dueDateLabel(order.due_date) }}</div>
 <div><strong>Status:</strong> {{ order.order_status }}</div>
 <div><strong>Aprovação:</strong> {{ order.approval_status }}</div>
 <div class="compact-grid__full"><strong>Endereço:</strong> {{ order.client_address || "Sem endereço" }}</div>
 </div>
 </div>
 <div class="compact-block">
 <div class="compact-block__title">Equipamento e defeito</div>
 <div><strong>Equipamento:</strong> {{ order.equipment }}</div>
 <div><strong>Defeito:</strong> {{ order.defect }}</div>
 <div><strong>Acessórios:</strong> {{ parsedNotes.accessories.length ? parsedNotes.accessories.join(", ") : "Nenhum acessório marcado" }}</div>
 <div v-if="parsedNotes.accessoriesOther"><strong>Outros:</strong> {{ parsedNotes.accessoriesOther }}</div>
 <div><strong>Extras:</strong> {{ order.extras || "Sem extras informados" }}</div>
 <div><strong>Obs.:</strong> {{ parsedNotes.notes || "Sem observações" }}</div>
 </div>
 <div class="compact-block">
 <div class="compact-block__title">Itens da OS</div>
 <table v-if="printRows.length" class="table table-sm align-middle compact-table mb-0">
 <thead>
 <tr>
 <th>Tipo</th>
 <th>Descrição</th>
 <th>Qtd</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="row in printRows" :key="`store-${row.key}`">
 <td>{{ row.kind }}</td>
 <td>{{ row.name }}</td>
 <td>{{ row.quantity }}</td>
 <td>{{ currency(row.total) }}</td>
 </tr>
 </tbody>
 </table>
 <div v-else>Nenhum item, serviço ou produto solicitado vinculado.</div>
 </div>
 <div class="compact-footer">
 <div class="compact-totals">
 <div><strong>Orçamento:</strong> {{ quoteLabel(order.quote_amount) }}</div>
 <div><strong>Serviços:</strong> {{ currency(order.service_amount) }}</div>
 <div><strong>Desconto:</strong> {{ currency(order.discount_amount) }}</div>
 <div><strong>Prazo base:</strong> {{ minutesLabel(order.estimated_total_minutes || 0) }}</div>
 <div class="compact-totals__final"><strong>Total final:</strong> {{ currency(order.total_amount) }}</div>
 </div>
 <div class="compact-signature">
 <div class="compact-signature__line"></div>
 <div>Assinatura da loja</div>
 </div>
 </div>
 </section>
<div class="order-print-double__divider"></div>
<section class="panel-card order-slip order-print-double__half">
 <div class="print-watermark" aria-hidden="true">
 <img :src="PRINT_LOGO_URL" alt="" class="print-watermark__logo" />
 </div>
 <div class="copy-meta">Via do cliente</div>
 <div class="compact-top">
 <div class="compact-grid">
 <div><strong>OS:</strong> {{ order.code }}</div>
 <div><strong>Abertura:</strong> {{ dateLabel(order.opened_at) }}</div>
 <div><strong>Cliente:</strong> {{ order.client_name }}</div>
 <div><strong>Telefone:</strong> {{ order.client_phone || order.phone_snapshot || "Não informado" }}</div>
 <div><strong>Documento:</strong> {{ order.client_document || "Não informado" }}</div>
 <div><strong>Previsão:</strong> {{ dueDateLabel(order.due_date) }}</div>
 <div><strong>Status:</strong> {{ order.order_status }}</div>
 <div><strong>Aprovação:</strong> {{ order.approval_status }}</div>
 <div class="compact-grid__full"><strong>Endereço:</strong> {{ order.client_address || "Sem endereço" }}</div>
 </div>
 </div>
 <div class="compact-block">
 <div class="compact-block__title">Equipamento e defeito</div>
 <div><strong>Equipamento:</strong> {{ order.equipment }}</div>
 <div><strong>Defeito:</strong> {{ order.defect }}</div>
 <div><strong>Acessórios:</strong> {{ parsedNotes.accessories.length ? parsedNotes.accessories.join(", ") : "Nenhum acessório marcado" }}</div>
 <div v-if="parsedNotes.accessoriesOther"><strong>Outros:</strong> {{ parsedNotes.accessoriesOther }}</div>
 <div><strong>Extras:</strong> {{ order.extras || "Sem extras informados" }}</div>
 <div><strong>Obs.:</strong> {{ parsedNotes.notes || "Sem observações" }}</div>
 </div>
 <div class="compact-block">
 <div class="compact-block__title">Itens da OS</div>
 <table v-if="printRows.length" class="table table-sm align-middle compact-table mb-0">
 <thead>
 <tr>
 <th>Tipo</th>
 <th>Descrição</th>
 <th>Qtd</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="row in printRows" :key="`client-${row.key}`">
 <td>{{ row.kind }}</td>
 <td>{{ row.name }}</td>
 <td>{{ row.quantity }}</td>
 <td>{{ currency(row.total) }}</td>
 </tr>
 </tbody>
 </table>
 <div v-else>Nenhum item, serviço ou produto solicitado vinculado.</div>
 </div>
 <div class="compact-footer">
 <div class="compact-totals">
 <div><strong>Orçamento:</strong> {{ quoteLabel(order.quote_amount) }}</div>
 <div><strong>Serviços:</strong> {{ currency(order.service_amount) }}</div>
 <div><strong>Desconto:</strong> {{ currency(order.discount_amount) }}</div>
 <div><strong>Prazo base:</strong> {{ minutesLabel(order.estimated_total_minutes || 0) }}</div>
 <div class="compact-totals__final"><strong>Total final:</strong> {{ currency(order.total_amount) }}</div>
 </div>
 <div class="compact-signature">
 <div class="compact-signature__line"></div>
 <div>Assinatura do cliente</div>
 </div>
 </div>
 </section>
 </div>
<div v-else class="order-print-page">
<section class="panel-card order-slip">
 <div class="print-watermark" aria-hidden="true">
 <img :src="PRINT_LOGO_URL" alt="" class="print-watermark__logo" />
 </div>
 <div class="copy-meta">Via da loja</div>
 <div class="compact-top">
 <div class="compact-grid">
 <div><strong>OS:</strong> {{ order.code }}</div>
 <div><strong>Abertura:</strong> {{ dateLabel(order.opened_at) }}</div>
 <div><strong>Cliente:</strong> {{ order.client_name }}</div>
 <div><strong>Telefone:</strong> {{ order.client_phone || order.phone_snapshot || "Não informado" }}</div>
 <div><strong>Documento:</strong> {{ order.client_document || "Não informado" }}</div>
 <div><strong>Previsão:</strong> {{ dueDateLabel(order.due_date) }}</div>
 <div><strong>Status:</strong> {{ order.order_status }}</div>
 <div><strong>Aprovação:</strong> {{ order.approval_status }}</div>
 <div class="compact-grid__full"><strong>Endereço:</strong> {{ order.client_address || "Sem endereço" }}</div>
 </div>
 </div>
 <div class="compact-block">
 <div class="compact-block__title">Equipamento e defeito</div>
 <div><strong>Equipamento:</strong> {{ order.equipment }}</div>
 <div><strong>Defeito:</strong> {{ order.defect }}</div>
 <div><strong>Acessórios:</strong> {{ parsedNotes.accessories.length ? parsedNotes.accessories.join(", ") : "Nenhum acessório marcado" }}</div>
 <div v-if="parsedNotes.accessoriesOther"><strong>Outros:</strong> {{ parsedNotes.accessoriesOther }}</div>
 <div><strong>Extras:</strong> {{ order.extras || "Sem extras informados" }}</div>
 <div><strong>Obs.:</strong> {{ parsedNotes.notes || "Sem observações" }}</div>
 </div>
 <div class="compact-block">
 <div class="compact-block__title">Itens da OS</div>
 <table v-if="printRows.length" class="table table-sm align-middle compact-table mb-0">
 <thead>
 <tr>
 <th>Tipo</th>
 <th>Descrição</th>
 <th>Qtd</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="row in printRows" :key="row.key">
 <td>{{ row.kind }}</td>
 <td>{{ row.name }}</td>
 <td>{{ row.quantity }}</td>
 <td>{{ currency(row.total) }}</td>
 </tr>
 </tbody>
 </table>
 <div v-else>Nenhum item, serviço ou produto solicitado vinculado.</div>
 </div>
 <div class="compact-footer">
 <div class="compact-totals">
 <div><strong>Orçamento:</strong> {{ quoteLabel(order.quote_amount) }}</div>
 <div><strong>Serviços:</strong> {{ currency(order.service_amount) }}</div>
 <div><strong>Desconto:</strong> {{ currency(order.discount_amount) }}</div>
 <div><strong>Prazo base:</strong> {{ minutesLabel(order.estimated_total_minutes || 0) }}</div>
 <div class="compact-totals__final"><strong>Total final:</strong> {{ currency(order.total_amount) }}</div>
 </div>
 <div class="compact-signature">
 <div class="compact-signature__line"></div>
 <div>Assinatura da loja</div>
 </div>
 </div>
 </section>
 </div>
 </div>
 </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../services/api";
import { currency } from "../services/format";
import { splitOrderNotes } from "../services/orderNotes";
import { notifyError } from "../services/ui";
import type { OrderDetail } from "../services/types";

const route = useRoute();
const order = ref<OrderDetail | null>(null);
const includeClientCopy = ref(false);
const fontPreset = ref<"compact" | "normal" | "large">("normal");
const printSheetRef = ref<HTMLElement | null>(null);
const PRINT_LOGO_URL =
 "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop,q=95/QnUfS5HJ5GJsYLVW/logo-horizontal-em-png-brasil-express-j6F74w6gnr5a0KTa.png";

const fontPresetMap = {
 compact: {
  screenBase: "20px",
  screenLine: "1.4",
  screenSmall: "15px",
  printBase: "12.2px",
  printLine: "1.18",
  printSmall: "10px",
  printMeta: "10px",
  printSection: "10.2px",
  printTable: "11.2px",
  screenWeight: "600",
  printWeight: "600"
 },
 normal: {
  screenBase: "22px",
  screenLine: "1.44",
  screenSmall: "16px",
  printBase: "13px",
  printLine: "1.2",
  printSmall: "10.6px",
  printMeta: "10.6px",
  printSection: "10.8px",
  printTable: "11.8px",
  screenWeight: "600",
  printWeight: "600"
 },
 large: {
  screenBase: "24px",
  screenLine: "1.5",
  screenSmall: "17px",
  printBase: "13.6px",
  printLine: "1.22",
  printSmall: "11px",
  printMeta: "11px",
  printSection: "11.2px",
  printTable: "12.2px",
  screenWeight: "700",
  printWeight: "700"
 }
} as const;

const parsedNotes = computed(() => splitOrderNotes(order.value?.notes || ""));
const printSheetStyle = computed(() => {
 const preset = fontPresetMap[fontPreset.value];
 return {
  "--print-screen-base": preset.screenBase,
  "--print-screen-line": preset.screenLine,
  "--print-screen-small": preset.screenSmall,
  "--print-screen-weight": preset.screenWeight,
  "--print-base": preset.printBase,
  "--print-line": preset.printLine,
  "--print-small": preset.printSmall,
  "--print-meta": preset.printMeta,
  "--print-section": preset.printSection,
  "--print-table": preset.printTable,
  "--print-weight": preset.printWeight
 };
});
const printRows = computed(() => {
 const currentOrder = order.value;
 if (!currentOrder) {
  return [];
 }

 const serviceRows = (currentOrder.services || []).map((service, index) => ({
  key: `service-${service.id || index}`,
  kind: "Serviço",
  name: service.service_name || "Serviço",
  quantity: Number(service.quantity || 1),
  total: Number(service.line_total || service.lineTotal || ((service.unit_price || service.unitPrice || 0) * Number(service.quantity || 1)))
 }));

 const itemRows = (currentOrder.items || []).map((item, index) => ({
  key: `item-${item.id || index}`,
  kind: "Peça",
  name: item.item_name || "Item",
  quantity: Number(item.quantity || 1),
  total: Number((item.unit_price || item.unitPrice || 0) * Number(item.quantity || 1))
 }));

 const requestedRows = (currentOrder.requested_products || []).map((item, index) => ({
  key: `requested-${item.id || index}`,
  kind: "Pedido",
  name: item.product_name || item.name || "Produto solicitado",
  quantity: Number(item.quantity || 1),
  total: Number((item.sale_price || item.salePrice || 0) * Number(item.quantity || 1))
 }));

 return [...serviceRows, ...itemRows, ...requestedRows];
});

function minutesLabel(minutes: number) {
 const days = Math.max(0, Math.ceil(Number(minutes || 0) / (8 * 60)));
 return days > 0 ? String(days) + " dia(s)" : "No ato";
}

function dateLabel(value: string | null | undefined) {
 if (!value) {
  return "Sem previsão";
 }
 const raw = String(value).slice(0, 10);
 if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
  return raw.slice(8, 10) + "/" + raw.slice(5, 7) + "/" + raw.slice(0, 4);
 }
 return String(value);
}

function dueDateLabel(value: string | null | undefined) {
 return value ? dateLabel(value) : "Sem previsão";
}

function quoteLabel(value: number | null | undefined) {
 return value === null || value === undefined ? "Sem orçamento" : currency(value);
}

function escapeHtml(value: unknown) {
 return String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
}

function renderPrintRowsHtml() {
 if (!printRows.value.length) {
  return '<div class="empty-state">Nenhum item, serviço ou produto solicitado vinculado.</div>';
 }

 return `
  <table class="items-table">
   <thead>
    <tr>
     <th>Tipo</th>
     <th>Descrição</th>
     <th>Qtd</th>
     <th>Total</th>
    </tr>
   </thead>
   <tbody>
    ${printRows.value
      .map(
       (row) => `
        <tr>
         <td>${escapeHtml(row.kind)}</td>
         <td>${escapeHtml(row.name)}</td>
         <td>${escapeHtml(row.quantity)}</td>
         <td>${escapeHtml(currency(row.total))}</td>
        </tr>
       `
      )
      .join("")}
   </tbody>
  </table>
 `;
}

function renderPrintCopyHtml(copyLabel: string, signatureLabel: string) {
 const currentOrder = order.value;
 if (!currentOrder) {
  return "";
 }

 return `
  <section class="print-copy">
   <div class="print-watermark" aria-hidden="true">
    <img src="${escapeHtml(PRINT_LOGO_URL)}" alt="" class="print-watermark__logo" />
   </div>
   <div class="copy-meta">${escapeHtml(copyLabel)}</div>
   <div class="compact-top">
    <div class="compact-grid">
     <div><strong>OS:</strong> ${escapeHtml(currentOrder.code)}</div>
     <div><strong>Abertura:</strong> ${escapeHtml(dateLabel(currentOrder.opened_at))}</div>
     <div><strong>Cliente:</strong> ${escapeHtml(currentOrder.client_name)}</div>
     <div><strong>Telefone:</strong> ${escapeHtml(currentOrder.client_phone || currentOrder.phone_snapshot || "Não informado")}</div>
     <div><strong>Documento:</strong> ${escapeHtml(currentOrder.client_document || "Não informado")}</div>
     <div><strong>Previsão:</strong> ${escapeHtml(dueDateLabel(currentOrder.due_date))}</div>
     <div><strong>Status:</strong> ${escapeHtml(currentOrder.order_status)}</div>
     <div><strong>Aprovação:</strong> ${escapeHtml(currentOrder.approval_status)}</div>
     <div class="compact-grid__full"><strong>Endereço:</strong> ${escapeHtml(currentOrder.client_address || "Sem endereço")}</div>
    </div>
   </div>
   <div class="compact-block">
    <div class="compact-block__title">Equipamento e defeito</div>
    <div><strong>Equipamento:</strong> ${escapeHtml(currentOrder.equipment)}</div>
    <div><strong>Defeito:</strong> ${escapeHtml(currentOrder.defect)}</div>
    <div><strong>Acessórios:</strong> ${escapeHtml(parsedNotes.value.accessories.length ? parsedNotes.value.accessories.join(", ") : "Nenhum acessório marcado")}</div>
    ${
     parsedNotes.value.accessoriesOther
      ? `<div><strong>Outros:</strong> ${escapeHtml(parsedNotes.value.accessoriesOther)}</div>`
      : ""
    }
    <div><strong>Extras:</strong> ${escapeHtml(currentOrder.extras || "Sem extras informados")}</div>
    <div><strong>Obs.:</strong> ${escapeHtml(parsedNotes.value.notes || "Sem observações")}</div>
   </div>
   <div class="compact-block">
    <div class="compact-block__title">Itens da OS</div>
    ${renderPrintRowsHtml()}
   </div>
   <div class="compact-footer">
    <div class="compact-totals">
     <div><strong>Orçamento:</strong> ${escapeHtml(quoteLabel(currentOrder.quote_amount))}</div>
     <div><strong>Serviços:</strong> ${escapeHtml(currency(currentOrder.service_amount))}</div>
     <div><strong>Desconto:</strong> ${escapeHtml(currency(currentOrder.discount_amount))}</div>
     <div><strong>Prazo base:</strong> ${escapeHtml(minutesLabel(currentOrder.estimated_total_minutes || 0))}</div>
     <div class="compact-totals__final"><strong>Total final:</strong> ${escapeHtml(currency(currentOrder.total_amount))}</div>
    </div>
    <div class="compact-signature">
     <div class="compact-signature__line"></div>
     <div>${escapeHtml(signatureLabel)}</div>
    </div>
   </div>
  </section>
 `;
}

function closeWindow() {
 window.close();
}

async function printWindow() {
 await nextTick();
 if (!order.value) {
  window.print();
  return;
 }

 const popup = window.open("", "_blank", "width=960,height=1280");
 if (!popup) {
  window.print();
  return;
 }

 const preset = fontPresetMap[fontPreset.value];
 const copiesHtml = includeClientCopy.value
  ? `
   <div class="page-double">
    ${renderPrintCopyHtml("Via da loja", "Assinatura da loja")}
    <div class="page-divider"></div>
    ${renderPrintCopyHtml("Via do cliente", "Assinatura do cliente")}
   </div>
  `
  : renderPrintCopyHtml("Via da loja", "Assinatura da loja");

 popup.document.open();
 popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Impressao de OS ${order.value?.code || ""}</title>
<style>
 @page {
  size: A4 portrait;
  margin: 8mm;
 }
 * {
  box-sizing: border-box;
 }
 html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #000;
 }
 body {
  font-family: "Times New Roman", Times, serif;
  font-size: ${preset.printBase};
  line-height: ${preset.printLine};
  font-weight: ${preset.printWeight};
 }
 .print-root {
  width: 100%;
 }
 .page-double {
  display: grid;
  grid-template-rows: 1fr auto 1fr;
  min-height: calc(297mm - 16mm);
 }
 .page-divider {
  border-top: 1px solid #000;
  margin: 4mm 0;
 }
 .print-copy {
  position: relative;
  display: grid;
  gap: 4px;
  break-inside: avoid;
  page-break-inside: avoid;
 }
 .print-copy > *:not(.print-watermark) {
  position: relative;
  z-index: 1;
 }
 .print-watermark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 0;
 }
 .print-watermark__logo {
  display: block;
  width: min(78%, 320px);
  opacity: 0.08;
  object-fit: contain;
 }
 .copy-meta {
  font-size: ${preset.printMeta};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 1px;
 }
 .compact-top,
 .compact-block,
 .compact-footer {
  border: 1px solid #000;
  border-radius: 6px;
  padding: 3px 5px;
 }
 .compact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px 8px;
 }
 .compact-grid__full {
  grid-column: 1 / -1;
 }
 .compact-block__title,
 .compact-signature {
  font-size: ${preset.printSection};
 }
 .items-table {
  font-size: ${preset.printTable};
 }
 .items-table {
  width: 100%;
  border-collapse: collapse;
 }
 .items-table th,
 .items-table td {
  text-align: left;
  padding: 1px 3px;
  border-bottom: 1px solid #ddd;
 }
 .compact-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 8px;
  align-items: end;
 }
 .compact-totals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px 8px;
 }
 .compact-totals__final {
  grid-column: 1 / -1;
  font-weight: 700;
 }
 .compact-signature {
  text-align: center;
 }
 .compact-signature__line {
  border-top: 1px solid #000;
  margin-top: 12px;
  padding-top: 2px;
 }
 .empty-state {
  padding: 2px 0;
 }
</style>
</head>
<body>
<div class="print-root">${copiesHtml}</div>
</body>
</html>`);
 popup.document.close();

 window.setTimeout(() => {
  popup.focus();
  popup.print();
 }, 300);
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
 font-size: var(--print-screen-base, 14px);
 line-height: var(--print-screen-line, 1.25);
 font-weight: var(--print-screen-weight, 500);
}

.print-sheet .small {
 font-size: var(--print-screen-small, 12px);
}

.print-sheet .fw-semibold,
.print-sheet .fw-bold,
.print-sheet strong,
.print-sheet th {
 font-weight: 700 !important;
}

.order-print-page {
 display: grid;
 gap: 10mm;
}

.order-slip {
 position: relative;
 break-inside: avoid;
 display: grid;
 gap: 4px;
 box-sizing: border-box;
}

.order-print-double {
 display: grid;
 gap: 0;
}

.order-print-double__divider {
 border-top: 1px solid #000;
 margin: 4mm 0;
}

.order-slip > *:not(.print-watermark) {
 position: relative;
 z-index: 1;
}

.print-watermark {
 position: absolute;
 inset: 0;
 display: flex;
 align-items: center;
 justify-content: center;
 pointer-events: none;
 z-index: 0;
}

.print-watermark__logo {
 display: block !important;
 width: min(78%, 420px);
 opacity: 0.08;
 object-fit: contain;
}

.copy-meta {
 font-size: 10px;
 font-weight: 700;
 text-transform: uppercase;
 letter-spacing: 0.04em;
 margin-bottom: 2px;
}

.compact-top,
.compact-block,
.compact-footer {
 border: 1px solid var(--bs-border-color, #dee2e6);
 border-radius: 10px;
 padding: 6px 8px;
}

.compact-grid {
 display: grid;
 grid-template-columns: repeat(2, minmax(0, 1fr));
 gap: 2px 10px;
}

.compact-grid__full {
 grid-column: 1 / -1;
}

.compact-block__title {
 font-size: 10px;
 font-weight: 700;
 text-transform: uppercase;
 margin-bottom: 2px;
}

.compact-table {
 font-size: var(--print-table, 11px);
}

.compact-footer {
 display: grid;
 grid-template-columns: minmax(0, 1fr) 160px;
 gap: 12px;
 align-items: end;
}

.compact-totals {
 display: grid;
 grid-template-columns: repeat(2, minmax(0, 1fr));
 gap: 2px 10px;
}

.compact-totals__final {
 grid-column: 1 / -1;
 font-weight: 700;
}

.compact-signature {
 text-align: center;
 font-size: 11px;
}

.compact-signature__line {
 border-top: 1px solid #000;
 margin-top: 18px;
 padding-top: 4px;
}

.print-sheet img:not(.print-watermark__logo),
.print-sheet picture,
.print-sheet svg,
.print-sheet canvas,
.print-sheet iframe,
.print-sheet embed,
.print-sheet object {
 display: none !important;
}

@media print {
 @page {
  size: A4 portrait;
  margin: 8mm;
 }

 .print-sheet {
  font-size: var(--print-base, 9.4px);
  line-height: var(--print-line, 1.08);
  font-weight: var(--print-weight, 500);
 }

 .print-sheet .small {
  font-size: var(--print-small, 8px);
 }

 .order-print-page {
  gap: 4mm;
 }

 .order-slip {
  padding: 2.5mm !important;
  break-inside: avoid;
  page-break-inside: avoid;
 }

 .order-print-double {
  display: grid;
  gap: 0;
 }

 .order-print-double__half {
  break-inside: avoid;
  page-break-inside: avoid;
 }

 .order-print-double__divider {
  margin: 4mm 0;
 }

 .print-watermark__logo {
  width: min(74%, 300px);
  opacity: 0.06;
 }

 .copy-meta {
  font-size: var(--print-meta, 8px);
  margin-bottom: 1px;
 }

 .compact-top,
 .compact-block,
 .compact-footer {
  padding: 3px 5px;
  border-radius: 6px;
 }

 .compact-block__title,
 .compact-signature {
  font-size: var(--print-section, 8.2px);
 }

 .compact-table {
  font-size: var(--print-table, 8.2px);
 }

 .compact-grid,
 .compact-totals {
  gap: 1px 8px;
 }

 .compact-footer {
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 8px;
 }

 .compact-signature__line {
  margin-top: 12px;
  padding-top: 2px;
 }

 .table {
  margin-bottom: 0;
 }

 .table th,
 .table td {
  padding: 1px 3px;
 }
}
</style>
