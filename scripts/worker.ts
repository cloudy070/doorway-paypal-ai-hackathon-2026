import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { getPaymentService } = await import("../src/lib/runtime");
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
console.log(
  "Doorway reconciliation worker: every 30 seconds. Sandbox provider configuration is required.",
);
while (!stopped) {
  try {
    const result = await (await getPaymentService()).reconcilePending();
    console.log(JSON.stringify({ time: new Date().toISOString(), ...result }));
  } catch (error) {
    console.error(
      JSON.stringify({
        time: new Date().toISOString(),
        code: (error as { code?: string }).code || "WORKER_FAILED",
      }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 30000));
}
process.exit(0);
