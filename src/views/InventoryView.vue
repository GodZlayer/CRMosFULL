<template>
 <CatalogWorkspace
 title="Inventário da loja"
 subtitle="Monitores, gabinetes, PCs completos e demais itens expostos ou controlados como inventario físico da loja."
 eyebrow="Loja"
 table-title="Inventário interno"
 create-label="Novo item da loja"
 :store-inventory-only="true"
 />
</template>

<script setup lang="ts">
import CatalogWorkspace from "../components/CatalogWorkspace.vue";
</script>