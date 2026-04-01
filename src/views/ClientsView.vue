<template>
 <AppShell
  title="Clientes e histórico"
  subtitle="Cadastro completo do cliente, perfil consolidado e linha do tempo das ordens de serviço.">
  <template #actions>
   <button class="btn btn-primary rounded-pill" @click="openCreate">
    <i class="fa-solid fa-user-plus me-2"></i>
    Novo cliente
   </button>
  </template>

  <div class="row g-4 mb-4">
   <div class="col-md-4">
    <MetricCard
     title="Clientes ativos"
     :value="clients.length"
     hint="Base viva com histórico e relacionamento."
     icon="fa-solid fa-address-book"
     tone="primary"
    />
   </div>
   <div class="col-md-4">
    <MetricCard
     title="OS em aberto"
     :value="openOrders"
     hint="Demanda atual concentrada na carteira."
     icon="fa-solid fa-file-circle-exclamation"
     tone="warning"
    />
   </div>
   <div class="col-md-4">
    <MetricCard
     title="Receita por clientes"
     :value="currency(totalSpent)"
     hint="Somatório dos atendimentos concluídos."
     icon="fa-solid fa-money-bill-trend-up"
     tone="success"
    />
   </div>
  </div>

  <DataTable
   title="Carteira de clientes"
   eyebrow="CRM interno"
   :rows="clients"
   :columns="columns"
   :allow-csv="true"
   :allow-print="true"
   responsive-mode="auto"
   :card-title="(row) => row.name"
   :card-subtitle="(row) => row.phone || row.email || 'Sem contato rapido'"
   :card-fields="clientCardFields"
   :card-actions="clientCardActions"
   @row-click="openProfile"
  />

  <ModalDialog v-model="showProfile" title="Perfil completo do cliente" eyebrow="CRM interno" size="xl">
   <div v-if="selectedClient" class="row g-4">
    <div class="col-12">
     <div class="hero-banner">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
       <div class="d-flex align-items-start gap-3">
        <div
         class="rounded-4 overflow-hidden border border-white border-opacity-25 bg-white bg-opacity-10 d-inline-flex align-items-center justify-content-center"
         style="width: 96px; height: 96px;">
         <img
          v-if="selectedClient.photo_url"
          :src="selectedClient.photo_url"
          alt="Foto do cliente"
          class="w-100 h-100"
          style="object-fit: cover;"
         />
         <span v-else class="display-6 fw-bold">{{ selectedClient.name.slice(0, 1).toUpperCase() }}</span>
        </div>
        <div>
         <div class="small opacity-75 mb-2">Cliente ativo</div>
         <h3 class="h2 fw-bold mb-1">{{ selectedClient.name }}</h3>
         <div class="text-white-50 d-flex align-items-center gap-2 flex-wrap">
          <span>ID #{{ selectedClient.id }}</span>
          <span>|</span>
          <PhoneLink :phone="selectedClient.phone" fallback="Não informado" />
         </div>
        </div>
       </div>
       <div class="table-actions">
        <button class="btn btn-light rounded-pill" @click="openClientOrder(selectedClient)">
         <i class="fa-solid fa-file-circle-plus me-2"></i>
         Nova OS
        </button>
        <button class="btn btn-outline-light rounded-pill" @click="openEdit(selectedClient)">
         <i class="fa-solid fa-pen me-2"></i>
         Editar
        </button>
        <button class="btn btn-outline-light rounded-pill" @click="removeClient(selectedClient)">
         <i class="fa-solid fa-trash me-2"></i>
         Excluir
        </button>
       </div>
      </div>
     </div>
    </div>

    <div class="col-md-4">
     <div class="panel-card h-100">
      <div class="small fw-semibold mb-2">Cadastro completo</div>
      <div class="mb-2"><strong>ID:</strong> #{{ selectedClient.id }}</div>
      <div class="mb-2"><strong>Email:</strong> {{ selectedClient.email || "Não informado" }}</div>
      <div class="mb-2"><strong>Documento:</strong> {{ selectedClient.document || "Não informado" }}</div>
      <div class="mb-2"><strong>Endereço:</strong> {{ selectedClient.address || "Não informado" }}</div>
      <div class="mb-2"><strong>Observações:</strong> {{ selectedClient.notes || "Sem observações" }}</div>
     </div>
    </div>

    <div class="col-md-8">
     <div class="row g-3">
      <div class="col-md-4">
       <div class="panel-card h-100">
        <div class="small fw-semibold mb-2">Total de OS</div>
        <div class="fs-3 fw-bold">{{ selectedClient.orders_count || 0 }}</div>
       </div>
      </div>
      <div class="col-md-4">
       <div class="panel-card h-100">
        <div class="small fw-semibold mb-2">OS em aberto</div>
        <div class="fs-3 fw-bold">{{ selectedClient.open_orders || 0 }}</div>
       </div>
      </div>
      <div class="col-md-4">
       <div class="panel-card h-100">
        <div class="small fw-semibold mb-2">Receita gerada</div>
        <div class="fs-4 fw-bold">{{ currency(selectedClient.total_spent) }}</div>
       </div>
      </div>

      <div class="col-12">
       <div class="panel-card h-100">
        <div class="d-flex justify-content-between align-items-center mb-3">
         <div>
          <div class="small fw-semibold">Histórico do cliente</div>
          <h4 class="h5 fw-bold mb-0">Uma pessoa por vez, com contexto total</h4>
         </div>
        </div>
        <DataTable
         title="Histórico de OS"
         eyebrow="Linha do tempo"
         :rows="selectedClient.history"
         :columns="historyColumns"
         :allow-csv="true"
         :allow-print="true"
         height="320px"
        />
       </div>
      </div>
     </div>
    </div>
   </div>
  </ModalDialog>

  <ModalDialog
   v-model="showForm"
   :title="form.id ? 'Editar cliente' : 'Novo cliente'"
   eyebrow="Cadastro mestre"
   size="lg">
   <form class="row g-3" @submit.prevent="saveClient">
    <div v-if="form.id" class="col-md-4">
     <label class="form-label fw-semibold">ID interno</label>
     <input :value="`#${form.id}`" class="form-control rounded-4" disabled />
    </div>
    <div :class="form.id ? 'col-md-4' : 'col-md-6'">
     <label class="form-label fw-semibold">Nome</label>
     <input v-model="form.name" class="form-control rounded-4" required />
    </div>
    <div :class="form.id ? 'col-md-4' : 'col-md-6'">
     <label class="form-label fw-semibold">Telefone</label>
     <input v-model="form.phone" class="form-control rounded-4" required />
    </div>
    <div class="col-md-6">
     <label class="form-label fw-semibold">Email</label>
     <input v-model="form.email" type="email" class="form-control rounded-4" />
    </div>
    <div class="col-md-6">
     <label class="form-label fw-semibold">Documento</label>
     <input v-model="form.document" class="form-control rounded-4" />
    </div>
    <div class="col-12">
     <label class="form-label fw-semibold">Endereço</label>
     <input v-model="form.address" class="form-control rounded-4" />
    </div>
    <div class="col-12">
     <label class="form-label fw-semibold">Observações</label>
     <textarea v-model="form.notes" class="form-control rounded-4" rows="4"></textarea>
    </div>
    <div class="col-12">
     <MediaCaptureField
      v-model="photoPayload"
      :preview="photoPreview"
      label="Foto do cliente"
      helper="Use a câmera ou a galeria para registrar a foto do cliente antes de salvar."
      accept="image/*"
      @preview-change="handlePhotoPreviewChange"
     />
    </div>
    <div class="col-12 d-flex justify-content-end gap-2">
     <button type="button" class="btn btn-light rounded-pill" @click="showForm = false">Cancelar</button>
     <button class="btn btn-primary rounded-pill">
      <i class="fa-solid fa-floppy-disk me-2"></i>
      Salvar cliente
     </button>
    </div>
   </form>
  </ModalDialog>
 </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import DataTable from "../components/DataTable.vue";
import MediaCaptureField from "../components/MediaCaptureField.vue";
import MetricCard from "../components/MetricCard.vue";
import ModalDialog from "../components/ModalDialog.vue";
import PhoneLink from "../components/PhoneLink.vue";
import { api } from "../services/api";
import { currency } from "../services/format";
import type { ClientDetail, ClientSummary, MediaUploadPayload } from "../services/types";
import { notifyError, notifySuccess } from "../services/ui";

const router = useRouter();
const clients = ref<ClientSummary[]>([]);
const selectedClient = ref<ClientDetail | null>(null);
const showProfile = ref(false);
const showForm = ref(false);
const photoPayload = ref<MediaUploadPayload | null>(null);
const photoPreview = ref("");
const form = reactive({
 id: null as number | null,
 name: "",
 phone: "",
 email: "",
 document: "",
 address: "",
 notes: ""
});

const openOrders = computed(() => clients.value.reduce((sum, item) => sum + Number(item.open_orders || 0), 0));
const totalSpent = computed(() => clients.value.reduce((sum, item) => sum + Number(item.total_spent || 0), 0));

const columns = [
 {
  title: "Ações",
  field: "actions",
  hozAlign: "center",
  headerSort: false,
  cssClass: "action-cell",
  width: 92,
  formatter: () =>
    `
 <div class="action-menu" data-row-action="true">
 <details class="action-menu__details" data-row-action="true">
 <summary class="action-menu__toggle" data-row-action="true" title="Mais acoes">
 <i class="fa-solid fa-ellipsis-vertical" data-row-action="true"></i>
 </summary>
 <div class="action-menu__list" data-row-action="true">
 <button class="action-menu__item action-view" data-row-action="true">
 <i class="fa-solid fa-eye me-2" data-row-action="true"></i>
 Ver
 </button>
 <button class="action-menu__item action-edit" data-row-action="true">
 <i class="fa-solid fa-pen me-2" data-row-action="true"></i>
 Editar
 </button>
 <button class="action-menu__item action-delete" data-row-action="true">
 <i class="fa-solid fa-trash me-2" data-row-action="true"></i>
 Excluir
 </button>
 </div>
 </details>
 </div>
 `,
  cellClick: async (event: MouseEvent, cell: any) => {
   const target = event.target as HTMLElement | null;
   const rowData = cell.getRow().getData() as Record<string, unknown>;
   event.stopPropagation();

   if (target?.closest(".action-view")) {
    closeActionMenu(target);
    await openProfile(rowData);
    return;
   }

   if (target?.closest(".action-edit")) {
    closeActionMenu(target);
    await openEditById(Number(rowData.id));
    return;
   }

   if (target?.closest(".action-delete")) {
    closeActionMenu(target);
    await removeClientByRow(rowData);
   }
  }
 },
 { title: "Cliente", field: "name", minWidth: 220, cssClass: "cell-wrap", variableHeight: true },
 {
  title: "Telefone",
  field: "phone",
  minWidth: 170,
  formatter: (cell: any) => {
   const phone = String(cell.getValue() || "");
   const digits = phone.replace(/\D/g, "");
   return digits
    ? `<a href="https://wa.me/${digits}" class="phone-link" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp"></i><span>${phone}</span></a>`
    : "-";
  }
 },
 { title: "OS", field: "orders_count", hozAlign: "center", minWidth: 85 },
 { title: "Em aberto", field: "open_orders", hozAlign: "center", minWidth: 110 },
 { title: "Gasto", field: "total_spent", minWidth: 135, formatter: (cell: any) => currency(cell.getValue()) },
 { title: "ID", field: "id", hozAlign: "center", width: 90 },
 { title: "Email", field: "email", minWidth: 220, cssClass: "cell-wrap", variableHeight: true }
];

const clientCardFields = [
 { key: "phone", label: "Telefone", value: (row: Record<string, unknown>) => String(row.phone || "-") },
 { key: "orders_count", label: "OS", value: (row: Record<string, unknown>) => String(row.orders_count || 0) },
 { key: "open_orders", label: "Em aberto", value: (row: Record<string, unknown>) => String(row.open_orders || 0) },
 { key: "total_spent", label: "Gasto", value: (row: Record<string, unknown>) => currency(Number(row.total_spent || 0)) },
 { key: "id", label: "ID", value: (row: Record<string, unknown>) => `#${row.id || "-"}` },
 { key: "email", label: "Email", value: (row: Record<string, unknown>) => String(row.email || "Não informado"), fullWidth: true }
];

const clientCardActions = [
 {
  key: "view",
  label: "Ver",
  icon: "fa-solid fa-eye",
  handler: async (row: Record<string, unknown>) => {
   await openProfile(row);
  }
 },
 {
  key: "edit",
  label: "Editar",
  icon: "fa-solid fa-pen",
  handler: async (row: Record<string, unknown>) => {
   await openEditById(Number(row.id));
  }
 },
 {
  key: "delete",
  label: "Excluir",
  icon: "fa-solid fa-trash",
  tone: "danger" as const,
  handler: async (row: Record<string, unknown>) => {
   await removeClientByRow(row);
  }
 }
];

const historyColumns = [
 { title: "Código", field: "code" },
 { title: "Equipamento", field: "equipment" },
 { title: "Status", field: "order_status" },
 { title: "Aprovação", field: "approval_status" },
 { title: "Total", field: "total_amount", formatter: (cell: any) => currency(cell.getValue()) }
];

function closeActionMenu(target: HTMLElement | null) {
 target?.closest("details")?.removeAttribute("open");
}

function handlePhotoPreviewChange(preview: string) {
 photoPreview.value = preview;
}

async function loadClients() {
 try {
  const response = await api.clients({});
  clients.value = response.data;
 } catch (error) {
  await notifyError(error);
 }
}

async function openProfile(row: Record<string, unknown>) {
 try {
  const response = await api.client(Number(row.id));
  selectedClient.value = response.data;
  showProfile.value = true;
 } catch (error) {
  await notifyError(error);
 }
}

async function openEditById(clientId: number) {
 try {
  const response = await api.client(clientId);
  openEdit(response.data);
 } catch (error) {
  await notifyError(error);
 }
}

function openCreate() {
 selectedClient.value = null;
 Object.assign(form, {
  id: null,
  name: "",
  phone: "",
  email: "",
  document: "",
  address: "",
  notes: ""
 });
 photoPayload.value = null;
 photoPreview.value = "";
 showForm.value = true;
}

function openEdit(client: ClientDetail) {
 showProfile.value = false;
 Object.assign(form, {
  id: client.id,
  name: client.name,
  phone: client.phone,
  email: client.email,
  document: client.document,
  address: client.address,
  notes: client.notes
 });
 photoPayload.value = null;
 photoPreview.value = client.photo_url || "";
 showForm.value = true;
}

function openClientOrder(client: ClientDetail) {
 showProfile.value = false;
 router.push({
  path: "/os",
  query: {
   clientId: String(client.id),
   createOrder: "1"
  }
 });
}

async function removeClient(client: ClientDetail) {
 const totalOrders = Number(client.orders_count || client.history?.length || 0);
 const warningText =
  totalOrders > 0
   ? `Isso vai excluir o cliente e tambem ${totalOrders} OS vinculada(s), incluindo histórico relacionado.`
   : "Isso vai excluir definitivamente o cadastro do cliente.";

 const confirmed = window.Swal
  ? await window.Swal.fire({
    icon: "warning",
    title: `Excluir ${client.name}?`,
    text: warningText,
    showCancelButton: true,
    confirmButtonText: "Excluir tudo",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#d95165"
   })
  : { isConfirmed: window.confirm(`Excluir ${client.name}?`) };

 if (!confirmed.isConfirmed) {
  return;
 }

 try {
  const response = await api.deleteClient(client.id);
  showProfile.value = false;
  if (selectedClient.value?.id === client.id) {
   selectedClient.value = null;
  }
  await loadClients();
  await notifySuccess("Cliente excluído", `${response.deletedOrders || totalOrders} OS removida(s) junto com o cadastro.`);
 } catch (error) {
  await notifyError(error);
 }
}

async function removeClientByRow(row: Record<string, unknown>) {
 await removeClient({
  ...(row as unknown as ClientDetail),
  history: []
 });
}

async function saveClient() {
 try {
  const response = await api.saveClient({
   ...form,
   photoUpload: photoPayload.value ?? undefined,
   photoPreview: photoPreview.value
  });
  const wasEditing = Boolean(form.id);
  showForm.value = false;
  photoPayload.value = null;
  photoPreview.value = response.data.photo_url || "";
  await loadClients();
  selectedClient.value = response.data;
  showProfile.value = true;
  await notifySuccess(
   wasEditing ? "Cliente atualizado" : "Cliente criado",
   `Cadastro salvo com ID #${response.data.id}.`
  );
 } catch (error) {
  await notifyError(error);
 }
}

onMounted(loadClients);
</script>
