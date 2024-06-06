import { defineManifest } from "../../dist/manifest.js";

export default defineManifest({
  manifest_version: 3,
  // version: "0.0.1",
  name: "Example 1",
  action: {
    default_popup: "src/popup.tsx",
  },
  content_security_policy: {
    extension_pages: "script-src 'self';",
  },
  content_scripts: [
    {
      js: ["./src/content-1.ts", "./src/nested/content-2.ts"],
      matches: ["<all_urls>"],
    },
    {
      js: ["./src/content-3.ts"],
      matches: ["<all_urls>"],
    },
    {
      // This content script is build, but not loaded in manifest because it has no "matches" urls
      js: ["./src/content-4.ts"],
    },
  ],
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
});
