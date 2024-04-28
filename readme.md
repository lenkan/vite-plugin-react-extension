# Vite plugin for browser extension

Example usage:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { extension } from "vite-plugin-extension";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    extension({
      manifest_version: 3,
      version: "0.0.1",
      permissions: ["activeTab", "storage", "alarms", "background", "webRequest"],
      name: "Test Extension",
      action: {
        default_popup: "src/main.tsx",
      },
      background: {
        service_worker: "src/background.ts",
        type: "module",
      },
      content_scripts: [
        {
          matches: ["<all_urls>"],
          js: ["src/content.ts"],
          run_at: "document_end",
          all_frames: true,
        },
      ],
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self';",
      },
    }),
  ],
});
```
