import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

export default defineConfig(() => ({
    base: "./",
    plugins: [react(), svgr()],
    envPrefix: ["REACT_APP_", "VITE_"],
    server: {
        host: true,
        port: 3000,
    },
    build: {
        reportCompressedSize: false,
    },
}));
