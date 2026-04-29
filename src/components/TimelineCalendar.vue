<template>
  <div class="panel-card timeline-calendar" :class="{ 'timeline-calendar--compact': compact }">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <div class="small fw-semibold">Linha do tempo</div>
        <h3 class="h5 fw-bold mb-0">{{ title }}</h3>
      </div>
      <div class="btn-group btn-group-sm">
        <button type="button" class="btn btn-outline-secondary" @click="changeZoom(-1)">
          <i class="fa-solid fa-magnifying-glass-minus"></i>
        </button>
        <button type="button" class="btn btn-outline-secondary" @click="changeZoom(1)">
          <i class="fa-solid fa-magnifying-glass-plus"></i>
        </button>
      </div>
    </div>

    <div class="timeline-scroll">
      <div class="timeline-grid" :style="gridStyle">
        <div v-for="day in days" :key="day" class="timeline-grid__day">
          <div class="timeline-grid__label">{{ day.slice(8, 10) }}/{{ day.slice(5, 7) }}</div>
        </div>

        <button
          v-for="entry in normalizedEntries"
          :key="entry.key"
          type="button"
          class="timeline-entry"
          :style="entry.style"
          @click="emit('select', entry.raw)">
          <strong>{{ entry.title }}</strong>
          <span v-if="showSubtitle">{{ entry.subtitle }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
  title: string;
  entries: Array<Record<string, any>>;
  compact?: boolean;
  startField?: string;
  endField?: string;
  titleField?: string;
  subtitleField?: string;
  colorField?: string;
}>();

const emit = defineEmits<{
  (event: "select", value: Record<string, any>): void;
}>();

const zoom = ref(1);
const compact = computed(() => Boolean(props.compact));
const showSubtitle = computed(() => !compact.value);

const bounds = computed(() => {
  const startField = props.startField || "startDate";
  const endField = props.endField || "endDate";
  const values = props.entries.flatMap((entry) => [String(entry[startField] || ""), String(entry[endField] || entry[startField] || "")]).filter(Boolean);
  const sorted = [...new Set(values)].sort();
  const start = sorted[0] || new Date().toISOString().slice(0, 10);
  const end = sorted[sorted.length - 1] || start;
  return { start, end };
});

const days = computed(() => {
  const result: string[] = [];
  const current = new Date(`${bounds.value.start}T00:00:00`);
  const end = new Date(`${bounds.value.end}T00:00:00`);
  while (current <= end) {
    result.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return result;
});

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.max(days.value.length, 1)}, minmax(${140 * zoom.value}px, 1fr))`
}));

const normalizedEntries = computed(() => {
  const startField = props.startField || "startDate";
  const endField = props.endField || "endDate";
  const titleField = props.titleField || "title";
  const subtitleField = props.subtitleField || "subtitle";
  const colorField = props.colorField || "color";

  return props.entries.map((entry, index) => {
    const start = String(entry[startField] || bounds.value.start);
    const end = String(entry[endField] || start);
    const startIndex = Math.max(days.value.indexOf(start), 0);
    const endIndex = Math.max(days.value.indexOf(end), startIndex);
    return {
      key: `${entry.id || index}-${start}`,
      title: String(entry[titleField] || entry.code || `Entrada ${index + 1}`),
      subtitle: String(entry[subtitleField] || ""),
      raw: entry,
      style: {
        gridColumn: `${startIndex + 1} / ${endIndex + 2}`,
        background: String(entry[colorField] || "#0d6efd"),
        top: `${80 + index * 74}px`
      }
    };
  });
});

function changeZoom(direction: number) {
  zoom.value = Math.min(3, Math.max(0.6, zoom.value + direction * 0.25));
}
</script>

<style scoped>
.timeline-entry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  border: 0;
  border-radius: 0.9rem;
  color: #fff;
  padding: 0.8rem 0.9rem;
  position: absolute;
  min-height: 62px;
  box-shadow: 0 12px 30px rgba(16, 35, 63, 0.18);
  text-align: left;
}

.timeline-entry strong,
.timeline-entry span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.timeline-entry span {
  opacity: 0.9;
  font-size: 0.82rem;
}

.timeline-calendar--compact .timeline-entry {
  min-height: 44px;
  padding: 0.55rem 0.7rem;
  justify-content: center;
}
</style>
