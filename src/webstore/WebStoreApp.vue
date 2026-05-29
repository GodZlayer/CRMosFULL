<template>
  <main class="webstore-shell" :style="themeStyle">
    <nav class="navbar navbar-expand-lg sticky-top store-nav">
      <div class="container">
        <button class="navbar-brand brand-mark" type="button" @click="goTo('home')" aria-label="Inicio">
          <img
            v-if="settings.logoImageUrl"
            class="brand-logo"
            :src="settings.logoImageUrl"
            :alt="settings.logoText"
            :style="{ maxHeight: `${settings.logoMaxHeight}px` }"
          />
          <span v-else>{{ compactBrand }}</span>
        </button>

        <div class="d-flex align-items-center gap-2 order-lg-2">
          <button class="btn btn-dark position-relative" type="button" @click="cartOpen = true">
            <i class="fa-solid fa-bag-shopping me-2"></i>
            Carrinho
            <span v-if="cartCount" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-warning text-dark">
              {{ cartCount }}
            </span>
          </button>
          <button class="btn btn-outline-dark" type="button" @click="goTo('profile')">
            <i class="fa-solid fa-user me-2"></i>
            Perfil
          </button>
        </div>

        <div class="nav-links order-lg-1">
          <button v-if="settings.homepageEnabled" type="button" :class="{ active: page === 'home' }" @click="goTo('home')">Inicio</button>
          <button type="button" :class="{ active: page === 'store' }" @click="goTo('store')">Loja</button>
          <button type="button" :class="{ active: page === 'about' }" @click="goTo('about')">Sobre</button>
        </div>
      </div>
    </nav>

    <section v-if="!settings.enabled" class="container py-5">
      <div class="state-card">{{ settings.closedMessage }}</div>
    </section>
    <section v-else-if="emailConfirmationStatus" class="container py-5">
      <div class="state-card" :class="{ 'state-card--error': emailConfirmationStatus === 'error' }">
        {{ emailConfirmationMessage }}
        <button class="btn btn-outline-dark mt-3" type="button" @click="goTo('home')">Ir para a loja</button>
      </div>
    </section>
    <section v-else-if="loadError && !allItems.length" class="container py-5">
      <div class="state-card state-card--error">
        {{ settings.offlineMessage || loadError }}
        <button class="btn btn-outline-dark mt-3" type="button" @click="loadStore">Tentar novamente</button>
      </div>
    </section>

    <template v-else>
      <HomePage
        v-if="page === 'home' && settings.homepageEnabled"
        :settings="settings"
        :best-sellers="bestSellers"
        :item-count="showcaseItemCount"
        :whatsapp-url="whatsappUrl"
        @open-store="goTo('store')"
        @open-item="openBestSeller"
      />

      <AboutPage
        v-else-if="page === 'about'"
        :settings="settings"
        :whatsapp-url="whatsappUrl"
        @open-store="goTo('store')"
      />

      <section v-else-if="page === 'profile'" class="container section-pad profile-page">
        <div class="section-title">
          <span class="eyebrow">Perfil</span>
          <h2>Seu cadastro</h2>
          <p>Entre com Google e salve seu WhatsApp para finalizar compras.</p>
        </div>
        <div class="profile-layout">
          <div class="profile-panel">
            <div class="session-status" :class="{ 'session-status--active': customerLoggedIn || customerGoogleVerified }">
              <span>{{ customerLoggedIn || customerGoogleVerified ? "Sessao ativa" : "Sessao nao iniciada" }}</span>
              <strong>{{ customer.email || "Entre com Google ou salve seus dados." }}</strong>
              <button v-if="customerLoggedIn || customerGoogleVerified" class="btn btn-outline-dark btn-sm" type="button" @click="logoutCustomer">
                Sair
              </button>
            </div>
            <button v-if="!customerGoogleVerified && !customerLoggedIn" class="btn btn-light btn-lg w-100 google-button" type="button" :disabled="customerSubmitting" @click="connectCustomerGoogle">
              <i class="fa-brands fa-google me-2"></i>
              Continuar com Google
            </button>
            <div class="profile-separator" :class="{ 'mt-0': customerGoogleVerified || customerLoggedIn }">Dados obrigatorios</div>
            <form class="checkout-form" @submit.prevent="submitCustomerRegistration">
              <input v-model="customer.name" class="form-control form-control-lg" required placeholder="Nome completo" />
              <input v-model="customer.phone" class="form-control form-control-lg" required placeholder="WhatsApp" />
              <input v-model="customer.email" class="form-control form-control-lg" type="email" placeholder="Email" />
              <button class="btn btn-dark btn-lg w-100" type="submit" :disabled="customerSubmitting">
                {{ customerSubmitting ? "Salvando..." : "Salvar perfil" }}
              </button>
            </form>
            <p v-if="customerError" class="form-error">{{ customerError }}</p>
            <p v-if="customerSuccess" class="form-success">{{ customerSuccess }}</p>
          </div>
        </div>
      </section>

      <StorePage
        v-else
        :settings="settings"
        :loading="loading"
        :store-open="storeOpen"
        :filtered-items="filteredItems"
        :grouped-filtered-items="groupedFilteredItems"
        :categories="categories"
        :quality-options="qualityOptions"
        :search="search"
        :selected-category="selectedCategory"
        :selected-condition="selectedCondition"
        :sort-mode="sortMode"
        :view-mode="viewMode"
        @update:search="search = $event"
        @update:selected-category="selectedCategory = $event"
        @update:selected-condition="selectedCondition = $event"
        @update:sort-mode="sortMode = $event"
        @update:view-mode="viewMode = $event"
        @open-item="openItem"
        @add-to-cart="addToCart"
      />
    </template>

    <a v-if="whatsappPhone" class="floating-whatsapp" :href="whatsappUrl" target="_blank" rel="noreferrer" aria-label="Chamar no WhatsApp">
      <i class="fa-brands fa-whatsapp"></i>
    </a>

    <aside v-if="selectedItem" class="cart-drawer" aria-label="Detalhe do item">
      <div class="cart-panel">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-4">
          <div>
            <p class="eyebrow mb-1">{{ selectedItem.type === "service" ? "Servico" : "Produto" }}</p>
            <h2 class="h4 fw-black mb-0">{{ selectedItem.name }}</h2>
          </div>
          <button class="btn btn-light rounded-circle" type="button" @click="selectedItem = null">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="detail-image">
          <img v-if="selectedItem.photo_url" :src="selectedItem.photo_url" :alt="selectedItem.name" />
          <span v-else>Sem imagem</span>
        </div>
        <p class="text-secondary mt-3">{{ selectedItem.description || selectedItem.brand || "Sem descricao cadastrada." }}</p>
        <div class="total-row">
          <span>{{ selectedItem.type === "product" ? stockLabel(selectedItem) : "Servico disponivel" }}</span>
          <strong>{{ currency(selectedItem.price_amount) }}</strong>
        </div>
        <button class="btn btn-dark btn-lg w-100 mt-3" type="button" :disabled="!canAddItem(selectedItem)" @click="addToCart(selectedItem)">
          Adicionar ao carrinho
        </button>
      </div>
    </aside>

    <aside v-if="customerOpen" class="cart-drawer" aria-label="Perfil do cliente">
      <div class="cart-panel">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-4">
          <div>
            <p class="eyebrow mb-1">Cliente</p>
            <h2 class="h3 fw-black mb-0">Perfil</h2>
          </div>
          <button class="btn btn-light rounded-circle" type="button" @click="customerOpen = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form class="checkout-form" @submit.prevent="submitCustomerRegistration">
          <input v-model="customer.name" class="form-control form-control-lg" required placeholder="Nome completo" />
          <input v-model="customer.phone" class="form-control form-control-lg" required placeholder="WhatsApp" />
          <input v-model="customer.email" class="form-control form-control-lg" type="email" placeholder="Email" />
          <button class="btn btn-dark btn-lg w-100" type="submit" :disabled="customerSubmitting">
            {{ customerSubmitting ? "Salvando..." : "Salvar perfil" }}
          </button>
          <p v-if="customerError" class="form-error">{{ customerError }}</p>
          <p v-if="customerSuccess" class="form-success">{{ customerSuccess }}</p>
        </form>
      </div>
    </aside>

    <aside v-if="cartOpen" class="cart-drawer" aria-label="Carrinho">
      <div class="cart-panel">
        <div class="d-flex justify-content-between align-items-start gap-3 mb-4">
          <div>
            <p class="eyebrow mb-1">Pedido</p>
            <h2 class="h3 fw-black mb-0">Carrinho</h2>
          </div>
          <button class="btn btn-light rounded-circle" type="button" @click="cartOpen = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div v-if="!cart.length" class="empty-cart">Nenhum item adicionado.</div>
        <div v-else class="cart-lines">
          <div v-for="line in cart" :key="`${line.type}-${line.id}`" class="cart-line">
            <div class="min-w-0">
              <strong>{{ line.name }}</strong>
              <span>{{ currency(line.price_amount) }}</span>
            </div>
            <div class="quantity">
              <button type="button" @click="changeQuantity(line, -1)">-</button>
              <span>{{ line.quantity }}</span>
              <button type="button" @click="changeQuantity(line, 1)">+</button>
            </div>
          </div>
          <button class="btn btn-outline-secondary" type="button" @click="clearCart">Limpar carrinho</button>
        </div>

        <form class="checkout-form" @submit.prevent="submitOrder">
          <div v-if="checkoutAfterHoursNotice" class="alert alert-warning fw-bold mb-0">
            {{ checkoutAfterHoursNotice }}
          </div>
          <div v-if="!customerProfileComplete" class="alert alert-warning fw-bold mb-0">
            Complete seus dados na pagina
            <button class="alert-link-button" type="button" @click="goTo('profile'); cartOpen = false">Perfil</button>.
          </div>
          <template v-else>
            <div class="checkout-summary">
              <span>Cliente</span>
              <strong>{{ customer.name }}</strong>
              <small>{{ customer.phone }}</small>
            </div>
            <div class="checkout-summary">
              <span>Entrega</span>
              <strong>Retirada em loja</strong>
              <small>{{ settings.address || "Endereco da loja configurado no CRM" }}</small>
            </div>
            <div class="total-row">
              <span>Total estimado</span>
              <strong>{{ currency(cartTotal) }}</strong>
            </div>
            <button class="btn btn-dark btn-lg w-100" type="submit" :disabled="submitting || !canCheckout">
              {{ submitting ? "Enviando..." : "Enviar pedido" }}
            </button>
          </template>
          <p v-if="submitError" class="form-error">{{ submitError }}</p>
          <p v-if="successCode" class="form-success">Pedido {{ successCode }} criado no CRM.</p>
        </form>
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, reactive, ref, watch, type PropType } from "vue";

type StoreItem = {
  id: number;
  type: "product" | "service";
  name: string;
  brand?: string;
  description?: string;
  category?: string;
  item_condition?: string;
  stock_quantity: number;
  price_amount: number;
  photo_url?: string;
  available: boolean;
};

type CartLine = StoreItem & { quantity: number };
type BestSellerItem = Pick<StoreItem, "id" | "type" | "name" | "description" | "category" | "price_amount" | "photo_url"> & { sold_quantity: number };
type PageName = "home" | "store" | "about" | "profile";

type PublicSettings = {
  enabled: boolean;
  checkoutEnabled: boolean;
  allowCheckoutWhenClosed: boolean;
  storeName: string;
  pageTitle: string;
  headline: string;
  logoText: string;
  logoImageUrl: string;
  logoMaxHeight: number;
  heroImageUrl: string;
  showcaseOneImageUrl: string;
  showcaseTwoImageUrl: string;
  showcaseThreeImageUrl: string;
  subtitle: string;
  closedMessage: string;
  offlineMessage: string;
  whatsapp: string;
  googleBusinessUrl: string;
  googleMapsUrl: string;
  homepageEnabled: boolean;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string;
  servicesTitle: string;
  bestSellersTitle: string;
  aboutTitle: string;
  aboutText: string;
  statsYears: string;
  statsYearsLabel: string;
  statsClients: string;
  statsClientsLabel: string;
  companyOpeningYear: number;
  statsClientsBase: number;
  realClients: number;
  realShowcaseItems: number;
  differentiatorsTitle: string;
  differentiatorOneTitle: string;
  differentiatorOneText: string;
  differentiatorTwoTitle: string;
  differentiatorTwoText: string;
  differentiatorThreeTitle: string;
  differentiatorThreeText: string;
  reviewsTitle: string;
  reviewsSubtitle: string;
  googleReviewOneName: string;
  googleReviewOneText: string;
  googleReviewTwoName: string;
  googleReviewTwoText: string;
  googleReviewThreeName: string;
  googleReviewThreeText: string;
  ctaTitle: string;
  ctaText: string;
  locationTitle: string;
  address: string;
  businessHoursText: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
  featuredCategoriesLimit: number;
  bestSellersLimit: number;
  heroGradientFromColor: string;
  heroGradientToColor: string;
  heroGradientAngle: number;
  surfaceGradientFromColor: string;
  surfaceGradientToColor: string;
  surfaceGradientAngle: number;
  darkGradientFromColor: string;
  darkGradientToColor: string;
  darkGradientAngle: number;
  heroImageX: number;
  heroImageY: number;
  heroImageZ: number;
  showcaseOneImageX: number;
  showcaseOneImageY: number;
  showcaseOneImageZ: number;
  showcaseTwoImageX: number;
  showcaseTwoImageY: number;
  showcaseTwoImageZ: number;
  themePrimaryColor: string;
  themeTextColor: string;
  themeMutedColor: string;
  themeBackgroundColor: string;
  themeSurfaceColor: string;
  themeLineColor: string;
  themeAccentColor: string;
  themeDarkColor: string;
  themeFooterColor: string;
  heroTitleSize: number;
  heroSubtitleSize: number;
  sectionTitleSize: number;
  bodyTextSize: number;
  cardTitleSize: number;
  navTextSize: number;
  businessHours: Array<{ day: number; enabled: boolean; openTime: string; closeTime: string }>;
  openDays: number[];
  openTime: string;
  closeTime: string;
  showProducts: boolean;
  showServices: boolean;
  hideOutOfStock: boolean;
  status: { isOpen: boolean; label: string; openTime?: string; closeTime?: string };
};

const defaultSettings: PublicSettings = {
  enabled: true,
  checkoutEnabled: true,
  allowCheckoutWhenClosed: false,
  storeName: "Brasil Express",
  pageTitle: "Brasil Express",
  headline: "Brasil Express",
  logoText: "Brasil Express",
  logoImageUrl: "",
  logoMaxHeight: 64,
  heroImageUrl: "",
  showcaseOneImageUrl: "",
  showcaseTwoImageUrl: "",
  showcaseThreeImageUrl: "",
  subtitle: "Produtos e servicos tecnicos com pedido direto para o CRM.",
  closedMessage: "Loja fechada no momento. Volte no proximo horario de atendimento.",
  offlineMessage: "Nao foi possivel conectar ao CRM. A vitrine esta temporariamente indisponivel.",
  whatsapp: "5531999042766",
  googleBusinessUrl: "",
  googleMapsUrl: "https://maps.google.com/maps?q=Av.%20Francisco%20Sa%20787%20Loja%20111%20Belo%20Horizonte",
  homepageEnabled: true,
  heroTitle: "Ha mais de 20 anos atendendo equipamentos de informatica com qualidade e confianca",
  heroSubtitle: "Empresas e usuarios contam com atendimento presencial, diagnostico transparente e solucoes tecnicas.",
  heroCtaLabel: "Faca seu orcamento on-line",
  servicesTitle: "Servicos para Equipamentos de Informatica",
  bestSellersTitle: "Mais vendidos",
  aboutTitle: "Quem somos nos",
  aboutText: "Atendimento tecnico presencial, montagem sob demanda e orientacao clara para cada necessidade.",
  statsYears: "20",
  statsYearsLabel: "Anos no mercado",
  statsClients: "5000",
  statsClientsLabel: "Clientes atendidos",
  companyOpeningYear: 2004,
  statsClientsBase: 5000,
  realClients: 0,
  realShowcaseItems: 0,
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
  openDays: [1, 2, 3, 4, 5, 6],
  openTime: "09:00",
  closeTime: "18:00",
  showProducts: true,
  showServices: true,
  hideOutOfStock: false,
  status: { isOpen: true, label: "Loja aberta" }
};

const HomePage = defineComponent({
  props: {
    settings: { type: Object as PropType<PublicSettings>, required: true },
    bestSellers: { type: Array as PropType<BestSellerItem[]>, required: true },
    itemCount: { type: Number, required: true },
    whatsappUrl: { type: String, required: true }
  },
  emits: ["open-store", "open-item"],
  setup(props, { emit }) {
    const differentiators = computed(() => [
      { icon: "fa-solid fa-user-gear", title: props.settings.differentiatorOneTitle, text: props.settings.differentiatorOneText },
      { icon: "fa-solid fa-shield-halved", title: props.settings.differentiatorTwoTitle, text: props.settings.differentiatorTwoText },
      { icon: "fa-solid fa-microchip", title: props.settings.differentiatorThreeTitle, text: props.settings.differentiatorThreeText }
    ]);
    const reviews = computed(() => [
      { name: props.settings.googleReviewOneName, text: props.settings.googleReviewOneText },
      { name: props.settings.googleReviewTwoName, text: props.settings.googleReviewTwoText },
      { name: props.settings.googleReviewThreeName, text: props.settings.googleReviewThreeText }
    ].filter((review) => review.name || review.text));
    const imageStyle = (x: number, y: number, z: number) => ({
      "--image-x": `${x}%`,
      "--image-y": `${y}%`,
      "--image-z": String(z)
    });

    return () => h("div", { class: "home-page" }, [
      h("section", { class: "hero-section" }, [
        h("div", { class: "container" }, [
          h("div", { class: "row align-items-center g-5" }, [
            h("div", { class: "col-lg-7" }, [
              h("h1", { class: "display-title" }, props.settings.heroTitle),
              h("p", { class: "lead hero-lead" }, props.settings.heroSubtitle),
              h("div", { class: "d-flex flex-wrap gap-3 mt-4" }, [
                props.settings.whatsapp || props.settings.contactPhone
                  ? h("a", { class: "btn btn-dark btn-lg", href: props.whatsappUrl, target: "_blank", rel: "noreferrer" }, props.settings.heroCtaLabel || "Enviar mensagem")
                  : h("button", { class: "btn btn-dark btn-lg", type: "button", onClick: () => emit("open-store") }, props.settings.heroCtaLabel),
                props.settings.googleMapsUrl
                  ? h("a", { class: "btn btn-outline-dark btn-lg", href: props.settings.googleMapsUrl, target: "_blank", rel: "noreferrer" }, "Venha à loja")
                  : null
              ]),
              h("div", { class: "trust-row" }, [
                h("div", [h("strong", props.settings.statsYears), h("span", props.settings.statsYearsLabel)]),
                h("div", [h("strong", props.settings.statsClients), h("span", props.settings.statsClientsLabel)]),
                h("div", [h("strong", String(props.itemCount)), h("span", "Itens na vitrine")])
              ])
            ]),
            h("div", { class: "col-lg-5" }, [
              h("div", { class: "tech-showcase" }, [
                h("div", { class: "showcase-photo showcase-photo--main", style: imageStyle(props.settings.heroImageX, props.settings.heroImageY, props.settings.heroImageZ) }, [
                  props.settings.heroImageUrl ? h("img", { src: props.settings.heroImageUrl, alt: "Bancada tecnica" }) : null,
                  h("i", { class: "fa-solid fa-screwdriver-wrench" }),
                  h("strong", "Bancada tecnica"),
                  h("span", "Diagnostico presencial e processo registrado.")
                ]),
                h("div", { class: "showcase-photo showcase-photo--side", style: imageStyle(props.settings.showcaseOneImageX, props.settings.showcaseOneImageY, props.settings.showcaseOneImageZ) }, [
                  props.settings.showcaseOneImageUrl ? h("img", { src: props.settings.showcaseOneImageUrl, alt: "Pecas e upgrades" }) : null,
                  h("i", { class: "fa-solid fa-microchip" }),
                  h("strong", "Pecas e upgrades")
                ]),
                h("div", { class: "showcase-photo showcase-photo--bottom", style: imageStyle(props.settings.showcaseTwoImageX, props.settings.showcaseTwoImageY, props.settings.showcaseTwoImageZ) }, [
                  props.settings.showcaseTwoImageUrl || props.settings.showcaseThreeImageUrl
                    ? h("img", { src: props.settings.showcaseTwoImageUrl || props.settings.showcaseThreeImageUrl, alt: "Computadores sob demanda" })
                    : null,
                  h("i", { class: "fa-solid fa-desktop" }),
                  h("strong", "Computadores sob demanda")
                ])
              ])
            ])
          ])
        ])
      ]),
      h("section", { class: "container section-pad" }, [
        h("div", { class: "section-title" }, [
          h("span", { class: "eyebrow" }, "Catalogo"),
          h("h2", props.settings.bestSellersTitle),
          h("p", "Itens com maior saida considerando OS, PDV e movimentacoes do CRM.")
        ]),
        props.bestSellers.length
          ? h("div", { class: "best-seller-podium" }, props.bestSellers.slice(0, 3).map((item, index) =>
            h("div", { class: `podium-slot podium-slot--${index + 1}`, key: `${item.type}-${item.id}` }, [
              h("button", { class: "best-seller-tile", type: "button", onClick: () => emit("open-item", item) }, [
                h("span", `#${index + 1} | ${item.sold_quantity} venda(s)`),
                item.photo_url ? h("img", { src: item.photo_url, alt: item.name }) : h("i", { class: item.type === "service" ? "fa-solid fa-screwdriver-wrench" : "fa-solid fa-box-open" }),
                h("strong", item.name),
                h("small", currency(item.price_amount))
              ])
            ])
          ))
          : h("div", { class: "state-card" }, "Assim que houver vendas no CRM, os itens mais vendidos aparecem aqui.")
      ]),
      h("section", { class: "about-section section-pad" }, [
        h("div", { class: "container" }, [
          h("div", { class: "row g-4 align-items-center" }, [
            h("div", { class: "col-lg-6" }, [
              h("span", { class: "eyebrow" }, "Institucional"),
              h("h2", props.settings.aboutTitle),
              h("p", props.settings.aboutText),
              props.settings.showcaseThreeImageUrl
                ? h("img", { class: "about-photo", src: props.settings.showcaseThreeImageUrl, alt: props.settings.aboutTitle })
                : null
            ]),
            h("div", { class: "col-lg-6" }, [
              h("div", { class: "row g-3" }, differentiators.value.map((item) =>
                h("div", { class: "col-12", key: item.title }, [
                  h("article", { class: "differential-card" }, [
                    h("i", { class: item.icon }),
                    h("div", [h("strong", item.title), h("p", item.text)])
                  ])
                ])
              ))
            ])
          ])
        ])
      ]),
      reviews.value.length
        ? h("section", { class: "reviews-section section-pad" }, [
          h("div", { class: "container" }, [
            h("div", { class: "reviews-heading" }, [
              h("div", [
                h("span", { class: "eyebrow" }, "Google Reviews"),
                h("h2", props.settings.reviewsTitle),
                h("p", props.settings.reviewsSubtitle)
              ]),
              props.settings.googleBusinessUrl
                ? h("a", { class: "btn btn-outline-dark", href: props.settings.googleBusinessUrl, target: "_blank", rel: "noreferrer" }, [
                  h("i", { class: "fa-brands fa-google me-2" }),
                  "Ver perfil"
                ])
                : null
            ]),
            h("div", { class: "row g-4" }, reviews.value.map((review, index) =>
              h("div", { class: "col-md-4", key: `${review.name}-${index}` }, [
                h("article", { class: "review-card" }, [
                  h("div", { class: "review-topline" }, [
                    h("span", { class: "google-dot" }, "G"),
                    h("div", [
                      h("strong", review.name || "Cliente Google"),
                      h("small", "Avaliacao positiva")
                    ])
                  ]),
                  h("div", { class: "review-stars", "aria-label": "5 estrelas" }, "★★★★★"),
                  h("p", review.text)
                ])
              ])
            ))
          ])
        ])
        : null,
      h("footer", { class: "home-footer" }, [
        h("div", { class: "container" }, [
          h("div", { class: "footer-grid" }, [
            h("div", { class: "footer-brand" }, [
              h("strong", props.settings.logoText || props.settings.pageTitle),
              h("p", props.settings.ctaText)
            ]),
            h("div", { class: "footer-column" }, [
              h("span", "Atendimento"),
              h("h2", props.settings.ctaTitle),
              props.settings.whatsapp || props.settings.contactPhone
                ? h("a", { href: props.whatsappUrl, target: "_blank", rel: "noreferrer" }, "WhatsApp")
                : h("button", { type: "button", onClick: () => emit("open-store") }, "Ver loja")
            ]),
            h("div", { class: "footer-column" }, [
              h("span", props.settings.locationTitle),
              h("p", props.settings.address),
              h("p", props.settings.city),
              h("p", props.settings.businessHoursText)
            ]),
            h("div", { class: "footer-column" }, [
              h("span", "Contato"),
              props.settings.contactPhone ? h("a", { href: `tel:${props.settings.contactPhone}` }, props.settings.contactPhone) : null,
              props.settings.contactEmail ? h("a", { href: `mailto:${props.settings.contactEmail}` }, props.settings.contactEmail) : null,
              props.settings.googleBusinessUrl ? h("a", { href: props.settings.googleBusinessUrl, target: "_blank", rel: "noreferrer" }, "Perfil no Google") : null
            ])
          ]),
          h("div", { class: "footer-bottom" }, [
            h("span", `© ${new Date().getFullYear()} ${props.settings.pageTitle}`),
            h("button", { type: "button", onClick: () => emit("open-store") }, "Abrir loja")
          ])
        ])
      ])
    ]);
  }
});

const AboutPage = defineComponent({
  props: {
    settings: { type: Object as PropType<PublicSettings>, required: true },
    whatsappUrl: { type: String, required: true }
  },
  emits: ["open-store"],
  setup(props, { emit }) {
    const differentiators = computed(() => [
      { icon: "fa-solid fa-user-gear", title: props.settings.differentiatorOneTitle, text: props.settings.differentiatorOneText },
      { icon: "fa-solid fa-shield-halved", title: props.settings.differentiatorTwoTitle, text: props.settings.differentiatorTwoText },
      { icon: "fa-solid fa-microchip", title: props.settings.differentiatorThreeTitle, text: props.settings.differentiatorThreeText }
    ]);
    const reviews = computed(() => [
      { name: props.settings.googleReviewOneName, text: props.settings.googleReviewOneText },
      { name: props.settings.googleReviewTwoName, text: props.settings.googleReviewTwoText },
      { name: props.settings.googleReviewThreeName, text: props.settings.googleReviewThreeText }
    ].filter((review) => review.name || review.text));

    return () => h("div", { class: "about-page" }, [
      h("section", { class: "about-hero section-pad" }, [
        h("div", { class: "container" }, [
          h("div", { class: "row g-5 align-items-center" }, [
            h("div", { class: "col-lg-7" }, [
              h("span", { class: "eyebrow" }, "Sobre"),
              h("h1", props.settings.aboutTitle),
              h("p", props.settings.aboutText),
              h("div", { class: "d-flex flex-wrap gap-3 mt-4" }, [
                h("button", { class: "btn btn-dark btn-lg", type: "button", onClick: () => emit("open-store") }, "Abrir loja"),
                props.settings.whatsapp || props.settings.contactPhone
                  ? h("a", { class: "btn btn-outline-dark btn-lg", href: props.whatsappUrl, target: "_blank", rel: "noreferrer" }, "WhatsApp")
                  : null
              ])
            ]),
            h("div", { class: "col-lg-5" }, [
              h("div", { class: "about-hero-media" }, [
                props.settings.heroImageUrl
                  ? h("img", { src: props.settings.heroImageUrl, alt: props.settings.aboutTitle })
                  : h("i", { class: "fa-solid fa-screwdriver-wrench" }),
                h("strong", props.settings.statsYears),
                h("span", props.settings.statsYearsLabel)
              ])
            ])
          ])
        ])
      ]),
      h("section", { class: "container section-pad" }, [
        h("div", { class: "section-title" }, [
          h("span", { class: "eyebrow" }, props.settings.differentiatorsTitle),
          h("h2", "Atendimento tecnico com processo claro"),
          h("p", "Diagnostico, orcamento e acompanhamento pensados para atendimento presencial e compra segura.")
        ]),
        h("div", { class: "row g-4" }, differentiators.value.map((item) =>
          h("div", { class: "col-md-4", key: item.title }, [
            h("article", { class: "about-feature" }, [
              h("i", { class: item.icon }),
              h("strong", item.title),
              h("p", item.text)
            ])
          ])
        ))
      ]),
      reviews.value.length
        ? h("section", { class: "reviews-section section-pad" }, [
          h("div", { class: "container" }, [
            h("div", { class: "reviews-heading" }, [
              h("div", [
                h("span", { class: "eyebrow" }, "Google Reviews"),
                h("h2", props.settings.reviewsTitle),
                h("p", props.settings.reviewsSubtitle)
              ]),
              props.settings.googleBusinessUrl
                ? h("a", { class: "btn btn-outline-dark", href: props.settings.googleBusinessUrl, target: "_blank", rel: "noreferrer" }, [
                  h("i", { class: "fa-brands fa-google me-2" }),
                  "Ver perfil"
                ])
                : null
            ]),
            h("div", { class: "row g-4" }, reviews.value.map((review, index) =>
              h("div", { class: "col-md-4", key: `${review.name}-${index}` }, [
                h("article", { class: "review-card" }, [
                  h("div", { class: "review-topline" }, [
                    h("span", { class: "google-dot" }, "G"),
                    h("div", [
                      h("strong", review.name || "Cliente Google"),
                      h("small", "Avaliacao positiva")
                    ])
                  ]),
                  h("div", { class: "review-stars", "aria-label": "5 estrelas" }, "★★★★★"),
                  h("p", review.text)
                ])
              ])
            ))
          ])
        ])
        : null,
      h("footer", { class: "home-footer" }, [
        h("div", { class: "container" }, [
          h("div", { class: "footer-grid" }, [
            h("div", { class: "footer-brand" }, [
              h("strong", props.settings.logoText || props.settings.pageTitle),
              h("p", props.settings.ctaText)
            ]),
            h("div", { class: "footer-column" }, [
              h("span", "Atendimento"),
              h("h2", props.settings.ctaTitle),
              props.settings.whatsapp || props.settings.contactPhone
                ? h("a", { href: props.whatsappUrl, target: "_blank", rel: "noreferrer" }, "WhatsApp")
                : h("button", { type: "button", onClick: () => emit("open-store") }, "Ver loja")
            ]),
            h("div", { class: "footer-column" }, [
              h("span", props.settings.locationTitle),
              h("p", props.settings.address),
              h("p", props.settings.city),
              h("p", props.settings.businessHoursText)
            ]),
            h("div", { class: "footer-column" }, [
              h("span", "Contato"),
              props.settings.contactPhone ? h("a", { href: `tel:${props.settings.contactPhone}` }, props.settings.contactPhone) : null,
              props.settings.contactEmail ? h("a", { href: `mailto:${props.settings.contactEmail}` }, props.settings.contactEmail) : null,
              props.settings.googleBusinessUrl ? h("a", { href: props.settings.googleBusinessUrl, target: "_blank", rel: "noreferrer" }, "Perfil no Google") : null
            ])
          ])
        ])
      ])
    ]);
  }
});

const StorePage = defineComponent({
  props: {
    settings: { type: Object as PropType<PublicSettings>, required: true },
    loading: { type: Boolean, required: true },
    storeOpen: { type: Boolean, required: true },
    filteredItems: { type: Array as PropType<StoreItem[]>, required: true },
    groupedFilteredItems: { type: Array as PropType<Array<{ category: string; items: StoreItem[] }>>, required: true },
    categories: { type: Array as PropType<string[]>, required: true },
    qualityOptions: { type: Array as PropType<Array<{ value: string; label: string }>>, required: true },
    search: { type: String, required: true },
    selectedCategory: { type: String, required: true },
    selectedCondition: { type: String, required: true },
    sortMode: { type: String, required: true },
    viewMode: { type: String as PropType<"all" | "product" | "service">, required: true }
  },
  emits: [
    "update:search",
    "update:selected-category",
    "update:selected-condition",
    "update:sort-mode",
    "update:view-mode",
    "open-item",
    "add-to-cart"
  ],
  setup(props, { emit }) {
    const itemCategoryLabel = (item: StoreItem) => item.type === "service" ? "Servico tecnico" : `${item.category || "Produto"}${item.item_condition ? ` | ${conditionLabel(item.item_condition)}` : ""}`;

    return () => h("div", { class: "store-page" }, [
      !props.storeOpen
        ? h("div", { class: "container mt-4" }, [
          h("div", { class: "alert alert-warning rounded-4 fw-bold" }, [
            h("strong", "Loja fechada. "),
            h("span", props.settings.closedMessage)
          ])
        ])
        : null,
      h("section", { class: "container py-4" }, [
        h("div", { class: "filter-card" }, [
          h("div", { class: "row g-3 align-items-end" }, [
            h("div", { class: "col-lg-4" }, [
              h("label", { class: "form-label fw-bold", for: "search" }, "Buscar"),
              h("input", {
                id: "search",
                class: "form-control form-control-lg",
                value: props.search,
                placeholder: "Produto, servico, marca ou categoria",
                onInput: (event: Event) => emit("update:search", (event.target as HTMLInputElement).value)
              })
            ]),
            h("div", { class: "col-md-4 col-lg-2" }, [
              h("label", { class: "form-label fw-bold" }, "Categoria"),
              h("select", {
                class: "form-select form-select-lg",
                value: props.selectedCategory,
                onChange: (event: Event) => emit("update:selected-category", (event.target as HTMLSelectElement).value)
              }, [
                h("option", { value: "" }, "Todas"),
                ...props.categories.map((category) => h("option", { value: category, key: category }, category))
              ])
            ]),
            h("div", { class: "col-md-4 col-lg-2" }, [
              h("label", { class: "form-label fw-bold" }, "Qualidade"),
              h("select", {
                class: "form-select form-select-lg",
                value: props.selectedCondition,
                onChange: (event: Event) => emit("update:selected-condition", (event.target as HTMLSelectElement).value)
              }, [
                h("option", { value: "" }, "Todas"),
                ...props.qualityOptions.map((condition) => h("option", { value: condition.value, key: condition.value }, condition.label))
              ])
            ]),
            h("div", { class: "col-md-4 col-lg-2" }, [
              h("label", { class: "form-label fw-bold" }, "Ordenar"),
              h("select", {
                class: "form-select form-select-lg",
                value: props.sortMode,
                onChange: (event: Event) => emit("update:sort-mode", (event.target as HTMLSelectElement).value)
              }, [
                h("option", { value: "name" }, "Nome"),
                h("option", { value: "price-asc" }, "Menor preco"),
                h("option", { value: "price-desc" }, "Maior preco")
              ])
            ]),
            h("div", { class: "col-lg-2" }, [
              h("div", { class: "btn-group w-100", role: "group" }, [
                h("button", { class: ["btn", props.viewMode === "all" ? "btn-dark" : "btn-outline-dark"], type: "button", onClick: () => emit("update:view-mode", "all") }, "Tudo"),
                h("button", { class: ["btn", props.viewMode === "product" ? "btn-dark" : "btn-outline-dark"], type: "button", onClick: () => emit("update:view-mode", "product") }, "Produtos"),
                h("button", { class: ["btn", props.viewMode === "service" ? "btn-dark" : "btn-outline-dark"], type: "button", onClick: () => emit("update:view-mode", "service") }, "Servicos")
              ])
            ])
          ])
        ])
      ]),
      h("section", { class: "container pb-5" }, [
        props.loading
          ? h("div", { class: "state-card" }, "Carregando vitrine...")
          : !props.filteredItems.length
            ? h("div", { class: "state-card" }, "Nenhum item encontrado neste filtro.")
            : h("div", { class: "catalog-groups" }, props.groupedFilteredItems.map((group) =>
              h("section", { class: "catalog-group", key: group.category }, [
                h("div", { class: "group-heading" }, [
                  h("div", [h("span", { class: "eyebrow" }, "Categoria"), h("h2", group.category)]),
                  h("span", `${group.items.length} item(ns)`)
                ]),
                h("div", { class: "row g-4" }, group.items.map((item) =>
                  h("div", { class: "col-md-6 col-xl-4", key: `${item.type}-${item.id}` }, [
                    h("article", { class: "product-card" }, [
                      h("button", { class: "product-image", type: "button", onClick: () => emit("open-item", item) }, [
                        item.photo_url ? h("img", { src: item.photo_url, alt: item.name }) : h("div", item.type === "service" ? "Servico" : "Produto"),
                        !item.available ? h("span", { class: "stock-ribbon" }, "Indisponivel") : null
                      ]),
                      h("div", { class: "product-body" }, [
                        h("span", { class: "product-meta" }, itemCategoryLabel(item)),
                        h("h3", item.name),
                        h("p", item.description || item.brand || "Sem descricao cadastrada."),
                        h("div", { class: "stock-line" }, item.type === "product" ? stockLabel(item) : "Disponivel para pedido"),
                        h("div", { class: "product-footer" }, [
                          h("strong", currency(item.price_amount)),
                          h("button", { class: "btn btn-dark", type: "button", disabled: !canAddItem(item), onClick: () => emit("add-to-cart", item) }, "Adicionar")
                        ])
                      ])
                    ])
                  ])
                ))
              ])
            ))
      ])
    ]);
  }
});

const products = ref<StoreItem[]>([]);
const services = ref<StoreItem[]>([]);
const bestSellers = ref<BestSellerItem[]>([]);
const cart = ref<CartLine[]>(loadSavedCart());
const selectedItem = ref<StoreItem | null>(null);
const search = ref("");
const selectedCategory = ref("");
const selectedCondition = ref("");
const sortMode = ref("name");
const viewMode = ref<"all" | "product" | "service">("all");
const page = ref<PageName>(pathToPage());
const loading = ref(true);
const loadError = ref("");
const submitError = ref("");
const successCode = ref("");
const submitting = ref(false);
const cartOpen = ref(false);
const customerOpen = ref(false);
const customerSubmitting = ref(false);
const customerError = ref("");
const customerSuccess = ref("");
const customerLoggedIn = ref(false);
const customerGoogleVerified = ref(false);
const emailConfirmationStatus = ref<"" | "loading" | "success" | "error">("");
const emailConfirmationMessage = ref("");
const settings = reactive<PublicSettings>({ ...defaultSettings });
const customer = reactive({
  id: null as number | null,
  name: "",
  phone: "",
  email: "",
  document: "",
  address: "",
  notes: "",
  photoUpload: null as { base64: string; name: string; mimeType?: string } | null,
  photoPreview: ""
});

const themeStyle = computed(() => ({
  "--store-ink": settings.themeTextColor,
  "--store-muted": settings.themeMutedColor,
  "--store-line": settings.themeLineColor,
  "--store-soft": settings.themeSurfaceColor,
  "--store-gold": settings.themeAccentColor,
  "--store-blue": settings.themePrimaryColor,
  "--store-dark": settings.themeDarkColor,
  "--store-footer": settings.themeFooterColor,
  "--store-bg": settings.themeBackgroundColor,
  "--hero-gradient": `linear-gradient(${settings.heroGradientAngle}deg, ${settings.heroGradientFromColor}, ${settings.heroGradientToColor})`,
  "--surface-gradient": `linear-gradient(${settings.surfaceGradientAngle}deg, ${settings.surfaceGradientFromColor}, ${settings.surfaceGradientToColor})`,
  "--dark-gradient": `linear-gradient(${settings.darkGradientAngle}deg, ${settings.darkGradientFromColor}, ${settings.darkGradientToColor})`,
  "--hero-title-size": `${settings.heroTitleSize}px`,
  "--hero-subtitle-size": `${settings.heroSubtitleSize}px`,
  "--section-title-size": `${settings.sectionTitleSize}px`,
  "--body-text-size": `${settings.bodyTextSize}px`,
  "--card-title-size": `${settings.cardTitleSize}px`,
  "--nav-text-size": `${settings.navTextSize}px`
}));

const compactBrand = computed(() => {
  const source = String(settings.logoText || settings.pageTitle || settings.storeName || "Brasil Express").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.map((part) => part[0]).join("").slice(0, 3).toUpperCase() : source;
});

const qualityOptions = [
  { value: "NOVA", label: "Novo" },
  { value: "SEMINOVA", label: "Seminovo" },
  { value: "USADA", label: "Usado" }
];

function decodeHtmlEntities(value: unknown) {
  let text = String(value ?? "");
  const entities: Record<string, string> = {
    amp: "&",
    quot: "\"",
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " "
  };
  for (let index = 0; index < 6; index += 1) {
    const next = text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
      const key = String(entity);
      if (key.startsWith("#x") || key.startsWith("#X")) {
        return String.fromCharCode(Number.parseInt(key.slice(2), 16));
      }
      if (key.startsWith("#")) {
        return String.fromCharCode(Number.parseInt(key.slice(1), 10));
      }
      return entities[key] || match;
    });
    if (next === text) break;
    text = next;
  }
  return text;
}

function cleanStoreItem<T extends Record<string, any>>(item: T): T {
  return {
    ...item,
    name: decodeHtmlEntities(item.name),
    brand: decodeHtmlEntities(item.brand),
    description: decodeHtmlEntities(item.description),
    category: decodeHtmlEntities(item.category),
    item_condition: decodeHtmlEntities(item.item_condition)
  };
}

const allItems = computed(() => [...products.value, ...services.value]);
const showcaseItemCount = computed(() => Number(settings.realShowcaseItems || products.value.length));
const storeOpen = computed(() => settings.status?.isOpen === true);
const cartCount = computed(() => cart.value.reduce((sum, item) => sum + item.quantity, 0));
const cartTotal = computed(() => cart.value.reduce((sum, item) => sum + item.quantity * item.price_amount, 0));
const customerProfileComplete = computed(() => {
  const phone = customer.phone.trim().toLowerCase();
  const phoneDigits = phone.replace(/\D/g, "");
  return Boolean(customer.name.trim() && customer.email.trim() && phoneDigits.length >= 10 && phone !== "nao informado");
});
const canCheckout = computed(() => customerProfileComplete.value && cart.value.length > 0 && settings.enabled && settings.checkoutEnabled && (storeOpen.value || settings.allowCheckoutWhenClosed));
const categories = computed(() => [...new Set(allItems.value.map((item) => itemCategory(item)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")));
const whatsappPhone = computed(() => (settings.whatsapp || settings.contactPhone || "").replace(/\D/g, ""));
const whatsappUrl = computed(() => {
  const phone = whatsappPhone.value;
  const message = encodeURIComponent(settings.ctaText || settings.heroCtaLabel || "Olá, gostaria de atendimento pela Brasil Express.");
  return message ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/${phone}`;
});
const checkoutAfterHoursNotice = computed(() => {
  if (storeOpen.value || !settings.allowCheckoutWhenClosed || !settings.checkoutEnabled) {
    return "";
  }
  return `Pedido fora do horario de funcionamento. A confirmacao, envio ou retirada sera feita no proximo dia util, entre ${settings.status?.openTime || settings.openTime} e ${settings.status?.closeTime || settings.closeTime}.`;
});
const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase();
  const items = allItems.value.filter((item) => {
    if (viewMode.value !== "all" && item.type !== viewMode.value) return false;
    if (selectedCategory.value && itemCategory(item) !== selectedCategory.value) return false;
    if (selectedCondition.value && item.type === "product" && item.item_condition !== selectedCondition.value) return false;
    if (selectedCondition.value && item.type !== "product") return false;
    if (!query) return true;
    return [item.name, item.brand, item.description, item.category, item.item_condition].some((value) => String(value || "").toLowerCase().includes(query));
  });
  return [...items].sort((a, b) => {
    if (sortMode.value === "price-asc") return a.price_amount - b.price_amount;
    if (sortMode.value === "price-desc") return b.price_amount - a.price_amount;
    return a.name.localeCompare(b.name, "pt-BR");
  });
});
const groupedFilteredItems = computed(() => {
  const groups = new Map<string, StoreItem[]>();
  for (const item of filteredItems.value) {
    const category = itemCategory(item);
    groups.set(category, [...(groups.get(category) || []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([category, items]) => ({ category, items }));
});

function pathToPage(): PageName {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path.endsWith("/loja")) return "store";
  if (path.endsWith("/sobre")) return "about";
  if (path.endsWith("/perfil")) return "profile";
  return "home";
}

function goTo(nextPage: PageName) {
  const resolvedPage = !settings.homepageEnabled && nextPage === "home" ? "store" : nextPage;
  page.value = resolvedPage;
  const path = resolvedPage === "store" ? "/loja" : resolvedPage === "about" ? "/sobre" : resolvedPage === "profile" ? "/perfil" : "/";
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
}

function handlePopState() {
  page.value = pathToPage();
  if (!settings.homepageEnabled && page.value === "home") {
    page.value = "store";
  }
}

function openBestSeller(item: BestSellerItem) {
  selectedCategory.value = "";
  search.value = item.name;
  goTo("store");
}

function currency(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function loadSavedCart() {
  try {
    return JSON.parse(localStorage.getItem("webstore-cart") || "[]") as CartLine[];
  } catch {
    return [];
  }
}

function stockLabel(item: StoreItem) {
  return item.stock_quantity > 0 ? `${item.stock_quantity} em estoque` : "Sem estoque";
}

function itemCategory(item: StoreItem) {
  return String(item.category || (item.type === "service" ? "Servicos" : "Produtos")).trim() || "Produtos";
}

function conditionLabel(code = "") {
  return qualityOptions.find((option) => option.value === code)?.label || code;
}

function canAddItem(item: StoreItem) {
  return item.available && settings.enabled;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message || "Falha na webstore.");
  }
  return payload as T;
}

async function loadStore() {
  loading.value = true;
  loadError.value = "";
  try {
    const [settingsPayload, catalogPayload, servicesPayload, bestSellersPayload] = await Promise.all([
      getJson<{ data: PublicSettings }>("/api/webstore/settings"),
      getJson<{ data: any[] }>("/api/webstore/catalog"),
      getJson<{ data: any[] }>("/api/webstore/services"),
      getJson<{ data: BestSellerItem[] }>("/api/webstore/best-sellers")
    ]);
    Object.assign(settings, { ...defaultSettings, ...settingsPayload.data });
    document.title = settings.pageTitle || settings.storeName || "Brasil Express";
    const currentPage = pathToPage();
    if (currentPage === "about") {
      page.value = "about";
    } else if (!settings.homepageEnabled || currentPage === "store") {
      page.value = "store";
    }
    products.value = catalogPayload.data.map((item) => cleanStoreItem({ ...item, type: "product", available: item.available !== false, stock_quantity: Number(item.stock_quantity || 0) }));
    services.value = servicesPayload.data.map((item) => cleanStoreItem({ ...item, type: "service", category: "Servicos", available: item.available !== false, stock_quantity: 0 }));
    bestSellers.value = (bestSellersPayload.data || []).map((item) => cleanStoreItem(item));
    removeUnavailableCartLines();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "Nao foi possivel carregar a vitrine.";
    Object.assign(settings, { ...defaultSettings, enabled: false });
  } finally {
    loading.value = false;
  }
}

async function confirmEmailFromUrl() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  if (!window.location.pathname.endsWith("/confirmar-email") || !token) {
    return;
  }
  emailConfirmationStatus.value = "loading";
  emailConfirmationMessage.value = "Confirmando sua conta...";
  try {
    const payload = await getJson<{ data: { name: string; email: string; confirmedAt: string } }>(`/api/webstore/confirm-email?token=${encodeURIComponent(token)}`);
    emailConfirmationStatus.value = "success";
    emailConfirmationMessage.value = `Email ${payload.data.email} confirmado para ${payload.data.name}.`;
  } catch (error) {
    emailConfirmationStatus.value = "error";
    emailConfirmationMessage.value = error instanceof Error ? error.message : "Nao foi possivel confirmar o email.";
  }
}

function openItem(item: StoreItem) {
  selectedItem.value = item;
}

function addToCart(item: StoreItem) {
  if (!canAddItem(item)) return;
  const existing = cart.value.find((line) => line.id === item.id && line.type === item.type);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.value.push({ ...item, quantity: 1 });
  }
  selectedItem.value = null;
  cartOpen.value = true;
}

function changeQuantity(line: CartLine, amount: number) {
  line.quantity += amount;
  if (line.quantity <= 0) {
    cart.value = cart.value.filter((item) => item !== line);
  }
}

function clearCart() {
  cart.value = [];
}

function openCustomerRegistration() {
  customerError.value = "";
  customerSuccess.value = "";
  goTo("profile");
}

function resetCustomerForm(resetLogin = true) {
  Object.assign(customer, {
    id: null,
    name: "",
    phone: "",
    email: "",
    document: "",
    address: "",
    notes: "",
    photoUpload: null,
    photoPreview: ""
  });
  if (resetLogin) {
    customerLoggedIn.value = false;
    customerGoogleVerified.value = false;
  }
}

function logoutCustomer() {
  resetCustomerForm(true);
  customerError.value = "";
  customerSuccess.value = "";
  submitError.value = "";
  successCode.value = "";
  localStorage.removeItem("webstore-customer");
  goTo("profile");
}

async function handleCustomerPhotoChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    customer.photoUpload = null;
    customer.photoPreview = "";
    return;
  }
  const base64 = await readFileAsDataUrl(file);
  customer.photoPreview = base64;
  customer.photoUpload = {
    base64,
    name: file.name || "cliente-webstore.jpg",
    mimeType: file.type || "image/jpeg"
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel carregar a foto do cliente."));
    reader.readAsDataURL(file);
  });
}

function removeUnavailableCartLines() {
  const availableKeys = new Set(allItems.value.filter((item) => item.available).map((item) => `${item.type}-${item.id}`));
  cart.value = cart.value.filter((item) => availableKeys.has(`${item.type}-${item.id}`));
}

async function submitCustomerRegistration() {
  customerError.value = "";
  customerSuccess.value = "";
  customerSubmitting.value = true;
  try {
    const response = await fetch("/api/webstore/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.message || "Nao foi possivel salvar o cadastro.");
    }
    customer.id = Number(payload.data.clientId || customer.id || 0) || null;
    customerSuccess.value = "Perfil salvo.";
    localStorage.setItem("webstore-customer", JSON.stringify({ ...customer, id: payload.data.clientId }));
    customerLoggedIn.value = true;
    customerGoogleVerified.value = false;
  } catch (error) {
    customerError.value = error instanceof Error ? error.message : "Nao foi possivel salvar o cadastro.";
  } finally {
    customerSubmitting.value = false;
  }
}

async function connectCustomerGoogle() {
  customerError.value = "";
  customerSubmitting.value = true;
  try {
    const payload = await getJson<{ data: { url: string } }>("/api/webstore/google/connect");
    window.location.href = payload.data.url;
  } catch (error) {
    customerError.value = error instanceof Error ? error.message : "Nao foi possivel iniciar login Google.";
    customerSubmitting.value = false;
  }
}

function restoreCustomerProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem("webstore-customer") || "{}");
    Object.assign(customer, {
      id: Number(saved.id || 0) || null,
      name: saved.name || "",
      phone: saved.phone || "",
      email: saved.email || "",
      document: saved.document || "",
      address: saved.address || "",
      notes: saved.notes || "",
      photoPreview: saved.photoPreview || saved.photoUrl || ""
    });
    customerLoggedIn.value = Boolean(saved.id || saved.email);
    customerGoogleVerified.value = Boolean(saved.googleVerified && !saved.id);
  } catch {
    // ignore stale local profile
  }
}

function applyGoogleCustomerFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("customer");
  if (!encoded) return;
  try {
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    Object.assign(customer, {
      id: Number(decoded.id || 0) || null,
      name: decoded.name || "",
      phone: decoded.phone || "",
      email: decoded.email || "",
      document: decoded.document || "",
      address: decoded.address || "",
      notes: decoded.notes || "",
      photoPreview: decoded.photoUrl || ""
    });
    localStorage.setItem("webstore-customer", JSON.stringify(decoded));
    customerGoogleVerified.value = Boolean(decoded.googleVerified);
    customerLoggedIn.value = Boolean(decoded.id && !decoded.needsCompletion);
    customerSuccess.value = decoded.needsCompletion ? "Google conectado. Confirme os dados faltantes." : "Perfil Google conectado.";
    window.history.replaceState({}, "", "/perfil");
  } catch {
    customerError.value = "Nao foi possivel ler o perfil Google.";
  }
}

async function submitOrder() {
  submitError.value = "";
  successCode.value = "";
  if (!customerProfileComplete.value) {
    submitError.value = "Complete seus dados na pagina Perfil.";
    goTo("profile");
    cartOpen.value = false;
    return;
  }
  submitting.value = true;
  try {
    const response = await fetch("/api/webstore/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer,
        notes: customer.notes,
        items: cart.value.map((item) => ({
          id: item.id,
          type: item.type === "service" ? "SERVICE" : "PRODUCT",
          quantity: item.quantity
        }))
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.message || "Nao foi possivel enviar o pedido.");
    }
    successCode.value = payload.data.code;
    cart.value = [];
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : "Nao foi possivel enviar o pedido.";
  } finally {
    submitting.value = false;
  }
}

watch(cart, () => {
  localStorage.setItem("webstore-cart", JSON.stringify(cart.value));
}, { deep: true });

onMounted(() => {
  restoreCustomerProfile();
  applyGoogleCustomerFromUrl();
  void confirmEmailFromUrl();
  window.addEventListener("popstate", handlePopState);
  loadStore();
});

onBeforeUnmount(() => {
  window.removeEventListener("popstate", handlePopState);
});
</script>
