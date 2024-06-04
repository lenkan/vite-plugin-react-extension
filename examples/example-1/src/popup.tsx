import { createRoot } from "react-dom/client";
import { TEXT } from "./shared/mod.js";
console.log("Background");

const root = document.getElementById("root");
createRoot(root).render(<div>{TEXT}</div>);
