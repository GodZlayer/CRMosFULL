<template>
 <AppShell title="Serviços" subtitle="Base de serviços usada em OS e no PDV, com prazo em dias e suporte a serviços instantâneos.">
 <template #actions>
 <button class="btn btn-primary rounded-pill" @click="openCreate">
 <i class="fa-solid fa-plus me-2"></i>
 Novo serviço
 </button>
 </template>

 <div class="row g-4 mb-4">
 <div class="col-md-4">
 <MetricCard title="Serviços ativos" :value="activeServices" hint="Base pronta para uso operacional." icon="fa-solid fa-screwdriver-wrench" tone="primary" />
 </div>
 <div class="col-md-4">
 <MetricCard title="Preço médio" :value="currency(averagePrice)" hint="Faixa média dos serviços cadastrados." icon="fa-solid fa-money-bill-wave" tone="success" />
 </div>
 <div class="col-md-4">
 <MetricCard title="Prazo médio" :value="averageDaysLabel" hint="Serviços instantâneos aparecem como no ato." icon="fa-solid fa-calendar-days" tone="info" />
 </div>
 </div>

 <DataTable
 ref="servicesTable"
 title="Base de serviços"
 eyebrow="Operação"
 :rows="services"
 :columns="columns"
 :allow-csv="true"
 :allow-print="true"
 :selectable-rows="true"
 @selection-change="handleSelectionChange"
 @row-click="openDetail"
 />

 <SelectionActionBar class="mt-4" :selected-count="selectedRows.length" item-label="serviço(s)" @select-all="selectAll" @clear="clearSelection">
 <button class="btn btn-danger rounded-pill" :disabled="!selectedRows.length" @click="removeSelected">
 <i class="fa-solid fa-trash me-2"></i>
 Excluir selecionados
 </button>
 </SelectionActionBar>

 <ModalDialog v-model="showDetail" title="Serviço" eyebrow="Base de serviços" size="lg">
 <div v-if="selectedService" class="d-grid gap-4">
 <div class="hero-banner">
 <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
 <div>
 <div class="small opacity-75 mb-2">Serviço cadastrado</div>
 <h3 class="h2 fw-bold mb-1">{{ selectedService.name }}</h3>
 <div class="text-white-50">{{ currency(selectedService.price_amount) }} | {{ durationLabel(selectedService.estimated_minutes) }}</div>
 </div>
 <div class="table-actions">
 <button class="btn btn-light rounded-pill" @click="openEdit(selectedService)">
 <i class="fa-solid fa-pen me-2"></i>
 Editar
 </button>
 <button class="btn btn-outline-light rounded-pill" @click="removeService(selectedService)">
 <i class="fa-solid fa-trash me-2"></i>
 Excluir
 </button>
 </div>
 </div>
 </div>

 <div class="row g-4">
 <div class="col-md-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Dados</div>
 <div class="mb-2"><strong>Nome:</strong> {{ selectedService.name }}</div>
 <div class="mb-2"><strong>Descrição:</strong> {{ selectedService.description || 'Sem descrição' }}</div>
 <div class="mb-2"><strong>Status:</strong> {{ selectedService.active ? 'Ativo' : 'Inativo' }}</div>
 </div>
 </div>
 <div class="col-md-6">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-3">Comercial e uso</div>
 <div class="mb-2"><strong>Preço base:</strong> {{ currency(selectedService.price_amount) }}</div>
 <div class="mb-2"><strong>Tipo de preço:</strong> {{ Number(selectedService.additional_price_amount || 0) > 0 || selectedService.pricing_mode === 'PROGRESSIVE' ? 'Progressivo' : 'Fixo' }}</div>
 <div v-if="selectedService.pricing_mode === 'PROGRESSIVE'" class="mb-2"><strong>Adicional:</strong> {{ currency(selectedService.additional_price_amount) }}</div>
 <div class="mb-2"><strong>Prazo:</strong> {{ durationLabel(selectedService.estimated_minutes) }}</div>
 <div class="mb-2"><strong>Na OS:</strong> {{ selectedService.available_in_order ? 'Sim' : 'Não' }}</div>
 <div class="mb-2"><strong>No PDV:</strong> {{ selectedService.available_in_pdv ? 'Sim' : 'Não' }}</div>
 <div class="mb-2"><strong>Preço customizado:</strong> {{ selectedService.allow_custom_price ? 'Sim' : 'Não' }}</div>
 </div>
 </div>
 </div>
 </div>
 </ModalDialog>

 <ModalDialog v-model="showForm" :title="form.id ? 'Editar serviço' : 'Novo serviço'" eyebrow="Cadastro de serviços" size="lg">
 <form class="row g-3" @submit.prevent="saveService">
 <div class="col-12">
 <label class="form-label fw-semibold">Nome</label>
 <input v-model="form.name" class="form-control rounded-4" required />
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold">Descrição</label>
 <textarea v-model="form.description" class="form-control rounded-4" rows="4"></textarea>
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Preço base</label>
 <input v-model.number="form.price_amount" type="number" step="0.01" min="0" class="form-control rounded-4" required />
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Tipo de preço</label>
 <select v-model="form.pricing_mode" class="form-select rounded-4">
 <option value="FIXED">Fixo</option>
 <option value="PROGRESSIVE">Progressivo</option>
 </select>
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Adicional</label>
 <input v-model.number="form.additional_price_amount" type="number" step="0.01" min="0" class="form-control rounded-4" :disabled="form.pricing_mode !== 'PROGRESSIVE'" />
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Prazo em dias</label>
 <input v-model.number="form.estimated_days" type="number" min="0" class="form-control rounded-4" required />
 <div class="small mt-2">Use `0` para serviço instantâneo.</div>
 </div>
 <div class="col-md-6">
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form.available_in_order" type="checkbox" class="form-check-input mt-0" />
 <span class="fw-semibold">Disponível na OS</span>
 </label>
 </div>
 <div class="col-md-6">
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form.available_in_pdv" type="checkbox" class="form-check-input mt-0" />
 <span class="fw-semibold">Disponível no PDV</span>
 </label>
 </div>
 <div class="col-md-6">
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form.allow_custom_price" type="checkbox" class="form-check-input mt-0" />
 <span class="fw-semibold">Permitir preço customizado no PDV</span>
 </label>
 </div>
 <div class="col-12">
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form.active" type="checkbox" class="form-check-input mt-0" />
 <span class="fw-semibold">Serviço ativo</span>
 </label>
 </div>
 <div class="col-12 d-flex justify-content-end gap-2">
 <button type="button" class="btn btn-light rounded-pill" @click="showForm = false">Cancelar</button>
 <button class="btn btn-primary rounded-pill">
 <i class="fa-solid fa-floppy-disk me-2"></i>
 Salvar serviço
 </button>
 </div>
 </form>
 </ModalDialog>
 </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import DataTable from "../components/DataTable.vue";
import MetricCard from "../components/MetricCard.vue";
import ModalDialog from "../components/ModalDialog.vue";
import SelectionActionBar from "../components/SelectionActionBar.vue";
import { api } from "../services/api";
import { currency } from "../services/format";
import { notifyError, notifySuccess } from "../services/ui";
import type { ServiceCatalogItem } from "../services/types";

const servicesTable = ref<any>(null);
const services = ref<ServiceCatalogItem[]>([]);
const selectedRows = ref<ServiceCatalogItem[]>([]);
const selectedService = ref<ServiceCatalogItem | null>(null);
const showDetail = ref(false);
const showForm = ref(false);

const form = reactive({
 id: 0,
 name: "",
 description: "",
 price_amount: 0,
 pricing_mode: 'FIXED',
 additional_price_amount: 0,
 estimated_days: 0,
 available_in_order: true,
 available_in_pdv: false,
 allow_custom_price: false,
 active: true
});

const DAY_MINUTES = 8 * 60;

const activeServices = computed(() => services.value.filter((item) => Number(item.active) === 1).length);
const averagePrice = computed(() => services.value.length ? services.value.reduce((sum, item) => sum + Number(item.price_amount || 0), 0) / services.value.length : 0);
const averageDays = computed(() => services.value.length ? services.value.reduce((sum, item) => sum + minutesToDays(item.estimated_minutes), 0) / services.value.length : 0);
const averageDaysLabel = computed(() => averageDays.value ? `${averageDays.value.toFixed(1)} dia(s)` : "No ato");

const columns = [
 { title: "ID", field: "id", width: 90, hozAlign: "center" },
 { title: "Serviço", field: "name", minWidth: 220, cssClass: "cell-wrap", variableHeight: true },
 { title: "Descrição", field: "description", minWidth: 260, cssClass: "cell-wrap", variableHeight: true },
 { title: "Preço base", field: "price_amount", minWidth: 130, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Tipo", field: "pricing_mode", minWidth: 120, formatter: (cell: any) => Number(cell.getRow().getData().additional_price_amount || 0) > 0 || String(cell.getValue() || 'FIXED') === 'PROGRESSIVE' ? 'Progressivo' : 'Fixo' },
 { title: "Adicional", field: "additional_price_amount", minWidth: 130, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "Prazo", field: "estimated_minutes", minWidth: 140, formatter: (cell: any) => durationLabel(Number(cell.getValue() || 0)) },
 { title: "OS", field: "available_in_order", minWidth: 100, formatter: (cell: any) => badgeFormatter(Number(cell.getValue()) ? "Sim" : "Não", Number(cell.getValue()) ? "success" : "secondary") },
 { title: "PDV", field: "available_in_pdv", minWidth: 100, formatter: (cell: any) => badgeFormatter(Number(cell.getValue()) ? "Sim" : "Não", Number(cell.getValue()) ? "primary" : "secondary") },
 { title: "Preço livre", field: "allow_custom_price", minWidth: 150, formatter: (cell: any) => badgeFormatter(Number(cell.getValue()) ? "Sim" : "Não", Number(cell.getValue()) ? "warning" : "secondary") },
 { title: "Status", field: "active", minWidth: 120, formatter: (cell: any) => badgeFormatter(Number(cell.getValue()) ? "Ativo" : "Inativo", Number(cell.getValue()) ? "success" : "secondary") },
 {
 title: "Ações",
 field: "actions",
 hozAlign: "center",
 headerSort: false,
 cssClass: "action-cell",
 width: 92,
 formatter: () => `
 <div class="action-menu" data-row-action="true">
 <details class="action-menu__details" data-row-action="true">
 <summary class="action-menu__toggle" data-row-action="true"><i class="fa-solid fa-ellipsis-vertical" data-row-action="true"></i></summary>
 <div class="action-menu__list" data-row-action="true">
 <button class="action-menu__item action-view" data-row-action="true"><i class="fa-solid fa-eye me-2"></i>Ver</button>
 <button class="action-menu__item action-edit" data-row-action="true"><i class="fa-solid fa-pen me-2"></i>Editar</button>
 <button class="action-menu__item action-delete" data-row-action="true"><i class="fa-solid fa-trash me-2"></i>Excluir</button>
 </div>
 </details>
 </div>
 `,
 cellClick: async (event: MouseEvent, cell: any) => {
 const target = event.target as HTMLElement | null;
 const rowData = cell.getRow().getData() as ServiceCatalogItem;
 event.stopPropagation();
 if (target?.closest(".action-view")) {
 target.closest("details")?.removeAttribute("open");
 await openDetail(rowData);
 return;
 }
 if (target?.closest(".action-edit")) {
 target.closest("details")?.removeAttribute("open");
 openEdit(rowData);
 return;
 }
 if (target?.closest(".action-delete")) {
 target.closest("details")?.removeAttribute("open");
 await removeService(rowData);
 }
 }
 }
];

function badgeFormatter(label: string, tone: string) {
 return `<span class="badge text-bg-${tone}">${label}</span>`;
}

function minutesToDays(minutes: number) {
 const safe = Math.max(0, Number(minutes || 0));
 return safe ? Math.ceil(safe / DAY_MINUTES) : 0;
}

function daysToMinutes(days: number) {
 const safe = Math.max(0, Number(days || 0));
 return safe * DAY_MINUTES;
}

function durationLabel(minutes: number) {
 const days = minutesToDays(minutes);
 return days > 0 ? `${days} dia(s)` : "No ato";
}

function resetForm() {
 Object.assign(form, {
 id: 0,
 name: "",
 description: "",
 price_amount: 0,
 pricing_mode: 'FIXED',
 additional_price_amount: 0,
 estimated_days: 0,
 available_in_order: true,
 available_in_pdv: false,
 allow_custom_price: false,
 active: true
 });
}

async function loadServices() {
 try {
 const response = await api.services();
 services.value = response.data;
 } catch (error) {
 await notifyError(error);
 }
}

function openCreate() {
 resetForm();
 showForm.value = true;
}

function handleSelectionChange(rows: Record<string, unknown>[]) {
 selectedRows.value = rows as ServiceCatalogItem[];
}

function selectAll() {
 servicesTable.value?.selectAllRows?.();
}

function clearSelection() {
 selectedRows.value = [];
 servicesTable.value?.clearSelection?.();
}

async function openDetail(row: Partial<ServiceCatalogItem>) {
 try {
 const response = await api.service(Number(row.id));
 selectedService.value = response.data;
 showDetail.value = true;
 } catch (error) {
 await notifyError(error);
 }
}

function openEdit(row: Partial<ServiceCatalogItem>) {
 showDetail.value = false;
 Object.assign(form, {
 id: Number(row.id || 0),
 name: row.name || "",
 description: row.description || "",
 price_amount: Number(row.price_amount || 0),
 pricing_mode: String(row.pricing_mode || 'FIXED'),
 additional_price_amount: Number(row.additional_price_amount || 0),
 estimated_days: minutesToDays(Number(row.estimated_minutes || 0)),
 available_in_order: Boolean(Number(row.available_in_order ?? 1)),
 available_in_pdv: Boolean(Number(row.available_in_pdv ?? 0)),
 allow_custom_price: Boolean(Number(row.allow_custom_price ?? 0)),
 active: Boolean(Number(row.active ?? 1))
 });
 showForm.value = true;
}

async function saveService() {
 try {
 if (!form.available_in_order && !form.available_in_pdv) {
 throw new Error("Marque pelo menos um canal de uso para o serviço.");
 }
 const response = await api.saveService({
 id: form.id,
 name: form.name,
 description: form.description,
 price_amount: form.price_amount,
 pricing_mode: form.pricing_mode,
 additional_price_amount: form.pricing_mode === 'PROGRESSIVE' ? form.additional_price_amount : 0,
 estimated_minutes: daysToMinutes(form.estimated_days),
 available_in_order: form.available_in_order ? 1 : 0,
 available_in_pdv: form.available_in_pdv ? 1 : 0,
 allow_custom_price: form.allow_custom_price ? 1 : 0,
 active: form.active ? 1 : 0
 });
 showForm.value = false;
 selectedService.value = response.data;
 await loadServices();
 await notifySuccess("Serviço salvo", "Cadastro atualizado para uso na OS e no PDV.");
 } catch (error) {
 await notifyError(error);
 }
}

async function removeService(item: ServiceCatalogItem) {
 const confirmed = window.Swal
 ? await window.Swal.fire({
 icon: "warning",
 title: `Excluir ${item.name}?`,
 text: "O serviço será removido da base e deixará de aparecer nos fluxos operacionais.",
 showCancelButton: true,
 confirmButtonText: "Excluir serviço",
 cancelButtonText: "Cancelar",
 confirmButtonColor: "#d95165"
 })
 : { isConfirmed: window.confirm(`Excluir ${item.name}?`) };

 if (!confirmed.isConfirmed) {
 return;
 }

 try {
 await api.deleteService(item.id);
 if (selectedService.value?.id === item.id) {
 selectedService.value = null;
 showDetail.value = false;
 }
 await loadServices();
 clearSelection();
 await notifySuccess("Serviço excluído", `${item.name} foi removido da base.`);
 } catch (error) {
 await notifyError(error);
 }
}

async function removeSelected() {
 for (const item of selectedRows.value) {
 await api.deleteService(item.id);
 }
 clearSelection();
 await loadServices();
 await notifySuccess("Serviços excluídos", "A seleção foi removida da base de serviços.");
}

onMounted(loadServices);
</script>
