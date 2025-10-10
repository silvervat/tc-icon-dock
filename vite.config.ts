import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-ignore – plugin is bundled with vite
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  preview: { port: 5174 }
});
