<template>
  <div class="login-page login-page--minimal">
    <section v-if="session.hasCompanySession && !session.user" class="profile-picker-shell">
      <div class="profile-picker-brand text-center mb-5">
        <img v-if="session.company?.logoUrl" :src="session.company.logoUrl" :alt="session.company.name" class="profile-picker-brand__logo mb-3" />
        <div class="small fw-semibold">Empresa autenticada</div>
        <h1 class="display-6 fw-bold mb-2">{{ session.company?.name }}</h1>
        <p class="mb-0">Quem vai usar o CRM agora?</p>
      </div>

      <div class="profile-picker-grid">
        <button v-for="profile in session.profiles" :key="profile.id" type="button" class="profile-card" @click="handleProfileSelect(profile.id)">
          <span class="profile-card__avatar" :style="{ background: profile.avatarColor || '#10233f' }">{{ profile.avatarInitial || profile.name.slice(0, 1).toUpperCase() }}</span>
          <span class="profile-card__name">{{ profile.name }}</span>
        </button>
      </div>

      <div class="text-center mt-4">
        <button class="btn btn-outline-secondary rounded-pill" @click="backToCompanyLogin">
          <i class="fa-solid fa-arrow-left me-2"></i>
          Entrar com outra empresa
        </button>
      </div>
    </section>

    <section v-else class="panel-card login-card login-card--minimal">
      <form class="row g-3" @submit.prevent="handleSubmit">
        <div class="col-12">
          <input
            v-model="form.email"
            type="email"
            class="form-control form-control-lg rounded-4 login-card__input"
            placeholder="Email da empresa"
            autocomplete="username"
            required
          />
        </div>
        <div class="col-12">
          <input
            v-model="form.password"
            type="password"
            class="form-control form-control-lg rounded-4 login-card__input"
            placeholder="Senha"
            autocomplete="current-password"
            required
          />
        </div>
        <div class="col-12">
          <button class="btn btn-dark btn-lg rounded-pill w-100 login-card__button" :disabled="submitting">
            {{ submitting ? "Entrando..." : "Entrar" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "../stores/session";
import { notifyError } from "../services/ui";

const router = useRouter();
const session = useSessionStore();
const submitting = ref(false);

const form = reactive({
  email: "",
  password: ""
});

async function handleSubmit() {
  submitting.value = true;
  try {
    await session.login(form.email, form.password);
  } catch (error) {
    await notifyError(error);
  } finally {
    submitting.value = false;
  }
}

async function handleProfileSelect(profileId: number) {
  try {
    await session.selectProfile(profileId);
    router.push("/financeiro");
  } catch (error) {
    await notifyError(error);
  }
}

async function backToCompanyLogin() {
  await session.logout();
}
</script>

