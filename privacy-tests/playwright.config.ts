import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Ports chosen not to collide with a real signer (8081) or `npm run dev` (3000).
const WEB_PORT = 13000;
const SIGNER_PORT = 18081;

// The web app writes hunts and media here, never into quest-web/data. The
// folder is emptied once per run; test workers inherit the variable.
if (!process.env.SQ_TEST_DATA) {
  const dir = path.join(here, ".data");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  process.env.SQ_TEST_DATA = dir;
  process.env.SQ_WEB = `http://127.0.0.1:${WEB_PORT}`;
  process.env.SQ_SIGNER = `http://127.0.0.1:${SIGNER_PORT}`;
}

export default defineConfig({
  testDir: "tests",
  // One at a time: every guess costs 64 MiB of Argon2id, and the tests share one server.
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.SQ_WEB,
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: [
    {
      command: "node mock-signer.mjs",
      cwd: here,
      url: `http://127.0.0.1:${SIGNER_PORT}/health`,
      env: { MOCK_SIGNER_PORT: String(SIGNER_PORT) },
      reuseExistingServer: false,
    },
    {
      // A production build, so the tests run against what gets hosted: the real
      // Content-Security-Policy and rate limits, not the development server.
      command: `npx next build && npx next start -H 127.0.0.1 -p ${WEB_PORT}`,
      cwd: path.join(here, "..", "quest-web"),
      url: `http://127.0.0.1:${WEB_PORT}/hunts`,
      timeout: 600_000,
      env: {
        SIGNER_URL: `http://127.0.0.1:${SIGNER_PORT}`,
        QUEST_DATA_DIR: process.env.SQ_TEST_DATA!,
        DEMO_POOL_SIZE: "0",
        // As when hosted behind a proxy. Each test visitor sends its own
        // X-Forwarded-For, so one test can't use up another's rate limit.
        TRUST_PROXY: "1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      reuseExistingServer: false,
    },
  ],
});
