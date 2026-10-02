"use client";

// Makes a prize pot's keys in this browser, with a small WebAssembly module
// built from ../pot-keys (Rust). The seed phrase is created here and stays here;
// only the viewing key and the seed's fingerprint go to the server.
//
// The module is served from /wasm/ on this site. It's loaded with a plain
// <script> tag and no bundler involvement, so the Content-Security-Policy
// ('self' scripts, 'wasm-unsafe-eval') covers it without exceptions.

export interface BrowserPot {
  seedPhrase: string;
  viewingKey: string;
  seedFingerprint: string;
}

interface WasmPotKeys {
  seed_phrase: string;
  viewing_key: string;
  seed_fingerprint: string;
  free(): void;
}
type WasmBindgen = ((init: { module_or_path: string }) => Promise<unknown>) & {
  new_pot(): WasmPotKeys;
  pot_from_phrase(phrase: string): WasmPotKeys;
};
declare global {
  interface Window {
    wasm_bindgen?: WasmBindgen;
  }
}

const JS_URL = "/wasm/pot_keys.js";
const WASM_URL = "/wasm/pot_keys_bg.wasm";

let loading: Promise<WasmBindgen | null> | null = null;

/** Loads the module once. Resolves to null if this site doesn't ship it or the browser can't run it. */
function load(): Promise<WasmBindgen | null> {
  loading ??= (async () => {
    try {
      if (typeof WebAssembly !== "object") return null;
      const head = await fetch(JS_URL, { method: "HEAD" });
      if (!head.ok) return null;
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = JS_URL;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("couldn't load the key module"));
        document.head.appendChild(s);
      });
      const wb = window.wasm_bindgen;
      if (!wb) return null;
      await wb({ module_or_path: WASM_URL });
      return wb;
    } catch {
      return null;
    }
  })();
  return loading;
}

function read(k: WasmPotKeys): BrowserPot {
  try {
    return { seedPhrase: k.seed_phrase, viewingKey: k.viewing_key, seedFingerprint: k.seed_fingerprint };
  } finally {
    k.free();
  }
}

/** True if this browser can make pot keys itself. */
export async function canMakePots(): Promise<boolean> {
  return (await load()) !== null;
}

/** A brand-new pot, made here. Returns null if the module isn't available. */
export async function makeBrowserPot(): Promise<BrowserPot | null> {
  const wb = await load();
  if (!wb) return null;
  const pot = read(wb.new_pot());
  // Belt and braces: the phrase must re-derive the same viewing key.
  const again = read(wb.pot_from_phrase(pot.seedPhrase));
  if (again.viewingKey !== pot.viewingKey || pot.seedPhrase.split(" ").length !== 24) {
    throw new Error("the key module gave an inconsistent result");
  }
  return pot;
}
