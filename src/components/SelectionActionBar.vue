<template>
  <transition name="fade-slide">
    <div v-if="selectedCount > 0" class="selection-action-bar panel-card d-flex flex-wrap justify-content-between align-items-center gap-3">
      <div>
        <div class="small fw-semibold">Selecao operacional</div>
        <div class="fw-semibold">{{ selectedCount }} {{ selectedLabel }}</div>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <button type="button" class="btn btn-outline-secondary rounded-pill" @click="emit('select-all')">
          <i class="fa-solid fa-check-double me-2"></i>
          Selecionar todos
        </button>
        <button type="button" class="btn btn-light rounded-pill" @click="emit('clear')">
          <i class="fa-solid fa-eraser me-2"></i>
          Limpar
        </button>
        <slot />
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  selectedCount: number;
  itemLabel?: string;
}>();

const emit = defineEmits<{
  (event: "select-all"): void;
  (event: "clear"): void;
}>();

const selectedLabel = computed(() => {
  const base = props.itemLabel || "item(ns)";
  return `${base} marcado(s) para acao em lote.`;
});
</script>
