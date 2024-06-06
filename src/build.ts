import esbuild from "esbuild";
import { join, relative } from "node:path";
import type { Manifest } from "./main.js";
import { writeFile } from "node:fs/promises";

const workingDirectory = process.cwd();
const outdir = join(workingDirectory, "dist");
const { default: manifest } = (await import(join(workingDirectory, "manifest.js"))) as { default: Manifest };

if (!manifest) {
  throw new Error("No manifest");
}

function resolveOutfile(entryPoint: string, result: esbuild.BuildResult): string {
  for (const [outfile, metadata] of Object.entries(result.metafile?.outputs ?? {})) {
    if (metadata.entryPoint === entryPoint) {
      return relative(outdir, outfile);
    }
  }

  throw new Error(`No output for ${entryPoint}`);
}

function resolveManifest(result: esbuild.BuildResult, manifest: Manifest): Manifest {
  return {
    ...manifest,
    action: {
      ...manifest.action,
      default_popup: manifest.action?.default_popup ? resolveOutfile(manifest.action.default_popup, result) : undefined,
    },
  };
}

async function build() {
  const entryPoints: string[] = [];
  if (manifest.action?.default_popup) {
    entryPoints.push(manifest.action.default_popup);
  }

  if (manifest.background?.service_worker) {
    entryPoints.push(manifest.background.service_worker);
  }

  if (manifest.content_scripts) {
    entryPoints.push(...(manifest.content_scripts?.flatMap((contentScript) => contentScript.js ?? []) ?? []));
  }

  await esbuild.build({
    entryPoints,
    outdir,
    logLevel: "debug",
    bundle: true,
    metafile: true,
    plugins: [
      {
        name: "manifest",
        setup(build) {
          build.onEnd(async (result) => {
            await writeFile(join(outdir, "manifest.json"), JSON.stringify(resolveManifest(result, manifest), null, 2));
            if (manifest.action?.default_popup) {
              await writeFile(join(outdir, "index.html"));
            }
          });
        },
      },
    ],
  });
}

await build();
