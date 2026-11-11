// Writes src/durations.json with seconds for every VO clip and capture.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const out = { vo: {}, capture: {} };
for (const f of readdirSync("public/vo")) if (f.endsWith(".mp3")) out.vo[f.replace(".mp3", "")] = probe(`public/vo/${f}`);
for (const f of readdirSync("public/capture")) if (f.endsWith(".webm")) out.capture[f.replace(".webm", "")] = probe(`public/capture/${f}`);
out.marks = existsSync("public/capture/passflow-marks.json") ? { passflow: JSON.parse(readFileSync("public/capture/passflow-marks.json", "utf8")) } : {};
writeFileSync("src/durations.json", JSON.stringify(out, null, 2));
console.log(out);
