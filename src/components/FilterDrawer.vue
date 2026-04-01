<template>
  <div class="d-inline-flex">
    <button type="button" class="btn btn-outline-secondary rounded-pill" @click="openDrawer">
      <i class="fa-solid fa-sliders me-2"></i>
      {{ buttonLabel || "Filtros" }}
    </button>

    <div ref="panel" class="offcanvas offcanvas-end filter-drawer-panel" tabindex="-1">
      <div class="offcanvas-header border-bottom">
        <div>
          <div class="small fw-semibold">Filtro expandido</div>
          <h5 class="offcanvas-title mb-0">{{ title }}</h5>
        </div>
        <button type="button" class="btn-close" aria-label="Close" @click="closeDrawer"></button>
      </div>
      <div class="offcanvas-body">
        <slot />
      </div>
      <div class="offcanvas-footer border-top p-3 d-flex justify-content-between gap-2">
        <button type="button" class="btn btn-light rounded-pill" @click="emit('clear')">
          <i class="fa-solid fa-eraser me-2"></i>
          Limpar
        </button>
        <button type="button" class="btn btn-primary rounded-pill" @click="applyAndClose">
          <i class="fa-solid fa-check me-2"></i>
          Aplicar
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{
  title: string;
  buttonLabel?: string;
}>();

const emit = defineEmits<{
  (event: "apply"): void;
  (event: "clear"): void;
}>();

const panel = ref<HTMLElement | null>(null);
let instance: any = null;

function openDrawer() {
  instance?.show?.();
}

function closeDrawer() {
  instance?.hide?.();
}

function applyAndClose() {
  emit("apply");
  closeDrawer();
}

onMounted(() => {
  if (panel.value && window.bootstrap?.Offcanvas) {
    instance = new window.bootstrap.Offcanvas(panel.value);
  }
});

onBeforeUnmount(() => {
  instance?.dispose?.();
});
</script>

