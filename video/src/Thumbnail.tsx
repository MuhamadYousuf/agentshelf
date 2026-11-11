import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Bg, C, Logo, sans, serif } from "./theme";

export const Thumbnail: React.FC = () => (
  <Bg tint>
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 70px", gap: 40 }}>
      <div style={{ flex: 1.1 }}>
        <Logo size={58} />
        <div style={{ fontFamily: serif, fontSize: 96, lineHeight: 0.98, letterSpacing: "-0.03em", marginTop: 26 }}>
          Your shop,<br /><span style={{ fontStyle: "italic", color: C.primary }}>sold by AI agents.</span>
        </div>
        <div style={{ marginTop: 28, display: "inline-flex", padding: "12px 22px", borderRadius: 14, background: C.paypal, color: "#fff", fontFamily: sans, fontWeight: 600, fontSize: 30 }}>
          Paid safely with PayPal
        </div>
      </div>
      <div style={{ flex: 0.9, position: "relative", height: 520 }}>
        <Img src={staticFile("thumb/mug.jpg")} style={{ position: "absolute", right: 0, top: 0, width: 400, height: 520, objectFit: "cover", borderRadius: 28, boxShadow: "0 30px 70px rgba(20,20,31,.25)" }} />
        <div style={{ position: "absolute", left: -10, bottom: 70, padding: "18px 24px", borderRadius: 18, background: "#fff", boxShadow: "0 20px 50px rgba(20,20,31,.2)", fontFamily: sans, fontSize: 28, fontWeight: 600 }}>
          <span style={{ color: C.muted, textDecoration: "line-through", marginRight: 12 }}>$28.00</span>
          <span style={{ color: C.green }}>$23.80 · agreed</span>
        </div>
      </div>
    </AbsoluteFill>
  </Bg>
);
