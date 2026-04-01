import { defineStore } from "pinia";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "be-theme-mode";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

let boundStore: ReturnType<typeof useUiStore> | null = null;
let mediaQuery: MediaQueryList | null = null;
let mediaQueryHandler: ((event: MediaQueryListEvent) => void) | null = null;
let resizeHandler: (() => void) | null = null;

function resolveSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light" as ResolvedTheme;
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}

export const useUiStore = defineStore("ui", {
  state: () => ({
    themeMode: "system" as ThemeMode,
    resolvedTheme: "light" as ResolvedTheme,
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : 1440,
    booted: false
  }),
  getters: {
    isPhone(state) {
      return state.viewportWidth < 768;
    },
    isTablet(state) {
      return state.viewportWidth >= 768 && state.viewportWidth < 992;
    },
    isMobileShell(state) {
      return state.viewportWidth < 992;
    },
    themeLabel(state) {
      if (state.themeMode === "light") {
        return "Claro";
      }
      if (state.themeMode === "dark") {
        return "Escuro";
      }
      return "Sistema";
    }
  },
  actions: {
    bootstrap() {
      if (typeof window === "undefined") {
        return;
      }

      this.themeMode = normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
      this.viewportWidth = window.innerWidth;
      this.applyTheme();

      if (!boundStore) {
        boundStore = this;
        mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
        mediaQueryHandler = () => {
          boundStore?.applyTheme();
        };
        mediaQuery.addEventListener?.("change", mediaQueryHandler);

        resizeHandler = () => {
          if (!boundStore) {
            return;
          }
          boundStore.viewportWidth = window.innerWidth;
        };
        window.addEventListener("resize", resizeHandler, { passive: true });
      }

      this.booted = true;
    },
    applyTheme() {
      const nextTheme = this.themeMode === "system" ? resolveSystemTheme() : this.themeMode;
      this.resolvedTheme = nextTheme;

      if (typeof document === "undefined") {
        return;
      }

      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
    },
    setThemeMode(mode: ThemeMode) {
      this.themeMode = mode;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      }
      this.applyTheme();
    }
  }
});
