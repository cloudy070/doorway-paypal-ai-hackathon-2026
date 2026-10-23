import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../src/lib/db";
import { SandboxPayPal } from "../src/lib/paypal";
import {
  assertHumanApproval,
  captureAndCrash,
  isolatedRecoveryConfig,
  recordRecoveryResult,
  recoverAfterCaptureCrash,
  RecoveryHarnessError,
  writeRecoveryMarker,
  type RecoveryMarker,
} from "../src/lib/recovery-harness";
import type { Checkout } from "../src/lib/domain-commerce";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Isolated sandbox only: ISOLATED_SANDBOX=1 pnpm exec tsx scripts/live-recovery.ts --checkout EXISTING_CHECKOUT --approval-attestation EXISTING_HUMAN_JSON\nAfter a recovery read outage, add --resume-marker PATH_TO_ORIGINAL_PRIVATE_MARKER for read-only resume. Requires a distinct TEST_DATABASE_URL, sandbox keys/payee and valid stable Ed25519 RECEIPT_PRIVATE_KEY. Stop the isolated webhook/worker before the initial run. No new order or human attestation is created. Private markers remain under .data/live-recovery; this command never appends benchmark PASS rows.",
  );
  process.exit(0);
}
const value = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
let store: Awaited<ReturnType<typeof createStore>> | undefined;
try {
  const config = isolatedRecoveryConfig(process.env),
    checkoutId = value("--checkout"),
    attestation = value("--approval-attestation");
  if (!checkoutId || !attestation)
    throw new RecoveryHarnessError(
      "CHECKOUT_AND_EXISTING_HUMAN_ATTESTATION_REQUIRED",
      400,
    );
  const approval: unknown = JSON.parse(
    readFileSync(path.resolve(attestation), "utf8"),
  );
  const callback = process.env.APP_URL || "http://127.0.0.1:3000";
  const gateway = new SandboxPayPal({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    webhookId: process.env.PAYPAL_WEBHOOK_ID || "",
    returnUrl: new URL("/checkout/return", callback).href,
    cancelUrl: new URL("/checkout/cancel", callback).href,
  });
  if (args.includes("--child")) {
    const marker = value("--marker"),
      runId = value("--run-id");
    if (!marker || !runId)
      throw new RecoveryHarnessError("INTERNAL_CHILD_ARGUMENTS_REQUIRED", 400);
    store = await createStore(config.databaseUrl);
    await captureAndCrash(store, gateway, {
      checkoutId,
      merchantId: config.merchantId,
      runId,
      source: "LIVE_SANDBOX",
      approval,
      signer: config.signer,
      writeMarker: (data) => writeRecoveryMarker(marker, data),
      terminate: (code) => process.exit(code),
    });
  } else {
    const resume = value("--resume-marker"),
      root = path.resolve(process.env.DATA_DIR || ".data", "live-recovery"),
      runId = resume ? undefined : randomUUID();
    const markerPath = resume
        ? path.resolve(resume)
        : path.join(root, runId!, "capture-boundary.json"),
      directory = path.dirname(markerPath);
    const relative = path.relative(root, markerPath);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new RecoveryHarnessError(
        "RESUME_MARKER_OUTSIDE_PRIVATE_RECOVERY_DIRECTORY",
        403,
      );
    if (!resume) {
      mkdirSync(directory, { recursive: true });
      const child = spawnSync(
        process.execPath,
        [
          path.resolve("node_modules/tsx/dist/cli.mjs"),
          fileURLToPath(import.meta.url),
          "--child",
          "--checkout",
          checkoutId,
          "--approval-attestation",
          path.resolve(attestation),
          "--marker",
          markerPath,
          "--run-id",
          runId!,
        ],
        {
          env: process.env,
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 60000,
          maxBuffer: 64000,
          windowsHide: true,
        },
      );
      // Do not echo child errors, SQL connection strings or provider response bodies.
      if (child.status !== 86 || !existsSync(markerPath))
        throw new RecoveryHarnessError(
          "EXPECTED_CAPTURE_CRASH_NOT_OBSERVED_RECONCILE_EXISTING_ORDER",
          409,
        );
    }
    const marker = JSON.parse(
      readFileSync(markerPath, "utf8"),
    ) as RecoveryMarker;
    if (
      (!resume && marker.run_id !== runId) ||
      !marker.run_id ||
      marker.source !== "LIVE_SANDBOX"
    )
      throw new RecoveryHarnessError("RECOVERY_MARKER_MISMATCH");
    store = await createStore(config.databaseUrl);
    const original = await store.get<Checkout>("checkouts", checkoutId);
    if (!original?.orderId)
      throw new RecoveryHarnessError("EXISTING_UNCAPTURED_CHECKOUT_REQUIRED");
    assertHumanApproval(approval, original.orderId);
    const result = await recoverAfterCaptureCrash(
      store,
      gateway,
      checkoutId,
      marker,
      config.signer,
    );
    const recorded = recordRecoveryResult(
      path.join(directory, "result.json"),
      result,
    );
    console.log(JSON.stringify(recorded));
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: "REFUSED_OR_UNCONFIRMED",
      source: "LOCAL_VALIDATION",
      http_status:
        error instanceof RecoveryHarnessError ? error.httpStatus : 503,
      code:
        error instanceof RecoveryHarnessError
          ? error.code
          : "RECOVERY_DID_NOT_COMPLETE",
      external_provider_proven: false,
      instruction:
        "Never create a new payment to resolve uncertainty. Reconcile the existing isolated checkout and inspect private provider evidence.",
    }),
  );
  process.exitCode = 1;
} finally {
  await store?.close?.();
}
