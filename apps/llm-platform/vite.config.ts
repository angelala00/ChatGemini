import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const basePath = env.VITE_BASE_PATH || "/";

    return {
        base: basePath,
        plugins: [react()],
        envPrefix: ["REACT_APP_", "VITE_"],
        server: {
            host: true,
            port: 3010,
        },
        build: {
            reportCompressedSize: false,
        },
    };
});
