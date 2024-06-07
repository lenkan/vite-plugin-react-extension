if (process.env.NODE_ENV === "development") {
  const port = process.env.PORT;
  const url = `http://localhost:${port}`;

  const manifest = chrome.runtime.getManifest();
  const scripts: string[] = [];

  if (typeof window === "undefined") {
    if (manifest.background && "service_worker" in manifest.background) {
      scripts.push("/" + manifest.background.service_worker);
    }

    if (manifest.content_scripts) {
      scripts.push(...manifest.content_scripts.flatMap((cs) => cs.js ?? []).map((script) => `/${script}`));
    }
  }

  function reload() {
    chrome.runtime.reload();
  }

  new EventSource(url).addEventListener("message", (ev) => {
    console.log("Got message");
    console.log(ev.data);
    const { updated } = JSON.parse(ev.data) as { updated: string[] };
    // console.log({ updated, scripts });
    // if (updated.some((update) => scripts.includes(update))) {
    //   reload();
    // }
  });
}
