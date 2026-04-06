<template>
 <div class="media-capture-field panel-card h-100">
  <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
   <div>
    <div class="small fw-semibold">Captura visual</div>
    <h4 class="h6 fw-bold mb-1">{{ label }}</h4>
    <p class="mb-0">
     {{ helper || "Use galeria, camera real do navegador, imagens ou PDFs para anexar arquivos." }}
    </p>
    <div class="small mt-2 text-body-secondary">
     Limite de {{ maxPerSelection }} por envio e {{ maxTotal }} no total desta OS.
    </div>
   </div>
   <div class="d-flex gap-2 flex-wrap">
    <button type="button" class="btn btn-outline-secondary rounded-pill" @click="openGallery">
     <i class="fa-regular fa-image me-2"></i>
     Enviar arquivos
    </button>
    <button type="button" class="btn btn-primary rounded-pill" @click="openCamera">
     <i class="fa-solid fa-camera me-2"></i>
     Camera
    </button>
   </div>
  </div>

  <input ref="galleryInput" type="file" :accept="accept || defaultAccept" class="d-none" multiple @change="handleInput" />

  <div v-if="displayItems.length" class="d-grid gap-3">
   <div class="row g-3">
    <div v-for="item in displayItems" :key="item.key" class="col-6 col-xl-4">
     <button type="button" class="preview-surface btn btn-light border rounded-4 p-2 text-start w-100 h-100" @click="openPreview(item)">
      <div v-if="item.isPdf" class="d-grid gap-2 text-center">
       <div class="bg-danger-subtle text-danger rounded-4 d-inline-flex align-items-center justify-content-center mx-auto" style="width: 72px; height: 72px;">
        <i class="fa-solid fa-file-pdf fs-2"></i>
       </div>
       <div class="small fw-semibold text-truncate">{{ item.name }}</div>
      </div>
      <div v-else class="d-grid gap-2">
       <img :src="item.url" class="img-fluid rounded-4 border" style="height: 140px; width: 100%; object-fit: contain;" />
       <div class="small fw-semibold text-truncate">{{ item.name }}</div>
      </div>
     </button>
     <div class="d-flex justify-content-between align-items-center gap-2 mt-2">
      <div class="small text-body-secondary text-truncate">{{ item.badge }}</div>
      <button v-if="item.isNew" type="button" class="btn btn-link text-danger p-0" @click="removeNewItem(item.index)">
       <i class="fa-solid fa-trash me-1"></i>
       Remover
      </button>
     </div>
    </div>
   </div>
  </div>
  <div v-else class="empty-dropzone rounded-4 border border-secondary-subtle bg-light-subtle p-4 text-center">
   Nenhum arquivo capturado ainda.
  </div>

  <ModalDialog v-model="showCamera" title="Capturar pela camera" eyebrow="Captura ao vivo" size="lg">
   <div class="d-grid gap-3">
    <div v-if="cameraError" class="alert alert-warning rounded-4 mb-0">{{ cameraError }}</div>
    <div v-else class="rounded-4 overflow-hidden bg-dark">
     <video
      ref="videoElement"
      class="w-100 d-block"
      autoplay
      playsinline
      muted
      style="max-height: 60vh; object-fit: cover;"></video>
    </div>
    <div class="d-flex justify-content-end gap-2">
     <button type="button" class="btn btn-light rounded-pill" @click="closeCamera">Fechar</button>
     <button type="button" class="btn btn-primary rounded-pill" :disabled="!cameraReady" @click="captureFrame">
      <i class="fa-solid fa-camera-retro me-2"></i>
      Capturar foto
     </button>
    </div>
   </div>
   <canvas ref="canvasElement" class="d-none"></canvas>
  </ModalDialog>

  <ModalDialog v-model="showPreviewModal" title="Visualizacao do anexo" eyebrow="Preview antes de salvar" size="xl">
   <div v-if="activePreview" class="d-grid gap-3">
    <div class="small fw-semibold">{{ activePreview.name }}</div>
    <div v-if="activePreview.isPdf" class="rounded-4 overflow-hidden border" style="height: 75vh; min-height: 420px;">
     <iframe :src="activePreview.url" title="Preview do PDF" class="w-100 h-100 border-0"></iframe>
    </div>
    <div v-else class="text-center">
     <img :src="activePreview.url" class="img-fluid rounded-4 border" style="max-height: 75vh; object-fit: contain;" />
    </div>
   </div>
  </ModalDialog>
 </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { MediaUploadPayload } from "../services/types";
import { notifyError } from "../services/ui";
import ModalDialog from "./ModalDialog.vue";

type ExistingItem = { url: string; name?: string };
type DisplayItem = { key: string; url: string; name: string; isPdf: boolean; isNew: boolean; index: number; badge: string };

const props = withDefaults(
 defineProps<{
  modelValue: MediaUploadPayload[];
  existingItems?: ExistingItem[];
  existingCount?: number;
  label: string;
  helper?: string;
  accept?: string;
  maxPerSelection?: number;
  maxTotal?: number;
 }>(),
 {
  existingItems: () => [],
  existingCount: 0,
  maxPerSelection: 5,
  maxTotal: 15
 }
);

const emit = defineEmits<{
 (event: "update:modelValue", value: MediaUploadPayload[]): void;
}>();

const defaultAccept = "image/*,.pdf,application/pdf";
const galleryInput = ref<HTMLInputElement | null>(null);
const videoElement = ref<HTMLVideoElement | null>(null);
const canvasElement = ref<HTMLCanvasElement | null>(null);
const showCamera = ref(false);
const showPreviewModal = ref(false);
const cameraReady = ref(false);
const cameraError = ref("");
const stream = ref<MediaStream | null>(null);
const activePreview = ref<DisplayItem | null>(null);

const displayItems = computed<DisplayItem[]>(() => {
 const existing = (props.existingItems || []).map((item, index) => ({
  key: `existing-${index}-${item.url}`,
  url: item.url,
  name: item.name || extractFileName(item.url) || `Anexo ${index + 1}`,
  isPdf: isPdf(item.url, item.name || ""),
  isNew: false,
  index,
  badge: "Ja salvo"
 }));

 const queued = (props.modelValue || []).map((item, index) => ({
  key: `new-${index}-${item.name}`,
  url: item.base64,
  name: item.name || `Anexo ${index + 1}`,
  isPdf: isPdf(item.base64, item.name || ""),
  isNew: true,
  index,
  badge: "Pronto para salvar"
 }));

 return [...existing, ...queued];
});

function extractFileName(value = "") {
 const clean = String(value || "").split("?")[0];
 return clean.split("/").pop() || "";
}

function isPdf(url: string, name: string) {
 const normalizedUrl = String(url || "").toLowerCase();
 const normalizedName = String(name || "").toLowerCase();
 return normalizedUrl.startsWith("data:application/pdf") || normalizedUrl.endsWith(".pdf") || normalizedName.endsWith(".pdf");
}

function openGallery() {
 galleryInput.value?.click();
}

function updateFiles(nextFiles: MediaUploadPayload[]) {
 emit("update:modelValue", nextFiles);
}

async function appendFiles(files: MediaUploadPayload[]) {
 const alreadySelected = props.modelValue.length;
 const alreadyExisting = Number(props.existingCount || 0);
 const availableSlots = Math.max(0, props.maxTotal - alreadyExisting - alreadySelected);
 const allowedFiles = files.slice(0, Math.min(props.maxPerSelection, availableSlots));

 if (!allowedFiles.length) {
  await notifyError(new Error(`Limite atingido. Esta OS permite no máximo ${props.maxTotal} anexos.`));
  return;
 }

 if (files.length > allowedFiles.length) {
  await notifyError(new Error(`Foram adicionados ${allowedFiles.length} arquivo(s). O limite é ${props.maxPerSelection} por envio e ${props.maxTotal} no total.`));
 }

 updateFiles([...props.modelValue, ...allowedFiles]);
}

async function openCamera() {
 if (!navigator.mediaDevices?.getUserMedia) {
  await notifyError(new Error("A camera do navegador nao esta disponivel neste dispositivo."));
  return;
 }

 showCamera.value = true;
 await nextTick();
 await startCamera();
}

async function startCamera() {
 stopCamera();
 cameraReady.value = false;
 cameraError.value = "";

 try {
  const mediaStream = await navigator.mediaDevices.getUserMedia({
   video: {
    facingMode: { ideal: "environment" }
   },
   audio: false
  });

  stream.value = mediaStream;
  if (videoElement.value) {
   videoElement.value.srcObject = mediaStream;
   await videoElement.value.play();
   cameraReady.value = true;
  }
 } catch (error) {
  cameraError.value = "Nao foi possivel acessar a camera neste navegador ou dispositivo.";
  await notifyError(error);
 }
}

function stopCamera() {
 if (stream.value) {
  for (const track of stream.value.getTracks()) {
   track.stop();
  }
  stream.value = null;
 }
 if (videoElement.value) {
  videoElement.value.srcObject = null;
 }
 cameraReady.value = false;
}

function closeCamera() {
 showCamera.value = false;
 stopCamera();
}

async function captureFrame() {
 if (!videoElement.value || !canvasElement.value) {
  return;
 }

 const video = videoElement.value;
 const canvas = canvasElement.value;
 const width = video.videoWidth || 1280;
 const height = video.videoHeight || 720;

 canvas.width = width;
 canvas.height = height;
 const context = canvas.getContext("2d");
 if (!context) {
  await notifyError(new Error("Nao foi possivel capturar a imagem da camera."));
  return;
 }

 context.drawImage(video, 0, 0, width, height);
 const base64 = canvas.toDataURL("image/jpeg", 0.92);
 await appendFiles([
  {
   base64,
   name: `captura-${Date.now()}.jpg`,
   mimeType: "image/jpeg"
  }
 ]);
 closeCamera();
}

function readFile(file: File) {
 return new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo selecionado."));
  reader.readAsDataURL(file);
 });
}

function fileNameWithExtension(name: string, extension: string) {
 const cleanName = String(name || "anexo").replace(/\.[^.]+$/, "");
 return `${cleanName}${extension}`;
}

function loadImage(dataUrl: string) {
 return new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Nao foi possivel processar a imagem selecionada."));
  image.src = dataUrl;
 });
}

async function optimizeImage(file: File) {
 const source = await readFile(file);
 const image = await loadImage(source);
 const maxDimension = 1600;
 const largestSide = Math.max(image.naturalWidth || image.width || 0, image.naturalHeight || image.height || 0) || 1;
 const scale = Math.min(1, maxDimension / largestSide);
 const width = Math.max(1, Math.round((image.naturalWidth || image.width || 1) * scale));
 const height = Math.max(1, Math.round((image.naturalHeight || image.height || 1) * scale));
 const canvas = document.createElement("canvas");
 canvas.width = width;
 canvas.height = height;
 const context = canvas.getContext("2d");
 if (!context) {
  throw new Error("Nao foi possivel preparar a imagem para envio.");
 }

 context.drawImage(image, 0, 0, width, height);
 return {
  base64: canvas.toDataURL("image/jpeg", 0.82),
  name: fileNameWithExtension(file.name || "imagem", ".jpg"),
  mimeType: "image/jpeg"
 };
}

async function encodeFile(file: File) {
 if ((file.type || "").startsWith("image/")) {
  return optimizeImage(file);
 }

 return {
  base64: await readFile(file),
  name: file.name,
  mimeType: file.type || undefined
 };
}

async function handleInput(event: Event) {
 const input = event.target as HTMLInputElement;
 const files = Array.from(input.files || []);
 if (!files.length) {
  return;
 }

 try {
  const encoded = await Promise.all(files.map((file) => encodeFile(file)));
  await appendFiles(encoded);
 } catch (error) {
  await notifyError(error);
 } finally {
  input.value = "";
 }
}

function removeNewItem(index: number) {
 const next = [...props.modelValue];
 next.splice(index, 1);
 updateFiles(next);
 if (activePreview.value?.isNew && activePreview.value.index === index) {
  activePreview.value = null;
  showPreviewModal.value = false;
 }
}

function openPreview(item: DisplayItem) {
 activePreview.value = item;
 showPreviewModal.value = true;
}

watch(
 () => showCamera.value,
 (open) => {
  if (!open) {
   stopCamera();
  }
 }
);

onBeforeUnmount(() => {
 stopCamera();
});
</script>
