<template>
 <a v-if="sanitizedPhone" :href="href" class="phone-link" target="_blank" rel="noopener noreferrer">
 <i class="fa-brands fa-whatsapp"></i>
 <span>{{ phone }}</span>
 </a>
 <span v-else>{{ fallback || 'Não informado' }}</span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
 phone?: string | null;
 fallback?: string;
}>();

const sanitizedPhone = computed(() => String(props.phone || "").replace(/\D/g, ""));
const href = computed(() => `https://wa.me/${sanitizedPhone.value}`);
</script>