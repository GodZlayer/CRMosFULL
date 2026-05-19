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

    <section class="tasks-hero panel-card">
      <div class="tasks-hero__copy">
        <div class="tasks-hero__eyebrow">Importação oficial</div>
        <h2 class="tasks-hero__title">Uma fila, dois momentos: trabalho ativo e fechamento.</h2>
        <p class="tasks-hero__text">
          A aba <strong>Atual</strong> da <strong>tarefas.ods</strong> entra aqui sem ruído. As faixas urgentes ficam
          separadas das faixas de conclusão para você bater o olho e agir mais rápido.
        </p>
      </div>
      <div class="tasks-hero__tips">
        <div class="tasks-hero__tip">
          <i class="fa-solid fa-hand-pointer"></i>
          Clique uma vez para expandir, clique de novo para editar.
        </div>
        <div class="tasks-hero__tip">
          <i class="fa-solid fa-arrow-right-arrow-left"></i>
          Arraste um cartão para mudar a faixa.
        </div>
        <div class="tasks-hero__tip">
          <i class="fa-solid fa-filter"></i>
          Use a busca para reduzir o volume antes de abrir detalhes.
        </div>
      </div>
    </section>

    <div class="row g-4 mb-4 tasks-metrics">
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

    <div class="tasks-board-sections">
      <section class="tasks-board-group">
        <div class="tasks-board-group__header">
          <div class="tasks-board-group__copy">
            <div class="tasks-board-group__eyebrow">Trabalho ativo</div>
            <h3 class="tasks-board-group__title">O que exige decisão hoje</h3>
            <p class="tasks-board-group__text">
              Prioriza urgência e fila aberta. Aqui entram as tarefas que precisam de movimento antes do fechamento.
            </p>
          </div>
          <div class="tasks-board-group__meta">
            <span class="tasks-board-group__meta-pill">Hoje {{ laneCount("today") }}</span>
            <span class="tasks-board-group__meta-pill">1 dia {{ laneCount("next-day") }}</span>
            <span class="tasks-board-group__meta-pill">3 a 7 dias {{ laneCount("three-to-seven") }}</span>
          </div>
        </div>
        <div class="tasks-board">
          <section
            v-for="lane in activeLaneColumns"
            :key="lane.key"
            class="tasks-lane panel-card"
            :class="{ 'is-expanded': isLaneExpanded(lane.key) }"
            @dragover.prevent
            @drop="handleDrop(lane)">
            <header class="tasks-lane__header" @click="toggleLane(lane.key)">
              <div>
                <div class="tasks-lane__eyebrow">{{ lane.eyebrow }}</div>
                <h4 class="tasks-lane__title">{{ lane.label }}</h4>
                <p class="tasks-lane__help">{{ lane.help }}</p>
              </div>
              <div class="tasks-lane__header-side">
                <span class="tasks-lane__count" :class="`is-${lane.tone}`">{{ lane.tasks.length }}</span>
                <button type="button" class="tasks-lane__toggle" :aria-expanded="isLaneExpanded(lane.key)">
                  <i class="fa-solid fa-chevron-down"></i>
                </button>
              </div>
            </header>

            <div v-if="isLaneExpanded(lane.key)" class="tasks-lane__body">
              <div v-if="!lane.tasks.length" class="tasks-lane__empty">
                Nenhuma tarefa nessa faixa agora.
              </div>

              <article
                v-for="task in lane.tasks"
                :key="task.id"
                class="task-card"
                :class="{ 'is-expanded': isTaskExpanded(task.id) }"
                draggable="true"
                @dragstart="startDrag(task.id)"
                @click.stop="handleTaskCardClick(task.id)">
                <div class="task-card__compact-row">
                  <div class="task-card__compact-main">
                    <div class="task-card__title">{{ displayTaskName(task) }}</div>
                    <span class="task-card__compact-status">{{ task.legacy_status_label || lane.label }}</span>
                  </div>
                  <span v-if="task.order_code" class="task-card__order">{{ task.order_code }}</span>
                </div>

                <template v-if="isTaskExpanded(task.id)">
                  <div class="task-card__top">
                    <div class="task-card__heading">
                      <div class="task-card__service">{{ task.description || "Sem descrição informada." }}</div>
                    </div>
                  </div>

                  <div class="task-card__meta">
                    <span v-if="task.phone" class="task-card__chip"><i class="fa-solid fa-phone"></i>{{ task.phone }}</span>
                    <span v-if="task.device" class="task-card__chip"><i class="fa-solid fa-laptop"></i>{{ task.device }}</span>
                    <span v-if="taskValue(task)" class="task-card__chip"><i class="fa-solid fa-money-bill-wave"></i>{{ taskValue(task) }}</span>
                    <span v-if="task.responsible_name" class="task-card__chip"><i class="fa-solid fa-user"></i>{{ task.responsible_name }}</span>
                  </div>

                  <div v-if="taskSummary(task)" class="task-card__notes">
                    {{ taskSummary(task) }}
                  </div>

                  <div class="task-card__footer">
                    <span class="task-card__queue">{{ lane.label }}</span>
                    <span class="task-card__status">{{ task.legacy_status_label || lane.help }}</span>
                  </div>
                </template>
              </article>
            </div>
          </section>
        </div>
      </section>

      <section class="tasks-board-group tasks-board-group--secondary">
        <div class="tasks-board-group__header">
          <div class="tasks-board-group__copy">
            <div class="tasks-board-group__eyebrow">Fechamento</div>
            <h3 class="tasks-board-group__title">O que já passou pela bancada</h3>
            <p class="tasks-board-group__text">
              Faz a leitura do andamento final sem misturar com o fluxo do dia. É a visão para dar baixa e acompanhar
              pendências de entrega.
            </p>
          </div>
          <div class="tasks-board-group__meta">
            <span class="tasks-board-group__meta-pill">Pronto {{ laneCount("ready") }}</span>
            <span class="tasks-board-group__meta-pill">Aguardando {{ laneCount("notified") }}</span>
            <span class="tasks-board-group__meta-pill">Entregue {{ laneCount("delivered") }}</span>
            <span class="tasks-board-group__meta-pill">Dênio {{ laneCount("denio") }}</span>
          </div>
        </div>

        <div class="tasks-board">
          <section
            v-for="lane in closedLaneColumns"
            :key="lane.key"
            class="tasks-lane panel-card"
            :class="{ 'is-expanded': isLaneExpanded(lane.key) }"
            @dragover.prevent
            @drop="handleDrop(lane)">
            <header class="tasks-lane__header" @click="toggleLane(lane.key)">
              <div>
                <div class="tasks-lane__eyebrow">{{ lane.eyebrow }}</div>
                <h4 class="tasks-lane__title">{{ lane.label }}</h4>
                <p class="tasks-lane__help">{{ lane.help }}</p>
              </div>
              <div class="tasks-lane__header-side">
                <span class="tasks-lane__count" :class="`is-${lane.tone}`">{{ lane.tasks.length }}</span>
                <button type="button" class="tasks-lane__toggle" :aria-expanded="isLaneExpanded(lane.key)">
                  <i class="fa-solid fa-chevron-down"></i>
                </button>
              </div>
            </header>

            <div v-if="isLaneExpanded(lane.key)" class="tasks-lane__body">
              <div v-if="!lane.tasks.length" class="tasks-lane__empty">
                Nenhuma tarefa nessa faixa agora.
              </div>

              <article
                v-for="task in lane.tasks"
                :key="task.id"
                class="task-card"
                :class="{ 'is-expanded': isTaskExpanded(task.id) }"
                draggable="true"
                @dragstart="startDrag(task.id)"
                @click.stop="handleTaskCardClick(task.id)">
                <div class="task-card__compact-row">
                  <div class="task-card__compact-main">
                    <div class="task-card__title">{{ displayTaskName(task) }}</div>
                    <span class="task-card__compact-status">{{ task.legacy_status_label || lane.label }}</span>
                  </div>
                  <span v-if="task.order_code" class="task-card__order">{{ task.order_code }}</span>
                </div>

                <template v-if="isTaskExpanded(task.id)">
                  <div class="task-card__top">
                    <div class="task-card__heading">
                      <div class="task-card__service">{{ task.description || "Sem descrição informada." }}</div>
                    </div>
                  </div>

                  <div class="task-card__meta">
                    <span v-if="task.phone" class="task-card__chip"><i class="fa-solid fa-phone"></i>{{ task.phone }}</span>
                    <span v-if="task.device" class="task-card__chip"><i class="fa-solid fa-laptop"></i>{{ task.device }}</span>
                    <span v-if="taskValue(task)" class="task-card__chip"><i class="fa-solid fa-money-bill-wave"></i>{{ taskValue(task) }}</span>
                    <span v-if="task.responsible_name" class="task-card__chip"><i class="fa-solid fa-user"></i>{{ task.responsible_name }}</span>
                  </div>

                  <div v-if="taskSummary(task)" class="task-card__notes">
                    {{ taskSummary(task) }}
                  </div>

                  <div class="task-card__footer">
                    <span class="task-card__queue">{{ lane.label }}</span>
                    <span class="task-card__status">{{ task.legacy_status_label || lane.help }}</span>
                  </div>
                </template>
              </article>
            </div>
          </section>
        </div>
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

            <div v-if="taskForm.id" class="col-12">
              <div class="panel-card task-purchase-panel">
                <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
                  <div>
                    <div class="small fw-semibold">OS e compra</div>
                    <div class="fw-bold">{{ taskForm.order_id ? "OS vinculada" : "Criar OS pela tarefa" }}</div>
                    <div class="small">Use a tarefa para abrir uma OS e registrar itens que precisam ser comprados.</div>
                  </div>
                  <button type="button" class="btn btn-outline-primary rounded-pill" @click="createOrderForTask">
                    <i class="fa-solid fa-file-circle-plus me-2"></i>
                    {{ taskForm.order_id ? "Abrir OS vinculada" : "Criar OS" }}
                  </button>
                </div>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label fw-semibold">Item para comprar</label>
                    <input v-model="purchaseForm.productName" class="form-control rounded-4" placeholder="Ex.: Tela 15.6 30 pinos" />
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">Quantidade</label>
                    <input v-model.number="purchaseForm.quantity" type="number" min="1" class="form-control rounded-4" />
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">Venda unidade</label>
                    <input v-model.number="purchaseForm.salePrice" type="number" min="0" step="0.01" class="form-control rounded-4" />
                  </div>
                  <div class="col-12 d-flex justify-content-end">
                    <button type="button" class="btn btn-primary rounded-pill" :disabled="!purchaseForm.productName.trim()" @click="addPurchaseItemFromTask">
                      <i class="fa-solid fa-cart-plus me-2"></i>
                      Adicionar para compra
                    </button>
                  </div>
                </div>
              </div>
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
import { useRouter } from "vue-router";
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
const expandedLaneKeys = ref<string[]>([]);
const expandedTaskIds = ref<number[]>([]);
const activeModalTaskId = ref<number | null>(null);
const router = useRouter();

const taskForm = reactive(createEmptyTaskForm());
const purchaseForm = reactive({
  productName: "",
  quantity: 1,
  salePrice: 0
});

const editableLaneDefinitions = computed(() => LANE_DEFINITIONS.filter((lane) => lane.input));
const laneColumns = computed(() =>
  LANE_DEFINITIONS.map((lane) => ({
    ...lane,
    tasks: tasks.value.filter((task) => resolveLane(task.legacy_queue_code).key === lane.key)
  }))
);
const activeLaneColumns = computed(() =>
  laneColumns.value.filter((lane) => ["today", "next-day", "three-to-seven", "unguided"].includes(lane.key))
);
const closedLaneColumns = computed(() =>
  laneColumns.value.filter((lane) => ["ready", "notified", "delivered", "denio"].includes(lane.key))
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

function taskSummary(task: DailyTask) {
  const parts = [task.description, task.notes].map((value) => normalizeLegacyText(value || "")).filter(Boolean);
  const summary = parts.join(" • ");
  if (!summary) {
    return "";
  }
  return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
}

function isLaneExpanded(laneKey: string) {
  return expandedLaneKeys.value.includes(laneKey);
}

function toggleLane(laneKey: string) {
  if (isLaneExpanded(laneKey)) {
    expandedLaneKeys.value = expandedLaneKeys.value.filter((key) => key !== laneKey);
    const laneTaskIds = laneColumns.value.find((lane) => lane.key === laneKey)?.tasks.map((task) => task.id) || [];
    expandedTaskIds.value = expandedTaskIds.value.filter((taskId) => !laneTaskIds.includes(taskId));
    return;
  }
  expandedLaneKeys.value = [...expandedLaneKeys.value, laneKey];
}

function isTaskExpanded(taskId: number) {
  return expandedTaskIds.value.includes(taskId);
}

function collapseTask(taskId: number) {
  expandedTaskIds.value = expandedTaskIds.value.filter((id) => id !== taskId);
}

function expandTask(taskId: number) {
  if (!isTaskExpanded(taskId)) {
    expandedTaskIds.value = [...expandedTaskIds.value, taskId];
  }
}

function handleTaskCardClick(taskId: number) {
  if (!isTaskExpanded(taskId)) {
    expandTask(taskId);
    return;
  }
  void openTask(taskId);
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
  resetPurchaseForm();
  taskUpdates.value = [];
  newUpdateMessage.value = "";
  showModal.value = true;
}

function resetPurchaseForm() {
  Object.assign(purchaseForm, {
    productName: "",
    quantity: 1,
    salePrice: 0
  });
}

async function openTask(taskId: number) {
  try {
    activeModalTaskId.value = taskId;
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
    resetPurchaseForm();
    newUpdateMessage.value = "";
    showModal.value = true;
  } catch (error) {
    activeModalTaskId.value = null;
    await notifyError(error);
  }
}

async function createOrderForTask() {
  if (!taskForm.id) {
    await notifyError(new Error("Salve a tarefa antes de criar a OS."));
    return;
  }
  if (taskForm.order_id) {
    showModal.value = false;
    await router.push({ name: "os-detalhe", params: { id: String(taskForm.order_id) } });
    return;
  }
  showModal.value = false;
  await router.push({ name: "os", query: { createOrder: "1", sourceTaskId: String(taskForm.id) } });
}

async function addPurchaseItemFromTask() {
  if (!taskForm.id) {
    await notifyError(new Error("Salve a tarefa antes de adicionar item para compra."));
    return;
  }
  try {
    const response = await api.addTaskPurchaseItem(Number(taskForm.id), {
      productName: purchaseForm.productName,
      quantity: purchaseForm.quantity,
      salePrice: purchaseForm.salePrice
    });
    taskForm.order_id = Number(response.data.task.order_id || response.data.order.id || 0);
    taskUpdates.value = response.data.task.updates || taskUpdates.value;
    resetPurchaseForm();
    await Promise.all([loadTasks(), loadOrders()]);
    await notifySuccess("Item adicionado para compra.");
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
    activeModalTaskId.value = null;
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
watch(showModal, (visible) => {
  if (visible) {
    return;
  }
  if (activeModalTaskId.value) {
    collapseTask(activeModalTaskId.value);
  }
  activeModalTaskId.value = null;
});

onMounted(async () => {
  await Promise.all([loadTasks(), loadOrders()]);
  if (!expandedLaneKeys.value.length) {
    expandedLaneKeys.value = ["today", "next-day", "ready"];
  }
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

.tasks-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr);
  gap: 1.25rem;
  align-items: start;
  margin-bottom: 1.5rem;
}

.tasks-hero__copy,
.tasks-hero__tips {
  display: grid;
  gap: 0.85rem;
}

.tasks-hero__eyebrow,
.tasks-board-group__eyebrow,
.tasks-lane__eyebrow,
.tasks-history__eyebrow {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.tasks-hero__title,
.tasks-board-group__title,
.tasks-history__title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--text-primary);
}

.tasks-hero__text,
.tasks-board-group__text {
  margin: 0;
  max-width: 60rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.tasks-hero__tips {
  padding: 1rem;
  border-radius: 1.25rem;
  border: 1px solid var(--border-soft);
  background: color-mix(in srgb, var(--surface-base) 72%, var(--surface-elevated));
}

.tasks-hero__tip {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: var(--surface-elevated);
  border: 1px solid var(--border-soft);
  color: var(--text-primary);
  line-height: 1.45;
}

.tasks-hero__tip i {
  flex: 0 0 auto;
  color: var(--brand-primary);
  margin-top: 0.15rem;
}

.tasks-metrics {
  --bs-gutter-x: 1rem;
  --bs-gutter-y: 1rem;
}

.tasks-board-sections {
  display: grid;
  gap: 1.5rem;
}

.tasks-board-group {
  display: grid;
  gap: 1rem;
}

.tasks-board-group__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.tasks-board-group__copy {
  display: grid;
  gap: 0.45rem;
}

.tasks-board-group__meta {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.tasks-board-group__meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.34rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: color-mix(in srgb, var(--surface-elevated) 84%, var(--surface-base));
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.tasks-board-group--secondary .tasks-board-group__meta-pill {
  background: color-mix(in srgb, var(--surface-base) 76%, var(--surface-elevated));
}

.tasks-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.tasks-lane__help {
  color: var(--text-muted);
  line-height: 1.5;
}

.tasks-lane {
  display: grid;
  gap: 0.9rem;
  align-content: start;
  min-height: 0;
}

.tasks-lane__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
  cursor: pointer;
}

.tasks-lane__header-side {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.tasks-lane__toggle {
  width: 2.3rem;
  height: 2.3rem;
  border: 0;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--surface-base) 76%, var(--surface-elevated));
  color: var(--text-muted);
  transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease;
  pointer-events: none;
}

.tasks-lane.is-expanded .tasks-lane__toggle {
  transform: rotate(180deg);
  background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
  color: var(--text-primary);
}

.tasks-lane__body {
  display: grid;
  gap: 0.7rem;
}

.tasks-lane__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-primary);
}

.tasks-lane__count {
  min-width: 2.15rem;
  height: 2.15rem;
  padding: 0 0.65rem;
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
  gap: 0.65rem;
  padding: 0.78rem 0.86rem;
  border-radius: 1rem;
  border: 1px solid var(--border-soft);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated) 94%, transparent), color-mix(in srgb, var(--surface-base) 14%, transparent));
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  overflow: hidden;
  position: relative;
}

.task-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--brand-primary) 28%, var(--border-soft));
  box-shadow: 0 12px 28px color-mix(in srgb, var(--shadow-color) 70%, transparent);
}

.task-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 0.28rem;
  background: color-mix(in srgb, var(--brand-primary) 18%, transparent);
}

.tasks-lane:nth-child(1) .task-card::before {
  background: #d95165;
}

.tasks-lane:nth-child(2) .task-card::before {
  background: #e6ad39;
}

.tasks-lane:nth-child(3) .task-card::before {
  background: #31c4d5;
}

.tasks-lane:nth-child(4) .task-card::before {
  background: #71839f;
}

.tasks-board-group--secondary .tasks-lane:nth-child(1) .task-card::before {
  background: #2f6fd6;
}

.tasks-board-group--secondary .tasks-lane:nth-child(2) .task-card::before {
  background: #71839f;
}

.tasks-board-group--secondary .tasks-lane:nth-child(3) .task-card::before {
  background: #169873;
}

.tasks-board-group--secondary .tasks-lane:nth-child(4) .task-card::before {
  background: #10233f;
}

.task-card__compact-row,
.task-card__top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}

.task-card__compact-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.task-card__compact-status {
  flex: 0 0 auto;
  max-width: 12rem;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-base) 70%, var(--surface-elevated));
  color: var(--text-muted);
  font-size: 0.74rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-card__heading {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}

.task-card__title {
  font-weight: 800;
  line-height: 1.2;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.task-card:not(.is-expanded) .task-card__order {
  padding-block: 0.18rem;
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
  .tasks-hero {
    grid-template-columns: 1fr;
  }

  .tasks-board {
    grid-template-columns: 1fr;
  }

  .tasks-board-group__header {
    display: grid;
  }

  .tasks-board-group__meta {
    justify-content: flex-start;
  }
}

@media (max-width: 767.98px) {
  .tasks-actions {
    width: 100%;
  }

  .tasks-search {
    width: 100%;
  }

  .task-card__compact-main {
    display: grid;
    gap: 0.35rem;
  }

  .task-card__compact-status {
    max-width: 100%;
  }
}
</style>
