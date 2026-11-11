import React from "react";
import { AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, spring } from "remotion";
import { C, sans, serif } from "./theme";

/** A 1600×900 capture shown 1:1 inside a browser window on the cream background. */
export const BrowserFrame: React.FC<{
  src: string;
  url: string;
  trimBefore?: number;
  playbackRate?: number;
  zoom?: { from: number; to: number; originX?: number; originY?: number };
  children?: React.ReactNode;
}> = ({ src, url, trimBefore = 0, playbackRate = 1, zoom, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.7 } });
  const scale = zoom
    ? interpolate(frame, [0, durationInFrames], [zoom.from, zoom.to], { extrapolateRight: "clamp" })
    : 1;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          width: 1600,
          height: 944,
          marginTop: 8,
          borderRadius: 18,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 30px 80px rgba(20,20,31,.18), 0 0 0 1px rgba(20,20,31,.08)",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 30}px) scale(${0.985 + enter * 0.015})`,
        }}
      >
        <div style={{ height: 44, display: "flex", alignItems: "center", gap: 18, padding: "0 18px", background: "#f3f0eb", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", gap: 8 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
          </div>
          <div style={{ flex: 1, height: 28, borderRadius: 8, background: "#fff", display: "flex", alignItems: "center", padding: "0 14px", fontSize: 15, color: C.muted, fontFamily: sans, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.green, marginRight: 8 }}>●</span>
            {url}
          </div>
        </div>
        <div style={{ width: 1600, height: 900, overflow: "hidden", position: "relative" }}>
          <div style={{ width: 1600, height: 900, transform: `scale(${scale})`, transformOrigin: `${zoom?.originX ?? 50}% ${zoom?.originY ?? 50}%` }}>
            <OffthreadVideo src={staticFile(src)} trimBefore={trimBefore} playbackRate={playbackRate} muted style={{ width: 1600, height: 900 }} />
          </div>
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Burned-in captions: sentences timed proportionally to their length across the VO clip. */
export const Captions: React.FC<{ text: string; voStart: number; voFrames: number }> = ({ text, voStart, voFrames }) => {
  const frame = useCurrentFrame() - voStart;
  if (frame < 0 || frame > voFrames + 6) return null;
  const chunks = splitCaption(text);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  let acc = 0;
  let current = chunks[chunks.length - 1];
  for (const c of chunks) {
    const end = ((acc + c.length) / total) * voFrames;
    if (frame <= end) { current = c; break; }
    acc += c.length;
  }
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 26, pointerEvents: "none" }}>
      <div
        style={{
          maxWidth: 1500,
          padding: "10px 22px",
          borderRadius: 12,
          background: "rgba(20,20,31,.82)",
          color: "#fff",
          fontFamily: sans,
          fontSize: 30,
          fontWeight: 500,
          lineHeight: 1.3,
          textAlign: "center",
          letterSpacing: "-0.005em",
        }}
      >
        {current}
      </div>
    </AbsoluteFill>
  );
};

function splitCaption(text: string): string[] {
  const sentences = text.match(/[^.!?:]+[.!?:]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const out: string[] = [];
  const wrap = (s: string) => {
    if (s.length <= 64) { out.push(s); return; }
    // Prefer a comma near the middle, otherwise the word boundary closest to the middle.
    const mid = s.length / 2;
    let cut = -1;
    for (let i = 0; i < s.length; i++) if (s[i] === "," && Math.abs(i - mid) < s.length * 0.3 && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i + 1;
    if (cut < 0) for (let i = 0; i < s.length; i++) if (s[i] === " " && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    wrap(s.slice(0, cut).trim()); wrap(s.slice(cut).trim());
  };
  sentences.forEach(wrap);
  return out;
}

/** A small floating label that pops in at `at` frames and leaves at `until`. */
export const Callout: React.FC<{ at: number; until?: number; x: number; y: number; children: React.ReactNode; tone?: "primary" | "green" | "paypal" | "dark" }> = ({ at, until, x, y, children, tone = "primary" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: { damping: 14, mass: 0.6 } });
  const out = until === undefined ? 1 : interpolate(frame, [until, until + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame < at) return null;
  const colors = { primary: C.primary, green: C.green, paypal: C.paypal, dark: C.ink }[tone];
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `scale(${0.6 + p * 0.4})`,
        transformOrigin: "left center",
        opacity: Math.min(p, out),
        background: colors,
        color: "#fff",
        padding: "12px 20px",
        borderRadius: 14,
        fontFamily: sans,
        fontWeight: 600,
        fontSize: 26,
        boxShadow: "0 14px 34px rgba(20,20,31,.28)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
};

export const SceneTitle: React.FC<{ kicker: string; title: string; at?: number }> = ({ kicker, title, at = 0 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 10, at + 70, at + 85], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 160, top: 20, opacity: o, display: "flex", alignItems: "baseline", gap: 16, zIndex: 5 }}>
      <span style={{ fontFamily: sans, fontSize: 18, fontWeight: 600, letterSpacing: ".14em", color: C.primary, textTransform: "uppercase" }}>{kicker}</span>
      <span style={{ fontFamily: serif, fontSize: 30, color: C.ink }}>{title}</span>
    </div>
  );
};
