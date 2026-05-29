<template>
 <AppShell title="Webstore" subtitle="Configuracao da loja online, envio de emails e confirmacao de conta do cliente.">
 <template #actions>
 <a class="btn btn-outline-secondary rounded-pill" href="http://127.0.0.1:3002" target="_blank" rel="noreferrer">
 <i class="fa-solid fa-up-right-from-square me-2"></i>
 Abrir webstore
 </a>
 <button class="btn btn-primary rounded-pill" :disabled="busy" @click="saveSettings">
 <i class="fa-solid fa-floppy-disk me-2"></i>
 {{ busy ? "Salvando..." : "Salvar configuracao" }}
 </button>
 </template>

 <div class="row g-4">
 <div class="col-12">
 <div class="panel-card">
 <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
 <div>
 <div class="small fw-semibold mb-1">Gmail API</div>
 <h2 class="h5 fw-bold mb-1">Conta de envio da loja</h2>
 <p class="mb-0">O CRM envia emails em nome da loja e usa links de confirmacao em http://localhost:3002.</p>
 </div>
 <span :class="`badge text-bg-${gmail.status === 'CONNECTED' ? 'success' : gmail.status === 'AUTH_REQUIRED' ? 'warning' : 'secondary'}`">
 {{ gmail.status || "DISCONNECTED" }}
 </span>
 </div>
 <div class="row g-3 align-items-end">
 <div class="col-md-5">
 <label class="form-label fw-semibold">Email conectado</label>
 <input :value="gmail.email || 'Nao conectado'" class="form-control rounded-4" disabled />
 </div>
 <div class="col-md-7 d-flex flex-wrap gap-2">
 <button class="btn btn-primary rounded-pill" :disabled="gmailBusy" @click="connectGmail">
 <i class="fa-brands fa-google me-2"></i>
 Conectar Gmail
 </button>
 <button class="btn btn-outline-secondary rounded-pill" :disabled="gmailBusy" @click="loadGmailStatus">
 <i class="fa-solid fa-rotate me-2"></i>
 Atualizar status
 </button>
 <button v-if="gmail.status !== 'DISCONNECTED' || gmail.email || gmail.hasRefreshToken" class="btn btn-outline-danger rounded-pill" :disabled="gmailBusy" @click="disconnectGmail">
 <i class="fa-solid fa-link-slash me-2"></i>
 Desvincular Gmail
 </button>
 </div>
 </div>
 </div>
 </div>

 <div class="col-xl-4">
 <div class="panel-card h-100">
 <div class="small fw-semibold mb-2">Status atual</div>
 <div class="d-flex align-items-center gap-2 mb-3">
 <span :class="`badge text-bg-${status?.isOpen ? 'success' : 'secondary'}`">{{ status?.label || "Indefinido" }}</span>
 <span v-if="status?.currentTime" class="small">Agora {{ status.currentTime }}</span>
 </div>
 <div class="d-grid gap-3">
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form.enabled" class="form-check-input mt-0" type="checkbox" />
 <span class="fw-semibold">Webstore ativa</span>
 </label>
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form.checkoutEnabled" class="form-check-input mt-0" type="checkbox" />
 <span class="fw-semibold">Receber pedidos</span>
 </label>
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form.respectBusinessHours" class="form-check-input mt-0" type="checkbox" />
 <span class="fw-semibold">Usar horario de funcionamento</span>
 </label>
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form.allowCheckoutWhenClosed" class="form-check-input mt-0" type="checkbox" />
 <span class="fw-semibold">Permitir checkout fora do horario</span>
 </label>
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form.homepageEnabled" class="form-check-input mt-0" type="checkbox" />
 <span class="fw-semibold">Homepage ativa</span>
 </label>
 </div>
 </div>
 </div>

 <div class="col-xl-8">
 <div class="panel-card">
 <div class="small fw-semibold mb-3">Branding e catalogo</div>
 <div class="row g-3">
 <div class="col-md-6">
 <label class="form-label fw-semibold">Titulo da pagina</label>
 <input v-model="form.pageTitle" class="form-control rounded-4" />
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">WhatsApp</label>
 <input v-model="form.whatsapp" class="form-control rounded-4" placeholder="5511999999999" />
 </div>
 <div class="col-md-8">
 <label class="form-label fw-semibold">Texto de logo</label>
 <input v-model="form.logoText" class="form-control rounded-4" />
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Altura maxima do logo</label>
 <input v-model.number="form.logoMaxHeight" type="number" min="32" max="140" class="form-control rounded-4" />
 </div>
 <div class="col-12">
 <MediaCaptureField
 v-model="form.logoUpload"
 :preview="form.logoPreview || form.logoImageUrl"
 label="Imagem do logo"
 helper="Use uma imagem opcional. A altura maxima acima controla a exibicao para nao quebrar o layout."
 accept="image/*"
 @preview-change="onImagePreviewChange('logo', $event)"
 />
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold">Subtitulo do catalogo</label>
 <textarea v-model="form.subtitle" class="form-control rounded-4" rows="2"></textarea>
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold">Link do Perfil da Empresa no Google</label>
 <input v-model="form.googleBusinessUrl" class="form-control rounded-4" placeholder="https://g.page/..." />
 <div class="form-text">Usado na navbar, no footer e no botao da secao de avaliacoes da home.</div>
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold">Link personalizado do Maps</label>
 <input v-model="form.googleMapsUrl" class="form-control rounded-4" placeholder="https://www.google.com/maps/place/..." />
 <div class="form-text">Usado no botão “Venha à loja” do hero.</div>
 </div>
 <div class="col-md-4" v-for="option in catalogOptions" :key="option.model">
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="form[option.model]" class="form-check-input mt-0" type="checkbox" />
 <span class="fw-semibold">{{ option.label }}</span>
 </label>
 </div>
 </div>
 </div>
 </div>

 <div class="col-12">
 <div class="panel-card">
 <div class="small fw-semibold mb-3">Visual da webstore</div>
 <div class="row g-3">
 <div v-for="item in colorFields" :key="item.model" class="col-md-4 col-xl-3">
 <label class="form-label fw-semibold">{{ item.label }}</label>
 <input v-model="form[item.model]" type="color" class="form-control form-control-color rounded-4 w-100" />
 </div>
 <div v-for="item in gradientColorFields" :key="item.model" class="col-md-4 col-xl-3">
 <label class="form-label fw-semibold">{{ item.label }}</label>
 <input v-model="form[item.model]" type="color" class="form-control form-control-color rounded-4 w-100" />
 </div>
 <div v-for="item in gradientAngleFields" :key="item.model" class="col-md-4 col-xl-2">
 <label class="form-label fw-semibold">{{ item.label }}</label>
 <input v-model.number="form[item.model]" type="number" min="0" max="360" class="form-control rounded-4" />
 </div>
 <div v-for="item in textSizeFields" :key="item.model" class="col-md-4 col-xl-2">
 <label class="form-label fw-semibold">{{ item.label }}</label>
 <input v-model.number="form[item.model]" type="number" min="12" max="96" class="form-control rounded-4" />
 </div>
 </div>
 </div>
 </div>

 <div class="col-12">
 <div class="panel-card">
 <div class="small fw-semibold mb-3">Imagens da home</div>
 <div class="row g-3">
 <div v-for="item in homeImageFields" :key="item.upload" class="col-lg-6">
 <MediaCaptureField
 v-model="form[item.upload]"
 :preview="form[item.preview] || form[item.url]"
 :label="item.label"
 helper="Imagem usada na home publica da webstore."
 accept="image/*"
 @preview-change="onImagePreviewChange(item.key, $event)"
 />
 </div>
 <div class="col-12">
 <div class="table-responsive">
 <table class="table align-middle">
 <thead>
 <tr>
 <th>Imagem do hero</th>
 <th>X (%)</th>
 <th>Y (%)</th>
 <th>Z</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="item in heroImagePositionFields" :key="item.label">
 <td class="fw-semibold">{{ item.label }}</td>
 <td><input v-model.number="form[item.x]" type="number" min="0" max="100" class="form-control rounded-4" /></td>
 <td><input v-model.number="form[item.y]" type="number" min="0" max="100" class="form-control rounded-4" /></td>
 <td><input v-model.number="form[item.z]" type="number" min="1" max="9" class="form-control rounded-4" /></td>
 </tr>
 </tbody>
 </table>
 </div>
 </div>
 </div>
 </div>
 </div>

 <div class="col-12">
 <div class="panel-card">
 <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
 <div>
 <div class="small fw-semibold mb-1">{{ editorTab === 'about' ? 'Sobre' : 'Home' }}</div>
 <div class="small">{{ editorTab === 'about' ? 'Conteudo institucional da pagina sobre.' : 'Conteudo exibido antes dos itens e categorias.' }}</div>
 </div>
 </div>
 <div v-if="editorTab === 'home'" class="row g-3">
 <div class="col-md-7">
 <label class="form-label fw-semibold">Titulo hero</label>
 <textarea v-model="form.heroTitle" class="form-control rounded-4" rows="2"></textarea>
 </div>
 <div class="col-md-5">
 <label class="form-label fw-semibold">Botao principal</label>
 <input v-model="form.heroCtaLabel" class="form-control rounded-4" />
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold">Texto hero</label>
 <textarea v-model="form.heroSubtitle" class="form-control rounded-4" rows="2"></textarea>
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Titulo dos mais vendidos</label>
 <input v-model="form.bestSellersTitle" class="form-control rounded-4" />
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Quantidade de mais vendidos</label>
 <input v-model.number="form.bestSellersLimit" type="number" min="0" max="12" class="form-control rounded-4" />
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">CTA WhatsApp</label>
 <input v-model="form.ctaTitle" class="form-control rounded-4 mb-2" />
 <textarea v-model="form.ctaText" class="form-control rounded-4" rows="4"></textarea>
 </div>
 </div>
 <div v-else class="row g-3">
 <div class="col-md-6">
 <label class="form-label fw-semibold">Quem somos</label>
 <input v-model="form.aboutTitle" class="form-control rounded-4 mb-2" />
 <textarea v-model="form.aboutText" class="form-control rounded-4" rows="4"></textarea>
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Ano de abertura</label>
 <input v-model.number="form.companyOpeningYear" type="number" min="1900" max="2099" class="form-control rounded-4 mb-2" />
 <input v-model="form.statsYearsLabel" class="form-control rounded-4" />
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Clientes base + CRM</label>
 <input v-model.number="form.statsClientsBase" type="number" min="0" class="form-control rounded-4 mb-2" />
 <input v-model="form.statsClientsLabel" class="form-control rounded-4" />
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Titulo diferenciais</label>
 <input v-model="form.differentiatorsTitle" class="form-control rounded-4" />
 </div>
 <div v-for="item in differentiatorFields" :key="item.title" class="col-md-4">
 <label class="form-label fw-semibold">{{ item.label }}</label>
 <input v-model="form[item.title]" class="form-control rounded-4 mb-2" />
 <textarea v-model="form[item.text]" class="form-control rounded-4" rows="3"></textarea>
 </div>
 <div class="col-12">
 <label class="form-label fw-semibold">Avaliacoes do Google</label>
 <input v-model="form.reviewsTitle" class="form-control rounded-4 mb-2" placeholder="Titulo da secao" />
 <textarea v-model="form.reviewsSubtitle" class="form-control rounded-4" rows="2" placeholder="Texto de apoio"></textarea>
 </div>
 <div v-for="item in reviewFields" :key="item.name" class="col-md-4">
 <label class="form-label fw-semibold">{{ item.label }}</label>
 <input v-model="form[item.name]" class="form-control rounded-4 mb-2" placeholder="Nome do cliente" />
 <textarea v-model="form[item.text]" class="form-control rounded-4" rows="4" placeholder="Trecho positivo da avaliacao"></textarea>
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Localizacao</label>
 <input v-model="form.locationTitle" class="form-control rounded-4 mb-2" />
 <input v-model="form.address" class="form-control rounded-4 mb-2" />
 <input v-model="form.city" class="form-control rounded-4" />
 </div>
 <div class="col-md-6">
 <label class="form-label fw-semibold">Horario e contatos</label>
 <textarea v-model="form.businessHoursText" class="form-control rounded-4 mb-2" rows="2"></textarea>
 <input v-model="form.contactPhone" class="form-control rounded-4 mb-2" placeholder="Telefone" />
 <input v-model="form.contactEmail" class="form-control rounded-4" placeholder="Email" />
 </div>
 </div>
 </div>
 </div>

 <div class="col-xl-6">
 <div class="panel-card">
 <div class="small fw-semibold mb-3">Horario por dia</div>
 <div class="row g-3">
 <div class="col-md-4">
 <label class="form-label fw-semibold">Abertura</label>
 <input v-model="form.openTime" type="time" class="form-control rounded-4" />
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Fechamento</label>
 <input v-model="form.closeTime" type="time" class="form-control rounded-4" />
 </div>
 <div class="col-md-4">
 <label class="form-label fw-semibold">Fuso</label>
 <input v-model="form.timezone" class="form-control rounded-4" />
 </div>
 <div class="col-12">
 <div class="d-grid gap-2">
 <div v-for="day in form.businessHours" :key="day.day" class="daily-hour-row">
 <label class="form-check d-flex align-items-center gap-2 mb-0">
 <input v-model="day.enabled" class="form-check-input mt-0" type="checkbox" />
 <span class="fw-semibold">{{ weekDayLabel(day.day) }}</span>
 </label>
 <input v-model="day.openTime" :disabled="!day.enabled" type="time" class="form-control rounded-4" />
 <input v-model="day.closeTime" :disabled="!day.enabled" type="time" class="form-control rounded-4" />
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>

 <div class="col-xl-6">
 <div class="panel-card">
 <div class="small fw-semibold mb-3">Mensagens</div>
 <div class="d-grid gap-3">
 <div>
 <label class="form-label fw-semibold">Loja fechada</label>
 <textarea v-model="form.closedMessage" class="form-control rounded-4" rows="3"></textarea>
 </div>
 <div>
 <label class="form-label fw-semibold">Servidor indisponivel</label>
 <textarea v-model="form.offlineMessage" class="form-control rounded-4" rows="3"></textarea>
 </div>
 </div>
 </div>
 </div>
 </div>
 </AppShell>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppShell from "../components/AppShell.vue";
import MediaCaptureField from "../components/MediaCaptureField.vue";
import { api } from "../services/api";
import { notifyError, notifySuccess } from "../services/ui";
import type { WebstoreSettings, WebstoreStatus } from "../services/types";

const busy = ref(false);
const gmailBusy = ref(false);
const route = useRoute();
const editorTab = ref<"home" | "about">(route.query.tab === "sobre" ? "about" : "home");
const status = ref<WebstoreStatus | null>(null);
const gmail = reactive({
 email: "",
 status: "DISCONNECTED",
 connectedAt: "",
 updatedAt: "",
 clientId: "",
 hasRefreshToken: false
});
const form = reactive<WebstoreSettings>({
 enabled: true,
 checkoutEnabled: true,
 respectBusinessHours: false,
 openDays: [1, 2, 3, 4, 5, 6],
 openTime: "09:00",
 closeTime: "18:00",
 timezone: "America/Sao_Paulo",
 storeName: "Brasil Express",
 pageTitle: "Brasil Express",
 headline: "Brasil Express",
 logoText: "Brasil Express",
 logoImageUrl: "",
 logoMaxHeight: 64,
 logoUpload: null,
 logoPreview: "",
 logoRemove: false,
 heroImageUrl: "",
 heroImageUpload: null,
 heroImagePreview: "",
 heroImageRemove: false,
 showcaseOneImageUrl: "",
 showcaseOneImageUpload: null,
 showcaseOneImagePreview: "",
 showcaseOneImageRemove: false,
 showcaseTwoImageUrl: "",
 showcaseTwoImageUpload: null,
 showcaseTwoImagePreview: "",
 showcaseTwoImageRemove: false,
 showcaseThreeImageUrl: "",
 showcaseThreeImageUpload: null,
 showcaseThreeImagePreview: "",
 showcaseThreeImageRemove: false,
 subtitle: "Produtos e servicos tecnicos com pedido direto para o CRM.",
 closedMessage: "Loja fechada no momento. Volte no proximo horario de atendimento.",
 offlineMessage: "Nao foi possivel conectar ao CRM. A vitrine esta temporariamente indisponivel.",
 whatsapp: "5531999042766",
 googleBusinessUrl: "",
 googleMapsUrl: "https://maps.google.com/maps?q=Av.%20Francisco%20Sa%20787%20Loja%20111%20Belo%20Horizonte",
 homepageEnabled: true,
 heroTitle: "Ha mais de 20 anos atendendo equipamentos de informatica com qualidade e confianca",
 heroSubtitle: "Empresas e usuarios contam com atendimento presencial, diagnostico transparente e solucoes tecnicas para computadores, notebooks e perifericos.",
 heroCtaLabel: "Faca seu orcamento on-line",
 servicesTitle: "Servicos para Equipamentos de Informatica",
 bestSellersTitle: "Mais vendidos",
 aboutTitle: "Quem somos nos",
 aboutText: "A Brasil Express atua no Prado com atendimento tecnico presencial, montagem de computadores sob demanda e orientacao clara para cada necessidade.",
 statsYears: "20",
 statsYearsLabel: "Anos no mercado",
 statsClients: "5000",
 statsClientsLabel: "Clientes atendidos",
 companyOpeningYear: 2004,
 statsClientsBase: 5000,
 differentiatorsTitle: "Diferenciais",
 differentiatorOneTitle: "Equipe tecnica",
 differentiatorOneText: "Atendimento humano, diagnostico objetivo e experiencia pratica.",
 differentiatorTwoTitle: "Qualidade e transparencia",
 differentiatorTwoText: "Orcamentos claros, registro no CRM e acompanhamento do servico.",
 differentiatorThreeTitle: "Projetos personalizados",
 differentiatorThreeText: "Montagem, upgrade e selecao de pecas conforme perfil de uso.",
 reviewsTitle: "Avaliacoes de clientes",
 reviewsSubtitle: "Ultimas recomendacoes positivas publicadas por clientes no Google.",
 googleReviewOneName: "Cliente Google",
 googleReviewOneText: "Atendimento excelente, equipe atenciosa e orcamento transparente.",
 googleReviewTwoName: "Cliente Google",
 googleReviewTwoText: "Resolveram meu computador com rapidez e explicaram tudo com clareza.",
 googleReviewThreeName: "Cliente Google",
 googleReviewThreeText: "Loja confiavel, atendimento presencial e servico muito bem feito.",
 ctaTitle: "Atendimento rapido pelo WhatsApp",
 ctaText: "Entre em contato com um especialista e solicite seu orcamento sem compromisso.",
 locationTitle: "Localizacao",
 address: "Av. Francisco Sa 787 - Loja 111",
 businessHoursText: "Segunda a sabado, das 09:00 as 18:00",
 city: "Belo Horizonte - MG",
 contactEmail: "",
 contactPhone: "(31) 99904-2766",
 featuredCategoriesLimit: 4,
 bestSellersLimit: 3,
 themePrimaryColor: "#12335a",
 themeTextColor: "#101827",
 themeMutedColor: "#64748b",
 themeBackgroundColor: "#ffffff",
 themeSurfaceColor: "#f5f7fb",
 themeLineColor: "#dbe4ee",
 themeAccentColor: "#f4b63f",
 themeDarkColor: "#0b1220",
 themeFooterColor: "#0b1220",
 heroGradientFromColor: "#6fff96",
 heroGradientToColor: "#2176ae",
 heroGradientAngle: 135,
 surfaceGradientFromColor: "#ffffff",
 surfaceGradientToColor: "#f5f7fb",
 surfaceGradientAngle: 180,
 darkGradientFromColor: "#6fff96",
 darkGradientToColor: "#2176ae",
 darkGradientAngle: 335,
 heroImageX: 0,
 heroImageY: 0,
 heroImageZ: 1,
 showcaseOneImageX: 58,
 showcaseOneImageY: 10,
 showcaseOneImageZ: 2,
 showcaseTwoImageX: 34,
 showcaseTwoImageY: 58,
 showcaseTwoImageZ: 3,
 heroTitleSize: 64,
 heroSubtitleSize: 20,
 sectionTitleSize: 48,
 bodyTextSize: 16,
 cardTitleSize: 18,
 navTextSize: 14,
 businessHours: [
  { day: 0, enabled: false, openTime: "09:00", closeTime: "18:00" },
  { day: 1, enabled: true, openTime: "09:00", closeTime: "18:00" },
  { day: 2, enabled: true, openTime: "09:00", closeTime: "18:00" },
  { day: 3, enabled: true, openTime: "09:00", closeTime: "18:00" },
  { day: 4, enabled: true, openTime: "09:00", closeTime: "18:00" },
  { day: 5, enabled: true, openTime: "09:00", closeTime: "18:00" },
  { day: 6, enabled: true, openTime: "09:00", closeTime: "18:00" }
 ],
 showProducts: true,
 showServices: true,
 hideOutOfStock: false,
 allowCheckoutWhenClosed: false
});

const catalogOptions = [
 { model: "showProducts" as const, label: "Mostrar produtos" },
 { model: "showServices" as const, label: "Mostrar servicos" },
 { model: "hideOutOfStock" as const, label: "Ocultar sem estoque" }
];

const differentiatorFields = [
 { label: "Diferencial 1", title: "differentiatorOneTitle" as const, text: "differentiatorOneText" as const },
 { label: "Diferencial 2", title: "differentiatorTwoTitle" as const, text: "differentiatorTwoText" as const },
 { label: "Diferencial 3", title: "differentiatorThreeTitle" as const, text: "differentiatorThreeText" as const }
];

const colorFields = [
 { label: "Primaria", model: "themePrimaryColor" as const },
 { label: "Texto", model: "themeTextColor" as const },
 { label: "Texto secundario", model: "themeMutedColor" as const },
 { label: "Fundo", model: "themeBackgroundColor" as const },
 { label: "Superficie", model: "themeSurfaceColor" as const },
 { label: "Bordas", model: "themeLineColor" as const },
 { label: "Destaque", model: "themeAccentColor" as const },
 { label: "Secao escura", model: "themeDarkColor" as const },
 { label: "Footer", model: "themeFooterColor" as const }
];

const gradientColorFields = [
 { label: "Hero gradiente início", model: "heroGradientFromColor" as const },
 { label: "Hero gradiente fim", model: "heroGradientToColor" as const },
 { label: "Fundo início", model: "surfaceGradientFromColor" as const },
 { label: "Fundo fim", model: "surfaceGradientToColor" as const },
 { label: "Seção escura início", model: "darkGradientFromColor" as const },
 { label: "Seção escura fim", model: "darkGradientToColor" as const }
];

const gradientAngleFields = [
 { label: "Direção hero", model: "heroGradientAngle" as const },
 { label: "Direção fundo", model: "surfaceGradientAngle" as const },
 { label: "Direção seção escura", model: "darkGradientAngle" as const }
];

const textSizeFields = [
 { label: "Titulo hero", model: "heroTitleSize" as const },
 { label: "Texto hero", model: "heroSubtitleSize" as const },
 { label: "Titulos secoes", model: "sectionTitleSize" as const },
 { label: "Texto base", model: "bodyTextSize" as const },
 { label: "Titulos cards", model: "cardTitleSize" as const },
 { label: "Navbar", model: "navTextSize" as const }
];

const homeImageFields = [
 { key: "hero" as const, label: "Imagem principal da home", url: "heroImageUrl" as const, upload: "heroImageUpload" as const, preview: "heroImagePreview" as const, remove: "heroImageRemove" as const },
 { key: "showcaseOne" as const, label: "Imagem secundaria 1", url: "showcaseOneImageUrl" as const, upload: "showcaseOneImageUpload" as const, preview: "showcaseOneImagePreview" as const, remove: "showcaseOneImageRemove" as const },
 { key: "showcaseTwo" as const, label: "Imagem secundaria 2", url: "showcaseTwoImageUrl" as const, upload: "showcaseTwoImageUpload" as const, preview: "showcaseTwoImagePreview" as const, remove: "showcaseTwoImageRemove" as const },
 { key: "showcaseThree" as const, label: "Imagem extra da home", url: "showcaseThreeImageUrl" as const, upload: "showcaseThreeImageUpload" as const, preview: "showcaseThreeImagePreview" as const, remove: "showcaseThreeImageRemove" as const }
];

const heroImagePositionFields = [
 { label: "Imagem principal", x: "heroImageX" as const, y: "heroImageY" as const, z: "heroImageZ" as const },
 { label: "Imagem secundária 1", x: "showcaseOneImageX" as const, y: "showcaseOneImageY" as const, z: "showcaseOneImageZ" as const },
 { label: "Imagem secundária 2", x: "showcaseTwoImageX" as const, y: "showcaseTwoImageY" as const, z: "showcaseTwoImageZ" as const }
];

const reviewFields = [
 { label: "Avaliacao 1", name: "googleReviewOneName" as const, text: "googleReviewOneText" as const },
 { label: "Avaliacao 2", name: "googleReviewTwoName" as const, text: "googleReviewTwoText" as const },
 { label: "Avaliacao 3", name: "googleReviewThreeName" as const, text: "googleReviewThreeText" as const }
];

const weekDays = [
 { value: 0, label: "Dom" },
 { value: 1, label: "Seg" },
 { value: 2, label: "Ter" },
 { value: 3, label: "Qua" },
 { value: 4, label: "Qui" },
 { value: 5, label: "Sex" },
 { value: 6, label: "Sab" }
];

function applySettings(settings: WebstoreSettings, nextStatus: WebstoreStatus) {
 Object.assign(form, settings, {
  logoUpload: null,
  logoPreview: "",
  logoRemove: false,
  heroImageUpload: null,
  heroImagePreview: "",
  heroImageRemove: false,
  showcaseOneImageUpload: null,
  showcaseOneImagePreview: "",
  showcaseOneImageRemove: false,
  showcaseTwoImageUpload: null,
  showcaseTwoImagePreview: "",
  showcaseTwoImageRemove: false,
  showcaseThreeImageUpload: null,
  showcaseThreeImagePreview: "",
  showcaseThreeImageRemove: false
 });
 status.value = nextStatus;
}

function weekDayLabel(value: number) {
 return weekDays.find((day) => day.value === Number(value))?.label || String(value);
}

function onImagePreviewChange(key: "logo" | "hero" | "showcaseOne" | "showcaseTwo" | "showcaseThree", value: string) {
 if (key === "logo") {
  form.logoPreview = value;
  form.logoRemove = value === "" && !form.logoUpload && Boolean(form.logoImageUrl);
  return;
 }
 const field = homeImageFields.find((item) => item.key === key);
 if (!field) return;
 form[field.preview] = value;
 form[field.remove] = value === "" && !form[field.upload] && Boolean(form[field.url]);
}

async function loadSettings() {
 try {
 const response = await api.webstoreSettings();
 applySettings(response.data, response.status);
 } catch (error) {
 await notifyError(error);
 }
}

async function loadGmailStatus() {
 try {
 const response = await api.gmailStatus();
 Object.assign(gmail, response.data);
 } catch (error) {
 await notifyError(error);
 }
}

async function connectGmail() {
 gmailBusy.value = true;
 try {
 const response = await api.gmailConnect();
 window.location.href = response.data.url;
 } catch (error) {
 await notifyError(error);
 gmailBusy.value = false;
 }
}

async function disconnectGmail() {
 if (!window.confirm("Desvincular o Gmail da webstore e parar os envios pela API?")) {
  return;
 }
 gmailBusy.value = true;
 try {
  const response = await api.gmailDisconnect();
  Object.assign(gmail, response.data);
  if (response.data.revokeError) {
   await notifySuccess("Gmail desvinculado", `Conta removida do CRM. Aviso Google: ${response.data.revokeError}`);
  } else {
   await notifySuccess("Gmail desvinculado", "A conta de envio foi removida do CRM.");
  }
 } catch (error) {
  await notifyError(error);
 } finally {
  gmailBusy.value = false;
 }
}

async function saveSettings() {
 busy.value = true;
 try {
 const response = await api.saveWebstoreSettings({
 ...form,
 storeName: form.pageTitle,
 headline: form.logoText,
 openDays: form.businessHours.filter((day) => day.enabled).map((day) => Number(day.day)).sort((a, b) => a - b),
 openTime: form.businessHours.find((day) => day.enabled)?.openTime || form.openTime,
 closeTime: form.businessHours.find((day) => day.enabled)?.closeTime || form.closeTime,
 businessHours: form.businessHours.map((day) => ({
  day: Number(day.day),
  enabled: Boolean(day.enabled),
  openTime: day.openTime,
  closeTime: day.closeTime
 }))
 });
 applySettings(response.data, response.status);
 await notifySuccess("Webstore atualizada", "Configuracao aplicada a loja online.");
 } catch (error) {
 await notifyError(error);
 } finally {
 busy.value = false;
 }
}

onMounted(async () => {
 await Promise.all([loadSettings(), loadGmailStatus()]);
 if (new URLSearchParams(window.location.search).get("gmail") === "connected") {
  await notifySuccess("Gmail conectado", "A conta de envio da loja foi vinculada ao CRM.");
 }
});

watch(() => route.query.tab, (tab) => {
 editorTab.value = tab === "sobre" ? "about" : "home";
});
</script>

<style scoped>
.day-toggle input {
 position: absolute;
 opacity: 0;
 pointer-events: none;
}

.day-toggle span {
 display: inline-flex;
 align-items: center;
 justify-content: center;
 min-width: 48px;
 min-height: 40px;
 border: 1px solid var(--border-soft);
 border-radius: 8px;
 background: var(--surface-muted);
 font-weight: 800;
 cursor: pointer;
}

.day-toggle input:checked + span {
 background: var(--brand-primary);
 color: #fff;
 border-color: var(--brand-primary);
}

.daily-hour-row {
 display: grid;
 grid-template-columns: minmax(120px, 1fr) 140px 140px;
 gap: 0.75rem;
 align-items: center;
 border: 1px solid var(--border-soft);
 border-radius: 12px;
 padding: 0.75rem;
 background: var(--surface-muted);
}

@media (max-width: 575.98px) {
 .daily-hour-row {
  grid-template-columns: 1fr;
 }
}
</style>
