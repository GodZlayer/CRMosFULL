import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const apiPort = Number(process.env.CRM_API_PORT || 3001);
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true
      },
      "/uploads": {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
});
