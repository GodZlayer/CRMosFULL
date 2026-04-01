<template>
 <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import { onMounted, watch } from "vue";
import { useSessionStore } from "./stores/session";
import { useUiStore } from "./stores/ui";

const session = useSessionStore();
const ui = useUiStore();

function ensureFavicon(href: string) {
 let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
 if (!link) {
  link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
 }
 link.href = href;
}

function applyBranding() {
 document.title = session.company?.appTitle || "CRM OS";
 if (session.company?.faviconUrl) {
  ensureFavicon(session.company.faviconUrl);
 }
 document.documentElement.style.setProperty("--brand-primary", session.company?.accent || "#10233f");
 document.documentElement.style.setProperty("--brand-accent", session.company?.accent || "#10233f");
}

onMounted(async () => {
 ui.applyTheme();
 await session.bootstrap();
 applyBranding();
});

watch(
 () => session.company,
 () => {
  applyBranding();
 },
 { deep: true }
);
</script>
