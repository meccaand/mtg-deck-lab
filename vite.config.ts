import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { aiPlugin } from "./server/ai";

export default defineConfig(({ mode }) => {
  // Make ANTHROPIC_* from .env visible to the dev-server middleware (server-side only; never exposed to client code).
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), "ANTHROPIC_"))) process.env[k] ??= v;
  return {
    plugins: [react(), aiPlugin()],
    server: { port: 5173 },
    test: { environment: "node" },
  };
});
