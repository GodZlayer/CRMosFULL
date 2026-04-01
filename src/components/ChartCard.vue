<template>
  <div class="chart-card panel-card h-100" :class="{ 'chart-card--dark': ui.resolvedTheme === 'dark' }">
    <div class="chart-card__head">
      <div class="chart-card__copy">
        <div class="chart-card__eyebrow">{{ eyebrow }}</div>
        <h3 class="chart-card__title">{{ title }}</h3>
        <p v-if="summary" class="chart-card__summary">{{ summary }}</p>
      </div>

      <div class="chart-card__icon" aria-hidden="true">
        <i :class="icon"></i>
      </div>
    </div>

    <div v-if="hasChartData" ref="chartTarget" class="chart-card__canvas"></div>
    <div v-else class="chart-card__empty">
      Sem dados suficientes para renderizar este grafico no filtro atual.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useUiStore } from "../stores/ui";

const props = defineProps<{
  title: string;
  eyebrow: string;
  icon: string;
  summary?: string;
  type: "line" | "bar" | "donut";
  series: any[];
  categories?: string[];
  height?: number;
}>();

const ui = useUiStore();
const chartTarget = ref<HTMLElement | null>(null);
let chartInstance: any = null;

const normalizedCategories = computed(() => (Array.isArray(props.categories) ? props.categories : []));
const normalizedSeries = computed(() => {
  if (props.type === "donut") {
    return Array.isArray(props.series)
      ? props.series.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value))
      : [];
  }

  if (!Array.isArray(props.series)) {
    return [];
  }

  return props.series.map((series, index) => ({
    name: series?.name ?? `Serie ${index + 1}`,
    data: Array.isArray(series?.data) ? series.data.map((value: unknown) => Number(value || 0)) : []
  }));
});

const hasChartData = computed(() => {
  if (props.type === "donut") {
    return Array.isArray(normalizedSeries.value) && normalizedSeries.value.length > 0;
  }

  return (
    Array.isArray(normalizedSeries.value) &&
    normalizedSeries.value.some((series) => Array.isArray(series.data) && series.data.length > 0)
  );
});

function renderChart() {
  if (!chartTarget.value || !window.ApexCharts || !hasChartData.value) {
    chartInstance?.destroy();
    chartInstance = null;
    return;
  }

  if (chartInstance) {
    chartInstance.destroy();
  }

  const styles = getComputedStyle(document.documentElement);
  const brandPrimary = styles.getPropertyValue("--brand-primary").trim() || "#10233f";
  const brandAccent = styles.getPropertyValue("--brand-accent").trim() || "#31c4d5";
  const textMuted = styles.getPropertyValue("--text-muted").trim() || "#5f708e";
  const gridBorder = styles.getPropertyValue("--border-soft").trim() || "rgba(16,35,63,0.08)";
  const chartHeight = props.height ?? (ui.isPhone ? 220 : ui.isTablet ? 260 : 300);

  chartInstance = new window.ApexCharts(chartTarget.value, {
    chart: {
      type: props.type,
      height: chartHeight,
      toolbar: { show: false },
      animations: { enabled: true, easing: "easeinout", speed: 650 },
      foreColor: textMuted
    },
    colors: [brandPrimary, brandAccent, "#e6ad39", "#ff8756", "#169873"],
    dataLabels: { enabled: props.type === "donut" && !ui.isPhone },
    stroke: { curve: "smooth", width: props.type === "line" ? 3 : 0 },
    series: normalizedSeries.value,
    labels: props.type === "donut" ? normalizedCategories.value : undefined,
    xaxis:
      props.type !== "donut"
        ? {
            categories: normalizedCategories.value,
            labels: {
              show: true,
              rotate: ui.isPhone ? -18 : 0,
              trim: true,
              hideOverlappingLabels: true
            }
          }
        : undefined,
    legend: {
      position: "bottom",
      fontSize: ui.isPhone ? "11px" : "12px"
    },
    grid: { borderColor: gridBorder },
    tooltip: {
      theme: ui.resolvedTheme
    },
    plotOptions: {
      bar: {
        borderRadius: 10,
        distributed: props.type === "bar"
      }
    }
  });
  chartInstance.render();
}

onMounted(renderChart);
watch(
  () => [normalizedSeries.value, normalizedCategories.value, props.type, hasChartData.value, ui.resolvedTheme, ui.viewportWidth],
  renderChart,
  { deep: true }
);
onBeforeUnmount(() => chartInstance?.destroy());
</script>

<style scoped>
.chart-card {
  display: grid;
  gap: 1rem;
  padding: 1.2rem;
  border: 1px solid var(--border-soft);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 253, 0.94));
}

.chart-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.chart-card__copy {
  display: grid;
  gap: 0.35rem;
}

.chart-card__eyebrow {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.chart-card__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-primary);
}

.chart-card__summary {
  margin: 0;
  max-width: 34rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.chart-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(16, 35, 63, 0.08);
  color: var(--text-primary);
  flex: 0 0 auto;
}

.chart-card__canvas {
  min-height: 220px;
}

.chart-card__empty {
  border-radius: 18px;
  border: 1px dashed var(--border-soft);
  background: var(--surface-muted);
  padding: 1.5rem;
  color: var(--text-muted);
  text-align: center;
}

.chart-card--dark {
  border-color: rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(15, 24, 37, 0.98), rgba(19, 31, 47, 0.96));
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.22);
}

.chart-card--dark .chart-card__eyebrow {
  color: rgba(214, 224, 238, 0.66);
}

.chart-card--dark .chart-card__title {
  color: #f4f7fb;
}

.chart-card--dark .chart-card__summary,
.chart-card--dark .chart-card__empty {
  color: rgba(232, 238, 245, 0.82);
}

.chart-card--dark .chart-card__icon {
  background: rgba(255, 255, 255, 0.08);
  color: #f4f7fb;
}

.chart-card--dark .chart-card__empty {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.035);
}
</style>
