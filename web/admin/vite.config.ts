import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Environment-free build, like the player app: runtime values come from /config.json (plan H.8).
export default defineConfig({
  // Fixed ports: the admin is always 5174 (player 5173); a busy port fails loudly instead of moving to the next one.
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  plugins: [react()],
});
