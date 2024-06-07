import { watch } from "chokidar";
import { readFile } from "node:fs/promises";
import { IncomingMessage, ServerResponse, createServer } from "node:http";
import { join, relative } from "node:path";
import type { Manifest } from "./manifest.js";
import { findScripts } from "./utils.js";

export interface ServeOptions {
  dir: string;
  port: number;
  signal: AbortSignal;
}

export async function serve(options: ServeOptions) {
  const watcher = watch(options.dir, {});

  let manifest = await readManifest();

  async function readManifest() {
    const manifest = JSON.parse(await readFile(join(options.dir, "manifest.json"), "utf8")) as Manifest;
    return manifest;
  }

  async function findPopupScripts() {
    if (!manifest.action?.default_popup) {
      return [];
    }

    const popup = await readFile(join(options.dir, manifest.action.default_popup), "utf8");
    return [manifest.action.default_popup, ...findScripts(popup)];
  }

  function createEmitter(req: IncomingMessage, res: ServerResponse) {
    return async (event: string) => {
      const filename = relative(options.dir, event);

      if (filename === "manifest.json") {
        manifest = await readManifest();
        res.write(`data: ${JSON.stringify({ changed: [filename] })}\n\n`);
        return;
      }

      if (req.url === "/popup") {
        const popupScripts = await findPopupScripts();
        if (popupScripts.includes(filename)) {
          res.write(`data: ${JSON.stringify({ changed: [filename] })}\n\n`);
        }
      }
    };
  }

  const server = createServer(async (req, res) => {
    try {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
        Connection: "keep-alive",
      });

      watcher.on("change", createEmitter(req, res));
    } catch (error) {
      res.writeHead(500, "Internal Server Error").end();
    }
  });

  server.listen(options.port, () => {
    console.log(`SSE app listening on port ${options.port}`);
  });

  options.signal.addEventListener("abort", async () => {
    await watcher.close();
    server.close((err) => {
      if (err) {
        console.error(err);
      }
      console.log("Server closed!");
    });
  });
}
