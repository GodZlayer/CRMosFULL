<template>
  <div class="pdv-receipt-sheet">
    <div class="d-flex justify-content-between align-items-start gap-3 mb-4 no-print">
      <div>
        <div class="small fw-semibold">Cupom não fiscal</div>
        <h1 class="h4 fw-bold mb-0">{{ sale?.code }}</h1>
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

    <div v-if="sale" class="pdv-receipt panel-card">
      <div class="text-center mb-3">
        <div class="fw-bold fs-5">{{ session.company?.shortName || 'CRM OS' }}</div>
        <div class="small">Cupom não fiscal</div>
        <div class="small">{{ sale.code }}</div>
      </div>

      <div class="small mb-3">
        <div><strong>Cliente:</strong> {{ sale.client_name }}</div>
        <div v-if="sale.client_phone"><strong>Telefone:</strong> {{ sale.client_phone }}</div>
        <div><strong>Operador:</strong> {{ sale.operator_name }}</div>
        <div><strong>Data:</strong> {{ dateTimeLabel(sale.created_at) }}</div>
      </div>

      <table class="table table-sm align-middle mb-3">
        <colgroup>
          <col class="item-col" />
          <col class="qty-col" />
          <col class="total-col" />
        </colgroup>
        <thead>
          <tr>
            <th>Item</th>
            <th class="text-center qty-col">Qtd</th>
            <th class="text-end total-col">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in sale.items" :key="item.id">
            <td>
              <div class="fw-semibold">{{ item.item_name }}</div>
              <div class="small no-break">{{ currency(item.unit_price) }} cada</div>
            </td>
            <td class="text-center qty-col no-break">{{ item.quantity }}</td>
            <td class="text-end total-col no-break">{{ currency(item.line_total) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="border-top pt-2 small mb-3">
        <div class="d-flex justify-content-between gap-2"><span>Subtotal</span><strong class="no-break">{{ currency(sale.subtotal_amount) }}</strong></div>
        <div class="d-flex justify-content-between gap-2"><span>Desconto</span><strong class="no-break">{{ sale.discount_mode === 'PERCENT' ? `${Number(sale.discount_value || 0).toFixed(2)}%` : currency(sale.discount_amount) }}</strong></div>
        <div class="d-flex justify-content-between gap-2 fw-bold fs-5"><span>Total</span><span class="no-break">{{ currency(sale.total_amount) }}</span></div>
      </div>

      <div class="border-top pt-2 small mb-3">
        <div class="fw-semibold mb-1">Pagamentos</div>
        <div v-for="payment in sale.payments" :key="payment.id" class="d-flex justify-content-between gap-2">
          <span>{{ payment.payment_method }}</span>
          <span class="no-break">{{ currency(payment.amount) }}</span>
        </div>
      </div>

      <div v-if="sale.notes" class="small mb-3">
        <div class="fw-semibold mb-1">Observações</div>
        <div>{{ sale.notes }}</div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../services/api";
import { currency } from "../services/format";
import { notifyError } from "../services/ui";
import { useSessionStore } from "../stores/session";
import type { PosSale } from "../services/types";

const route = useRoute();
const session = useSessionStore();
const sale = ref<PosSale | null>(null);

function dateTimeLabel(value: string) {
  if (!value) {
    return "Não informado";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("pt-BR");
}

function closeWindow() {
  window.close();
}

function printWindow() {
  window.print();
}

onMounted(async () => {
  try {
    const response = await api.posSale(Number(route.params.id));
    sale.value = response.data;
  } catch (error) {
    await notifyError(error);
  }
});
</script>

<style scoped>
.pdv-receipt-sheet {
  max-width: 360px;
  margin: 0 auto;
  padding: 1rem;
}

.pdv-receipt {
  font-size: 20px;
  line-height: 1.2;
  font-family: "Times New Roman", Times, serif;
  font-weight: 600;
  width: 72mm;
  margin: 0 auto;
  border-radius: 12px;
  padding: 0.8mm;
}

.pdv-receipt .small {
  font-size: 16px;
}

.pdv-receipt .fw-semibold,
.pdv-receipt .fw-bold,
.pdv-receipt strong,
.pdv-receipt th {
  font-weight: 700 !important;
}

.pdv-receipt td,
.pdv-receipt th,
.pdv-receipt span,
.pdv-receipt div {
  letter-spacing: 0.01em;
}

.pdv-receipt {
  white-space: normal;
}

.pdv-receipt table {
  table-layout: fixed;
  width: 100%;
}

.pdv-receipt .item-col {
  width: 46%;
}

.pdv-receipt .qty-col {
  width: 12%;
}

.pdv-receipt .total-col {
  width: 42%;
}

.pdv-receipt td,
.pdv-receipt th {
  vertical-align: top;
  word-break: normal;
  overflow-wrap: normal;
}

.pdv-receipt td,
.pdv-receipt th {
  padding-left: 0.18rem;
  padding-right: 0.18rem;
}

.pdv-receipt td:first-child,
.pdv-receipt th:first-child,
.pdv-receipt .d-flex span:first-child,
.pdv-receipt .d-flex strong:first-child,
.pdv-receipt .d-flex div:first-child {
  white-space: normal;
  word-break: normal;
  overflow-wrap: break-word;
}

.pdv-receipt .no-break,
.pdv-receipt .qty-col,
.pdv-receipt .total-col,
.pdv-receipt .text-end,
.pdv-receipt .text-center {
  white-space: nowrap;
  word-break: keep-all;
  overflow-wrap: normal;
}

@media print {
  .pdv-receipt-sheet {
    max-width: none;
    padding: 0;
  }

  .pdv-receipt {
    width: 72mm;
    font-size: 20px;
    line-height: 1.2;
    font-family: "Times New Roman", Times, serif;
    font-weight: 600;
    box-shadow: none;
    margin: 0;
    padding: 0.8mm;
  }

  .pdv-receipt .small {
    font-size: 16px;
  }
}
</style>
