import "../../../dist/reload.js";
import { TEXT } from "./shared/mod.js";

chrome.runtime.onConnect.addListener((port) => {
  console.log("Connected");
});

console.log("Content 1!!!");
console.log(TEXT);
