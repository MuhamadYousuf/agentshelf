export type SecretScanHit = { file: string; line: number };
export type ScannableFile = { file: string; contents: string };

const placeholderValues = new Set([
  "placeholder",
  "example",
  "your_client_id",
  "your_client_secret",
  "replace_me",
  "change_me",
  "password",
  "secret",
  "<redacted>",
  "<placeholder>",
]);

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().replace(/^['"`]|['"`]$/g, "").toLowerCase();
  return placeholderValues.has(normalized) || normalized.includes("placeholder") || normalized.startsWith("your_") || normalized.startsWith("your-") || normalized.startsWith("example_");
}

function lineContainsSecret(line: string): boolean {
  const privateKey = /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(line);
  if (privateKey) return true;

  const paypalAssignments = line.matchAll(/\bPAYPAL_(?:CLIENT_ID|CLIENT_SECRET)\s*(?:=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'`,;]+))|:\s*["']([^"']+)["'])/gi);
  for (const assignment of paypalAssignments) {
    const value = assignment[1] ?? assignment[2] ?? assignment[3] ?? assignment[4] ?? "";
    if (value.length >= 24 && !isPlaceholder(value)) return true;
  }

  const passTokens = line.matchAll(/\basp_[A-Za-z0-9_-]{35,}\b/g);
  if (passTokens.next().done === false) return true;

  const googleKeys = line.matchAll(/\bAIza[0-9A-Za-z_-]{30,}\b/g);
  if (googleKeys.next().done === false) return true;

  const groqKeys = line.matchAll(/\bgsk_[A-Za-z0-9]{30,}\b/g);
  if (groqKeys.next().done === false) return true;

  const databaseUrls = line.matchAll(/\bpostgres(?:ql)?:\/\/[^:\s/]+:([^@\s/]+)@/gi);
  for (const databaseUrl of databaseUrls) {
    if (!isPlaceholder(databaseUrl[1] ?? "")) return true;
  }
  return false;
}

/** Returns only file/line locations; matched secret text never enters the result. */
export function findSecretLeaks(files: Iterable<ScannableFile>): SecretScanHit[] {
  const hits: SecretScanHit[] = [];
  for (const file of files) {
    const lines = file.contents.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lineContainsSecret(lines[index] ?? "")) hits.push({ file: file.file, line: index + 1 });
    }
  }
  return hits;
}
