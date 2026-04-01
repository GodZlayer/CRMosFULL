<template>
  <div class="panel-card order-wizard">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
      <div>
        <div class="small fw-semibold">Fluxo guiado</div>
        <h3 class="h5 fw-bold mb-0">Cadastro da OS em etapas</h3>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <span v-for="(step, index) in steps" :key="step.key" class="wizard-chip" :class="index === activeStep ? 'is-active' : index < activeStep ? 'is-complete' : ''">
          <span class="wizard-chip__index">{{ index + 1 }}</span>
          <span>{{ step.label }}</span>
        </span>
      </div>
    </div>

    <slot />

    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-4 pt-3 border-top">
      <button type="button" class="btn btn-light rounded-pill" :disabled="activeStep <= 0" @click="emit('back')">
        <i class="fa-solid fa-arrow-left me-2"></i>
        Voltar
      </button>
      <div class="d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-outline-secondary rounded-pill" @click="emit('save-draft')">
          <i class="fa-solid fa-floppy-disk me-2"></i>
          Salvar rascunho
        </button>
        <button v-if="activeStep < steps.length - 1" type="button" class="btn btn-primary rounded-pill" @click="emit('next')">
          Proximo
          <i class="fa-solid fa-arrow-right ms-2"></i>
        </button>
        <button v-else type="button" class="btn btn-success rounded-pill" @click="emit('finish')">
          <i class="fa-solid fa-check me-2"></i>
          Concluir OS
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  steps: Array<{ key: string; label: string }>;
  activeStep: number;
}>();

const emit = defineEmits<{
  (event: "back"): void;
  (event: "next"): void;
  (event: "save-draft"): void;
  (event: "finish"): void;
}>();
</script>
