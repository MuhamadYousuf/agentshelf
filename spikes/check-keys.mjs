// Verifies the free-tier keys in .env.keys without printing them.
// Usage: node spikes/check-keys.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.keys", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2")]),
);
const ok = (n, m) => console.log(`✅ ${n}: ${m}`);
const bad = (n, m) => console.log(`❌ ${n}: ${m}`);

async function gemini() {
  const k = env.GOOGLE_GENERATIVE_AI_API_KEY; if (!k) return bad("Gemini", "missing");
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": k } });
  const j = await r.json();
  if (!r.ok) return bad("Gemini", `${r.status} ${j.error?.message}`);
  const flash = j.models.map((m) => m.name.replace("models/", "")).filter((n) => /flash/.test(n) && !/image|tts|audio|live/.test(n));
  ok("Gemini", `${j.models.length} models; flash: ${flash.slice(0, 8).join(", ")}`);
}
async function groq() {
  const k = env.GROQ_API_KEY; if (!k) return bad("Groq", "missing");
  const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${k}` } });
  const j = await r.json();
  if (!r.ok) return bad("Groq", `${r.status} ${j.error?.message}`);
  ok("Groq", j.data.map((m) => m.id).slice(0, 15).join(", "));
}
async function neon() {
  const u = env.DATABASE_URL; if (!u) return bad("Neon", "missing");
  let postgres;
  try { postgres = (await import("postgres")).default; } catch { return bad("Neon", "set, but 'postgres' package not installed yet (after P01)"); }
  const sql = postgres(u, { prepare: false, max: 1 });
  const [row] = await sql`select version()`; await sql.end();
  ok("Neon", row.version.split(",")[0]);
}
async function eleven() {
  const k = env.ELEVENLABS_API_KEY; if (!k) return console.log("➖ ElevenLabs: not set (optional)");
  const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": k } });
  const j = await r.json();
  if (!r.ok) return bad("ElevenLabs", `${r.status} ${JSON.stringify(j.detail ?? j)}`);
  ok("ElevenLabs", `tier=${j.tier}, chars left=${j.character_limit - j.character_count}`);
}
for (const f of [gemini, groq, neon, eleven]) { try { await f(); } catch (e) { bad(f.name, e.message); } }
