<template>
 <div class="media-capture-field panel-card h-100">
  <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
   <div>
    <div class="small fw-semibold">Captura visual</div>
    <h4 class="h6 fw-bold mb-1">{{ label }}</h4>
    <p class="mb-0">
     {{ helper || "Use galeria, camera real do navegador, imagem ou PDF para anexar o arquivo." }}
    </p>
   </div>
   <div class="d-flex gap-2 flex-wrap">
    <button type="button" class="btn btn-outline-secondary rounded-pill" @click="openGallery">
     <i class="fa-regular fa-image me-2"></i>
     Enviar arquivo
    </button>
    <button type="button" class="btn btn-primary rounded-pill" @click="openCamera">
     <i class="fa-solid fa-camera me-2"></i>
     Camera
    </button>
   </div>
  </div>

  <input ref="galleryInput" type="file" :accept="accept || defaultAccept" class="d-none" @change="handleInput" />

  <div v-if="previewUrl" class="d-grid gap-3">
   <button
    type="button"
    class="preview-surface btn btn-light border rounded-4 p-3 text-start"
    @click="showPreviewModal = true">
    <div v-if="isPdfPreview" class="d-flex align-items-center gap-3">
     <div
      class="bg-danger-subtle text-danger rounded-4 d-inline-flex align-items-center justify-content-center"
      style="width: 72px; height: 72px;">
      <i class="fa-solid fa-file-pdf fs-2"></i>
     </div>
     <div>
      <div class="fw-semibold">{{ previewName }}</div>
      <div class="small">PDF pronto para salvar. Clique para abrir a visualizacao completa.</div>
     </div>
    </div>
    <div v-else class="text-center">
     <img :src="previewUrl" class="img-fluid rounded-4 border" style="max-height: 260px; object-fit: contain;" />
    </div>
   </button>

   <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
    <div class="small">
     <strong>{{ isPdfPreview ? "PDF" : "Imagem" }} pronto(a):</strong>
     {{ previewName }}
    </div>
    <button type="button" class="btn btn-link text-danger p-0" @click="clearMedia">
     <i class="fa-solid fa-trash me-2"></i>
     Remover anexo
    </button>
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
   <div v-if="previewUrl" class="d-grid gap-3">
    <div class="small fw-semibold">{{ previewName }}</div>
    <div v-if="isPdfPreview" class="rounded-4 overflow-hidden border" style="height: 75vh; min-height: 420px;">
     <iframe :src="previewUrl" title="Preview do PDF" class="w-100 h-100 border-0"></iframe>
    </div>
    <div v-else class="text-center">
     <img :src="previewUrl" class="img-fluid rounded-4 border" style="max-height: 75vh; object-fit: contain;" />
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

const props = defineProps<{
 modelValue: MediaUploadPayload | null;
 preview?: string;
 label: string;
 helper?: string;
 accept?: string;
}>();

const emit = defineEmits<{
 (event: "update:modelValue", value: MediaUploadPayload | null): void;
 (event: "preview-change", value: string): void;
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

const previewUrl = computed(() => props.modelValue?.base64 || props.preview || "");
const previewName = computed(() => props.modelValue?.name || extractFileName(props.preview) || "anexo");
const isPdfPreview = computed(() => isPdf(previewUrl.value, previewName.value));

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

function emitPayload(payload: MediaUploadPayload | null, preview = "") {
 emit("update:modelValue", payload);
 emit("preview-change", preview);
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
 emitPayload(
  {
   base64,
   name: `captura-${Date.now()}.jpg`,
   mimeType: "image/jpeg"
  },
  base64
 );
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

async function handleInput(event: Event) {
 const input = event.target as HTMLInputElement;
 const file = input.files?.[0];
 if (!file) {
  return;
 }

 try {
  const base64 = await readFile(file);
  emitPayload(
   {
    base64,
    name: file.name,
    mimeType: file.type || undefined
   },
   base64
  );
 } catch (error) {
  await notifyError(error);
 } finally {
  input.value = "";
 }
}

function clearMedia() {
 emitPayload(null, "");
 showPreviewModal.value = false;
 if (galleryInput.value) {
  galleryInput.value.value = "";
 }
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
