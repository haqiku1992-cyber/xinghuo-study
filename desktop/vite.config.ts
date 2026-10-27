import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  base: "/",
  plugins: [react()],
  build: { outDir: "../desktop-dist", emptyOutDir: true },
});
