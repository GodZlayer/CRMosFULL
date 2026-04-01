<template>
  <div
    v-if="modelValue"
    class="modal fade show d-block app-modal-shell"
    tabindex="-1"
    style="background: rgba(10, 26, 45, 0.56);"
    @click.self="$emit('update:modelValue', false)">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-fullscreen-md-down app-modal-dialog" :class="dialogClass">
      <div class="modal-content border-0 rounded-5 overflow-hidden">
        <div class="modal-header border-0 pb-0 px-4 pt-4">
          <div>
            <div class="small fw-semibold">{{ eyebrow }}</div>
            <h2 class="h4 fw-bold mb-0">{{ title }}</h2>
          </div>
          <button type="button" class="btn btn-light rounded-circle" @click="$emit('update:modelValue', false)">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body px-4 pb-4">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue: boolean;
  title: string;
  eyebrow: string;
  size?: "lg" | "xl" | "full";
}>();

defineEmits<{
  (event: "update:modelValue", value: boolean): void;
}>();

const dialogClass = computed(() => {
  if (props.size === "full") {
    return "modal-fullscreen";
  }
  return props.size === "lg" ? "modal-lg" : "modal-xl";
});
</script>
