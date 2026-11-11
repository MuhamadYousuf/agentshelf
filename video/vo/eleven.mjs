import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const env = Object.fromEntries(readFileSync("../.env.keys", "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const key = env.ELEVENLABS_API_KEY;
const mode = process.argv[2];
if (mode === "voices") {
  const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
  const j = await r.json();
  console.log(r.status, (j.voices ?? []).map(v => `${v.voice_id} ${v.name} ${v.category} ${v.labels?.accent ?? ""} ${v.labels?.description ?? ""}`).join("\n") || JSON.stringify(j).slice(0, 300));
  const u = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
  const s = await u.json(); console.log("chars", s.character_count, "/", s.character_limit, s.tier);
} else {
  const voice = process.argv[3];
  const only = process.argv[4];
  mkdirSync("public/vo", { recursive: true });
  for (const scene of JSON.parse(readFileSync("vo/scenes.json", "utf8"))) {
    if (only && scene.id !== only) continue;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: scene.text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
    });
    if (!r.ok) { console.log(scene.id, r.status, (await r.text()).slice(0, 200)); continue; }
    writeFileSync(`public/vo/${scene.id}.mp3`, Buffer.from(await r.arrayBuffer()));
    console.log("ok", scene.id);
  }
}
