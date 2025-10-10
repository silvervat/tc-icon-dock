import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.VITE_BASE || "/"; // GH Pages: /<repo>/

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173, host: true },
  preview: { port: 5174 }
});
