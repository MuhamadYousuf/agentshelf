import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { findSecretLeaks } from "@/lib/security/secrets-scan";

async function main(): Promise<void> {
  try {
    const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter((path) => path.length > 0);
    const files = await Promise.all(paths.map(async (file) => ({ file, contents: await readFile(file, "utf8") })));
    const hits = findSecretLeaks(files);
    if (hits.length > 0) {
      console.error(`Potential secrets found in ${hits.length} tracked line(s):`);
      for (const hit of hits) console.error(`${hit.file}:${hit.line}`);
      process.exitCode = 1;
      return;
    }
    console.info(`No secrets found in ${files.length} tracked files.`);
  } catch {
    console.error("Secrets scan could not inspect tracked files.");
    process.exitCode = 1;
  }
}

void main();
