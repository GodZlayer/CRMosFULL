import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const apiPort = Number(process.env.CRM_API_PORT || 3001);
const webstorePort = Number(process.env.CRM_WEBSTORE_PORT || 5174);
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "public_webstore",
    rollupOptions: {
      input: "webstore.html"
    }
  },
  server: {
    host: "0.0.0.0",
    port: webstorePort,
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
