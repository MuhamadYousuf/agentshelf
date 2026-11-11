import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

export const serif = loadSerif("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
loadSerif("italic", { weights: ["400"], subsets: ["latin"] });
export const sans = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;

export const C = {
  bg: "#faf8f5",
  card: "#fffdfa",
  ink: "#14141f",
  muted: "#5b5964",
  border: "#e6e1d9",
  primary: "#3b2ed0",
  accent: "#f5a524",
  green: "#1f8a5b",
  red: "#c2410c",
  paypal: "#003087",
  paypalLight: "#009cde",
};

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);

/** Fade + rise in, starting at `delay` frames. */
export const useEnter = (delay = 0, distance = 24) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } });
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` } as const;
};

/** Fade out over the last `frames` of a sequence of length `duration`. */
export const useExit = (duration: number, frames = 10) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [duration - frames, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

export const Bg: React.FC<{ children?: React.ReactNode; tint?: boolean }> = ({ children, tint }) => (
  <AbsoluteFill
    style={{
      background: tint
        ? `radial-gradient(1200px 700px at 78% 12%, rgba(59,46,208,.10), transparent 60%), radial-gradient(900px 600px at 10% 95%, rgba(245,165,36,.10), transparent 60%), ${C.bg}`
        : C.bg,
      fontFamily: sans,
      color: C.ink,
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Logo: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.35 }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="15" width="20" height="3" rx="1.5" fill={C.primary} />
      <rect x="4" y="9" width="12" height="3" rx="1.5" fill={C.primary} opacity=".55" />
      <path d="M17 3l1.2 2.6L21 7l-2.8 1.3L17 11l-1.2-2.7L13 7l2.8-1.4z" fill={C.accent} />
    </svg>
    <span style={{ fontFamily: sans, fontWeight: 600, fontSize: size * 0.62, letterSpacing: "-0.02em" }}>AgentShelf</span>
  </div>
);

export const Chip: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.primary, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 18px",
      borderRadius: 999,
      background: "#fff",
      border: `1.5px solid ${color}33`,
      color,
      fontWeight: 600,
      fontSize: 24,
      boxShadow: "0 6px 20px rgba(20,20,31,.08)",
      ...style,
    }}
  >
    {children}
  </div>
);
