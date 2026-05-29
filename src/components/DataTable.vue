<template>
  <div class="panel-card print-panel data-table-shell" :class="{ 'data-table-shell--auto-height': isAutoTableHeight }">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3 no-print">
      <div>
        <div class="small fw-semibold">{{ eyebrow }}</div>
        <h3 class="h5 fw-bold mb-0">{{ title }}</h3>
      </div>

      <div class="table-actions">
        <div class="table-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input
            v-model.trim="quickSearch"
            type="search"
            class="form-control form-control-sm table-search__input"
            placeholder="Pesquisar na lista"
            aria-label="Pesquisar na lista"
          />
          <button
            v-if="quickSearch"
            type="button"
            class="btn btn-link btn-sm table-search__clear"
            @click="quickSearch = ''">
            Limpar
          </button>
        </div>

        <div v-if="!isCardMode" class="table-preferences">
          <div class="page-size-controls" role="group" aria-label="Itens por pagina">
            <span class="page-size-controls__label">Por pagina</span>
            <div class="page-size-controls__buttons">
              <button
                v-for="size in pageSizeOptions"
                :key="size"
                type="button"
                class="btn btn-outline-secondary btn-sm rounded-pill"
                :class="{ active: pageSize === size }"
                @click="setPageSize(size)">
                {{ size }}
              </button>
            </div>
          </div>

          <div class="page-size-controls" role="group" aria-label="Altura da lista">
            <span class="page-size-controls__label">Altura</span>
            <div class="page-size-controls__buttons">
              <button
                v-for="option in tableHeightOptions"
                :key="option.value"
                type="button"
                class="btn btn-outline-secondary btn-sm rounded-pill"
                :class="{ active: tableHeight === option.value }"
                @click="setTableHeight(option.value)">
                {{ option.label }}
              </button>
            </div>
          </div>

          <details v-if="toggleableColumns.length" class="action-menu__details table-preferences__details">
            <summary class="action-menu__toggle table-preferences__toggle">
              <i class="fa-solid fa-table-columns"></i>
              <span class="table-preferences__toggle-copy">Colunas {{ visibleColumnFields.length }}/{{ toggleableColumns.length }}</span>
            </summary>

            <div class="action-menu__list table-preferences__list">
              <div class="table-preferences__list-head">
                <strong>Colunas visiveis</strong>
                <div class="table-preferences__list-actions">
                  <button type="button" class="btn btn-link btn-sm p-0" @click.prevent.stop="showAllColumns">
                    Mostrar todas
                  </button>
                  <button type="button" class="btn btn-link btn-sm p-0" @click.prevent.stop="resetVisibleColumns">
                    Padrao
                  </button>
                </div>
              </div>

              <label
                v-for="column in toggleableColumns"
                :key="column.field"
                class="table-preferences__column">
                <input
                  class="form-check-input"
                  type="checkbox"
                  :checked="isColumnVisible(column.field)"
                  :disabled="isColumnVisible(column.field) && visibleColumnFields.length === 1"
                  @change="toggleColumnVisibility(column.field)"
                />
                <span class="table-preferences__column-copy">{{ column.title || column.field }}</span>
              </label>
            </div>
          </details>
        </div>

        <button v-if="allowCsv" class="btn btn-outline-secondary btn-sm rounded-pill" @click="downloadCsv">
          <i class="fa-solid fa-file-csv me-2"></i>
          CSV
        </button>

        <button v-if="allowPrint" class="btn btn-outline-secondary btn-sm rounded-pill" @click="printTable">
          <i class="fa-solid fa-print me-2"></i>
          Imprimir
        </button>
      </div>
    </div>

    <div v-if="isCardMode" class="data-cards">
      <article
        v-for="row in filteredRows"
        :key="String(resolveRowKey(row))"
        class="data-card"
        @click="handleCardClick($event, row)">
        <div class="data-card__header">
          <div v-if="selectableRows" class="data-card__selection">
            <input
              class="form-check-input"
              type="checkbox"
              :checked="isRowSelected(row)"
              @click.stop
              @change="toggleCardSelection(row, $event)"
            />
          </div>

          <div class="data-card__main">
            <div class="d-flex align-items-start justify-content-between gap-3">
              <div class="min-w-0 flex-grow-1">
                <div class="data-card__title">{{ resolveCardTitle(row) }}</div>
                <div v-if="resolveCardSubtitle(row)" class="data-card__subtitle">{{ resolveCardSubtitle(row) }}</div>
              </div>

              <span
                v-if="resolveCardBadge(row)"
                class="badge rounded-pill"
                :class="badgeClass(resolveCardBadge(row)?.tone)">
                {{ resolveCardBadge(row)?.label }}
              </span>
            </div>

            <div v-if="resolvedCardFields(row).length" class="data-card__meta">
              <div
                v-for="field in resolvedCardFields(row)"
                :key="field.key"
                class="data-card__field"
                :class="{ 'data-card__field--full': field.fullWidth }">
                <span class="data-card__label">{{ field.label }}</span>
                <span
                  :class="[ 'data-card__value', resolveCardFieldTone(field, row) ? 'data-card__value--badge badge' : '', resolveCardFieldTone(field, row) ? badgeClass(resolveCardFieldTone(field, row)) : '' ]"
                  :data-row-action="field.actionLike ? 'true' : null">
                  {{ resolveCardFieldValue(field, row) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="cardActions?.length" class="data-card__footer no-print">
          <div class="action-menu" data-row-action="true">
            <details class="action-menu__details" data-row-action="true">
              <summary class="action-menu__toggle" data-row-action="true">
                <i class="fa-solid fa-ellipsis-vertical" data-row-action="true"></i>
              </summary>
              <div class="action-menu__list" data-row-action="true">
                <button
                  v-for="action in cardActions"
                  :key="action.key"
                  type="button"
                  class="action-menu__item"
                  :class="{ 'action-delete': action.tone === 'danger' }"
                  data-row-action="true"
                  @click="triggerCardAction(action, row, $event)">
                  <i v-if="action.icon" :class="`${action.icon} me-2`"></i>
                  {{ action.label }}
                </button>
              </div>
            </details>
          </div>
        </div>
      </article>

      <div v-if="!filteredRows.length" class="panel-card text-center">
        Nenhum registro encontrado para o filtro atual.
      </div>
    </div>

    <div v-else ref="tableTarget"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType } from "vue";
import { useUiStore } from "../stores/ui";

interface CardField {
  key: string;
  label: string;
  value?: string | number | ((row: Record<string, unknown>) => unknown);
  tone?: string | ((row: Record<string, unknown>) => string | undefined);
  fullWidth?: boolean;
  actionLike?: boolean;
}

interface CardAction {
  key: string;
  label: string;
  icon?: string;
  tone?: "primary" | "secondary" | "danger";
  handler: (row: Record<string, unknown>) => void | Promise<void>;
}

interface CardBadge {
  label: string;
  tone?: string;
}

interface PrintSummaryField {
  label: string;
  field: string;
  format?: "currency" | "number";
}

interface TableColumnLike {
  field?: string;
  title?: string;
  visible?: boolean;
  cssClass?: string;
  variableHeight?: boolean;
  [key: string]: unknown;
}

const props = defineProps({
  title: { type: String, required: true },
  eyebrow: { type: String, required: true },
  rows: { type: Array as PropType<Record<string, unknown>[]>, required: true },
  columns: { type: Array as PropType<TableColumnLike[]>, required: true },
  allowCsv: Boolean,
  allowPrint: Boolean,
  allowAutoColumns: {
    type: Boolean,
    default: true
  },
  autoColumnsDefaultVisible: {
    type: Boolean,
    default: false
  },
  height: String,
  layout: String,
  selectableRows: Boolean,
  responsiveMode: {
    type: String as PropType<"auto" | "table" | "cards">,
    default: "table"
  },
  rowKeyField: {
    type: String,
    default: "id"
  },
  selectedRowKeys: {
    type: Array as PropType<Array<string | number>>,
    default: undefined
  },
  cardTitle: {
    type: [String, Function] as PropType<string | ((row: Record<string, unknown>) => unknown)>,
    default: ""
  },
  cardSubtitle: {
    type: [String, Function] as PropType<string | ((row: Record<string, unknown>) => unknown)>,
    default: ""
  },
  cardFields: {
    type: Array as PropType<CardField[]>,
    default: () => []
  },
  cardBadge: {
    type: Function as PropType<(row: Record<string, unknown>) => CardBadge | null | undefined>,
    default: undefined
  },
  cardActions: {
    type: Array as PropType<CardAction[]>,
    default: () => []
  },
  printSummaryFields: {
    type: Array as PropType<PrintSummaryField[]>,
    default: () => []
  },
  preferencesVersion: {
    type: String,
    default: "v1"
  }
});

const emit = defineEmits<{
  (event: "row-click", row: Record<string, unknown>): void;
  (event: "selection-change", rows: Record<string, unknown>[]): void;
  (event: "selection-keys-change", keys: Array<string | number>): void;
}>();

const ui = useUiStore();
const tableTarget = ref<HTMLElement | null>(null);
const selectedRowKeys = ref<Array<string | number>>([]);
const pageSizeOptions = [8, 16, 24, 50, 100];
const baseHeightOptions = ["420px", "640px", "860px", "1100px", "auto"];
const autoColumnLabelMap: Record<string, string> = {
  active: "Ativo",
  active_orders_count: "OS ativas",
  approval_status: "Aprovacao",
  brand: "Marca",
  category: "Categoria",
  client_name: "Cliente",
  code: "Codigo",
  compatibility: "Compatibilidade",
  concluded_at: "Concluida em",
  cost_amount: "Valor de compra",
  created_at: "Criado em",
  delivered_at: "Entregue em",
  description: "Descricao",
  equipment: "Equipamento",
  entry_type: "Tipo",
  id: "ID",
  is_complete: "Completo",
  is_store_inventory: "Inventario da loja",
  item_condition: "Condicao",
  last_order_code: "Ultima OS",
  last_previous_cost_amount: "Ult. compra ant.",
  last_previous_price_amount: "Ult. venda ant.",
  last_used_at: "Ultimo uso",
  legacy_section: "Secao legado",
  legacy_source_id: "ID legado",
  legacy_source_sheet: "Aba legado",
  linked_orders_count: "OS vinculadas",
  location_type: "Destino",
  min_stock: "Minimo",
  name: "Nome",
  open_quantity: "Reservado em OS",
  order_code: "OS",
  order_status: "Status OS",
  payment_method: "Pagamento",
  price_amount: "Valor de venda",
  profit_percent: "Lucro %",
  quantity: "Quantidade",
  source_row: "Linha origem",
  source_sheet: "Aba origem",
  source_workbook: "Arquivo origem",
  stock_health: "Saude estoque",
  stock_health_label: "Situacao",
  stock_cost_value: "Valor custo estoque",
  stock_quantity: "Estoque",
  stock_value: "Valor em estoque",
  store_name: "Loja",
  subcategory: "Subcategoria",
  total: "Total",
  total_amount: "Total",
  total_quantity_used: "Saida total",
  unit_margin: "Margem unit.",
  updated_at: "Atualizado em"
};
let tableInstance: any = null;
let originalPageSize: number | null = null;
let originalPage: number | null = null;
let printPrepared = false;
let scheduledRenderId = 0;
let isComponentUnmounted = false;
let hasCustomVisibleColumns = false;
let isSyncingSelection = false;
let lastSelectionAnchorKey: string | number | null = null;

const pageSize = ref(resolveInitialPageSize());
const tableHeight = ref(resolveInitialTableHeight());
const visibleColumnFields = ref(resolveInitialVisibleColumnFields());
const quickSearch = ref("");

const isCardMode = computed(() => {
  if (props.responsiveMode === "cards") {
    return true;
  }
  if (props.responsiveMode === "table") {
    return false;
  }
  return ui.isPhone;
});

const isAutoTableHeight = computed(() => tableHeight.value === "auto");

const resolvedColumns = computed(() => listResolvedColumns());
const toggleableColumns = computed(() => listToggleableColumns());

const visibleFieldSet = computed(() => new Set(visibleColumnFields.value));

const displayColumns = computed(() =>
  resolvedColumns.value.filter((column) => {
    if (!column.field || column.field === "actions") {
      return true;
    }
    return visibleFieldSet.value.has(String(column.field));
  }).map((column) => {
    if (!column.field || column.field === "actions") {
      return column;
    }
    return {
      ...column,
      visible: true
    };
  })
);

const fallbackColumns = computed(() =>
  displayColumns.value.filter((column) => column.field && column.field !== "actions")
);

const searchableColumns = computed(() =>
  resolvedColumns.value.filter((column) => isToggleableColumn(column)).map((column) => String(column.field))
);

const filteredRows = computed(() => {
  const normalizedSearch = normalizeSearchText(quickSearch.value);
  if (!normalizedSearch) {
    return props.rows;
  }

  return props.rows.filter((row) => rowMatchesQuickSearch(row, normalizedSearch));
});

const tableHeightOptions = computed(() => {
  const values = Array.from(
    new Set(
      [props.height, tableHeight.value, ...baseHeightOptions]
        .map((value) => normalizeHeightValue(value))
        .filter(Boolean)
    )
  ) as string[];

  return values.map((value) => ({
    value,
    label: value === "auto" ? "Auto" : String(Number.parseInt(value, 10))
  }));
});

function resolveRowKey(row: Record<string, unknown>) {
  const key = row[props.rowKeyField as keyof typeof row];
  return typeof key === "string" || typeof key === "number" ? key : JSON.stringify(row);
}

function slugify(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function storageScope() {
  return `${slugify(props.eyebrow)}:${slugify(props.title)}:${slugify(props.preferencesVersion)}`;
}

function pageSizeStorageKey() {
  return `be:data-table:page-size:${storageScope()}`;
}

function tableHeightStorageKey() {
  return `be:data-table:height:${storageScope()}`;
}

function visibleColumnsStorageKey() {
  return `be:data-table:visible-columns:${storageScope()}`;
}

function listResolvedColumns() {
  if (!props.allowAutoColumns) {
    return [...props.columns];
  }

  const explicitFieldSet = new Set(
    props.columns
      .map((column) => String(column.field || "").trim())
      .filter(Boolean)
  );

  const derivedColumns = new Map<string, TableColumnLike>();

  for (const row of props.rows) {
    for (const [field, value] of Object.entries(row || {})) {
      if (!field || explicitFieldSet.has(field) || !shouldIncludeAutoColumn(field, value)) {
        continue;
      }
      if (!derivedColumns.has(field)) {
        derivedColumns.set(field, buildAutoColumn(field, value));
      }
    }
  }

  return [
    ...props.columns,
    ...Array.from(derivedColumns.values()).sort((left, right) =>
      String(left.title || left.field).localeCompare(String(right.title || right.field), "pt-BR")
    )
  ];
}

function listToggleableColumns() {
  return listResolvedColumns().filter((column) => isToggleableColumn(column)).map((column) => ({
    field: String(column.field),
    title: column.title || String(column.field)
  }));
}

function defaultVisibleColumnFields() {
  const resolved = listResolvedColumns();
  const toggleable = listToggleableColumns();
  const defaults = toggleable
    .filter((column) => resolved.find((candidate) => candidate.field === column.field)?.visible !== false)
    .map((column) => column.field);

  if (defaults.length) {
    return defaults;
  }
  return toggleable.map((column) => column.field);
}

function normalizeVisibleColumnFields(fields: string[] | null | undefined) {
  const validFields = new Set(listToggleableColumns().map((column) => column.field));
  const nextFields = (fields || []).filter((field) => validFields.has(field));
  if (nextFields.length) {
    return Array.from(new Set(nextFields));
  }
  return defaultVisibleColumnFields();
}

function normalizeHeightValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "auto") {
    return "auto";
  }
  if (/^\d+$/.test(normalized)) {
    return `${normalized}px`;
  }
  return normalized;
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function searchableValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return normalizeSearchText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => searchableValue(item)).join(" ");
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => searchableValue(item))
      .join(" ");
  }

  return normalizeSearchText(String(value));
}

function areKeyArraysEqual(left: Array<string | number>, right: Array<string | number>) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function rowMatchesQuickSearch(row: Record<string, unknown>, search: string) {
  return searchableColumns.value.some((field) => searchableValue(row[field]).includes(search));
}

function applyTableQuickFilter() {
  if (isCardMode.value || !tableInstance) {
    return;
  }
  const normalizedSearch = normalizeSearchText(quickSearch.value);
  if (!normalizedSearch) {
    tableInstance.clearFilter?.(true);
    return;
  }
  tableInstance.setFilter?.((row: Record<string, unknown>) => rowMatchesQuickSearch(row, normalizedSearch));
}

function resolveInitialPageSize() {
  if (typeof window === "undefined") {
    return 24;
  }
  const stored = Number(window.localStorage.getItem(pageSizeStorageKey()) || 24);
  return pageSizeOptions.includes(stored) ? stored : 24;
}

function resolveInitialTableHeight() {
  const fallback = normalizeHeightValue(props.height) || "auto";
  return fallback;
}

function resolveInitialVisibleColumnFields() {
  const fallback = defaultVisibleColumnFields();
  if (typeof window === "undefined") {
    hasCustomVisibleColumns = false;
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(visibleColumnsStorageKey());
    if (!raw) {
      hasCustomVisibleColumns = false;
      return fallback;
    }
    const stored = JSON.parse(raw);
    const normalized = normalizeVisibleColumnFields(Array.isArray(stored) ? stored : []);
    hasCustomVisibleColumns = normalized.length > 0;
    return hasCustomVisibleColumns ? normalized : fallback;
  } catch {
    hasCustomVisibleColumns = false;
    return fallback;
  }
}

function persistPageSize(value: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(pageSizeStorageKey(), String(value));
}

function persistTableHeight(value: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(tableHeightStorageKey(), value);
}

function persistVisibleColumnFields(fields: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(visibleColumnsStorageKey(), JSON.stringify(fields));
}

function clearPersistedVisibleColumnFields() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(visibleColumnsStorageKey());
}

function setPageSize(value: number) {
  pageSize.value = value;
  persistPageSize(value);
  if (!isCardMode.value && tableInstance) {
    tableInstance.setPageSize?.(value);
    tableInstance.setPage?.(1);
  }
}

function setTableHeight(value: string) {
  tableHeight.value = normalizeHeightValue(value) || "auto";
  persistTableHeight(tableHeight.value);
  void queueTableRender(true);
}

function showAllColumns() {
  hasCustomVisibleColumns = true;
  visibleColumnFields.value = toggleableColumns.value.map((column) => column.field);
  persistVisibleColumnFields(visibleColumnFields.value);
  void queueTableRender(true);
}

function resetVisibleColumns() {
  hasCustomVisibleColumns = false;
  visibleColumnFields.value = defaultVisibleColumnFields();
  clearPersistedVisibleColumnFields();
  void queueTableRender(true);
}

function isColumnVisible(field: string) {
  return visibleFieldSet.value.has(field);
}

function toggleColumnVisibility(field: string) {
  hasCustomVisibleColumns = true;
  if (visibleFieldSet.value.has(field)) {
    if (visibleColumnFields.value.length === 1) {
      return;
    }
    visibleColumnFields.value = visibleColumnFields.value.filter((item) => item !== field);
  } else {
    visibleColumnFields.value = [...visibleColumnFields.value, field];
  }

  visibleColumnFields.value = normalizeVisibleColumnFields(visibleColumnFields.value);
  persistVisibleColumnFields(visibleColumnFields.value);
  void queueTableRender(true);
}

function emitSelectionChange() {
  emit("selection-keys-change", [...selectedRowKeys.value]);
  emit(
    "selection-change",
    props.rows.filter((row) => selectedRowKeys.value.includes(resolveRowKey(row)))
  );
}

function syncTableSelectionFromKeys() {
  if (isCardMode.value || !props.selectableRows || !tableInstance) {
    return;
  }
  isSyncingSelection = true;
  const rows = tableInstance.getRows?.() ?? [];
  rows.forEach((row: any) => {
    const key = resolveRowKey(row.getData());
    const isSelected = row.isSelected?.() ?? false;
    const shouldBeSelected = selectedRowKeys.value.includes(key);
    if (shouldBeSelected && !isSelected) {
      row.select?.();
    }
    if (!shouldBeSelected && isSelected) {
      row.deselect?.();
    }
  });
  queueMicrotask(() => {
    isSyncingSelection = false;
  });
}

function selectRangeToKey(targetKey: string | number) {
  const orderedKeys = filteredRows.value.map((row) => resolveRowKey(row));
  const targetIndex = orderedKeys.findIndex((key) => key === targetKey);
  if (targetIndex < 0) {
    return false;
  }

  const anchorIndex = lastSelectionAnchorKey === null
    ? -1
    : orderedKeys.findIndex((key) => key === lastSelectionAnchorKey);
  const start = anchorIndex >= 0 ? Math.min(anchorIndex, targetIndex) : targetIndex;
  const end = anchorIndex >= 0 ? Math.max(anchorIndex, targetIndex) : targetIndex;
  const rangeKeys = orderedKeys.slice(start, end + 1);
  selectedRowKeys.value = Array.from(new Set([...selectedRowKeys.value, ...rangeKeys]));
  syncTableSelectionFromKeys();
  emitSelectionChange();
  return true;
}

function toggleSelectionKey(key: string | number) {
  if (selectedRowKeys.value.includes(key)) {
    selectedRowKeys.value = selectedRowKeys.value.filter((item) => item !== key);
  } else {
    selectedRowKeys.value = [...selectedRowKeys.value, key];
  }
  lastSelectionAnchorKey = key;
  syncTableSelectionFromKeys();
  emitSelectionChange();
}

function handleRowSelectionShortcut(event: MouseEvent, rowData: Record<string, unknown>) {
  if (!props.selectableRows || !(event.ctrlKey || event.metaKey || event.shiftKey)) {
    return false;
  }

  const key = resolveRowKey(rowData);
  event.preventDefault();
  event.stopPropagation();

  if (event.shiftKey && selectRangeToKey(key)) {
    lastSelectionAnchorKey = key;
    return true;
  }

  toggleSelectionKey(key);
  return true;
}

function handleTableSelectionChanged() {
  if (isSyncingSelection) {
    return;
  }
  const visibleKeys = new Set(filteredRows.value.map((row) => resolveRowKey(row)));
  const selectedVisibleKeys = new Set(
    (tableInstance?.getSelectedData?.() ?? []).map((row: Record<string, unknown>) => resolveRowKey(row))
  );
  selectedRowKeys.value = [
    ...selectedRowKeys.value.filter((key) => !visibleKeys.has(key)),
    ...filteredRows.value.map((row) => resolveRowKey(row)).filter((key) => selectedVisibleKeys.has(key))
  ];
  emitSelectionChange();
}

function cellTooltip(_: MouseEvent, cell: any) {
  const value = cell?.getValue?.();
  if (value === null || value === undefined || value === "") {
    return false;
  }
  return String(value);
}

function isToggleableColumn(column: TableColumnLike) {
  return Boolean(column.field && column.field !== "actions");
}

function shouldIncludeAutoColumn(field: string, value: unknown) {
  if (!field || field === "actions" || field.startsWith("_")) {
    return false;
  }

  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (value instanceof Date) {
    return true;
  }

  return false;
}

function humanizeFieldLabel(field: string) {
  if (autoColumnLabelMap[field]) {
    return autoColumnLabelMap[field];
  }

  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function isCurrencyField(field: string) {
  return /(^|_)(amount|value|margin)$/.test(field) || ["price_amount", "cost_amount", "stock_cost_value", "stock_value", "unit_margin"].includes(field);
}

function isPercentField(field: string) {
  return field.endsWith("_percent") || field === "profit_percent";
}

function isDateField(field: string) {
  return field.endsWith("_at") || field.endsWith("_date");
}

function isNumericLike(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDateValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const raw = String(value);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toLocaleString("pt-BR");
}

function formatCurrencyValue(value: unknown) {
  if (!isNumericLike(value)) {
    return value === null || value === undefined || value === "" ? "-" : String(value);
  }
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function formatPercentValue(value: unknown) {
  if (!isNumericLike(value)) {
    return value === null || value === undefined || value === "" ? "-" : String(value);
  }
  return `${Number(value).toFixed(2)}%`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAutoColumnValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Nao";
  }

  if (isCurrencyField(field)) {
    return formatCurrencyValue(value);
  }

  if (isPercentField(field)) {
    return formatPercentValue(value);
  }

  if (isDateField(field)) {
    return formatDateValue(value);
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR");
  }

  return String(value);
}

function buildAutoColumn(field: string, sampleValue: unknown): TableColumnLike {
  const isLongTextField = /description|notes|observa|payload|subtitle|title/i.test(field);

  return {
    field,
    title: humanizeFieldLabel(field),
    visible: props.autoColumnsDefaultVisible,
    minWidth: isCurrencyField(field) ? 140 : isLongTextField ? 240 : 150,
    hozAlign: typeof sampleValue === "number" && !isLongTextField ? "right" : "left",
    cssClass: isLongTextField ? "cell-wrap" : "",
    variableHeight: isLongTextField,
    formatter: (cell: any) => escapeHtml(formatAutoColumnValue(field, cell.getValue?.()))
  };
}

function normalizeColumns(columns: TableColumnLike[]) {
  return columns.map((column) => ({
    minWidth: column.field === "id" ? 80 : 130,
    tooltip: column.field === "actions" ? false : cellTooltip,
    headerSortTristate: false,
    ...column
  }));
}

function buildColumns() {
  const normalized = normalizeColumns(displayColumns.value);
  if (!props.selectableRows) {
    return normalized;
  }

  return [
    {
      formatter: "rowSelection",
      titleFormatter: "rowSelection",
      titleFormatterParams: {
        rowRange: "active"
      },
      hozAlign: "center",
      headerHozAlign: "center",
      headerSort: false,
      frozen: true,
      resizable: false,
      width: 56,
      cssClass: "selection-cell",
      cellClick: (event: MouseEvent, cell: any) => {
        event.stopPropagation();
        const key = resolveRowKey(cell.getRow().getData());
        if (event.shiftKey && selectRangeToKey(key)) {
          lastSelectionAnchorKey = key;
          return;
        }
        toggleSelectionKey(key);
      }
    },
    ...normalized
  ];
}

function currentTabulatorHeight() {
  return isAutoTableHeight.value ? undefined : tableHeight.value;
}

function destroyTable() {
  if (!tableInstance) {
    return;
  }
  try {
    tableInstance.destroy?.();
  } catch (error) {
    console.warn("[DataTable] Falha ao destruir a tabela.", error);
  }
  tableInstance = null;
}

async function queueTableRender(forceRecreate = false) {
  const renderId = ++scheduledRenderId;
  await nextTick();
  if (isComponentUnmounted || renderId !== scheduledRenderId) {
    return;
  }
  renderTable(forceRecreate);
}

function renderTable(forceRecreate = false) {
  if (isCardMode.value) {
    destroyTable();
    return;
  }

  if (!tableTarget.value?.isConnected || !(window as any).Tabulator) {
    return;
  }

  if (forceRecreate) {
    destroyTable();
  }

  const shouldResetPagination = forceRecreate;

  if (!tableInstance) {
    tableInstance = new (window as any).Tabulator(tableTarget.value, {
      layout: props.layout ?? (ui.isMobileShell ? "fitColumns" : "fitDataStretch"),
      responsiveLayout: ui.isMobileShell ? "collapse" : false,
      selectableRows: props.selectableRows || false,
      selectableRowsPersistence: true,
      pagination: true,
      paginationSize: pageSize.value,
      height: currentTabulatorHeight(),
      data: props.rows,
      columnDefaults: {
        vertAlign: "middle",
        headerWordWrap: true,
        resizable: true
      },
      placeholder: "Nenhum registro encontrado para o filtro atual.",
      columns: buildColumns(),
      rowClick: (event: MouseEvent, row: any) => {
        const target = event.target as HTMLElement | null;
        const rowData = row.getData();
        if (
          target?.closest("[data-row-action='true']") ||
          target?.closest(".tabulator-row-header") ||
          target?.closest(".selection-cell")
        ) {
          return;
        }
        if (handleRowSelectionShortcut(event, rowData)) {
          return;
        }
        emit("row-click", rowData);
      }
    });

    if (props.selectableRows) {
      tableInstance.on?.("rowSelectionChanged", handleTableSelectionChanged);
    }
    applyTableQuickFilter();
    syncTableSelectionFromKeys();
    return;
  }

  tableInstance.setColumns(buildColumns());
  tableInstance.setPageSize?.(pageSize.value);
  tableInstance.replaceData(props.rows);
  applyTableQuickFilter();
  syncTableSelectionFromKeys();
  if (shouldResetPagination) {
    tableInstance.setPage?.(1);
  }
  queueMicrotask(emitSelectionChange);
}

function escapeCsv(value: unknown) {
  const normalized = String(value ?? "").replace(/"/g, '""');
  return `"${normalized}"`;
}

function downloadCsv() {
  if (!isCardMode.value && tableInstance?.download) {
    tableInstance.download("csv", "relatorio.csv");
    return;
  }

  const exportColumns = fallbackColumns.value;
  const header = exportColumns.map((column) => escapeCsv(column.title || column.field)).join(",");
  const lines = filteredRows.value.map((row) =>
    exportColumns.map((column) => escapeCsv(row[String(column.field)])).join(",")
  );
  const content = [header, ...lines].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "relatorio.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function printColumnValue(row: Record<string, unknown>, column: TableColumnLike) {
  const field = String(column.field || "");
  if (!field) {
    return "-";
  }
  return formatAutoColumnValue(field, row[field]);
}

function sumPrintSummaryField(rows: Record<string, unknown>[], field: string) {
  return rows.reduce((sum, row) => {
    const value = Number(row[field] ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function formatPrintSummaryValue(value: number, format: PrintSummaryField["format"] = "number") {
  if (format === "currency") {
    return formatCurrencyValue(value);
  }
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function buildPrintSummaryHtml(rows: Record<string, unknown>[]) {
  if (!props.printSummaryFields.length) {
    return "";
  }

  const cards = props.printSummaryFields
    .map((field) => {
      const total = sumPrintSummaryField(rows, field.field);
      return `<div class="print-summary__card"><div class="print-summary__label">${escapeHtml(field.label)}</div><div class="print-summary__value">${escapeHtml(formatPrintSummaryValue(total, field.format))}</div></div>`;
    })
    .join("");

  return `<section class="print-summary">${cards}</section>`;
}

function buildPrintTableHtml(rows = filteredRows.value, titleSuffix = "") {
  const exportColumns = fallbackColumns.value;
  const summary = buildPrintSummaryHtml(rows);
  const head = exportColumns
    .map((column) => `<th>${escapeHtml(column.title || column.field || "Coluna")}</th>`)
    .join("");
  const body = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${exportColumns
              .map((column) => `<td>${escapeHtml(printColumnValue(row, column))}</td>`)
              .join("")}</tr>`
        )
        .join("")
    : `<tr><td colspan="${Math.max(exportColumns.length, 1)}">Nenhum registro encontrado para o filtro atual.</td></tr>`;

  return [
    "<!DOCTYPE html>",
    "<html lang=\"pt-BR\">",
    "<head>",
    "<meta charset=\"utf-8\" />",
    `<title>${escapeHtml(`${props.title}${titleSuffix}`)}</title>`,
    "<style>",
    "body { font-family: Arial, sans-serif; margin: 24px; color: #111; }",
    ".print-head { margin-bottom: 16px; }",
    ".print-head__eyebrow { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 6px; }",
    ".print-head__title { font-size: 22px; font-weight: 700; margin: 0 0 4px; }",
    ".print-head__meta { font-size: 12px; color: #666; }",
    ".print-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin: 0 0 16px; }",
    ".print-summary__card { border: 1px solid #d0d7de; border-radius: 10px; padding: 10px 12px; background: #fafafa; }",
    ".print-summary__label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }",
    ".print-summary__value { font-size: 18px; font-weight: 800; color: #111; }",
    "table { width: 100%; border-collapse: collapse; table-layout: auto; }",
    "th, td { border: 1px solid #d0d7de; padding: 8px 10px; text-align: left; vertical-align: top; font-size: 12px; }",
    "th { background: #f3f4f6; font-weight: 700; }",
    "tr { break-inside: avoid; }",
    "@page { margin: 12mm; }",
    "</style>",
    "</head>",
    "<body>",
    `<div class="print-head"><div class="print-head__eyebrow">${escapeHtml(props.eyebrow)}</div><h1 class="print-head__title">${escapeHtml(`${props.title}${titleSuffix}`)}</h1><div class="print-head__meta">${escapeHtml(`Total listado: ${rows.length}`)}</div></div>`,
    summary,
    `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    "</body>",
    "</html>"
  ].join("");
}

function openPrintWindow(html: string) {
  const printWindow = window.open("", "_blank", "width=1200,height=800");
  if (!printWindow) {
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
    printWindow.setTimeout(() => printWindow.close(), 250);
  };
}

function printTable() {
  openPrintWindow(buildPrintTableHtml());
}

function printRows(rows: Record<string, unknown>[], titleSuffix = " - selecionados") {
  openPrintWindow(buildPrintTableHtml(rows, titleSuffix));
}

function selectAllRows() {
  if (isCardMode.value) {
    selectedRowKeys.value = props.rows.map((row) => resolveRowKey(row));
    emitSelectionChange();
    return;
  }
  selectedRowKeys.value = Array.from(new Set([
    ...selectedRowKeys.value,
    ...filteredRows.value.map((row) => resolveRowKey(row))
  ]));
  syncTableSelectionFromKeys();
  emitSelectionChange();
}

function clearSelection() {
  selectedRowKeys.value = [];
  if (!isCardMode.value) {
    syncTableSelectionFromKeys();
  }
  emitSelectionChange();
}

function isRowSelected(row: Record<string, unknown>) {
  return selectedRowKeys.value.includes(resolveRowKey(row));
}

function toggleCardSelection(row: Record<string, unknown>, event?: Event) {
  const key = resolveRowKey(row);
  const mouseEvent = event as MouseEvent | undefined;
  if (mouseEvent?.shiftKey && selectRangeToKey(key)) {
    lastSelectionAnchorKey = key;
    return;
  }
  toggleSelectionKey(key);
}

function clearSelectionAnchorIfNeeded() {
  if (lastSelectionAnchorKey !== null && !selectedRowKeys.value.includes(lastSelectionAnchorKey)) {
    lastSelectionAnchorKey = null;
  }
}

watch(selectedRowKeys, clearSelectionAnchorIfNeeded);

function handleCardClick(event: MouseEvent, row: Record<string, unknown>) {
  const target = event.target as HTMLElement | null;
  if (
    target?.closest("[data-row-action='true']") ||
    target?.closest("summary") ||
    target?.closest("details") ||
    target?.closest("input[type='checkbox']")
  ) {
    return;
  }
  if (handleRowSelectionShortcut(event, row)) {
    return;
  }
  emit("row-click", row);
}

function readPropValue(
  value: string | number | ((row: Record<string, unknown>) => unknown) | undefined,
  row: Record<string, unknown>
) {
  if (typeof value === "function") {
    return value(row);
  }
  if (typeof value === "string") {
    return row[value];
  }
  if (typeof value === "number") {
    return value;
  }
  return undefined;
}

function resolveCardTitle(row: Record<string, unknown>) {
  const explicit = readPropValue(props.cardTitle || undefined, row);
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return String(explicit);
  }
  return String(row[String(fallbackColumns.value[0]?.field)] || "Registro");
}

function resolveCardSubtitle(row: Record<string, unknown>) {
  const explicit = readPropValue(props.cardSubtitle || undefined, row);
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    return String(explicit);
  }
  const fallbackField = fallbackColumns.value[1]?.field;
  const fallback = fallbackField ? row[String(fallbackField)] : "";
  return fallback ? String(fallback) : "";
}

function resolveCardBadge(row: Record<string, unknown>) {
  return props.cardBadge ? props.cardBadge(row) || null : null;
}

function resolveCardFieldValue(field: CardField, row: Record<string, unknown>) {
  const value = readPropValue(field.value ?? field.key, row);
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  return String(value);
}

function resolveCardFieldTone(field: CardField, row: Record<string, unknown>) {
  if (typeof field.tone === "function") {
    return field.tone(row);
  }
  return field.tone;
}

function resolvedCardFields(_: Record<string, unknown>) {
  if (props.cardFields.length) {
    const configuredFields = props.cardFields.filter((field) => {
      const matchesToggleableField = toggleableColumns.value.some((column) => column.field === field.key);
      return !matchesToggleableField || visibleFieldSet.value.has(field.key);
    });

    const configuredKeys = new Set(configuredFields.map((field) => field.key));
    const autoFields = fallbackColumns.value
      .filter((column) => !configuredKeys.has(String(column.field)))
      .map((column) => ({
        key: String(column.field),
        label: column.title || String(column.field),
        value: String(column.field),
        fullWidth: Boolean(column.cssClass === "cell-wrap" || column.variableHeight)
      }));

    return [...configuredFields, ...autoFields];
  }

  return fallbackColumns.value.slice(2).map((column) => ({
    key: String(column.field),
    label: column.title || String(column.field),
    value: String(column.field),
    fullWidth: Boolean(column.cssClass === "cell-wrap" || column.variableHeight)
  }));
}

function badgeClass(tone: string | undefined | null) {
  if (!tone) {
    return "text-bg-secondary";
  }
  return `text-bg-${tone}`;
}

function triggerCardAction(action: CardAction, row: Record<string, unknown>, event: Event) {
  action.handler(row);
  (event.target as HTMLElement | null)?.closest("details")?.removeAttribute("open");
}

function refreshPreferencesFromStorage() {
  pageSize.value = resolveInitialPageSize();
  tableHeight.value = resolveInitialTableHeight();
  visibleColumnFields.value = resolveInitialVisibleColumnFields();
}

defineExpose({
  selectAllRows,
  clearSelection,
  printRows,
  getSelectedRows: () =>
    props.rows.filter((row) => selectedRowKeys.value.includes(resolveRowKey(row)))
});

onMounted(() => {
  isComponentUnmounted = false;
  void queueTableRender(true);
});

watch(isCardMode, () => {
  void queueTableRender(true);
  emitSelectionChange();
});

watch(
  () => [props.title, props.eyebrow],
  () => {
    refreshPreferencesFromStorage();
    void queueTableRender(true);
    emitSelectionChange();
  }
);

watch(
  () => resolvedColumns.value.map((column) => String(column.field || "")).join("|"),
  () => {
    visibleColumnFields.value = hasCustomVisibleColumns
      ? normalizeVisibleColumnFields(visibleColumnFields.value)
      : defaultVisibleColumnFields();
    if (hasCustomVisibleColumns) {
      persistVisibleColumnFields(visibleColumnFields.value);
    }
    void queueTableRender(true);
    emitSelectionChange();
  },
  { immediate: false }
);

watch(
  () => filteredRows.value,
  () => {
    if (isCardMode.value) {
      void queueTableRender();
    } else {
      void queueTableRender();
    }
  }
);

watch(
  () => props.selectedRowKeys,
  () => {
    if (!Array.isArray(props.selectedRowKeys)) {
      return;
    }
    const nextKeys = Array.from(new Set(props.selectedRowKeys));
    if (areKeyArraysEqual(selectedRowKeys.value, nextKeys)) {
      return;
    }
    selectedRowKeys.value = nextKeys;
    void queueTableRender();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  isComponentUnmounted = true;
  scheduledRenderId += 1;
  destroyTable();
});
</script>
