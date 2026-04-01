<template>
 <div class="barcode-field panel-card h-100">
  <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
   <div>
    <div class="small fw-semibold">SKU ou código</div>
    <h4 class="h6 fw-bold mb-1">{{ label }}</h4>
    <p class="mb-0">{{ helper || 'Digite manualmente ou preencha por imagem/câmera sem travar o cadastro.' }}</p>
   </div>
   <div class="d-flex gap-2 flex-wrap">
    <button type="button" class="btn btn-outline-secondary rounded-pill" @click="openGallery">
     <i class="fa-regular fa-image me-2"></i>
     Ler imagem
    </button>
    <button type="button" class="btn btn-primary rounded-pill" @click="openCamera">
     <i class="fa-solid fa-camera me-2"></i>
     Ler câmera
    </button>
   </div>
  </div>

  <div class="input-group mb-3">
   <span class="input-group-text bg-white"><i class="fa-solid fa-upc"></i></span>
   <input :value="modelValue" class="form-control" :placeholder="placeholder || 'Digite ou leia o código'" @input="updateValue($event)" />
  </div>

  <input ref="galleryInput" type="file" accept="image/*" class="d-none" @change="handleInput" />
  <input ref="cameraInput" type="file" accept="image/*" capture="environment" class="d-none" @change="handleInput" />

  <div v-if="statusText" class="small">{{ statusText }}</div>

  <ModalDialog v-model="showCamera" title="Ler código pela câmera" eyebrow="Captura ao vivo" size="lg">
   <div class="d-grid gap-3">
    <div v-if="cameraError" class="alert alert-warning rounded-4 mb-0">{{ cameraError }}</div>
    <div v-else class="rounded-4 overflow-hidden bg-dark">
     <video
      ref="videoElement"
      class="w-100 d-block"
      autoplay
      playsinline
      muted
      style="max-height: 60vh; object-fit: cover;"
     ></video>
    </div>
    <div class="d-flex justify-content-end gap-2">
     <button type="button" class="btn btn-light rounded-pill" @click="closeCamera">Fechar</button>
     <button type="button" class="btn btn-primary rounded-pill" :disabled="!cameraReady || scanningCamera" @click="captureFrame">
      <i class="fa-solid fa-camera-retro me-2"></i>
      {{ scanningCamera ? 'Lendo...' : 'Capturar código' }}
     </button>
    </div>
   </div>
   <canvas ref="canvasElement" class="d-none"></canvas>
  </ModalDialog>
 </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { notifyError } from "../services/ui";
import ModalDialog from "./ModalDialog.vue";

const props = defineProps<{
 modelValue: string;
 label: string;
 helper?: string;
 placeholder?: string;
}>();

const emit = defineEmits<{
 (event: "update:modelValue", value: string): void;
}>();

const galleryInput = ref<HTMLInputElement | null>(null);
const cameraInput = ref<HTMLInputElement | null>(null);
const videoElement = ref<HTMLVideoElement | null>(null);
const canvasElement = ref<HTMLCanvasElement | null>(null);
const showCamera = ref(false);
const cameraReady = ref(false);
const cameraError = ref("");
const scanningCamera = ref(false);
const statusText = ref("");
const stream = ref<MediaStream | null>(null);

function openGallery() {
 galleryInput.value?.click();
}

async function openCamera() {
 statusText.value = "";
 if (!navigator.mediaDevices?.getUserMedia) {
  cameraInput.value?.click();
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
  cameraError.value = "Não foi possível acessar a câmera neste navegador ou dispositivo.";
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
 scanningCamera.value = false;
}

function closeCamera() {
 showCamera.value = false;
 stopCamera();
}

function updateValue(event: Event) {
 const target = event.target as HTMLInputElement;
 emit("update:modelValue", target.value);
}

async function captureFrame() {
 if (!videoElement.value || !canvasElement.value || scanningCamera.value) {
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
  await notifyError(new Error("Não foi possível capturar a imagem da câmera."));
  return;
 }

 scanningCamera.value = true;
 try {
  context.drawImage(video, 0, 0, width, height);
  const imageUrl = canvas.toDataURL("image/jpeg", 0.92);
  const detectedCode = await detectBarcode(imageUrl);
  if (!detectedCode) {
   statusText.value = "Nenhum código foi detectado na captura. Tente aproximar mais a etiqueta.";
   return;
  }
  emit("update:modelValue", detectedCode);
  statusText.value = `Código detectado: ${detectedCode}`;
  closeCamera();
 } catch (error) {
  await notifyError(error);
 } finally {
  scanningCamera.value = false;
 }
}

async function handleInput(event: Event) {
 const input = event.target as HTMLInputElement;
 const file = input.files?.[0];
 if (!file) {
  return;
 }

 try {
  const imageUrl = URL.createObjectURL(file);
  const detectedCode = await detectBarcode(imageUrl);
  URL.revokeObjectURL(imageUrl);
  if (!detectedCode) {
   statusText.value = "Nenhum código detectado automaticamente. Você pode preencher manualmente.";
   return;
  }
  emit("update:modelValue", detectedCode);
  statusText.value = `Código detectado: ${detectedCode}`;
 } catch (error) {
  await notifyError(error);
 } finally {
  input.value = "";
 }
}

async function detectBarcode(imageUrl: string) {
 if (!("BarcodeDetector" in window)) {
  statusText.value = "Leitura automática indisponível neste navegador. Preencha o código manualmente se necessário.";
  return "";
 }

 const image = await loadImage(imageUrl);
 const detector = new (window as any).BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e"] });
 const codes = await detector.detect(image);
 return String(codes?.[0]?.rawValue || "");
}

function loadImage(imageUrl: string) {
 return new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Não foi possível ler a imagem para o código."));
  image.src = imageUrl;
 });
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
