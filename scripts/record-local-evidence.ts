import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { REGISTER_FIELDS, parseEvidenceCsv } from "../src/lib/readiness";
const endpoint = process.argv[2];
if (!endpoint)
  throw new Error(
    "Pass the running MCP endpoint; this records only local PostgreSQL/MCP checks.",
  );
const commit = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout.trim();
const dirty = spawnSync(
  "git",
  [
    "status",
    "--porcelain",
    "--",
    "src",
    "scripts",
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "next.config.ts",
  ],
  { encoding: "utf8" },
).stdout;
if (dirty.trim())
  throw new Error(
    "Commit the implementation first. Evidence must identify a frozen implementation.",
  );
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = JSON.parse(
  readFileSync("node_modules/@modelcontextprotocol/sdk/package.json", "utf8"),
).version;
mkdirSync("bench/evidence", { recursive: true });
const quote = (v: unknown) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
const header = REGISTER_FIELDS.join(",");
if (readFileSync("bench/register.csv", "utf8").split(/\r?\n/)[0] !== header)
  throw new Error(
    "Register schema differs from the recorder; preserve prior rows and migrate explicitly.",
  );
for (const item of [
  {
    experiment: "DB",
    caseId: "DB-D01",
    method: "REAL_POSTGRES",
    script: "scripts/postgres-smoke.ts",
    args: [],
  },
  {
    experiment: "E4",
    caseId: "E4-D01",
    method: "REAL_HTTP_MCP",
    script: "scripts/mcp-smoke.ts",
    args: [endpoint],
  },
]) {
  const start = new Date().toISOString(),
    id = item.experiment + "-" + start.replace(/[^0-9]/g, ""),
    file = "bench/evidence/" + id + ".json";
  const previous =
    parseEvidenceCsv(
      readFileSync("bench/register.csv", "utf8"),
      REGISTER_FIELDS,
    )
      .filter((row) => row.case_id === item.caseId)
      .at(-1)?.run_id || null;
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", item.script, ...item.args],
    { encoding: "utf8", timeout: 60000, windowsHide: true },
  );
  let observations: Record<string, unknown> = {};
  try {
    observations = JSON.parse(result.stdout);
  } catch {
    /* A malformed/failed transcript is retained, never called PASS. */
  }
  const status =
    result.status === 0 &&
    (observations.status === "PASS" || observations.success === true)
      ? "PASS"
      : "FAIL";
  const proof =
    item.experiment === "DB"
      ? observations.proof
      : {
          kind: "mcp_http",
          endpoint,
          client: { name: "@modelcontextprotocol/sdk", version },
          transport: "STREAMABLE_HTTP",
          tools: observations.tools || [],
          payment_created: false,
        };
  const artifact = {
    schema: "doorway.evidence.v1",
    run_id: id,
    experiment: item.experiment,
    case_id: item.caseId,
    split: "dev",
    source: "LOCAL_VALIDATION",
    method: item.method,
    status,
    fault_injected: false,
    rerun_of: previous,
    started_at: start,
    completed_at: new Date().toISOString(),
    commit_sha: commit,
    metrics: [],
    proof,
    runtime: { node: process.version, dependencies: packageJson.dependencies },
    observations,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error?.message,
    externalPaymentProven: false,
  };
  const bytes = JSON.stringify(artifact, null, 2) + "\n";
  writeFileSync(file, bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const row: Record<string, string> = {
    run_id: id,
    experiment: item.experiment,
    case_id: item.caseId,
    split: "dev",
    source: "LOCAL_VALIDATION",
    method: item.method,
    status,
    fault_injected: "false",
    rerun_of: previous || "",
    started_at: start,
    evidence: file,
    evidence_sha256: digest,
    commit_sha: commit,
    notes:
      "Frozen local run; synthetic fixture; external AI/payment not proven",
  };
  appendFileSync(
    "bench/register.csv",
    REGISTER_FIELDS.map((key) => quote(row[key])).join(",") + "\n",
  );
  console.log(id + " " + status + " " + file);
  if (status === "FAIL") process.exitCode = 1;
}
