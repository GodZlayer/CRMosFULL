<template>
  <AppShell
    title="Tarefas"
    subtitle="Agenda operacional importada da aba Atual da tarefas.ods, organizada pela coluna A.">
    <template #actions>
      <div class="tasks-actions">
        <input
          v-model="search"
          class="form-control rounded-pill tasks-search"
          placeholder="Buscar por nome, telefone, aparelho, serviço ou OS"
        />
        <button class="btn btn-primary rounded-pill" @click="openCreateModal">
          <i class="fa-solid fa-plus me-2"></i>
          Nova tarefa
        </button>
      </div>
    </template>

    <section class="tasks-guide panel-card">
      <div class="tasks-guide__copy">
        <div class="tasks-guide__eyebrow">Importação oficial</div>
        <h2 class="tasks-guide__title">A coluna A é a guia da operação.</h2>
        <p class="tasks-guide__text">
          Cada tarefa entra pela aba <strong>Atual</strong> da <strong>tarefas.ods</strong> e é organizada por prazo
          ou fase real do serviço: hoje, próximos dias, pronto, cliente avisado, entregue ou pendência do Dênio.
        </p>
      </div>
      <div class="tasks-guide__legend">
        <div v-for="lane in visibleLaneDefinitions" :key="lane.key" class="tasks-guide__legend-item">
          <span class="tasks-guide__legend-dot" :class="`is-${lane.tone}`"></span>
          <div>
            <div class="tasks-guide__legend-label">{{ lane.label }}</div>
            <div class="tasks-guide__legend-help">{{ lane.help }}</div>
          </div>
        </div>
      </div>
    </section>

    <div class="row g-4 mb-4">
      <div class="col-md-6 col-xl-3">
        <MetricCard
          title="Total da agenda"
          :value="tasks.length"
          hint="Linhas ativas carregadas da aba Atual."
          icon="fa-solid fa-list-check"
          tone="primary"
        />
      </div>
      <div class="col-md-6 col-xl-3">
        <MetricCard
          title="Hoje"
          :value="laneCount('today')"
          hint="Tarefas para resolver no dia de hoje."
          icon="fa-solid fa-bolt"
          tone="danger"
        />
      </div>
      <div class="col-md-6 col-xl-3">
        <MetricCard
          title="Próximas"
          :value="laneCount('next-day') + laneCount('three-to-seven')"
          hint="Entregas previstas para 1 dia e para a faixa de 3 a 7 dias."
          icon="fa-solid fa-hourglass-half"
          tone="warning"
        />
      </div>
      <div class="col-md-6 col-xl-3">
        <MetricCard
          title="Pós-serviço"
          :value="laneCount('ready') + laneCount('notified') + laneCount('delivered')"
          hint="Pronto, cliente avisado e tarefas já entregues."
          icon="fa-solid fa-flag-checkered"
          tone="success"
        />
      </div>
    </div>

    <div class="tasks-board">
      <section
        v-for="lane in laneColumns"
        :key="lane.key"
        class="tasks-lane panel-card"
        @dragover.prevent
        @drop="handleDrop(lane)">
        <header class="tasks-lane__header">
          <div>
            <div class="tasks-lane__eyebrow">{{ lane.eyebrow }}</div>
            <h3 class="tasks-lane__title">{{ lane.label }}</h3>
            <p class="tasks-lane__help">{{ lane.help }}</p>
          </div>
          <span class="tasks-lane__count" :class="`is-${lane.tone}`">{{ lane.tasks.length }}</span>
        </header>

        <div v-if="!lane.tasks.length" class="tasks-lane__empty">
          Nenhuma tarefa nessa faixa agora.
        </div>

        <article
          v-for="task in lane.tasks"
          :key="task.id"
          class="task-card"
          draggable="true"
          @dragstart="startDrag(task.id)"
          @click="openTask(task.id)">
          <div class="task-card__top">
            <div class="task-card__heading">
              <div class="task-card__title">{{ displayTaskName(task) }}</div>
              <div class="task-card__service">{{ task.description || "Sem descrição informada." }}</div>
            </div>
            <span v-if="task.order_code" class="task-card__order">{{ task.order_code }}</span>
          </div>

          <div class="task-card__meta">
            <span v-if="task.phone" class="task-card__chip"><i class="fa-solid fa-phone"></i>{{ task.phone }}</span>
            <span v-if="task.device" class="task-card__chip"><i class="fa-solid fa-laptop"></i>{{ task.device }}</span>
            <span v-if="taskValue(task)" class="task-card__chip"><i class="fa-solid fa-money-bill-wave"></i>{{ taskValue(task) }}</span>
            <span v-if="task.responsible_name" class="task-card__chip"><i class="fa-solid fa-user"></i>{{ task.responsible_name }}</span>
          </div>

          <div v-if="task.notes" class="task-card__notes">
            {{ task.notes }}
          </div>

          <div class="task-card__footer">
            <span class="task-card__queue">{{ lane.label }}</span>
            <span class="task-card__status">{{ task.legacy_status_label || lane.help }}</span>
          </div>
        </article>
      </section>
    </div>

    <ModalDialog v-model="showModal" title="Detalhe da tarefa" eyebrow="tarefas.ods / Atual" size="xl">
      <div class="row g-4">
        <div class="col-xl-7">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-semibold">Guia da coluna A</label>
              <select v-model="taskForm.legacy_queue_code" class="form-select rounded-4">
                <option value="">Sem guia</option>
                <option v-for="lane in editableLaneDefinitions" :key="lane.key" :value="lane.input">
                  {{ lane.label }}
                </option>
              </select>
              <div class="form-text">{{ resolvedLane.help }}</div>
            </div>

            <div class="col-md-6">
              <label class="form-label fw-semibold">Status calculado</label>
              <input :value="resolvedLane.statusLabel" class="form-control rounded-4" disabled />
            </div>

            <div class="col-md-7">
              <label class="form-label fw-semibold">Nome / objetivo</label>
              <input v-model="taskForm.client_name" class="form-control rounded-4" />
            </div>

            <div class="col-md-5">
              <label class="form-label fw-semibold">OS vinculada</label>
              <select v-model.number="taskForm.order_id" class="form-select rounded-4">
                <option :value="0">Sem vínculo</option>
                <option v-for="order in orders" :key="order.id" :value="order.id">
                  {{ order.code }} | {{ order.client_name }}
                </option>
              </select>
            </div>

            <div class="col-md-4">
              <label class="form-label fw-semibold">Telefone / contato</label>
              <input v-model="taskForm.phone" class="form-control rounded-4" />
            </div>

            <div class="col-md-4">
              <label class="form-label fw-semibold">Valor / expectativa</label>
              <input
                v-model="taskForm.value_label"
                class="form-control rounded-4"
                placeholder="Ex.: até 500, vários, 430"
              />
            </div>

            <div class="col-md-4">
              <label class="form-label fw-semibold">Responsável</label>
              <input v-model="taskForm.responsible_name" class="form-control rounded-4" />
            </div>

            <div class="col-12">
              <label class="form-label fw-semibold">Dispositivo</label>
              <input v-model="taskForm.device" class="form-control rounded-4" />
            </div>

            <div class="col-12">
              <label class="form-label fw-semibold">Serviço</label>
              <textarea v-model="taskForm.description" rows="4" class="form-control rounded-4"></textarea>
            </div>

            <div class="col-12">
              <label class="form-label fw-semibold">Observações internas</label>
              <textarea
                v-model="taskForm.notes"
                rows="3"
                class="form-control rounded-4"
                placeholder="Use aqui para resumir atualizações antigas, detalhes ou contexto."></textarea>
            </div>
          </div>
        </div>

        <div class="col-xl-5">
          <div class="panel-card tasks-history">
            <div class="tasks-history__eyebrow">Atualizações</div>
            <h3 class="tasks-history__title">Histórico da tarefa</h3>

            <div class="tasks-history__list">
              <div v-for="item in taskUpdates" :key="item.id" class="tasks-history__item">
                <div class="tasks-history__meta">
                  {{ item.actor_name }} · {{ item.created_at.replace("T", " ").slice(0, 16) }}
                </div>
                <div>{{ item.message }}</div>
              </div>
              <div v-if="!taskUpdates.length" class="tasks-history__empty">
                Nenhuma atualização registrada ainda.
              </div>
            </div>

            <label class="form-label fw-semibold mt-3">Nova atualização</label>
            <textarea
              v-model="newUpdateMessage"
              rows="4"
              class="form-control rounded-4"
              placeholder="Descreva o andamento real da tarefa."></textarea>

            <div class="d-flex flex-wrap justify-content-between gap-2 mt-3">
              <button class="btn btn-outline-secondary rounded-pill" @click="saveTaskRecord">
                <i class="fa-solid fa-floppy-disk me-2"></i>
                Salvar tarefa
              </button>

              <div class="d-flex gap-2">
                <button
                  v-if="taskForm.id"
                  class="btn btn-outline-danger rounded-pill"
                  @click="removeTaskRecord">
                  <i class="fa-solid fa-trash me-2"></i>
                  Excluir
                </button>
                <button
                  class="btn btn-primary rounded-pill"
                  :disabled="!taskForm.id || !newUpdateMessage.trim()"
                  @click="saveUpdate">
                  <i class="fa-solid fa-comment-medical me-2"></i>
                  Registrar atualização
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalDialog>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import AppShell from "../components/AppShell.vue";
import MetricCard from "../components/MetricCard.vue";
import ModalDialog from "../components/ModalDialog.vue";
import { api } from "../services/api";
import { currency } from "../services/format";
import type { DailyTask, DailyTaskUpdate, OrderSummary } from "../services/types";
import { notifyError, notifySuccess } from "../services/ui";

type LaneDefinition = {
  key: string;
  input: string;
  label: string;
  statusLabel: string;
  help: string;
  tone: string;
  eyebrow: string;
};

const LANE_DEFINITIONS: LaneDefinition[] = [
  {
    key: "today",
    input: "0 HJ",
    label: "Hoje",
    statusLabel: "Para resolver hoje",
    help: "Tarefas que precisam ser tocadas no dia de hoje.",
    tone: "danger",
    eyebrow: "0 HJ"
  },
  {
    key: "next-day",
    input: "1 dia",
    label: "1 dia",
    statusLabel: "Entrega no próximo dia",
    help: "Tarefas com promessa curta, para o próximo dia.",
    tone: "warning",
    eyebrow: "1 dia"
  },
  {
    key: "three-to-seven",
    input: "3 < 7d",
    label: "3 < 7 dias",
    statusLabel: "Entrega em até 7 dias",
    help: "Pendências com prazo de alguns dias, sem urgência imediata.",
    tone: "info",
    eyebrow: "3 < 7d"
  },
  {
    key: "ready",
    input: "5 Pron",
    label: "Pronto",
    statusLabel: "Serviço pronto, cliente não avisado",
    help: "O serviço terminou, mas ainda falta avisar o cliente.",
    tone: "primary",
    eyebrow: "5 Pron"
  },
  {
    key: "notified",
    input: "6 Agu",
    label: "Aguardando",
    statusLabel: "Aguardando",
    help: "Aguardando retirada, resposta do cliente ou definição para seguir.",
    tone: "secondary",
    eyebrow: "6 Agu"
  },
  {
    key: "delivered",
    input: "7 Ent",
    label: "Entregue",
    statusLabel: "Tarefa realizada",
    help: "Serviço ou tarefa concluída.",
    tone: "success",
    eyebrow: "7 Ent"
  },
  {
    key: "denio",
    input: "8 Denio",
    label: "Dênio",
    statusLabel: "Pendência separada para Dênio",
    help: "Fila especial das tarefas que ficaram na alçada do Dênio.",
    tone: "dark",
    eyebrow: "8 Denio"
  },
  {
    key: "unguided",
    input: "",
    label: "Sem guia",
    statusLabel: "Sem coluna A",
    help: "Tarefas criadas direto no CRM, sem código vindo da coluna A.",
    tone: "secondary",
    eyebrow: "CRM"
  }
];

const search = ref("");
const tasks = ref<DailyTask[]>([]);
const orders = ref<OrderSummary[]>([]);
const showModal = ref(false);
const taskUpdates = ref<DailyTaskUpdate[]>([]);
const newUpdateMessage = ref("");
const dragTaskId = ref<number | null>(null);

const taskForm = reactive(createEmptyTaskForm());

const visibleLaneDefinitions = computed(() => LANE_DEFINITIONS.filter((lane) => lane.key !== "unguided"));
const editableLaneDefinitions = computed(() => LANE_DEFINITIONS.filter((lane) => lane.input));
const laneColumns = computed(() =>
  LANE_DEFINITIONS.map((lane) => ({
    ...lane,
    tasks: tasks.value.filter((task) => resolveLane(task.legacy_queue_code).key === lane.key)
  }))
);
const resolvedLane = computed(() => resolveLane(taskForm.legacy_queue_code));

function createEmptyTaskForm() {
  return {
    id: 0,
    order_id: 0,
    client_name: "",
    phone: "",
    value_label: "",
    device: "",
    description: "",
    responsible_name: "",
    notes: "",
    legacy_queue_code: "0 HJ"
  };
}

function normalizeLegacyText(value = "") {
  return String(value ?? "").trim();
}

function decodeLegacyText(value = "") {
  return normalizeLegacyText(value)
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function legacySlug(value = "") {
  return decodeLegacyText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveLane(code = "") {
  const raw = decodeLegacyText(code);
  const slug = legacySlug(raw);

  if (!raw) {
    return LANE_DEFINITIONS.find((lane) => lane.key === "unguided")!;
  }
  if (/^0\b/.test(raw) || slug.includes("hj")) {
    return LANE_DEFINITIONS.find((lane) => lane.key === "today")!;
  }
  if (/^1\b/.test(raw)) {
    return LANE_DEFINITIONS.find((lane) => lane.key === "next-day")!;
  }
  if (/^3\b/.test(raw) || slug.includes("7d")) {
    return LANE_DEFINITIONS.find((lane) => lane.key === "three-to-seven")!;
  }
  if (slug.includes("pron")) {
    return LANE_DEFINITIONS.find((lane) => lane.key === "ready")!;
  }
  if (slug.includes("agu")) {
    return LANE_DEFINITIONS.find((lane) => lane.key === "notified")!;
  }
  if (slug.includes("ent")) {
    return LANE_DEFINITIONS.find((lane) => lane.key === "delivered")!;
  }
  if (slug.includes("denio")) {
    return LANE_DEFINITIONS.find((lane) => lane.key === "denio")!;
  }
  return LANE_DEFINITIONS.find((lane) => lane.key === "unguided")!;
}

function laneCount(key: string) {
  return laneColumns.value.find((lane) => lane.key === key)?.tasks.length || 0;
}

function displayTaskName(task: DailyTask) {
  return task.client_name || task.title || "Sem nome";
}

function taskValue(task: DailyTask) {
  if (task.value_label) {
    return task.value_label;
  }
  if (task.value_amount !== null && task.value_amount !== undefined) {
    return currency(task.value_amount);
  }
  return "";
}

function buildTaskTitle() {
  const objective = normalizeLegacyText(taskForm.client_name);
  if (objective) {
    return objective;
  }
  const description = normalizeLegacyText(taskForm.description);
  if (!description) {
    return "Tarefa sem título";
  }
  return description.length > 72 ? `${description.slice(0, 69)}...` : description;
}

async function loadTasks() {
  try {
    const tasksResponse = await api.tasks({ search: search.value });
    tasks.value = tasksResponse.data;
  } catch (error) {
    await notifyError(error);
  }
}

async function loadOrders() {
  try {
    const response = await api.orders({});
    orders.value = response.data;
  } catch (error) {
    await notifyError(error);
  }
}

function openCreateModal() {
  Object.assign(taskForm, createEmptyTaskForm());
  taskUpdates.value = [];
  newUpdateMessage.value = "";
  showModal.value = true;
}

async function openTask(taskId: number) {
  try {
    const response = await api.task(taskId);
    Object.assign(taskForm, {
      ...createEmptyTaskForm(),
      id: response.data.id,
      order_id: response.data.order_id || 0,
      client_name: response.data.client_name || response.data.title || "",
      phone: response.data.phone || "",
      value_label: response.data.value_label || (response.data.value_amount ?? "") || "",
      device: response.data.device || "",
      description: response.data.description || "",
      responsible_name: response.data.responsible_name || "",
      notes: response.data.notes || "",
      legacy_queue_code: response.data.legacy_queue_code || ""
    });
    taskUpdates.value = response.data.updates || [];
    newUpdateMessage.value = "";
    showModal.value = true;
  } catch (error) {
    await notifyError(error);
  }
}

async function saveTaskRecord() {
  try {
    const response = await api.saveTask({
      id: Number(taskForm.id) || undefined,
      orderId: Number(taskForm.order_id) || null,
      title: buildTaskTitle(),
      clientName: taskForm.client_name,
      phone: taskForm.phone,
      valueLabel: taskForm.value_label,
      device: taskForm.device,
      description: taskForm.description,
      responsibleName: taskForm.responsible_name,
      notes: taskForm.notes,
      legacyQueueCode: taskForm.legacy_queue_code
    });

    Object.assign(taskForm, {
      ...createEmptyTaskForm(),
      id: response.data.id,
      order_id: response.data.order_id || 0,
      client_name: response.data.client_name || response.data.title || "",
      phone: response.data.phone || "",
      value_label: response.data.value_label || (response.data.value_amount ?? "") || "",
      device: response.data.device || "",
      description: response.data.description || "",
      responsible_name: response.data.responsible_name || "",
      notes: response.data.notes || "",
      legacy_queue_code: response.data.legacy_queue_code || ""
    });

    taskUpdates.value = response.data.updates || [];
    await loadTasks();
    await notifySuccess("Tarefa salva.");
  } catch (error) {
    await notifyError(error);
  }
}

async function saveUpdate() {
  try {
    const response = await api.saveTaskUpdate(Number(taskForm.id), { message: newUpdateMessage.value });
    taskUpdates.value = response.data.updates || [];
    newUpdateMessage.value = "";
    await loadTasks();
    await notifySuccess("Atualização registrada.");
  } catch (error) {
    await notifyError(error);
  }
}

async function removeTaskRecord() {
  try {
    await api.deleteTask(Number(taskForm.id));
    showModal.value = false;
    await loadTasks();
    await notifySuccess("Tarefa excluída.");
  } catch (error) {
    await notifyError(error);
  }
}

function startDrag(taskId: number) {
  dragTaskId.value = taskId;
}

async function handleDrop(lane: LaneDefinition) {
  if (!dragTaskId.value) {
    return;
  }

  try {
    const response = await api.task(dragTaskId.value);
    await api.saveTask({
      id: response.data.id,
      orderId: response.data.order_id,
      title: response.data.title,
      clientName: response.data.client_name,
      phone: response.data.phone,
      valueLabel: response.data.value_label || response.data.value_amount,
      device: response.data.device,
      description: response.data.description,
      responsibleName: lane.key === "denio" ? response.data.responsible_name || "Dênio" : response.data.responsible_name,
      notes: response.data.notes,
      legacyQueueCode: lane.input || ""
    });
    await loadTasks();
  } catch (error) {
    await notifyError(error);
  } finally {
    dragTaskId.value = null;
  }
}

watch(search, loadTasks);

onMounted(async () => {
  await Promise.all([loadTasks(), loadOrders()]);
});
</script>

<style scoped>
.tasks-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.tasks-search {
  width: min(420px, 100%);
}

.tasks-guide {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.tasks-guide__copy,
.tasks-guide__legend {
  display: grid;
  gap: 0.9rem;
}

.tasks-guide__eyebrow,
.tasks-lane__eyebrow,
.tasks-history__eyebrow {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.tasks-guide__title,
.tasks-history__title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-primary);
}

.tasks-guide__text {
  margin: 0;
  max-width: 60rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.tasks-guide__legend-item {
  display: grid;
  grid-template-columns: 14px 1fr;
  gap: 0.85rem;
  align-items: start;
}

.tasks-guide__legend-dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  margin-top: 0.3rem;
  background: color-mix(in srgb, var(--brand-primary) 20%, transparent);
}

.tasks-guide__legend-dot.is-danger {
  background: #d95165;
}

.tasks-guide__legend-dot.is-warning {
  background: #e6ad39;
}

.tasks-guide__legend-dot.is-info {
  background: #31c4d5;
}

.tasks-guide__legend-dot.is-primary {
  background: #2f6fd6;
}

.tasks-guide__legend-dot.is-secondary {
  background: #71839f;
}

.tasks-guide__legend-dot.is-success {
  background: #169873;
}

.tasks-guide__legend-dot.is-dark {
  background: #10233f;
}

.tasks-guide__legend-label {
  font-weight: 800;
  color: var(--text-primary);
}

.tasks-guide__legend-help,
.tasks-lane__help {
  color: var(--text-muted);
  line-height: 1.5;
}

.tasks-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}

.tasks-lane {
  display: grid;
  gap: 0.9rem;
  align-content: start;
  min-height: 420px;
}

.tasks-lane__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
}

.tasks-lane__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-primary);
}

.tasks-lane__count {
  min-width: 2.3rem;
  height: 2.3rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  color: var(--text-primary);
}

.tasks-lane__count.is-danger {
  background: #d951651a;
  color: #b93346;
}

.tasks-lane__count.is-warning {
  background: #e6ad391f;
  color: #9c6b00;
}

.tasks-lane__count.is-info {
  background: #31c4d51a;
  color: #0c7280;
}

.tasks-lane__count.is-primary {
  background: #2f6fd61a;
  color: #1f56af;
}

.tasks-lane__count.is-secondary {
  background: #71839f1a;
  color: #53667f;
}

.tasks-lane__count.is-success {
  background: #1698731a;
  color: #0d6d52;
}

.tasks-lane__count.is-dark {
  background: #10233f1a;
  color: #10233f;
}

.tasks-lane__empty {
  border: 1px dashed var(--border-soft);
  border-radius: 1rem;
  padding: 1rem;
  color: var(--text-muted);
  text-align: center;
}

.task-card {
  display: grid;
  gap: 0.7rem;
  padding: 0.9rem;
  border-radius: 1rem;
  border: 1px solid var(--border-soft);
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  overflow: hidden;
}

.task-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--brand-primary) 28%, var(--border-soft));
  box-shadow: 0 12px 28px color-mix(in srgb, var(--shadow-color) 70%, transparent);
}

.task-card__top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: start;
}

.task-card__heading {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}

.task-card__title {
  font-weight: 800;
  line-height: 1.25;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.task-card__service {
  color: var(--text-muted);
  line-height: 1.45;
  font-size: 0.92rem;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.task-card__order {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-accent) 14%, transparent);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 800;
}

.task-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.task-card__chip {
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.58rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-base) 74%, var(--surface-elevated));
  color: var(--text-muted);
  font-size: 0.78rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.task-card__chip i {
  flex: 0 0 auto;
}

.task-card__notes {
  padding: 0.65rem 0.75rem;
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--surface-base) 72%, var(--surface-elevated));
  color: var(--text-primary);
  line-height: 1.4;
  font-size: 0.84rem;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.task-card__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.45rem 0.75rem;
  font-size: 0.78rem;
}

.task-card__queue {
  font-weight: 800;
  color: var(--text-primary);
}

.task-card__status {
  color: var(--text-muted);
}

.tasks-history {
  height: 100%;
}

.tasks-history__list {
  display: grid;
  gap: 0.85rem;
}

.tasks-history__item {
  padding: 0.85rem 0.95rem;
  border-radius: 1rem;
  border: 1px solid var(--border-soft);
  background: color-mix(in srgb, var(--surface-base) 70%, var(--surface-elevated));
  color: var(--text-primary);
}

.tasks-history__meta {
  margin-bottom: 0.35rem;
  color: var(--text-muted);
  font-size: 0.84rem;
}

.tasks-history__empty {
  border: 1px dashed var(--border-soft);
  border-radius: 1rem;
  padding: 1rem;
  color: var(--text-muted);
}

:global(:root[data-theme="dark"]) .tasks-guide__legend-dot.is-dark,
:global(:root[data-theme="dark"]) .tasks-lane__count.is-dark {
  background: #dce7f8;
  color: #09111d;
}

:global(:root[data-theme="dark"]) .task-card__order {
  background: #31c4d522;
  color: #eef6ff;
}

:global(:root[data-theme="dark"]) .tasks-lane__count.is-danger {
  color: #ffd6dd;
}

:global(:root[data-theme="dark"]) .tasks-lane__count.is-warning {
  color: #ffe7b2;
}

:global(:root[data-theme="dark"]) .tasks-lane__count.is-info {
  color: #b8f3fb;
}

:global(:root[data-theme="dark"]) .tasks-lane__count.is-primary {
  color: #c9dcff;
}

:global(:root[data-theme="dark"]) .tasks-lane__count.is-secondary {
  color: #d4dceb;
}

:global(:root[data-theme="dark"]) .tasks-lane__count.is-success {
  color: #c9ffe7;
}

@media (max-width: 991.98px) {
  .tasks-guide {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767.98px) {
  .tasks-actions {
    width: 100%;
  }

  .tasks-search {
    width: 100%;
  }
}
</style>
