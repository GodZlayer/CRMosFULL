<template>
  <AppShell
    title="Dashboard executivo"
    subtitle="Resumo visual da operacao para enxergar financeiro, estoque, OS, PDV e tarefas sem mergulhar em tabelas.">
    <template #actions>
    </template>

    <div class="dashboard-view" :class="{ 'dashboard-view--dark': ui.resolvedTheme === 'dark' }">
      <section class="dashboard-hero hero-banner">
        <div class="dashboard-hero__stats">
          <article v-for="item in heroStats" :key="item.label" class="dashboard-hero-stat">
            <span class="dashboard-hero-stat__label">{{ item.label }}</span>
            <strong class="dashboard-hero-stat__value">{{ item.value }}</strong>
            <span class="dashboard-hero-stat__hint">{{ item.hint }}</span>
          </article>
          <span>
              <i class="fa-regular fa-clock"></i>
              Atualizado {{ generatedAtLabel }}
            </span>
        </div>
      </section>

      <div class="row g-4">
        <div class="col-md-6 col-xl-3" v-for="card in summaryCards" :key="card.title">
          <MetricCard v-bind="card" />
        </div>
      </div>

      <div class="row g-4">
        <div class="col-12 col-xl-5">
          <ChartCard
            title="Lucro potencial do estoque"
            eyebrow="Estoque"
            icon="fa-solid fa-chart-pie"
            summary="Cada fatia mostra a parte do lucro potencial que cada categoria pode entregar com o estoque atual."
            type="donut"
            :categories="stockProfitCategories"
            :series="stockProfitSeries"
            :height="340"
          />
        </div>
        <div class="col-12 col-xl-7">
          <ChartCard
            title="Fluxo de entradas"
            eyebrow="Financeiro"
            icon="fa-solid fa-chart-line"
            summary="Linha total de entradas, separando o que veio de ordens de servico e o que veio do PDV."
            type="line"
            :categories="trendCategories"
            :series="trendSeries"
            :height="340"
          />
        </div>
      </div>

      <div class="row g-4">
        <div class="col-md-6 col-xl-3">
          <ChartCard
            title="Fila de OS"
            eyebrow="Oficina"
            icon="fa-solid fa-screwdriver-wrench"
            summary="Panorama rapido dos status da fila operacional."
            type="donut"
            :categories="statusCategories"
            :series="statusSeries"
            :height="290"
          />
        </div>
        <div class="col-md-6 col-xl-3">
          <ChartCard
            title="Entradas por canal"
            eyebrow="OS x PDV"
            icon="fa-solid fa-arrows-split-up-and-left"
            summary="Mostra o peso relativo de oficina e venda direta no periodo."
            type="donut"
            :categories="channelCategories"
            :series="channelSeries"
            :height="290"
          />
        </div>
        <div class="col-md-6 col-xl-3">
          <ChartCard
            title="Tarefas do dia"
            eyebrow="Agenda"
            icon="fa-solid fa-list-check"
            summary="Distribuicao do quadro diario com pendencias antigas abertas."
            type="donut"
            :categories="taskCategories"
            :series="taskSeries"
            :height="290"
          />
        </div>
        <div class="col-md-6 col-xl-3">
          <ChartCard
            title="Aprovacao"
            eyebrow="Comercial"
            icon="fa-solid fa-stamp"
            summary="Leitura curta da etapa de aprovacao nas ordens."
            type="donut"
            :categories="approvalCategories"
            :series="approvalSeries"
            :height="290"
          />
        </div>
      </div>

      <div class="row g-4">
        <div class="col-12 col-xl-7">
          <section class="panel-card dashboard-insights">
            <div class="dashboard-section-head">
              <div class="dashboard-section-head__eyebrow">Leitura guiada</div>
              <h3 class="dashboard-section-head__title">Como interpretar o painel agora</h3>
            </div>

            <div class="dashboard-insights__grid">
              <article v-for="item in insightCards" :key="item.title" class="dashboard-insight-card">
                <div class="dashboard-insight-card__icon">
                  <i :class="item.icon"></i>
                </div>
                <div>
                  <h4 class="dashboard-insight-card__title">{{ item.title }}</h4>
                  <p class="dashboard-insight-card__text">{{ item.text }}</p>
                </div>
              </article>
            </div>
          </section>
        </div>

        <div class="col-12 col-xl-5">
          <section class="panel-card dashboard-attention">
            <div class="dashboard-section-head">
              <div class="dashboard-section-head__eyebrow">Foco imediato</div>
              <h3 class="dashboard-section-head__title">O que merece acao</h3>
            </div>

            <div v-if="attentionItems.length" class="dashboard-attention__list">
              <article
                v-for="item in attentionItems"
                :key="`${item.label}-${item.text}`"
                class="dashboard-attention__item"
                :class="`dashboard-attention__item--${item.tone}`">
                <span class="dashboard-attention__label">{{ item.label }}</span>
                <span class="dashboard-attention__text">{{ item.text }}</span>
              </article>
            </div>

            <div v-else class="dashboard-attention__empty">
              Sem alertas criticos neste momento. O painel esta limpo.
            </div>
          </section>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AppShell from "../components/AppShell.vue";
import ChartCard from "../components/ChartCard.vue";
import MetricCard from "../components/MetricCard.vue";
import { api } from "../services/api";
import { compactCurrency, currency, percentage } from "../services/format";
import { notifyError } from "../services/ui";
import { useSessionStore } from "../stores/session";
import { useUiStore } from "../stores/ui";
import type { CatalogItem, DailyTaskBoard, DashboardPayload, FinanceWorkbookPayload } from "../services/types";

type BreakdownRow = {
  label: string;
  value: number;
};

const session = useSessionStore();
const ui = useUiStore();
const payload = ref<DashboardPayload | null>(null);
const catalog = ref<CatalogItem[]>([]);
const taskBoard = ref<DailyTaskBoard | null>(null);
const financeWorkbook = ref<FinanceWorkbookPayload | null>(null);
const loading = ref(false);
const today = new Date().toISOString().slice(0, 10);

const generatedAtLabel = computed(() => {
  const value = String(payload.value?.generatedAt || "").trim();
  if (!value) {
    return "agora";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("pt-BR");
});

const officialCashValue = computed(() => {
  const currentBalance = financeWorkbook.value?.cashManagement?.currentBalance?.value;
  if (currentBalance !== null && currentBalance !== undefined) {
    return Number(currentBalance || 0);
  }
  return (financeWorkbook.value?.accounts || []).reduce((sum, item) => sum + Number(item.balance_amount || 0), 0);
});

const totalEntries = computed(() => Number(payload.value?.kpis.totalEntries ?? payload.value?.kpis.revenue ?? 0));
const expenses = computed(() => Number(payload.value?.kpis.expense || 0));
const margin = computed(() => Number(payload.value?.kpis.margin || 0));
const orderRevenue = computed(() => Number(payload.value?.kpis.orderRevenue || 0));
const pdvRevenue = computed(() => Number(payload.value?.kpis.pdvRevenue || 0));
const anonymousPdvSales = computed(() => Number(payload.value?.kpis.anonymousPdvSales || 0));
const anonymousPdvRevenue = computed(() => Number(payload.value?.kpis.anonymousPdvRevenue || 0));
const stockValue = computed(() => Number(payload.value?.kpis.stockValue || 0));
const approvalRate = computed(() => Number(payload.value?.kpis.approvalRate || 0));
const pendingApprovals = computed(() => Number(payload.value?.kpis.ordersPendingApproval || 0));
const openOrders = computed(() => Number(payload.value?.kpis.ordersOpen || 0));
const averageTicket = computed(() => Number(payload.value?.kpis.averageTicket || 0));
const financeDifference = computed(() => Number(financeWorkbook.value?.cashManagement?.topSummary?.differenceValue || 0));

const activeCatalog = computed(() => catalog.value.filter((item) => Number(item.active) !== 0));
const lowStockCount = computed(
  () =>
    activeCatalog.value.filter((item) => Number(item.stock_quantity || 0) <= Number(item.min_stock || 0)).length
);

const taskColumns = computed(() => taskBoard.value?.columns || []);
const taskBreakdown = computed(() =>
  taskColumns.value
    .map((column) => ({ label: column.label, code: column.code, value: column.tasks.length }))
    .filter((item) => item.value > 0)
);
const totalTasks = computed(() => taskColumns.value.reduce((sum, column) => sum + column.tasks.length, 0));
const activeTasks = computed(() =>
  taskColumns.value
    .filter((column) => column.code !== "CONCLUIDA")
    .reduce((sum, column) => sum + column.tasks.length, 0)
);
const completedTasks = computed(() => {
  const column = taskColumns.value.find((item) => item.code === "CONCLUIDA");
  return column ? column.tasks.length : 0;
});
const inProgressTasks = computed(() => {
  const column = taskColumns.value.find((item) => item.code === "EM_ANDAMENTO");
  return column ? column.tasks.length : 0;
});

const stockProfitBreakdown = computed(() => {
  const grouped = new Map<string, number>();
  for (const item of activeCatalog.value) {
    const quantity = Number(item.stock_quantity || 0);
    const unitMargin = Number(item.unit_margin || 0);
    const totalMargin = quantity * unitMargin;
    if (quantity <= 0 || totalMargin <= 0) {
      continue;
    }
    const label = String(item.category || "Sem categoria").trim() || "Sem categoria";
    grouped.set(label, (grouped.get(label) || 0) + totalMargin);
  }
  return collapseBreakdown(
    [...grouped.entries()].map(([label, value]) => ({ label, value })),
    6
  );
});

const stockProfitTotal = computed(() =>
  stockProfitBreakdown.value.reduce((sum, item) => sum + Number(item.value || 0), 0)
);

const orderStatusBreakdown = computed(() =>
  [...(payload.value?.charts.orderStatus || [])]
    .map((item) => ({ label: item.label, value: Number(item.value || 0) }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
);

const approvalBreakdown = computed(() =>
  [...(payload.value?.charts.approvals || [])]
    .map((item) => ({ label: item.label, value: Number(item.value || 0) }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
);

const revenueChannelBreakdown = computed(() =>
  [
    { label: "Ordens de servico", value: orderRevenue.value },
    { label: "PDV", value: pdvRevenue.value }
  ].filter((item) => item.value > 0)
);

const heroStats = computed(() => [
  {
    label: "Caixa oficial",
    value: currency(officialCashValue.value),
    hint: "Leitura viva do financeiro oficial."
  },
  {
    label: "Entradas do periodo",
    value: currency(totalEntries.value),
    hint: "Ordens de servico e PDV somados."
  },
  {
    label: "Margem do periodo",
    value: currency(margin.value),
    hint: `Despesas registradas: ${currency(expenses.value)}.`
  },
  {
    label: "Lucro potencial do estoque",
    value: currency(stockProfitTotal.value),
    hint: "Margem estimada sobre o estoque atual."
  }
]);

const summaryCards = computed(() => [
  {
    title: "OS abertas",
    value: openOrders.value,
    hint: "Fila ativa da oficina neste momento.",
    icon: "fa-solid fa-screwdriver-wrench",
    tone: "warning"
  },
  {
    title: "Pendentes de aprovacao",
    value: pendingApprovals.value,
    hint: `Taxa atual de aprovacao: ${percentage(approvalRate.value)}.`,
    icon: "fa-solid fa-hourglass-half",
    tone: "info"
  },
  {
    title: "PDV no periodo",
    value: compactCurrency(pdvRevenue.value),
    hint: anonymousPdvSales.value
      ? `${anonymousPdvSales.value} venda(s) sem cadastro somando ${compactCurrency(anonymousPdvRevenue.value)}.`
      : "Receita de venda direta.",
    icon: "fa-solid fa-cash-register",
    tone: "primary"
  },
  {
    title: "Tarefas ativas",
    value: activeTasks.value,
    hint: `${completedTasks.value} concluidas e ${inProgressTasks.value} em andamento.`,
    icon: "fa-solid fa-list-check",
    tone: "success"
  }
]);

const trendCategories = computed(() =>
  (payload.value?.charts.trend || []).map((item) => formatMonthLabel(String(item.label || "")))
);
const trendSeries = computed(() => [
  {
    name: "Total",
    data: (payload.value?.charts.trend || []).map((item) => Number(item.revenue || 0))
  },
  {
    name: "OS",
    data: (payload.value?.charts.trend || []).map((item) => Number(item.orderRevenue || item.revenue || 0))
  },
  {
    name: "PDV",
    data: (payload.value?.charts.trend || []).map((item) => Number(item.pdvRevenue || 0))
  }
]);

const stockProfitCategories = computed(() => stockProfitBreakdown.value.map((item) => item.label));
const stockProfitSeries = computed(() => stockProfitBreakdown.value.map((item) => Number(item.value || 0)));

const statusCategories = computed(() => orderStatusBreakdown.value.map((item) => item.label));
const statusSeries = computed(() => orderStatusBreakdown.value.map((item) => Number(item.value || 0)));

const channelCategories = computed(() => revenueChannelBreakdown.value.map((item) => item.label));
const channelSeries = computed(() => revenueChannelBreakdown.value.map((item) => Number(item.value || 0)));

const taskCategories = computed(() => taskBreakdown.value.map((item) => item.label));
const taskSeries = computed(() => taskBreakdown.value.map((item) => Number(item.value || 0)));

const approvalCategories = computed(() => approvalBreakdown.value.map((item) => item.label));
const approvalSeries = computed(() => approvalBreakdown.value.map((item) => Number(item.value || 0)));

const insightCards = computed(() => {
  const stockLeader = stockProfitBreakdown.value[0];
  const stockLeaderShare = stockLeader ? percentageOf(stockLeader.value, stockProfitTotal.value) : "0%";
  const orderLeader = orderStatusBreakdown.value[0];
  const taskLeader = taskBreakdown.value[0];
  const topClient = payload.value?.topClients?.[0];

  return [
    {
      title: "Financeiro",
      text: `Caixa oficial em ${currency(officialCashValue.value)}. Entradas em ${compactCurrency(totalEntries.value)} com ticket medio de ${compactCurrency(averageTicket.value)}.`,
      icon: "fa-solid fa-wallet"
    },
    {
      title: "Estoque",
      text: stockLeader
        ? `${stockLeader.label} lidera o lucro potencial do estoque com ${compactCurrency(stockLeader.value)} e peso de ${stockLeaderShare}.`
        : "Ainda nao ha distribuicao relevante de lucro potencial no estoque para este recorte.",
      icon: "fa-solid fa-boxes-stacked"
    },
    {
      title: "Oficina e PDV",
      text: orderLeader
        ? `${openOrders.value} OS seguem abertas e o status dominante e ${orderLeader.label}. O PDV trouxe ${compactCurrency(pdvRevenue.value)} no periodo${anonymousPdvSales.value ? `, com ${anonymousPdvSales.value} venda(s) sem cadastro.` : "."}`
        : `Sem status dominante na oficina agora. O PDV trouxe ${compactCurrency(pdvRevenue.value)} no periodo${anonymousPdvSales.value ? `, com ${anonymousPdvSales.value} venda(s) sem cadastro.` : "."}`,
      icon: "fa-solid fa-gauge-high"
    },
    {
      title: "Agenda",
      text: taskLeader
        ? `${totalTasks.value} tarefas compoem o dia e ${taskLeader.label} e a faixa mais carregada. ${topClient ? `${topClient.name} lidera o faturamento do recorte.` : "Sem cliente destaque no recorte."}`
        : `Nao ha tarefas suficientes para um recorte relevante. ${topClient ? `${topClient.name} lidera o faturamento do recorte.` : "Sem cliente destaque no recorte."}`,
      icon: "fa-solid fa-calendar-check"
    }
  ];
});

const attentionItems = computed(() => {
  const items: Array<{ label: string; text: string; tone: string }> = [];

  if (Math.abs(financeDifference.value) > 0.009) {
    items.push({
      label: "Financeiro",
      text: `Existe diferenca de ${currency(financeDifference.value)} entre a leitura oficial e o fechamento esperado.`,
      tone: "danger"
    });
  }

  if (pendingApprovals.value > 0) {
    items.push({
      label: "Aprovacao",
      text: `${pendingApprovals.value} ordens ainda aguardam retorno do cliente.`,
      tone: "warning"
    });
  }

  if (lowStockCount.value > 0) {
    items.push({
      label: "Estoque",
      text: `${lowStockCount.value} itens estao no minimo ou abaixo do minimo.`,
      tone: "info"
    });
  }

  if (activeTasks.value > 0) {
    items.push({
      label: "Tarefas",
      text: `${activeTasks.value} tarefas seguem abertas para hoje.`,
      tone: "primary"
    });
  }

  if (anonymousPdvSales.value > 0) {
    items.push({
      label: "PDV",
      text: `${anonymousPdvSales.value} venda(s) foram registradas sem cadastro de cliente, somando ${currency(anonymousPdvRevenue.value)}.`,
      tone: "info"
    });
  }

  for (const alert of payload.value?.alerts || []) {
    if (items.length >= 5) {
      break;
    }
    items.push({
      label: alert.value || "Alerta",
      text: `${alert.title}: ${alert.subtitle}`,
      tone: normalizeTone(alert.tone)
    });
  }

  return items.slice(0, 5);
});

async function loadDashboard() {
  loading.value = true;
  try {
    const [dashboardResponse, catalogResponse, taskBoardResponse, financeWorkbookResponse] = await Promise.all([
      api.dashboard(),
      api.catalog({ activeOnly: true }),
      api.taskBoard({ taskDate: today, includePendingFromPast: true }),
      api.financeWorkbook()
    ]);

    payload.value = dashboardResponse;
    catalog.value = catalogResponse.data || [];
    taskBoard.value = taskBoardResponse.data || null;
    financeWorkbook.value = financeWorkbookResponse.data || null;
  } catch (error) {
    await notifyError(error);
  } finally {
    loading.value = false;
  }
}

watch(
  () => session.store?.id,
  (next, previous) => {
    if (next && next !== previous) {
      loadDashboard();
    }
  }
);

onMounted(loadDashboard);

function collapseBreakdown(rows: BreakdownRow[], keep = 6) {
  const sorted = [...rows]
    .filter((item) => Number(item.value || 0) > 0)
    .sort((left, right) => right.value - left.value);

  if (sorted.length <= keep) {
    return sorted;
  }

  const visible = sorted.slice(0, keep - 1);
  const hiddenTotal = sorted.slice(keep - 1).reduce((sum, item) => sum + Number(item.value || 0), 0);
  return [...visible, { label: "Outros", value: hiddenTotal }];
}

function formatMonthLabel(value: string) {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-");
    return `${month}/${year.slice(2)}`;
  }
  return value;
}

function percentageOf(value: number, total: number) {
  if (!total) {
    return "0%";
  }
  return `${((value / total) * 100).toFixed(1)}%`;
}

function normalizeTone(value: string) {
  if (value === "danger" || value === "warning" || value === "primary" || value === "info") {
    return value;
  }
  return "info";
}
</script>

<style scoped>
.dashboard-view {
  display: grid;
  gap: 1.25rem;
}

.dashboard-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 1.25rem;
  align-items: stretch;
}

.dashboard-hero__copy {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 0.7rem;
  align-content: start;
}

.dashboard-hero__eyebrow,
.dashboard-section-head__eyebrow {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.76);
}

.dashboard-hero__title {
  margin: 0;
  max-width: 18ch;
  font-size: clamp(1.9rem, 2.7vw, 2.9rem);
  line-height: 1.03;
  font-weight: 900;
}

.dashboard-hero__text {
  margin: 0;
  max-width: 52rem;
  color: rgba(255, 255, 255, 0.84);
  line-height: 1.6;
}

.dashboard-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.92rem;
}

.dashboard-hero__meta span {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.dashboard-hero__stats {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.dashboard-hero-stat {
  display: grid;
  gap: 0.28rem;
  padding: 1rem 1.05rem;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(12px);
}

.dashboard-hero-stat__label {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.68);
}

.dashboard-hero-stat__value {
  font-size: clamp(1.25rem, 1.9vw, 1.75rem);
  line-height: 1.06;
  color: #ffffff;
}

.dashboard-hero-stat__hint {
  color: rgba(255, 255, 255, 0.78);
  line-height: 1.45;
}

.dashboard-insights,
.dashboard-attention {
  display: grid;
  gap: 1rem;
  height: 100%;
}

.dashboard-section-head {
  display: grid;
  gap: 0.2rem;
}

.dashboard-section-head__eyebrow {
  color: var(--text-muted);
}

.dashboard-section-head__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text-primary);
}

.dashboard-insights__grid {
  display: grid;
  gap: 0.85rem;
}

.dashboard-insight-card {
  display: grid;
  grid-template-columns: 48px 1fr;
  gap: 0.85rem;
  align-items: start;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
  border: 1px solid var(--border-soft);
}

.dashboard-insight-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  color: var(--text-primary);
}

.dashboard-insight-card__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-primary);
}

.dashboard-insight-card__text {
  margin: 0.3rem 0 0;
  color: var(--text-muted);
  line-height: 1.55;
}

.dashboard-attention__list {
  display: grid;
  gap: 0.75rem;
}

.dashboard-attention__item {
  display: grid;
  gap: 0.3rem;
  padding: 0.9rem 1rem;
  border-radius: 18px;
  border: 1px solid var(--border-soft);
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
}

.dashboard-attention__label {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.dashboard-attention__text {
  color: var(--text-primary);
  line-height: 1.5;
}

.dashboard-attention__item--danger {
  border-color: rgba(217, 81, 101, 0.22);
  background: rgba(255, 242, 244, 0.94);
}

.dashboard-attention__item--warning {
  border-color: rgba(230, 173, 57, 0.24);
  background: rgba(255, 248, 233, 0.96);
}

.dashboard-attention__item--info,
.dashboard-attention__item--primary {
  border-color: rgba(49, 196, 213, 0.22);
  background: rgba(240, 249, 252, 0.96);
}

.dashboard-attention__empty {
  border-radius: 18px;
  border: 1px dashed var(--border-soft);
  padding: 1rem;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
}

:global(:root[data-theme="dark"]) .dashboard-hero__eyebrow,
:global(:root[data-theme="dark"]) .dashboard-section-head__eyebrow {
  color: rgba(223, 233, 245, 0.68);
}

.dashboard-view--dark .dashboard-hero {
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 26px 58px rgba(0, 0, 0, 0.3);
}

.dashboard-view--dark .dashboard-hero__title {
  color: #f8fbff;
}

.dashboard-view--dark .dashboard-hero__text {
  color: rgba(232, 238, 245, 0.84);
}

.dashboard-view--dark .dashboard-hero__meta,
.dashboard-view--dark .dashboard-hero__eyebrow {
  color: rgba(223, 233, 245, 0.68);
}

.dashboard-view--dark .dashboard-hero-stat {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
}

.dashboard-view--dark .metric-card {
  background: linear-gradient(180deg, rgba(15, 24, 37, 0.96), rgba(18, 30, 46, 0.94));
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 42px rgba(0, 0, 0, 0.22);
}

.dashboard-view--dark .metric-card::after {
  background: color-mix(in srgb, var(--brand-accent) 18%, transparent);
  opacity: 0.7;
}

.dashboard-view--dark .metric-card .text-muted {
  color: rgba(214, 224, 238, 0.68) !important;
}

.dashboard-view--dark .metric-card .small,
.dashboard-view--dark .metric-card .fs-2 {
  color: #f5f9ff;
}

.dashboard-view--dark .dashboard-insights,
.dashboard-view--dark .dashboard-attention {
  background: linear-gradient(180deg, rgba(15, 24, 37, 0.96), rgba(18, 30, 46, 0.94));
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 42px rgba(0, 0, 0, 0.22);
}

.dashboard-view--dark .dashboard-section-head__title,
.dashboard-view--dark .dashboard-insight-card__title,
.dashboard-view--dark .dashboard-attention__text {
  color: #f4f7fb;
}

.dashboard-view--dark .dashboard-insight-card,
.dashboard-view--dark .dashboard-attention__item,
.dashboard-view--dark .dashboard-attention__empty {
  background: rgba(255, 255, 255, 0.035);
  border-color: rgba(255, 255, 255, 0.08);
}

.dashboard-view--dark .dashboard-insight-card__icon {
  background: rgba(255, 255, 255, 0.08);
  color: #f4f7fb;
}

.dashboard-view--dark .dashboard-insight-card__text,
.dashboard-view--dark .dashboard-attention__empty,
.dashboard-view--dark .dashboard-attention__label {
  color: rgba(223, 233, 245, 0.76);
}

.dashboard-view--dark .dashboard-attention__item--danger {
  background: rgba(104, 34, 44, 0.36);
}

.dashboard-view--dark .dashboard-attention__item--warning {
  background: rgba(103, 74, 21, 0.36);
}

.dashboard-view--dark .dashboard-attention__item--info,
.dashboard-view--dark .dashboard-attention__item--primary {
  background: rgba(26, 75, 86, 0.36);
}

@media (max-width: 1199.98px) {
  .dashboard-hero {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767.98px) {
  .dashboard-hero__stats {
    grid-template-columns: 1fr;
  }

  .dashboard-hero-stat {
    padding: 0.95rem;
  }
}
</style>
