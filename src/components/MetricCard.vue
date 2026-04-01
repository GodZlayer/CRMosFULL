<template>
  <div class="metric-card p-4 h-100">
    <div class="d-flex justify-content-between align-items-start mb-4">
      <div>
        <div class="small fw-semibold mb-2">{{ title }}</div>
        <div class="fs-2 fw-bold">{{ value }}</div>
      </div>
      <div class="rounded-4 d-inline-flex align-items-center justify-content-center" :class="iconWrapClass" style="width: 54px; height: 54px;">
        <i :class="icon"></i>
      </div>
    </div>
    <div>{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  title: string;
  value: string | number;
  hint: string;
  icon: string;
  tone?: string;
}>();

const iconWrapClass = computed(() => {
  const tone = props.tone ?? "primary";
  return `bg-${tone} bg-opacity-10 text-${tone}`;
});
</script>
