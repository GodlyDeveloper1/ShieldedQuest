// Loaded right after pot_keys.js. That file declares `wasm_bindgen` with `let`,
// which makes it visible to other scripts but not as a property of `window`.
// This hands it to the app without needing eval (which the site's
// Content-Security-Policy forbids).
window.__potKeys = wasm_bindgen;
