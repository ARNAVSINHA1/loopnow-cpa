import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/mocks/server-only.ts", import.meta.url),
      ),
    },
  },

  test: {
    environment: "node",
  },
});