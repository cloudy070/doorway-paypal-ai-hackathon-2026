import { readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parse } from "yaml";
import {
  parseEvidenceCsv,
  REGISTER_FIELDS,
  validateReadiness,
} from "../src/lib/readiness";
try {
  const commits = new Map<string, boolean>();
  const result = validateReadiness({
    config: parse(readFileSync("claims.yaml", "utf8")),
    cases: parseEvidenceCsv(readFileSync("bench/cases.csv", "utf8"), [
      "case_id",
      "experiment",
      "split",
      "required",
      "required_source",
      "required_method",
      "required_fault_injected",
    ]),
    rows: parseEvidenceCsv(
      readFileSync("bench/register.csv", "utf8"),
      REGISTER_FIELDS,
    ),
    readText: (file) => {
      const root = realpathSync("bench/evidence"),
        target = realpathSync(file),
        relative = path.relative(root, target);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Evidence symlink escapes bench/evidence");
      return readFileSync(target, "utf8");
    },
    commitExists: (sha) => {
      if (!commits.has(sha))
        commits.set(
          sha,
          spawnSync("git", ["cat-file", "-e", sha + "^{commit}"], {
            stdio: "ignore",
            windowsHide: true,
          }).status === 0,
        );
      return commits.get(sha)!;
    },
  });
  if (result.errors.length) {
    console.error(
      "NOT READY\n" + result.errors.map((error) => "- " + error).join("\n"),
    );
    process.exitCode = 1;
  } else
    console.log(
      "Structural evidence/claim gate passed. Independently inspect provider authenticity, consent, eligibility, licences and reviewer access; metadata does not establish these facts.",
    );
} catch (error) {
  console.error(
    "NOT READY\n- " +
      (error instanceof Error
        ? error.message
        : "Evidence files could not be read."),
  );
  process.exitCode = 1;
}
