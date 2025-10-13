import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_PROXY_TARGET ?? "http://localhost:5010";
  const wsTarget = apiTarget.replace(/^http/, "ws");

  return {
    plugins: [react()],
    server: {
      port: 4173,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true
        },
        "/ws": {
          target: wsTarget,
          ws: true
        }
      }
    }
  };
});
