import { defineStore } from "pinia";
import { api } from "../services/api";
import type { CompanyBrand, MetaPayload, StoreContext, User } from "../services/types";

export const useSessionStore = defineStore("session", {
  state: () => ({
    booted: false,
    user: null as User | null,
    company: null as CompanyBrand | null,
    store: null as StoreContext | null,
    profiles: [] as User[],
    meta: null as MetaPayload | null
  }),
  getters: {
    isAuthenticated(state) {
      return Boolean(state.company && state.user);
    },
    hasCompanySession(state) {
      return Boolean(state.company);
    }
  },
  actions: {
    applySession(payload: { user: User | null; company: CompanyBrand | null; store?: StoreContext | null; profiles: User[]; meta?: MetaPayload | null }) {
      this.user = payload.user;
      this.company = payload.company;
      this.store = payload.store ?? this.store;
      this.profiles = payload.profiles || [];
      if (payload.meta) {
        this.meta = payload.meta;
      }
    },
    async bootstrap() {
      if (this.booted) {
        return;
      }
      try {
        const response = await api.meta();
        this.applySession(response);
      } catch {
        this.user = null;
        this.company = null;
        this.store = null;
        this.profiles = [];
        this.meta = null;
      } finally {
        this.booted = true;
      }
    },
    async refreshMeta() {
      const response = await api.meta();
      this.applySession(response);
    },
    async login(email: string, password: string) {
      const response = await api.login(email, password);
      this.applySession(response);
      this.booted = true;
    },
    async selectProfile(profileId: number) {
      const response = await api.selectProfile(profileId);
      this.applySession(response);
      this.booted = true;
    },
    async refreshProfiles() {
      const response = await api.profiles();
      this.company = response.company;
      this.store = response.store;
      this.profiles = response.data;
      this.user = response.user;
    },
    async logout() {
      await api.logout();
      this.user = null;
      this.company = null;
      this.store = null;
      this.profiles = [];
      this.meta = null;
      this.booted = true;
    }
  }
});
