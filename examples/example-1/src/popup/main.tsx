import { createRoot } from "react-dom/client";
import { App } from "./Popup.tsx";
import "./main.css";

const root = document.getElementById("root");
createRoot(root).render(<App />);
