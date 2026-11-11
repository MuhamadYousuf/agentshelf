// Prints scene start/length in seconds (mirrors Main.tsx math) for still checks.
import d from "./src/durations.json" with { type: "json" };
const S = [["hook","s1-hook",0.3,8,0.8],["problem","s2-problem",0.2,11,1.4],["capture","s3-capture",0.4,22,1.2],["pass","s4-pass",0.3,11,1],["shopper","s5-shopper",0.4,26,1.6],["why","s5b-why",0.2,8,0.8],["attack","s6-attack",0.3,15,1.2],["dashboard","s7-dashboard",0.3,20,1.2],["arch","s8-arch",0.3,10,1.2],["outro","s9-outro",0.5,9,2.5]];
let at = 0; for (const [id, v, dl, min, tail] of S) { const f = Math.round(Math.max(min, dl + d.vo[v] + tail) * 30); console.log(id, (at/30).toFixed(1), (f/30).toFixed(1)); at += f; } console.log("total", (at/30).toFixed(1));
