import { CheckCircle2, Sparkles } from "lucide-react";

export function HeroPreview() {
  return (
    <div className="hero-demo-wrap">
      <div className="demo-window">
        <div className="demo-window-bar">
          <div className="demo-window-brand">
            <Sparkles aria-hidden="true" />
            <span>Maya&apos;s Clay Studio</span>
          </div>
          <span className="demo-illustrative-label">Illustrative preview</span>
        </div>

        <div className="demo-window-content">
          <div className="demo-product-art" aria-label="Product photo placeholder">
            <span className="demo-product-number">01</span>
            <span className="demo-product-art-caption">Product photo</span>
          </div>

          <div className="demo-details">
            <span className="demo-ready">
              <Sparkles aria-hidden="true" />
              Agent-ready listing
            </span>
            <h2 className="demo-product-title">Hand-glazed speckled mug</h2>
            <p className="demo-product-meta">Stoneware · Drinkware · 12 oz</p>

            <div className="demo-price-row">
              <span className="demo-price">$32.00</span>
              <span className="demo-floor">Maker-set floor<br />$27.00</span>
            </div>

            <div className="demo-divider" />

            <div className="demo-agent-request">
              <span className="demo-agent-request-label">Example agent request</span>
              <p>Find a handmade ceramic mug under $35.</p>
            </div>
            <span className="demo-match">
              <CheckCircle2 aria-hidden="true" />
              Within the shop&apos;s rules
            </span>
          </div>
        </div>

        <div className="demo-mcp-line">
          <span>Shop endpoint</span>
          <code>/api/mcp</code>
          <span>·</span>
          <span>Published by the merchant</span>
        </div>
      </div>
    </div>
  );
}
