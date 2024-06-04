import { type BuildOptions, type Plugin, type ResolvedConfig, type ViteDevServer } from "vite";
import esbuild from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { parseContentSecurityPolicy, serializeContentSecurityPolicy } from "./csp.js";

export interface Manifest {
  manifest_version: number;
  version?: string;
  version_name?: string;
  name?: string;
  permissions?: string[];
  action?: {
    default_popup?: string;
  };
  content_scripts?: {
    matches?: string[];
    js?: string[];
    run_at?: "document_end";
    all_frames?: boolean;
  }[];
  background?: {
    service_worker: string;
    type: "module";
  };
  content_security_policy?: {
    extension_pages?: string;
  };
  icons?: Record<string, string>;
  host_permissions?: string[];
  web_accessible_resources?: WebAccessibleResource[];
}

export interface WebAccessibleResource {
  resources: string[];
  matches?: string[];
  use_dynamic_url?: boolean;
  extension_ids?: string[];
}

function renderDevScript(prefix: string) {
  return renderLines([
    `import RefreshRuntime from "${prefix}/@react-refresh";`,
    `RefreshRuntime.injectIntoGlobalHook(window);`,
    `window.$RefreshReg$ = () => {};`,
    `window.$RefreshSig$ = () => (type) => type;`,
    `window.__vite_plugin_react_preamble_installed__ = true;`,
    `chrome.runtime.getURL = p => "${prefix}" + p;`,
  ]);
}

function renderPopup(title: string, scripts: string[], styles: string[]) {
  return renderLines([
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="UTF-8" />`,
    ...styles.map((s) => `<link rel="stylesheet" href="${s}">`),
    `</head>`,
    `<body>`,
    `<div id="root"></div>`,
    ...scripts.map((s) => `<script type="module" src="${s}"></script>`),
    `</body>`,
    `</html>`,
  ]);
}

function renderLines(lines: string[]) {
  return lines.join("\n") + "\n";
}

function renderDevBackground(prefix: string, backgroundScript: string) {
  return renderLines([
    `import "${prefix}/@vite/client";`,
    `import "${prefix}/${backgroundScript}";`,
    `location.reload = () => chrome.runtime.reload();`,
  ]);
}

function renderDevContent(prefix: string, contentScripts: string[]) {
  return renderLines([
    `import("${prefix}/@react-refresh").then(async ({ default: RefreshRuntime }) => {`,
    `  RefreshRuntime.injectIntoGlobalHook(window);`,
    `  window.$RefreshReg$ = () => {};`,
    `  window.$RefreshSig$ = () => (type) => type;`,
    `  window.__vite_plugin_react_preamble_installed__ = true;`,
    `  import("${prefix}/@vite/client");`,
    ...contentScripts.map((mod) => `  import("${prefix}/${mod}")`),
    `});`,
  ]);
}

function removeUndefinedValues(obj: Record<string, string | undefined>): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((res, [key, value]) => {
    return value ? { ...res, [key]: value } : res;
  }, {});
}

export function extension(options: Manifest): Plugin {
  let config: ResolvedConfig | null = null;
  let server: ViteDevServer | null = null;

  if (options.content_scripts && options.content_scripts.length > 1) {
    throw new Error("This extension does not support multiple content scripts yet");
  }

  const content_script = options.content_scripts?.[0];
  if (content_script?.js && content_script.js.length > 1) {
    throw new Error("This extension does not support multiple content scripts yet");
  }

  function resolveRollup(options: Manifest): BuildOptions["rollupOptions"] {
    return {
      input: removeUndefinedValues({
        default_popup: options.action?.default_popup,
        content_script: config?.command === "build" ? options.content_scripts?.[0]?.js?.[0] : undefined,
        background: options.background?.service_worker,
      }),
      output: {
        assetFileNames: "assets/[name].[ext]",
        chunkFileNames: "js/[name].js",
        entryFileNames: "[name].js",
      },
    };
  }

  function resolveManifest() {
    const host = resolveAddress();

    const webAccessibleResources: WebAccessibleResource[] = [...(options.web_accessible_resources ?? [])];

    const csp = parseContentSecurityPolicy(options.content_security_policy?.extension_pages ?? "");
    if (config?.command === "serve") {
      for (const key of csp.keys()) {
        csp.get(key)?.push(host);
      }
    }

    const result: Manifest = {
      ...options,
      name: config?.command === "serve" ? `${options.name} [DEV]` : options.name,
      content_scripts: options.content_scripts?.[0] && [
        {
          ...options.content_scripts[0],
          js: ["content.js"],
        },
      ],
      background: options.background && {
        service_worker: "background.js",
        type: "module",
      },
      action: {
        ...options.action,
        default_popup: "default_popup.html",
      },
      content_security_policy: {
        extension_pages: serializeContentSecurityPolicy(csp),
      },
      web_accessible_resources: webAccessibleResources,
    };

    return JSON.stringify(result, null, 2);
  }

  function resolveAddress() {
    if (config?.command === "build") {
      return ".";
    }

    const addr = server?.httpServer?.address();
    if (!addr || typeof addr === "string") {
      throw new Error("No address yet");
    }

    return `http://localhost:${addr.port}`;
  }

  return {
    name: "vite-extension",
    config(userConfig) {
      userConfig.build = {
        ...userConfig.build,
        assetsInlineLimit: 0,
        rollupOptions: resolveRollup(options),
      };
    },
    configResolved(_config) {
      config = _config;
    },
    configureServer(_server) {
      server = _server;
    },
    async buildStart() {
      if (config?.command === "serve") {
        server?.httpServer?.on("listening", async () => {
          const host = resolveAddress();
          const outdir = config?.build.outDir ?? "dist";

          await mkdir(outdir, { recursive: true });

          const contentScript = options.content_scripts?.[0]?.js?.[0];
          if (contentScript) {
            await writeFile(join(outdir, "content.js"), renderDevContent(host, [contentScript]));
          }

          if (options.background?.service_worker) {
            await writeFile(
              join(outdir, "background.js"),
              renderDevBackground(host, options.background.service_worker)
            );
          }

          if (options.action?.default_popup) {
            await writeFile(join(outdir, "default_popup.js"), renderDevScript(host));
            await writeFile(
              join(outdir, "default_popup.html"),
              renderPopup(
                options.name ?? "Browser Extension",
                ["./default_popup.js", `${host}/@vite/client`, `${host}/${options.action.default_popup}`],
                []
              )
            );
          }

          const publicDir = config?.publicDir;
          if (publicDir) {
            await Promise.all(
              Object.values(options.icons ?? {}).map((iconFileName) => {
                return cp(join(publicDir, iconFileName), join(outdir, iconFileName));
              })
            );
          }

          await writeFile(join(outdir, "manifest.json"), resolveManifest());
        });
      }
    },
    async generateBundle() {
      if (config?.command === "build") {
        const host = resolveAddress();
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: resolveManifest(),
        });

        if (options.action?.default_popup) {
          this.emitFile({
            type: "asset",
            fileName: "default_popup.html",
            source: renderPopup(host, ["./default_popup.js"], ["./assets/default_popup.css"]),
          });
        }

        const contentScript = options.content_scripts?.[0]?.js?.[0];
        if (contentScript) {
          const source = await esbuild.build({
            entryPoints: [contentScript],
            format: "iife",
            bundle: true,
            platform: "browser",
            write: false,
            minify: true,
          });

          this.emitFile({
            type: "asset",
            fileName: "content.js",
            source: source.outputFiles[0].text,
          });
        }
      }
    },
  };
}
