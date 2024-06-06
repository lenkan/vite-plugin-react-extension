import esbuild, { context, type BuildContext, type BuildOptions } from "esbuild";
import { join, relative, resolve } from "node:path";
import type { Manifest } from "./main.js";
import { readFile, writeFile } from "node:fs/promises";

const workingDirectory = process.cwd();
const outdir = join(workingDirectory, "dist");
const { default: manifest } = (await import(join(workingDirectory, "manifest.js"))) as { default: Manifest };

if (!manifest) {
  throw new Error("No manifest");
}

function resolveOutfile(entryPoint: string, result: esbuild.BuildResult): string {
  for (const [outfile, metadata] of Object.entries(result.metafile?.outputs ?? {})) {
    if (metadata.entryPoint && resolve(metadata.entryPoint) === resolve(entryPoint)) {
      return relative(outdir, outfile);
    }
  }

  throw new Error(`No output for ${entryPoint}`);
}

function resolveStyles(entryPoint: string, result: esbuild.BuildResult): string[] {
  for (const [outfile, metadata] of Object.entries(result.metafile?.outputs ?? {})) {
    if (metadata.entryPoint && resolve(metadata.entryPoint) === resolve(entryPoint)) {
      return metadata.cssBundle ? [relative(outdir, metadata.cssBundle)] : [];
    }
  }

  return [];
}

function resolveManifest(result: esbuild.BuildResult, manifest: Manifest): Manifest {
  return {
    ...manifest,
    action: {
      ...manifest.action,
      default_popup: manifest.action?.default_popup ? "index.html" : undefined,
    },
    background: manifest.background
      ? {
          ...manifest.background,
          service_worker: resolveOutfile(manifest.background?.service_worker, result),
        }
      : undefined,
    content_scripts: manifest.content_scripts
      ?.map((contentScript) => {
        return {
          ...contentScript,
          js: contentScript.js?.map((input) => resolveOutfile(input, result)),
        };
      })
      .filter((cs) => !!cs.matches && cs.matches.length > 0),
  };
}

function findScripts(doc: string): string[] {
  const regex = /<script\s+src=\"(.*)\">\s*<\/script>/;
  const match = regex.exec(doc);

  if (match) {
    return [match[1]];
  }

  return [];
}

async function resolvePopupDocument(content: string, result: esbuild.BuildResult): Promise<string> {
  const scripts = findScripts(content);

  for (const script of scripts) {
    const output = resolveOutfile(script, result);
    content = content.replace(script, output);

    const styles = resolveStyles(script, result);

    for (const stylesheet of styles) {
      content = content.replace("<head>", `<head>\n<link rel="stylesheet" href="${stylesheet}">`);
    }
  }

  return content;
}

async function readPopupDocument(manifest: Manifest): Promise<string | null> {
  if (!manifest.action?.default_popup) {
    return null;
  }

  return await readFile(join(workingDirectory, manifest.action.default_popup), "utf8");
}

async function build(): Promise<BuildOptions> {
  const entryPoints: string[] = [];
  const popupDocument = await readPopupDocument(manifest);

  if (popupDocument) {
    const popupScripts = findScripts(popupDocument);
    entryPoints.push(...popupScripts);
  }

  if (manifest.background?.service_worker) {
    entryPoints.push(manifest.background.service_worker);
  }

  if (manifest.content_scripts) {
    entryPoints.push(...(manifest.content_scripts?.flatMap((contentScript) => contentScript.js ?? []) ?? []));
  }

  async function handleBuild(result: esbuild.BuildResult) {
    await writeFile(join(outdir, "manifest.json"), JSON.stringify(resolveManifest(result, manifest), null, 2));
    if (popupDocument) {
      const doc = await resolvePopupDocument(popupDocument, result);
      if (doc) {
        await writeFile(join(outdir, "index.html"), doc);
      }
    }
  }

  return {
    entryPoints,
    outdir,
    logLevel: "debug",
    bundle: true,
    metafile: true,
    plugins: [
      {
        name: "manifest",
        setup(build) {
          build.onEnd(handleBuild);
        },
      },
    ],
  };
}

const options = await build();

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
