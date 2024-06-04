import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { extension } from "../../src/main.js";

export default defineConfig({
  build: {
    outDir: join(dirname(fileURLToPath(import.meta.url)), "..", "dist"),
  },
  plugins: [
    extension({
      manifest_version: 3,
      version: "0.0.1",
      name: "Example 1",
      action: {
        default_popup: "src/popup.tsx",
      },
      content_security_policy: {
        extension_pages: "script-src 'self';",
      },
      content_scripts: [
        {
          js: ["./src/content-1.ts", "./src/content-2.ts"],
          matches: ["<all_urls>"],
        },
        {
          js: ["./src/content-3.ts"],
          matches: ["<all_urls>"],
        },
      ],
      background: {
        service_worker: "src/background.ts",
        type: "module",
      },
    }),
  ],
});
