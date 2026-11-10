"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

type ConnectionGuide = {
  label: string;
  description: string;
  snippet: string;
  actionLabel: string;
  external?: boolean;
};

export function ConnectAgent({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const guides: ConnectionGuide[] = [
    {
      label: "Claude Desktop",
      description: "Add this entry inside your claude_desktop_config.json mcpServers object.",
      snippet: JSON.stringify({
        agentshelf: {
          command: "npx",
          args: ["-y", "mcp-remote", endpoint],
        },
      }, null, 2),
      actionLabel: "Copy config",
    },
    {
      label: "claude.ai",
      description: "Open Settings → Connectors → Add custom connector, then paste the endpoint.",
      snippet: endpoint,
      actionLabel: "Copy URL",
      external: true,
    },
    {
      label: "Streamable HTTP clients",
      description: "Use this endpoint with any MCP client that supports Streamable HTTP.",
      snippet: `new StreamableHTTPClientTransport(new URL("${endpoint}"))`,
      actionLabel: "Copy example",
    },
  ];

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => current === id ? null : current), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="connect-agent-list">
      {guides.map((guide) => (
        <article className="connect-agent-row" key={guide.label}>
          <div className="connect-agent-copy">
            <div className="connect-agent-title-line">
              <h3>{guide.label}</h3>
              {guide.external && <ExternalLink aria-hidden="true" size={14} />}
            </div>
            <p>{guide.description}</p>
          </div>
          <pre><code>{guide.snippet}</code></pre>
          <button
            aria-live="polite"
            className="connect-agent-copy-button"
            onClick={() => void copy(guide.label, guide.snippet)}
            type="button"
          >
            {copied === guide.label ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
            {copied === guide.label ? "Copied" : guide.actionLabel}
          </button>
        </article>
      ))}
    </div>
  );
}
