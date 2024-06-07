import { useState } from "react";

function useSessionStorage(key: string): [string | null, (newValue: string) => void] {
  const [value, update] = useState(window.sessionStorage.getItem(key));

  function setValue(newValue: string) {
    window.sessionStorage.setItem(key, newValue);
    update(window.sessionStorage.getItem(key));
  }

  return [value, setValue];
}

export function App() {
  const [input, setInput] = useSessionStorage("input");
  const manifest = chrome.runtime.getManifest();

  return (
    <div>
      <h1>Welcome!</h1>
      <input value={input ?? ""} onChange={(ev) => setInput(ev.target.value)} />
      <pre>
        <code>{JSON.stringify(manifest, null, 2)}</code>
      </pre>
    </div>
  );
}
