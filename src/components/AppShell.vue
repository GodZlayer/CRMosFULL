<template>
 <div class="crm-shell">
 <div class="container-fluid">
  <div class="row min-vh-100 g-0">
  <aside class="col-lg-3 col-xl-2 p-0 sidebar-panel d-none d-lg-block">
   <div class="sidebar-panel__content d-flex flex-column h-100 p-4">
   <div class="mb-4">
    <div class="mb-3">
    <div class="brand-logo-shell brand-logo-shell--menu">
     <img
     v-if="session.company?.logoUrl"
     :src="session.company.logoUrl"
     :alt="session.company.name"
     class="brand-logo-image"
     />
     <div
     v-else
     class="bg-warning text-dark rounded-4 d-inline-flex align-items-center justify-content-center w-100 h-100">
     <i class="fa-solid fa-screwdriver-wrench fs-4"></i>
     </div>
    </div>
    </div>
    <div class="sidebar-profile-copy text-white-50 mb-0">
    <div class="fw-semibold text-white">{{ session.user?.name || "Perfil não selecionado" }}</div>
    <div class="small opacity-75">{{ session.company?.shortName }}</div>
    <div class="small opacity-75">{{ session.store?.shortName || session.store?.name }}</div>
    </div>
   </div>

   <nav class="nav nav-pills flex-column gap-2 mb-4">
    <RouterLink
    v-for="item in navigation"
    :key="item.to"
    :to="item.to"
    class="nav-link text-white d-flex align-items-center gap-3 rounded-4 px-3 py-3"
    :class="{ 'router-link-active': isNavActive(item) }">
    <i :class="item.icon"></i>
    <span>{{ item.label }}</span>
    </RouterLink>
   </nav>

   <div class="mt-auto glass-card p-3 bg-white bg-opacity-10 text-white border border-white border-opacity-10">
    <div class="small opacity-75">Conta ativa</div>
    <div class="fw-semibold">{{ session.user?.name }}</div>
    <div class="text-white-50 small">{{ session.company?.shortName }}</div>
    <div class="text-white-50 small mb-3">{{ session.store?.shortName || session.store?.name }}</div>
    <button class="sidebar-profile-switch mb-2" type="button" @click="openProfilePicker">
     <span
      class="sidebar-profile-switch__avatar"
      :style="{ background: session.user?.avatarColor || '#10233f' }">
      {{ session.user?.avatarInitial || session.user?.name?.slice(0, 1)?.toUpperCase() }}
     </span>
     <span class="sidebar-profile-switch__copy">
      <span class="sidebar-profile-switch__label">Trocar perfil</span>
      <span class="sidebar-profile-switch__meta">Selecionar outra conta</span>
     </span>
     <i class="fa-solid fa-repeat ms-auto"></i>
    </button>
    <button class="btn btn-outline-light btn-sm rounded-pill w-100" @click="handleLogout">
     <i class="fa-solid fa-right-from-bracket me-2"></i>
     Sair da empresa
    </button>
   </div>
   </div>
  </aside>

  <main class="col-12 col-lg-9 col-xl-10 app-main py-3 py-lg-4 px-3 px-lg-4">
   <div
   class="app-page-header d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-4">
   <div class="d-flex align-items-start gap-3 flex-grow-1 min-w-0">
    <button
    type="button"
    class="btn btn-outline-secondary rounded-circle app-topbar__menu d-lg-none"
    @click="openMobileNav">
    <i class="fa-solid fa-bars"></i>
    </button>
    <div class="min-w-0">
    <p class="small fw-semibold mb-2">Operação inteligente</p>
    <h1 class="app-page-title fw-bold mb-1 text-break">{{ displayedTitle }}</h1>
    </div>
   </div>

   <div
    class="app-page-actions d-flex flex-wrap align-items-center justify-content-start justify-content-lg-end gap-2 no-print">
    <slot name="actions" />
    <div class="theme-switcher">
    <details class="theme-switcher__details">
     <summary class="btn btn-outline-secondary rounded-pill d-inline-flex align-items-center gap-2">
     <i :class="themeIconClass"></i>
     <span>{{ ui.themeLabel }}</span>
     </summary>
     <div class="action-menu__list theme-switcher__list">
     <button
      v-for="option in themeOptions"
      :key="option.value"
      type="button"
      class="action-menu__item"
      :class="{ 'fw-bold': ui.themeMode === option.value }"
      @click="setThemeMode(option.value, $event)">
      <i :class="`${option.icon} me-2`"></i>
      {{ option.label }}
     </button>
     </div>
    </details>
    </div>
    <button
    type="button"
    class="btn btn-outline-secondary rounded-pill position-relative"
    @click="openNotifications">
    <i class="fa-regular fa-bell me-2"></i>
    Alertas
    <span
     v-if="notifications.unreadCount"
     class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
     {{ notifications.unreadCount }}
    </span>
    </button>
   </div>
   </div>

   <div v-if="currentGroupTabs.length" class="app-section-tabs no-print mb-4">
   <nav class="nav nav-pills gap-2 flex-wrap">
    <RouterLink
    v-for="item in currentGroupTabs"
    :key="item.to"
    :to="item.to"
    active-class=""
    exact-active-class=""
    class="nav-link rounded-pill px-3 py-2"
    :class="{ 'router-link-active': isTabActive(item) }">
    {{ item.label }}
    </RouterLink>
   </nav>
   </div>

   <slot />
 </main>
  </div>
 </div>

 <div
  v-if="showProfiles"
  class="modal fade show d-block"
  tabindex="-1"
  style="background: rgba(10, 26, 45, 0.56);"
  @click.self="showProfiles = false">
  <div class="modal-dialog modal-lg modal-dialog-centered modal-fullscreen-md-down app-modal-dialog">
  <div class="modal-content border-0 rounded-5 overflow-hidden">
   <div class="modal-header border-0 px-4 pt-4 pb-0">
   <div>
    <div class="small fw-semibold">Troca rápida</div>
    <h2 class="h4 fw-bold mb-0">Quem vai usar agora?</h2>
   </div>
   <button type="button" class="btn btn-light rounded-circle" @click="showProfiles = false">
    <i class="fa-solid fa-xmark"></i>
   </button>
   </div>
   <div class="modal-body px-4 pb-4">
   <div class="profile-picker-grid">
    <button
    v-for="profile in session.profiles"
    :key="profile.id"
    type="button"
    class="profile-card"
    @click="switchProfile(profile.id)">
    <span
     class="profile-card__avatar"
     :style="{ background: profile.avatarColor || '#10233f' }">
     {{ profile.avatarInitial || profile.name.slice(0, 1).toUpperCase() }}
    </span>
    <span class="profile-card__name">{{ profile.name }}</span>
    </button>
   </div>
   </div>
  </div>
  </div>
 </div>

 <div ref="mobileNavPanel" class="offcanvas offcanvas-start app-shell-mobile-nav" tabindex="-1">
  <div class="offcanvas-header border-bottom">
  <div class="d-flex align-items-center gap-3 min-w-0">
   <div class="brand-logo-shell brand-logo-shell--offcanvas">
   <img
    v-if="session.company?.logoUrl"
    :src="session.company.logoUrl"
    :alt="session.company.name"
    class="brand-logo-image"
   />
   <div
    v-else
    class="bg-warning text-dark rounded-4 d-inline-flex align-items-center justify-content-center w-100 h-100">
    <i class="fa-solid fa-screwdriver-wrench fs-4"></i>
   </div>
   </div>
   <div class="min-w-0">
   <div class="fw-semibold text-truncate">{{ session.user?.name || "Perfil não selecionado" }}</div>
   <div class="small text-truncate">{{ session.company?.shortName }}</div>
   </div>
  </div>
  <button type="button" class="btn-close" @click="closeMobileNav"></button>
  </div>
  <div class="offcanvas-body d-flex flex-column gap-4">
  <nav class="nav nav-pills flex-column gap-2">
   <RouterLink
   v-for="item in navigation"
   :key="item.to"
   :to="item.to"
   class="nav-link d-flex align-items-center gap-3 rounded-4 px-3 py-3"
   :class="{ 'router-link-active': isNavActive(item) }"
   @click="closeMobileNav">
   <i :class="item.icon"></i>
   <span>{{ item.label }}</span>
   </RouterLink>
  </nav>
  <div class="panel-card d-grid gap-3 mt-auto">
   <div>
   <div class="small fw-semibold">Conta ativa</div>
   <div class="fw-semibold">{{ session.user?.name }}</div>
   <div class="small">{{ session.company?.shortName }}</div>
   </div>
   <button class="btn btn-outline-secondary rounded-pill d-inline-flex align-items-center gap-2" @click="openProfilePickerFromNav">
   <i class="fa-solid fa-repeat"></i>
   Trocar perfil
   </button>
   <button class="btn btn-outline-secondary rounded-pill" @click="handleLogout">
   <i class="fa-solid fa-right-from-bracket me-2"></i>
   Sair da empresa
   </button>
  </div>
  </div>
 </div>

 <div ref="notificationsPanel" class="offcanvas offcanvas-end app-notifications-panel" tabindex="-1">
  <div class="offcanvas-header border-bottom">
  <div>
   <div class="small fw-semibold">Centro de alertas</div>
   <h5 class="offcanvas-title mb-0">Notificações e automações</h5>
  </div>
  <button type="button" class="btn-close" @click="closeNotifications"></button>
  </div>
  <div class="offcanvas-body d-flex flex-column gap-3">
  <div v-if="notifications.items.length === 0" class="panel-card">
   Nenhum alerta ativo no momento.
  </div>
  <div v-for="item in notifications.items" :key="item.id" class="panel-card">
   <div class="d-flex justify-content-between align-items-start gap-3">
   <div>
    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
    <span :class="`badge text-bg-${item.tone || 'secondary'}`">{{ item.type }}</span>
    <span class="small">{{ item.created_at.slice(0, 10) }}</span>
    </div>
    <h6 class="fw-bold mb-1">{{ item.title }}</h6>
    <p class="mb-0">{{ item.message }}</p>
   </div>
   <button
    v-if="!item.read_at"
    type="button"
    class="btn btn-sm btn-light rounded-pill"
    @click="markRead(item.id)">
    Marcar como lida
   </button>
   </div>
  </div>
  </div>
 </div>
 </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useNotificationsStore } from "../stores/notifications";
import { useSessionStore } from "../stores/session";
import { type ThemeMode, useUiStore } from "../stores/ui";
import { notifyError } from "../services/ui";

const props = defineProps<{
 title: string;
 subtitle: string;
}>();

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const notifications = useNotificationsStore();
const ui = useUiStore();
const notificationsPanel = ref<HTMLElement | null>(null);
const mobileNavPanel = ref<HTMLElement | null>(null);
const showProfiles = ref(false);
let notificationsInstance: any = null;
let mobileNavInstance: any = null;
let profilePickerTimer: number | null = null;

const groupedSections = {
 finance: {
 title: "Financeiro",
 subtitle: "Fluxo de caixa e relatórios reunidos na mesma navegação.",
 tabs: [
  { to: "/financeiro", label: "Financeiro", section: "financeiro" },
  { to: "/compras", label: "Compras", section: "compras" },
  { to: "/relatorios", label: "Relatórios", section: "relatorios" }
 ]
 },
 agenda: {
 title: "Agenda",
 subtitle: "Calendário e tarefas.",
 tabs: [
  { to: "/calendario", label: "Calendário", section: "calendario" },
  { to: "/tarefas", label: "Tarefas diárias", section: "tarefas" }
 ]
 },
 inventory: {
 title: "Inventário",
 subtitle: "Estoque, serviços e inventário físico da loja organizados em abas.",
 tabs: [
  { to: "/catalogo", label: "Estoque", section: "catalogo" },
  { to: "/servicos", label: "Serviços", section: "servicos" },
  { to: "/inventario", label: "Inventário", section: "inventario" }
 ]
 },
operations: {
 title: "Operação",
 subtitle: "PDV e ordens de serviço concentrados na mesma área operacional.",
 tabs: [
  { to: "/pdv", label: "PDV", section: "pdv" },
  { to: "/os", label: "OS", section: "os" }
 ]
 },
 webstore: {
 title: "Webstore",
 subtitle: "Loja online, página pública e integração Gmail.",
 tabs: [
  { to: "/webstore?tab=home", label: "Home", section: "webstore-home" },
  { to: "/webstore?tab=sobre", label: "Sobre", section: "webstore-about" }
 ]
 }
} as const;

const navigation = [
 { to: "/financeiro", label: "Financeiro", icon: "fa-solid fa-wallet", group: "finance" },
 { to: "/pdv", label: "PDV e OS", icon: "fa-solid fa-cash-register", group: "operations", sections: ["pdv", "os"] },
 { to: "/webstore", label: "Webstore", icon: "fa-solid fa-store", group: "webstore", sections: ["webstore"] },
 { to: "/calendario", label: "Calendário e Tarefas", icon: "fa-solid fa-calendar-days", group: "agenda" },
 { to: "/catalogo", label: "Inventário", icon: "fa-solid fa-boxes-stacked", group: "inventory" },
 { to: "/clientes", label: "Clientes", icon: "fa-solid fa-users" },
 { to: "/backup-importacao", label: "Backup e Importação", icon: "fa-solid fa-database" }
];

const currentGroupKey = computed(() => String(route.meta.navGroup || ""));
const currentGroup = computed(() => groupedSections[currentGroupKey.value as keyof typeof groupedSections] || null);
const currentGroupTabs = computed(() => (route.meta.hideGroupTabs ? [] : currentGroup.value?.tabs || []));
const displayedTitle = computed(() => currentGroup.value?.title || props.title);
const displayedSubtitle = computed(() => currentGroup.value?.subtitle || props.subtitle);

const themeOptions: Array<{ value: ThemeMode; label: string; icon: string }> = [
 { value: "system", label: "Sistema", icon: "fa-solid fa-desktop" },
 { value: "light", label: "Claro", icon: "fa-regular fa-sun" },
 { value: "dark", label: "Escuro", icon: "fa-regular fa-moon" }
];

function isNavActive(item: { to: string; group?: string; sections?: string[] }) {
 if (item.sections?.length) {
 return currentGroupKey.value === item.group && item.sections.includes(String(route.meta.navSection || ""));
 }
 if (item.group) {
 return currentGroupKey.value === item.group;
 }
 return route.path === item.to;
}

function isTabActive(item: { section: string }) {
 if (currentGroupKey.value === "webstore") {
  const tab = String(route.query.tab || "home");
  return item.section === (tab === "sobre" ? "webstore-about" : "webstore-home");
 }
 return String(route.meta.navSection || "") === item.section;
}

const themeIconClass = computed(() => {
 if (ui.themeMode === "light") {
 return "fa-regular fa-sun";
 }
 if (ui.themeMode === "dark") {
 return "fa-regular fa-moon";
 }
 return "fa-solid fa-desktop";
});

async function handleLogout() {
 await session.logout();
 router.push("/login");
}

function openProfilePicker() {
 showProfiles.value = true;
}

function openProfilePickerFromNav() {
 closeMobileNav();
 if (profilePickerTimer) {
 window.clearTimeout(profilePickerTimer);
 }
 profilePickerTimer = window.setTimeout(() => {
 showProfiles.value = true;
 profilePickerTimer = null;
 }, 180);
}

function openNotifications() {
 notificationsInstance?.show?.();
}

function closeNotifications() {
 notificationsInstance?.hide?.();
}

function openMobileNav() {
 mobileNavInstance?.show?.();
}

function closeMobileNav() {
 mobileNavInstance?.hide?.();
}

async function markRead(id: number) {
 await notifications.markRead(id);
}

async function switchProfile(profileId: number) {
 try {
 await session.selectProfile(profileId);
 showProfiles.value = false;
 await notifications.load();
 } catch (error) {
 await notifyError(error);
 }
}

function setThemeMode(mode: ThemeMode, event: Event) {
 ui.setThemeMode(mode);
 (event.target as HTMLElement | null)?.closest("details")?.removeAttribute("open");
}

onMounted(async () => {
 if (notificationsPanel.value && window.bootstrap?.Offcanvas) {
 notificationsInstance = new window.bootstrap.Offcanvas(notificationsPanel.value);
 }
 if (mobileNavPanel.value && window.bootstrap?.Offcanvas) {
 mobileNavInstance = new window.bootstrap.Offcanvas(mobileNavPanel.value);
 }

 if (!session.isAuthenticated) {
 return;
 }

 await notifications.load();
});

onBeforeUnmount(() => {
 if (profilePickerTimer) {
 window.clearTimeout(profilePickerTimer);
 }
});
</script>

<style scoped>
.nav-link.router-link-active {
 background: rgba(255, 255, 255, 0.15);
 box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.app-shell-mobile-nav :deep(.nav-link) {
 color: var(--text-primary);
 background: var(--surface-muted);
}

.app-shell-mobile-nav :deep(.nav-link.router-link-active) {
 color: #fff;
 background: var(--brand-primary);
 box-shadow: none;
}

.app-section-tabs :deep(.nav-link) {
 color: var(--text-muted);
 background: var(--surface-muted);
 border: 1px solid var(--border-soft);
}

.app-section-tabs :deep(.nav-link.router-link-active) {
 color: #fff;
 background: var(--brand-primary);
 border-color: var(--brand-primary);
 box-shadow: none;
}




</style>
