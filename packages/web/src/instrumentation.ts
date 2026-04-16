/**
 * Next.js instrumentation hook — runs once at server startup.
 *
 * Pre-warms the services singleton (config + plugin registry + session manager)
 * so the first API request doesn't pay the cold-start compilation cost.
 * In dev mode, Next.js JIT-compiles each plugin import; doing it here means
 * that compilation happens during server startup, not during the first user request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const t0 = Date.now();
    console.log("[instrumentation] pre-warming services...");
    try {
      const { getServices } = await import("@/lib/services");
      await getServices();
      console.log(`[instrumentation] services ready in ${Date.now() - t0}ms`);
    } catch (err) {
      console.error(`[instrumentation] services pre-warm failed after ${Date.now() - t0}ms:`, err);
      // Non-fatal — routes will retry on first request
    }
  }
}
