import { createRoot } from "react-dom/client";
import { App } from "./Popup.tsx";
import "./main.css";

if (process.env.DEV_SERVER_URL) {
  new EventSource(process.env.DEV_SERVER_URL + "/popup").addEventListener("message", () => window.location.reload());
}

const root = document.getElementById("root");
createRoot(root).render(<App />);
