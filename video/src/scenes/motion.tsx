import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bg, C, Chip, Logo, sans, serif, useEnter } from "../theme";
import injection from "../../public/data/injection.json";

const Line: React.FC<{ delay: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay, children, style }) => {
  const e = useEnter(delay, 30);
  return <div style={{ ...e, ...style }}>{children}</div>;
};

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const phase2 = 128;
  const outA = interpolate(frame, [phase2 - 12, phase2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Bg tint>
      <AbsoluteFill style={{ padding: "0 200px", justifyContent: "center", opacity: outA }}>
        <Line delay={4} style={{ fontFamily: serif, fontSize: 120, lineHeight: 1.02, letterSpacing: "-0.03em" }}>Your next customer</Line>
        <Line delay={22} style={{ fontFamily: serif, fontSize: 120, lineHeight: 1.02, letterSpacing: "-0.03em" }}>might not be a person.</Line>
        <Line delay={58} style={{ fontFamily: serif, fontStyle: "italic", fontSize: 132, lineHeight: 1.1, color: C.primary, letterSpacing: "-0.03em", marginTop: 18 }}>It might be an AI agent.</Line>
      </AbsoluteFill>
      {frame >= phase2 - 4 && <Invisible start={phase2} />}
    </Bg>
  );
};

const Invisible: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame() - start;
  const { fps } = useVideoConfig();
  const shops = ["Clay studio", "Embroidery", "Candles", "Prints", "Jewelry", "Woodwork"];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 60 }}>
      <div style={{ display: "flex", gap: 26 }}>
        {shops.map((s, i) => {
          const p = spring({ frame: frame - i * 3, fps, config: { damping: 200 } });
          const fade = interpolate(frame, [40 + i * 4, 70 + i * 4], [1, 0.16], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={s} style={{ width: 210, height: 230, borderRadius: 20, background: C.card, border: `1.5px dashed ${C.border}`, opacity: p * fade, transform: `translateY(${(1 - p) * 30}px)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, boxShadow: "0 10px 30px rgba(20,20,31,.06)" }}>
              <div style={{ width: 86, height: 86, borderRadius: 18, background: "#efe9e0" }} />
              <div style={{ fontSize: 24, color: C.muted, fontWeight: 500 }}>{s}</div>
            </div>
          );
        })}
      </div>
      <div style={{ ...useEnter(start > 0 ? 18 : 0), fontFamily: serif, fontSize: 76, letterSpacing: "-0.02em" }}>
        …and most small shops are <span style={{ fontStyle: "italic", color: C.red }}>invisible</span> to it.
      </div>
    </AbsoluteFill>
  );
};

export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const fix = 300;
  const out = interpolate(frame, [fix - 12, fix], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const card = (delay: number, title: string, lines: string[], good: boolean) => {
    const e = useEnter(delay, 40);
    return (
      <div style={{ ...e, width: 640, padding: 48, borderRadius: 28, background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 24px 60px rgba(20,20,31,.08)" }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: good ? C.green : C.red }}>{good ? "Agent-ready" : "Left out"}</div>
        <div style={{ fontFamily: serif, fontSize: 64, margin: "14px 0 26px", letterSpacing: "-0.02em" }}>{title}</div>
        {lines.map((l, i) => (
          <div key={l} style={{ ...useEnter(delay + 12 + i * 8, 14), display: "flex", gap: 14, alignItems: "center", fontSize: 30, color: C.ink, marginTop: 14 }}>
            <span style={{ color: good ? C.green : C.red, fontWeight: 700 }}>{good ? "✓" : "✕"}</span>{l}
          </div>
        ))}
      </div>
    );
  };
  return (
    <Bg tint>
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 60, opacity: out }}>
        {card(4, "Big retailers", ["Agent commerce programs", "Engineering teams", "Catalog feeds and APIs"], true)}
        {card(70, "Small makers", ["A phone and a few products", "No API to build", "Can't trust a bot to haggle or pay"], false)}
      </AbsoluteFill>
      {frame >= fix - 2 && <ProblemFix at={fix} />}
    </Bg>
  );
};

const ProblemFix: React.FC<{ at: number }> = ({ at }) => {
  const a = useEnter(at, 30);
  const b = useEnter(at + 10, 20);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 34 }}>
      <div style={a}><Logo size={110} /></div>
      <div style={{ ...b, fontFamily: serif, fontSize: 62, color: C.muted }}>
        Make any small shop <span style={{ fontStyle: "italic", color: C.primary }}>sellable to AI agents</span>.
      </div>
    </AbsoluteFill>
  );
};

type Turn = { from: string; text: string; price?: { price?: string } };

export const AttackChat: React.FC<{ durationInFrames: number }> = () => {
  const frame = useCurrentFrame();
  const turns = (injection as { turns: Turn[] }).turns;
  const step = 52;
  return (
    <Bg tint>
      <AbsoluteFill style={{ flexDirection: "row", padding: "90px 140px 120px", gap: 70 }}>
        <div style={{ flex: 1.25, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ ...useEnter(0), display: "flex", alignItems: "center", gap: 14, fontSize: 22, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: C.red }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: C.red }} /> Live attack · real MCP responses
          </div>
          {turns.map((t, i) => {
            const at = 10 + i * step;
            if (frame < at) return null;
            const agent = t.from === "agent";
            const e = { opacity: interpolate(frame, [at, at + 8], [0, 1], { extrapolateRight: "clamp" }), transform: `translateY(${interpolate(frame, [at, at + 10], [16, 0], { extrapolateRight: "clamp" })}px)` };
            return (
              <div key={i} style={{ ...e, alignSelf: agent ? "flex-end" : "flex-start", maxWidth: 820 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: agent ? C.red : C.muted, marginBottom: 6, textAlign: agent ? "right" : "left" }}>
                  {agent ? "Buyer agent (attacker)" : "Maya's Clay Studio"}{!agent && t.price?.price ? `  ·  offer ${t.price.price}` : ""}
                </div>
                <div style={{ padding: "18px 24px", borderRadius: 20, fontSize: 27, lineHeight: 1.35, background: agent ? "#fff1ec" : "#fff", border: `1.5px solid ${agent ? "#f3c6b3" : C.border}`, color: C.ink, fontFamily: agent ? "ui-monospace, Consolas, monospace" : sans, boxShadow: "0 10px 26px rgba(20,20,31,.06)" }}>
                  {t.text}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ flex: 0.75, display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}>
          {[
            { at: 150, t: "LLM never sees floor or cost", d: "It only writes the words." },
            { at: 190, t: "Price set by the engine", d: "Clamped to Maya's floor and list price." },
            { at: 230, t: "Quotes are HMAC-signed", d: "A tampered price can't check out." },
          ].map((x) => (
            <div key={x.t} style={{ ...useEnter(x.at, 20), padding: "24px 28px", borderRadius: 20, background: C.card, border: `1px solid ${C.border}`, boxShadow: "0 14px 34px rgba(20,20,31,.08)" }}>
              <div style={{ fontSize: 30, fontWeight: 600, color: C.green }}>✓ {x.t}</div>
              <div style={{ fontSize: 24, color: C.muted, marginTop: 6 }}>{x.d}</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </Bg>
  );
};

export const Architecture: React.FC = () => {
  const frame = useCurrentFrame();
  const box = (delay: number, title: string, items: string[], color: string, width = 440) => (
    <div style={{ ...useEnter(delay, 26), width, padding: "28px 30px", borderRadius: 24, background: C.card, border: `1.5px solid ${color}40`, boxShadow: "0 20px 50px rgba(20,20,31,.08)" }}>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        {items.map((it, i) => (
          <div key={it} style={{ ...useEnter(delay + 6 + i * 4, 10), padding: "8px 14px", borderRadius: 10, background: `${color}10`, color: C.ink, fontSize: 24, fontWeight: 500 }}>{it}</div>
        ))}
      </div>
    </div>
  );
  const arrow = (delay: number) => {
    const w = interpolate(frame, [delay, delay + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return <div style={{ width: 90, height: 4, background: C.border, position: "relative" }}><div style={{ position: "absolute", inset: 0, width: `${w * 100}%`, background: C.primary }} /></div>;
  };
  return (
    <Bg tint>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 50 }}>
        <div style={{ ...useEnter(0), fontFamily: serif, fontSize: 70, letterSpacing: "-0.02em" }}>Under the hood</div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {box(6, "Any AI agent", ["Claude Desktop", "Shopper Agent", "Any MCP client"], C.ink, 360)}
          {arrow(20)}
          {box(16, "AgentShelf", ["MCP server", "Pricing engine", "Signed quotes", "Gemini · Groq", "Next.js · Neon"], C.primary, 470)}
          {arrow(34)}
          {box(30, "PayPal", ["Orders v2", "Vault v3", "Payouts", "Catalog", "Webhooks", "Agent Toolkit"], C.paypal, 500)}
        </div>
      </AbsoluteFill>
    </Bg>
  );
};

export const Outro: React.FC<{ team: string[] }> = ({ team }) => (
  <Bg tint>
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30 }}>
      <div style={useEnter(2)}><Logo size={120} /></div>
      <div style={{ ...useEnter(12), fontFamily: serif, fontSize: 66, textAlign: "center", lineHeight: 1.1 }}>
        Any small shop, <span style={{ fontStyle: "italic", color: C.primary }}>sellable to AI agents</span>.<br />Paid safely with PayPal.
      </div>
      <div style={{ ...useEnter(26), display: "flex", gap: 16, marginTop: 10 }}>
        <Chip>agentshelf-jade.vercel.app</Chip>
        <Chip color={C.ink}>Open source · MIT</Chip>
        <Chip color={C.green}>Sandbox demo · no real money</Chip>
      </div>
      <div style={{ ...useEnter(40), fontSize: 24, color: C.muted, marginTop: 24, textAlign: "center", maxWidth: 1400, lineHeight: 1.5 }}>
        Built by {team.join(" · ")}
      </div>
    </AbsoluteFill>
  </Bg>
);
