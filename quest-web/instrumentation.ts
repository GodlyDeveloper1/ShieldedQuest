// Runs once when the Next.js server starts: keeps the judge demo pool topped up
// (DEMO_POOL_SIZE=0 turns it off) and cleans up unused media uploads.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DEMO_POOL_SIZE !== "0") {
    const { startDemoPool } = await import("./lib/demo");
    startDemoPool();
  }
  // Delete uploads that never made it into a published hunt (every 15 minutes).
  const { cleanOrphanMedia } = await import("./lib/media");
  setInterval(() => void cleanOrphanMedia().catch(() => {}), 15 * 60_000).unref?.();
}
