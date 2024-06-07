import { TEXT } from "./shared/mod.ts";

if (process.env.DEV_SERVER_URL) {
  new EventSource(process.env.DEV_SERVER_URL + "/background").addEventListener("message", () =>
    chrome.runtime.reload()
  );
}

console.log(TEXT + "Hej!");
