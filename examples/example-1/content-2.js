import("http://localhost:5173/@react-refresh").then(async ({ default: RefreshRuntime }) => {
  RefreshRuntime.injectIntoGlobalHook(window);
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (type) => type;
  window.__vite_plugin_react_preamble_installed__ = true;
  import("http://localhost:5173/@vite/client");
  import("http://localhost:5173/./src/content-2.ts")
});
