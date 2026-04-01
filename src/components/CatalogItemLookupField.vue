<template>
  <div ref="root" class="catalog-combobox">
    <label class="form-label fw-semibold">{{ label }}</label>
    <div class="position-relative">
      <div class="input-group">
        <span class="input-group-text rounded-start-4 bg-body-tertiary border-end-0">
          <i class="fa-solid fa-barcode"></i>
        </span>
        <input
          :value="searchTerm"
          type="text"
          class="form-control rounded-end-4 border-start-0"
          :placeholder="placeholder"
          autocomplete="off"
          @focus="openMenu()"
          @input="handleInput"
          @keydown.enter.prevent="selectFirstMatch"
        />
        <button
          v-if="searchTerm"
          type="button"
          class="btn btn-outline-secondary rounded-pill ms-2"
          @click="clearSelection">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div v-if="isOpen" class="catalog-combobox__menu">
        <button
          v-for="item in limitedItems"
          :key="item.id"
          type="button"
          class="catalog-combobox__option"
          :class="{ 'is-selected': Number(item.id) === Number(modelValue) }"
          @click="selectItem(item)">
          <div class="fw-semibold">{{ item.name }}</div>
          <div class="small">
            {{ item.brand || "Sem marca" }} | {{ item.sku || "sem SKU" }} | estoque {{ item.stock_quantity }}
          </div>
        </button>
        <div v-if="!limitedItems.length" class="catalog-combobox__empty">
          Nenhum produto encontrado para esse termo.
        </div>
      </div>
    </div>
    <div class="small mt-2">
      Digite para filtrar e escolha o produto na lista logo abaixo.
    </div>
    <div v-if="searchTerm && !modelValue" class="small text-danger mt-1">Selecione um produto listado abaixo.</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CatalogItem } from "../services/types";

const props = withDefaults(
  defineProps<{
    modelValue: number;
    searchTerm: string;
    items: CatalogItem[];
    label?: string;
    placeholder?: string;
  }>(),
  {
    label: "Produto",
    placeholder: "Digite nome, marca ou SKU para buscar"
  }
);

const emit = defineEmits<{
  (event: "update:modelValue", value: number): void;
  (event: "update:searchTerm", value: string): void;
}>();

const root = ref<HTMLElement | null>(null);
const isOpen = ref(false);

const selectedItem = computed(() => props.items.find((item) => Number(item.id) === Number(props.modelValue)) || null);

const filteredItems = computed(() => {
  const query = String(props.searchTerm || "").trim().toLowerCase();
  if (!query) {
    return props.items;
  }
  return props.items.filter((item) =>
    `${item.name} ${item.brand || ""} ${item.sku || ""}`.toLowerCase().includes(query)
  );
});

const limitedItems = computed(() => filteredItems.value.slice(0, 20));

function itemLabel(item: CatalogItem | null) {
  if (!item) {
    return "";
  }
  return [item.name, item.brand, item.sku].filter(Boolean).join(" | ");
}

function syncFromModel() {
  if (selectedItem.value) {
    emit("update:searchTerm", itemLabel(selectedItem.value));
    return;
  }
  if (!isOpen.value) {
    emit("update:searchTerm", "");
  }
}

function openMenu() {
  isOpen.value = true;
}

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  emit("update:searchTerm", target?.value || "");
  isOpen.value = true;
  if (selectedItem.value && (target?.value || "") !== itemLabel(selectedItem.value)) {
    emit("update:modelValue", 0);
  }
}

function selectItem(item: CatalogItem) {
  emit("update:modelValue", Number(item.id));
  emit("update:searchTerm", itemLabel(item));
  isOpen.value = false;
}

function selectFirstMatch() {
  if (limitedItems.value.length) {
    selectItem(limitedItems.value[0]);
  }
}

function clearSelection() {
  emit("update:searchTerm", "");
  emit("update:modelValue", 0);
  isOpen.value = false;
}

function onDocumentPointerDown(event: Event) {
  if (!(event.target instanceof Node)) {
    return;
  }
  if (!root.value?.contains(event.target)) {
    isOpen.value = false;
    syncFromModel();
  }
}

watch(() => props.modelValue, syncFromModel, { immediate: true });
watch(() => props.items, syncFromModel, { immediate: true });

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
});
</script>

<style scoped>
.catalog-combobox__menu {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  z-index: 30;
  display: grid;
  gap: 0.35rem;
  max-height: 320px;
  overflow-y: auto;
  padding: 0.45rem;
  border: 1px solid var(--border-soft);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--surface-elevated) 94%, transparent);
  color: var(--text-primary);
  box-shadow: 0 18px 42px var(--shadow-color);
  backdrop-filter: blur(14px);
}

.catalog-combobox__option {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 0.9rem;
  padding: 0.8rem 0.9rem;
  text-align: left;
  background: transparent;
  color: var(--text-primary);
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.catalog-combobox__option:hover,
.catalog-combobox__option.is-selected {
  background: color-mix(in srgb, var(--brand-accent) 12%, var(--surface-elevated));
  border-color: color-mix(in srgb, var(--brand-accent) 28%, transparent);
  transform: translateY(-1px);
}

.catalog-combobox__empty {
  padding: 0.85rem 0.9rem;
  color: var(--text-muted);
}

.catalog-combobox :deep(.form-control),
.catalog-combobox :deep(.input-group-text) {
  color: var(--text-primary);
  background: var(--surface-elevated);
  border-color: var(--border-soft);
}

.catalog-combobox :deep(.form-control::placeholder) {
  color: var(--text-muted);
}

.catalog-combobox :deep(.form-control:focus) {
  box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--brand-accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--brand-accent) 36%, var(--border-soft));
}

.catalog-combobox :deep(.btn-outline-secondary) {
  --bs-btn-color: var(--text-muted);
  --bs-btn-border-color: var(--border-soft);
  --bs-btn-hover-color: var(--text-primary);
  --bs-btn-hover-bg: color-mix(in srgb, var(--surface-elevated) 78%, var(--brand-primary));
  --bs-btn-hover-border-color: var(--border-strong);
}
</style>
