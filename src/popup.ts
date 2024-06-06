import { renderLines } from "./utils.js";

export function renderPopup(scripts: string[], styles: string[]) {
  return renderLines([
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="UTF-8" />`,
    ...styles.map((s) => `<link rel="stylesheet" href="${s}">`),
    `</head>`,
    `<body>`,
    `<div id="root"></div>`,
    ...scripts.map((s) => `<script type="module" src="${s}"></script>`),
    `</body>`,
    `</html>`,
  ]);
}
