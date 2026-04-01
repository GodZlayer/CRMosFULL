<template>
  <span class="be-badge" :class="badgeClass">
    <span class="rounded-circle d-inline-block" style="width: 8px; height: 8px; background: currentColor;"></span>
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  label: string;
  tone?: string;
}>();

const badgeClass = computed(() => `bg-${props.tone || "secondary"} bg-opacity-10 text-${props.tone || "secondary"}`);
</script>
