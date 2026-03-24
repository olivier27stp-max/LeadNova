export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startScheduler } = await import("./lib/scheduler");
      startScheduler();
    } catch (err) {
      console.error("[instrumentation] Failed to start scheduler:", err);
    }
  }
}
