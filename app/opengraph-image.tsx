import { ImageResponse } from "next/og";

export const alt = "AgentShelf — Pay with PayPal · Works with any AI agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: "#f6f2eb", color: "#27231f", fontFamily: "Georgia, serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#4034b6", fontSize: 28, fontFamily: "Arial, sans-serif", fontWeight: 700 }}>
        <span style={{ width: 44, height: 44, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", background: "#4034b6", color: "white", fontSize: 25 }}>A</span>
        AgentShelf
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 25 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 12, fontSize: 72, lineHeight: 1.05, letterSpacing: -2 }}>A shelf for the <span style={{ color: "#4034b6", fontStyle: "italic" }}>agent era.</span></div>
        <div style={{ fontSize: 28, fontFamily: "Arial, sans-serif", color: "#6c665d" }}>Pay with PayPal · Works with any AI agent</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 20, color: "#6c665d", fontFamily: "Arial, sans-serif" }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: "#d78d4a" }} />
        Handmade shops. Clear boundaries. Human approval when it matters.
      </div>
    </div>,
    size,
  );
}
