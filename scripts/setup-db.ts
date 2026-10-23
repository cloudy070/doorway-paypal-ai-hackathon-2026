import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { randomBytes, generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { homedir } from "node:os";
const data = path.resolve(".data");
mkdirSync(data, { recursive: true });
const bin =
  process.env.POSTGRES_BIN ||
  path.join(homedir(), "scoop", "apps", "postgresql", "current", "bin");
const exe = (name: string) =>
  path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
if (!existsSync(exe("initdb")))
  throw new Error(
    "PostgreSQL binaries unavailable. Set POSTGRES_BIN, or use embedded development PostgreSQL by leaving DATABASE_URL empty.",
  );
const pgdata = path.join(data, "postgres");
const pwfile = path.join(data, "postgres-password");
if (!existsSync(pwfile))
  writeFileSync(pwfile, randomBytes(32).toString("base64url"), {
    mode: 0o600,
    flag: "wx",
  });
const password = readFileSync(pwfile, "utf8");
function run(command: string, args: string[], tolerate = false) {
  const result = spawnSync(exe(command), args, {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: password },
    windowsHide: true,
    timeout: 30000,
    stdio: command === "pg_ctl" && args.includes("start") ? "ignore" : "pipe",
  });
  if (result.status !== 0 && !tolerate)
    throw new Error(
      `${command} failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  return result;
}
if (!existsSync(path.join(pgdata, "PG_VERSION")))
  run("initdb", [
    "-D",
    pgdata,
    "-U",
    "doorway",
    "--auth=scram-sha-256",
    "--pwfile",
    pwfile,
    "--encoding=UTF8",
    "--locale=C",
  ]);
if (run("pg_ctl", ["-D", pgdata, "status"], true).status !== 0)
  run("pg_ctl", [
    "-D",
    pgdata,
    "-l",
    path.join(data, "postgres.log"),
    "-o",
    "-h 127.0.0.1 -p 55432",
    "-w",
    "start",
  ]);
for (const name of ["doorway", "doorway_tests"]) {
  const exists = run("psql", [
    "-h",
    "127.0.0.1",
    "-p",
    "55432",
    "-U",
    "doorway",
    "-d",
    "postgres",
    "-tAc",
    `SELECT 1 FROM pg_database WHERE datname='${name}'`,
  ]);
  if (!exists.stdout.trim())
    run("createdb", ["-h", "127.0.0.1", "-p", "55432", "-U", "doorway", name]);
}
const envFile = path.resolve(".env.local");
let text = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
function set(name: string, value: string) {
  const line = `${name}=${value}`;
  const re = new RegExp("^" + name + "=.*$", "m");
  text = re.test(text) ? text.replace(re, line) : text + "\n" + line;
}
set(
  "DATABASE_URL",
  `postgresql://doorway:${encodeURIComponent(password)}@127.0.0.1:55432/doorway`,
);
set(
  "TEST_DATABASE_URL",
  `postgresql://doorway:${encodeURIComponent(password)}@127.0.0.1:55432/doorway_tests`,
);
if (!text.includes("APP_URL=")) set("APP_URL", "http://127.0.0.1:3000");
if (!text.includes("RECONCILE_SECRET="))
  set("RECONCILE_SECRET", randomBytes(32).toString("base64url"));
writeFileSync(envFile, text.trim() + "\n", { mode: 0o600 });
const keyFile = path.join(data, "receipt-key.pem");
if (!existsSync(keyFile))
  writeFileSync(
    keyFile,
    generateKeyPairSync("ed25519").privateKey.export({
      type: "pkcs8",
      format: "pem",
    }),
    { mode: 0o600, flag: "wx" },
  );
if (!text.includes("RECEIPT_PRIVATE_KEY="))
  set("RECEIPT_PRIVATE_KEY", JSON.stringify(readFileSync(keyFile, "utf8")));
if (!text.includes("CHECKOUT_ACCESS_SECRET="))
  set("CHECKOUT_ACCESS_SECRET", randomBytes(48).toString("base64url"));
writeFileSync(envFile, text.trim() + "\n", { mode: 0o600 });
console.log(
  "Loopback PostgreSQL is running on port 55432; application and isolated test databases are ready. Credentials and signing keys stored only in ignored local files.",
);
