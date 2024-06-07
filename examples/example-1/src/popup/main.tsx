import { createRoot } from "react-dom/client";
import { App } from "./Popup.tsx";
import "./main.css";

const port = process.env.PORT;
const script = process.env.POPUP_SCRIPT;

if (process.env.NODE_ENV === "development") {
  const url = `http://localhost:${port}/esbuild`;
  new EventSource(url).addEventListener("change", (ev) => {
    const { updated } = JSON.parse(ev.data) as { updated: string[] };
    if (script && updated.includes(script)) {
      window.location.reload();
    }
  });
}

const root = document.getElementById("root");
createRoot(root).render(<App />);
