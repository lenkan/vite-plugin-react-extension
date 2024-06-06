import { type BuildOptions, type Plugin, type ResolvedConfig, type ViteDevServer, Rollup } from "vite";
import esbuild from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, parse, relative } from "node:path";
import { parseContentSecurityPolicy, serializeContentSecurityPolicy } from "./csp.js";
import { findCommonAncestor } from "./common-ancestor.js";
import { renderLines } from "./utils.js";
import { renderPopup } from "./popup.js";

export interface ManifestContentScript {
  matches?: string[];
  js?: string[];
  run_at?: "document_end" | "document_start" | "document_idle";
  all_frames?: boolean;
}

export interface Manifest {
  manifest_version: number;
  version?: string;
  description?: string;
  author?: string;
  version_name?: string;
  name?: string;
  permissions?: string[];
  chrome_url_overrides?: {
    bookmarks?: string;
    history?: string;
    newtap?: string;
  };
  commands?: Record<
    string,
    {
      suggested_key?: Record<string, string>;
      description?: string;
    }
  >;
  action?: {
    default_popup?: string;
  };
  content_scripts?: ManifestContentScript[];
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
  [key: string]: unknown;
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

  async function bundleScript(script: string): Promise<{ filename: string; content: Uint8Array }> {
    const outdir = config?.build.outDir;
    if (!outdir) {
      throw new Error("No outdir");
    }

    const outfile = join(outdir, relative(basepath, script.replace(/\.tsx?$/, ".js")));

    const source = await esbuild.build({
      entryPoints: [script],
      outfile,
      format: "iife",
      bundle: true,
      platform: "browser",
      write: false,
      minify: true,
    });

    if (!source.outputFiles) {
      throw new Error("No outputfile");
    }

    return { filename: relative(outdir, outfile), content: source.outputFiles[0].contents };
  }

  function resolveManifest(override: Partial<Manifest>) {
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
      ...override,
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

  const contentScriptFiles = options.content_scripts?.flatMap((cs) => cs.js ?? []) ?? [];
  const basepath = findCommonAncestor(...contentScriptFiles);

  return {
    name: "vite-extension",
    config(userConfig) {
      userConfig.esbuild = {
        // format: "iife",
        // platform: "browser",
        // target: "chrome58",
      };
      // this.info("Config");

      userConfig.build = {
        ...userConfig.build,
        assetsInlineLimit: 0,
        target: "chrome58",
        rollupOptions: {
          input: removeUndefinedValues({
            default_popup: options.action?.default_popup,
            // content_script: config?.command === "build" ? options.content_scripts?.[0]?.js?.[0] : undefined,
            background: options.background?.service_worker,
          }),
          output: {
            assetFileNames: "assets/[name].[ext]",
            entryFileNames: "[name].js",
            // inlineDynamicImports: true,
            // format: "module",
            // compact
          },
        },
        // write: false,
      };
    },
    transform(code, id, options) {
      this.info(`Transform ${id}\n`);
    },
    renderChunk(d, chunk) {
      this.info(`Render chunk ${chunk.fileName}\n`);
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

          const contentScripts = await Promise.all(
            (options.content_scripts ?? []).map(async (contentScript) => {
              return {
                ...contentScript,
                js: await Promise.all(
                  (contentScript.js ?? []).map(async (script) => {
                    const outfile = join(outdir, relative(basepath, script.replace(/\.tsx?$/, ".js")));
                    await mkdir(dirname(outfile), { recursive: true });
                    await writeFile(outfile, renderDevContent(host, [script]));
                    return relative(outdir, outfile);
                  })
                ),
              };
            })
          );

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
              renderPopup(["./default_popup.js", `${host}/@vite/client`, `${host}/${options.action.default_popup}`], [])
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

          await writeFile(
            join(outdir, "manifest.json"),
            resolveManifest({
              content_scripts: contentScripts.filter((cs) => !!cs.matches && cs.matches.length > 0),
            })
          );
        });
      }
    },
    async generateBundle(a, bundle) {
      if (config?.command === "build") {
        const contentScripts = await Promise.all(
          (options.content_scripts ?? []).map(async (contentScript) => {
            return {
              ...contentScript,
              js: await Promise.all(
                (contentScript.js ?? []).map(async (script) => {
                  const result = await bundleScript(script);

                  this.emitFile({
                    type: "asset",
                    fileName: result.filename,
                    source: result.content,
                  });

                  return result.filename;
                })
              ),
            };
          })
        );

        const host = resolveAddress();
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: resolveManifest({
            content_scripts: contentScripts.filter((cs) => !!cs.matches && cs.matches.length > 0),
          }),
        });

        if (options.action?.default_popup) {
          this.emitFile({
            type: "asset",
            fileName: "default_popup.html",
            source: renderPopup(["./default_popup.js"], ["./assets/default_popup.css"]),
          });
        }
      }
    },
  };
}
