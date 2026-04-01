import { defineStore } from "pinia";
import { api } from "../services/api";
import type { NotificationItem } from "../services/types";

export const useNotificationsStore = defineStore("notifications", {
  state: () => ({
    items: [] as NotificationItem[],
    loaded: false
  }),
  getters: {
    unreadCount(state) {
      return state.items.filter((item) => !item.read_at).length;
    },
    lowStockItems(state) {
      return state.items.filter((item) => item.type === "LOW_STOCK");
    }
  },
  actions: {
    async load(unreadOnly = false) {
      const response = await api.notifications(unreadOnly ? { unreadOnly: true } : {});
      this.items = response.data;
      this.loaded = true;
    },
    async markRead(id: number) {
      await api.markNotificationRead(id);
      await this.load();
    }
  }
});
