import type { PluginOption, ResolvedConfig, ViteDevServer } from "vite";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";

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
  content_security_policy: {
    extension_pages: string;
  };
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
    `<title>${title}</title>`,
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

export function extension(options: Manifest): PluginOption {
  let config: ResolvedConfig | null = null;
  let server: ViteDevServer | null = null;

  if (options.content_scripts && options.content_scripts.length > 1) {
    throw new Error("This extension does not support multiple content scripts yet");
  }

  const content_script = options.content_scripts?.[0];
  if (content_script?.js && content_script.js.length > 1) {
    throw new Error("This extension does not support multiple content scripts yet");
  }

  const contentScriptName = content_script?.js?.[0];

  function resolveManifest() {
    const host = resolveAddress();

    const result: Manifest = {
      ...options,
      name: config?.command === "serve" ? `${options.name} [DEV]` : options.name,
      content_scripts:
        content_script && contentScriptName
          ? [
              {
                ...content_script,
                js: config?.command === "serve" ? ["content.js"] : [parse(contentScriptName).name + ".js"],
              },
            ]
          : undefined,
      background: options.background
        ? {
            service_worker:
              config?.command === "serve" ? "background.js" : parse(options.background.service_worker).name + ".js",
            type: "module",
          }
        : undefined,
      action: {
        ...options.action,
        default_popup: "default_popup.html",
      },
      content_security_policy: {
        extension_pages:
          host !== "."
            ? `script-src 'self' ${host} 'wasm-unsafe-eval'; object-src 'self';`
            : options.content_security_policy.extension_pages,
      },
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
        assetsInlineLimit: 0,
        rollupOptions: {
          input: {
            ...(options?.action?.default_popup
              ? {
                  default_popup: options?.action?.default_popup,
                }
              : {}),
            ...options?.content_scripts?.reduce<Record<string, string>>((res, script) => {
              if (script.js && script.js[0]) {
                res["content"] = script.js[0];
              }
              return res;
            }, {}),
            ...(options.background?.service_worker
              ? {
                  background: options.background.service_worker,
                }
              : {}),
          },
          output: {
            assetFileNames: "assets/[name].[ext]",
            entryFileNames: "[name].js",
          },
        },
      };
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    configureServer(_server) {
      server = _server;
    },
    async buildStart() {
      if (config?.command === "serve") {
        server?.httpServer?.on("listening", async () => {
          const host = resolveAddress();
          const outdir = config?.build.outDir ?? "dist";

          await rm(outdir, { force: true, recursive: true });
          await mkdir(outdir, { recursive: true });

          await Promise.all([
            writeFile(join(outdir, "manifest.json"), resolveManifest()),
            contentScriptName && writeFile(join(outdir, "content.js"), renderDevContent(host, [contentScriptName])),
            options.background &&
              writeFile(join(outdir, "background.js"), renderDevBackground(host, options.background.service_worker)),
            options.action?.default_popup && writeFile(join(outdir, "default_popup.js"), renderDevScript(host)),
            options.action?.default_popup &&
              writeFile(
                join(outdir, "default_popup.html"),
                renderPopup(
                  options.name ?? "Browser Extension",
                  ["./default_popup.js", `${host}/@vite/client`, `${host}/${options.action.default_popup}`],
                  []
                )
              ),
          ]);
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
      }
    },
  };
}
