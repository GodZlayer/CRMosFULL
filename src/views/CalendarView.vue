<template>
 <AppShell title="Calendário" subtitle="Agenda da loja.">
 <template #actions>
 <button class="btn btn-outline-secondary rounded-pill" @click="showFullscreenCalendar = true">
 <i class="fa-solid fa-expand me-2"></i>
 Calendário fullscreen
 </button>
 <FilterDrawer title="Filtros" @apply="loadCalendar" @clear="clearFilters">
 <div class="d-grid gap-3">
 <div>
 <label class="form-label fw-semibold">Buscar</label>
 <input v-model="filters.search" class="form-control rounded-4" placeholder="Código, cliente, técnico ou equipamento" />
 </div>
 <div>
 <label class="form-label fw-semibold">Status operacional</label>
 <select v-model="filters.orderStatus" class="form-select rounded-4">
 <option value="">Todos</option>
 <option v-for="item in session.meta?.orderStatuses || []" :key="item.code" :value="item.code">{{ item.label }}</option>
 </select>
 </div>
 <div>
 <label class="form-label fw-semibold">Aprovação</label>
 <select v-model="filters.approvalStatus" class="form-select rounded-4">
 <option value="">Todas</option>
 <option v-for="item in session.meta?.approvalStatuses || []" :key="item.code" :value="item.code">{{ item.label }}</option>
 </select>
 </div>
 <div class="row g-3">
 <div class="col-md-6">
 <label class="form-label fw-semibold">De</label>
 <input v-model="filters.fromDate" type="date" class="form-control rounded-4" />
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Até</label>
 <input v-model="filters.toDate" type="date" class="form-control rounded-4" />
 </div>
 </div>
 </div>
 </FilterDrawer>
 </template>

 <div class="row g-4 mb-4">
 <div class="col-md-4">
 <MetricCard title="Na agenda" :value="entries.length" hint="Ordens no período." icon="fa-solid fa-timeline" tone="primary" />
 </div>
 <div class="col-md-4">
 <MetricCard title="Aguardando aprovação" :value="pendingApprovals" hint="Aguardando retorno." icon="fa-solid fa-hourglass-half" tone="warning" />
 </div>
 <div class="col-md-4">
 <MetricCard title="Concluídas" :value="deliveredOrders" hint="Concluídas no período." icon="fa-solid fa-flag-checkered" tone="success" />
 </div>
 </div>

 <div class="panel-card calendar-legend-card mb-4">
 <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
 <div>
 <div class="small fw-semibold">Legenda</div>
 <div>Status por cor.</div>
 </div>
 <div class="calendar-legend">
 <div v-for="item in statusLegend" :key="item.code" class="calendar-legend__item">
 <span class="calendar-legend__dot" :style="{ backgroundColor: item.color }"></span>
 <span>{{ item.label }}</span>
 </div>
 </div>
 </div>
 </div>

 <TimelineCalendar
 title="Agenda"
 :entries="entries"
 title-field="clientName"
 subtitle-field="statusLabel"
 compact
 @select="openTimeline"
 />
 <ModalDialog v-model="showFullscreenCalendar" title="Calendário fullscreen" eyebrow="Agenda" size="full">
 <TimelineCalendar
 title="Agenda"
 :entries="entries"
 title-field="clientName"
 subtitle-field="statusLabel"
 compact
 @select="openTimeline"
 />
 </ModalDialog>
 </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import FilterDrawer from "../components/FilterDrawer.vue";
import MetricCard from "../components/MetricCard.vue";
import ModalDialog from "../components/ModalDialog.vue";
import TimelineCalendar from "../components/TimelineCalendar.vue";
import { api } from "../services/api";
import { notifyError } from "../services/ui";
import { useSessionStore } from "../stores/session";
import type { CalendarEntry, Filters } from "../services/types";

const session = useSessionStore();
const router = useRouter();
const entries = ref<CalendarEntry[]>([]);
const showFullscreenCalendar = ref(false);
const filters = reactive<Filters>({
 search: "",
 orderStatus: "",
 approvalStatus: "",
 fromDate: "",
 toDate: ""
});

const pendingApprovals = computed(() => entries.value.filter((item) => item.approvalStatus === "AGUARDANDO_APROVACAO").length);
const deliveredOrders = computed(() => entries.value.filter((item) => item.orderStatus === "CONCLUIDA").length);
const statusLegend = computed(() =>
 (session.meta?.orderStatuses || []).map((item) => ({
 code: item.code,
 label: item.label,
 color: statusColor(item.code)
 }))
);

function statusColor(code: string) {
 switch (String(code || "ABERTA")) {
 case "CONCLUIDA":
 return "#198754";
 case "EM_ANDAMENTO":
 return "#fd7e14";
 case "CANCELADA":
 return "#dc3545";
 case "ABERTA":
 default:
 return "#0d6efd";
 }
}

function clearFilters() {
 Object.assign(filters, {
 search: "",
 orderStatus: "",
 approvalStatus: "",
 fromDate: "",
 toDate: ""
 });
 loadCalendar();
}

async function loadCalendar() {
 try {
 const response = await api.calendar(filters);
 entries.value = response.data;
 } catch (error) {
 await notifyError(error);
 }
}

function openTimeline(entry: Record<string, any>) {
 const id = Number(entry.id || 0);
 if (!id) {
 return;
 }
 router.push({ path: `/os/${id}`, query: { focus: "timeline" } });
}

onMounted(loadCalendar);
</script>

<style scoped>
.calendar-legend {
 display: flex;
 flex-wrap: wrap;
 gap: 0.75rem 1.25rem;
}

.calendar-legend__item {
 display: inline-flex;
 align-items: center;
 gap: 0.55rem;
 font-weight: 600;
 color: var(--bs-secondary-color);
}

.calendar-legend__dot {
 width: 14px;
 height: 14px;
 border-radius: 50%;
 box-shadow: 0 0 0 3px rgba(16, 35, 63, 0.08);
}
</style>
