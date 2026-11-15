import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Environment-free build, like the player app: runtime values come from /config.json (plan H.8).
export default defineConfig({
  plugins: [react()],
});
