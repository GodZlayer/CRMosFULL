<template>
  <AppShell title="Gerenciar Alertas" subtitle="Crie e envie notificações especiais para todos os perfis da Brasil Express.">
    <template #actions>
      <button class="btn btn-primary rounded-pill" @click="showModal = true">
        <i class="fa-solid fa-plus me-2"></i>
        Novo Alerta
      </button>
    </template>

    <div class="row g-4">
      <div class="col-12">
        <DataTable 
          title="Histórico de Alertas" 
          eyebrow="Notificações" 
          :rows="notifications" 
          :columns="columns"
          :allow-csv="true"
        />
      </div>
    </div>

    <!-- Modal Novo Alerta -->
    <div v-if="showModal" class="modal fade show d-block" tabindex="-1" style="background: rgba(10, 26, 45, 0.56);" @click.self="showModal = false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-5 overflow-hidden">
          <div class="modal-header border-0 px-4 pt-4 pb-0">
            <h2 class="h4 fw-bold mb-0">Criar Alerta Especial</h2>
            <button type="button" class="btn btn-light rounded-circle" @click="showModal = false">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="modal-body p-4">
            <form @submit.prevent="handleSubmit">
              <div class="mb-3">
                <label class="form-label fw-semibold">Título</label>
                <input v-model="form.title" type="text" class="form-control rounded-4" required placeholder="Ex: Manutenção na Base">
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold">Mensagem</label>
                <textarea v-model="form.message" class="form-control rounded-4" rows="4" required placeholder="Digite o conteúdo do alerta..."></textarea>
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold">Tom do Alerta</label>
                <select v-model="form.tone" class="form-select rounded-4">
                  <option value="info">Informativo (Azul)</option>
                  <option value="warning">Aviso (Amarelo)</option>
                  <option value="danger">Crítico (Vermelho)</option>
                  <option value="success">Sucesso (Verde)</option>
                </select>
              </div>
              <div class="d-grid gap-2">
                <button type="submit" class="btn btn-primary rounded-pill py-3 fw-bold" :disabled="loading">
                  <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                  Enviar para Todos
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import DataTable from "../components/DataTable.vue";
import { api } from "../services/api";
import { notifyError, notifySuccess } from "../services/ui";

const showModal = ref(false);
const loading = ref(false);
const notifications = ref<any[]>([]);

const form = ref({
  title: "Aviso Brasil Express",
  message: "",
  tone: "info"
});

const columns = [
  { title: "Data", field: "created_at", formatter: (cell: any) => cell.getValue()?.slice(0, 10) },
  { title: "Tipo", field: "type" },
  { title: "Título", field: "title" },
  { title: "Mensagem", field: "message" },
  { title: "Status", field: "read_at", formatter: (cell: any) => cell.getValue() ? "Lida" : "Pendente" }
];

async function loadNotifications() {
  try {
    const response = await api.notifications();
    notifications.value = response.data.filter((n: any) => n.type === "SPECIAL_ALERT");
  } catch (error) {
    notifyError(error);
  }
}

async function handleSubmit() {
  loading.value = ref(true);
  try {
    // Como não temos um endpoint direto para criar notificação "special", 
    // vou sugerir o uso de um tipo que o sistema já reconhece ou criar um mock
    // Mas para isso funcionar de verdade, preciso adicionar a rota no back-end.
    // Vou disparar para o servidor via um endpoint genérico se disponível.
    
    // Por enquanto, vamos simular que o servidor aceita via uma nova rota que vou criar
    await api.request("/api/notifications/special", {
      method: "POST",
      body: JSON.stringify({
        ...form.value,
        type: "SPECIAL_ALERT",
        ruleKey: `SPECIAL:${Date.now()}`
      })
    });

    notifySuccess("Alerta enviado com sucesso!");
    showModal.value = false;
    form.value.message = "";
    await loadNotifications();
  } catch (error) {
    notifyError(error);
  } finally {
    loading.value = false;
  }
}

onMounted(loadNotifications);
</script>
