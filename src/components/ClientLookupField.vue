<template>
 <div ref="root" class="client-combobox">
  <label class="form-label fw-semibold" :class="{ 'required-label': required }">{{ label }}</label>
  <div class="position-relative">
   <div class="input-group">
    <span class="input-group-text rounded-start-4 bg-body-tertiary border-end-0">
     <i class="fa-solid fa-magnifying-glass"></i>
    </span>
    <input
     v-model="searchTerm"
     type="text"
     class="form-control rounded-end-4 border-start-0"
     :placeholder="placeholder"
     :required="required && !modelValue"
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

   <div v-if="isOpen" class="client-combobox__menu">
    <button
     v-for="client in limitedClients"
     :key="client.id"
     type="button"
     class="client-combobox__option"
     :class="{ 'is-selected': Number(client.id) === Number(modelValue) }"
     @click="selectClient(client)">
     <div class="fw-semibold">{{ client.name }}</div>
     <div class="small">{{ client.phone || "Telefone nao informado" }}</div>
    </button>
    <div v-if="!limitedClients.length" class="client-combobox__empty">
     Nenhum cliente encontrado para esse termo.
    </div>
   </div>
  </div>
  <div class="small mt-2">{{ helperText }}</div>
  <div v-if="searchTerm && !modelValue" class="small text-danger mt-1">Selecione um cliente listado abaixo.</div>
 </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ClientSummary } from "../services/types";

const props = withDefaults(
 defineProps<{
  modelValue: number;
  clients: ClientSummary[];
  label?: string;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
 }>(),
 {
  label: "Cliente",
  placeholder: "Digite o nome ou telefone para buscar",
  required: false,
  helperText: "Clientes ordenados pela ultima OS alterada."
 }
);

const emit = defineEmits<{
 (event: "update:modelValue", value: number): void;
}>();

const root = ref<HTMLElement | null>(null);
const searchTerm = ref("");
const isOpen = ref(false);

const selectedClient = computed(() => props.clients.find((client) => Number(client.id) === Number(props.modelValue)) || null);
const filteredClients = computed(() => {
 const query = searchTerm.value.trim().toLowerCase();
 if (!query) {
  return props.clients;
 }
 return props.clients.filter((client) => `${client.name} ${client.phone} ${client.email}`.toLowerCase().includes(query));
});
const limitedClients = computed(() => filteredClients.value.slice(0, 12));

function clientLabel(client: ClientSummary | null) {
 return client ? `${client.name} - ${client.phone || "Telefone nao informado"}` : "";
}

function syncFromModel() {
 if (selectedClient.value) {
  searchTerm.value = clientLabel(selectedClient.value);
  return;
 }
 if (!isOpen.value) {
  searchTerm.value = "";
 }
}

function openMenu() {
 isOpen.value = true;
}

function handleInput() {
 isOpen.value = true;
 if (selectedClient.value && searchTerm.value !== clientLabel(selectedClient.value)) {
  emit("update:modelValue", 0);
 }
}

function selectClient(client: ClientSummary) {
 emit("update:modelValue", Number(client.id));
 searchTerm.value = clientLabel(client);
 isOpen.value = false;
}

function selectFirstMatch() {
 if (limitedClients.value.length) {
  selectClient(limitedClients.value[0]);
 }
}

function clearSelection() {
 searchTerm.value = "";
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
watch(() => props.clients, syncFromModel, { immediate: true });

onMounted(() => {
 document.addEventListener("pointerdown", onDocumentPointerDown);
});

onBeforeUnmount(() => {
 document.removeEventListener("pointerdown", onDocumentPointerDown);
});
</script>

<style scoped>
.client-combobox__menu {
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

.client-combobox__option {
 width: 100%;
 border: 1px solid transparent;
 border-radius: 0.9rem;
 padding: 0.8rem 0.9rem;
 text-align: left;
 background: transparent;
 color: var(--text-primary);
 transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.client-combobox__option:hover,
.client-combobox__option.is-selected {
 background: color-mix(in srgb, var(--brand-accent) 12%, var(--surface-elevated));
 border-color: color-mix(in srgb, var(--brand-accent) 28%, transparent);
 transform: translateY(-1px);
}

.client-combobox__empty {
 padding: 0.85rem 0.9rem;
 color: var(--text-muted);
}

.client-combobox :deep(.form-control),
.client-combobox :deep(.input-group-text) {
 color: var(--text-primary);
 background: var(--surface-elevated);
 border-color: var(--border-soft);
}

.client-combobox :deep(.form-control::placeholder) {
 color: var(--text-muted);
}

.client-combobox :deep(.form-control:focus) {
 box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--brand-accent) 18%, transparent);
 border-color: color-mix(in srgb, var(--brand-accent) 36%, var(--border-soft));
}

.client-combobox :deep(.btn-outline-secondary) {
 --bs-btn-color: var(--text-muted);
 --bs-btn-border-color: var(--border-soft);
 --bs-btn-hover-color: var(--text-primary);
 --bs-btn-hover-bg: color-mix(in srgb, var(--surface-elevated) 78%, var(--brand-primary));
 --bs-btn-hover-border-color: var(--border-strong);
}
</style>
