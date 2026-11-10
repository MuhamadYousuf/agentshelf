"use client";

import { useEffect, useState } from "react";
import { Check, Copy, LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type TokenResponse = { token?: string; error?: string };

export function PassTokenPanel({ passId, endpoint }: { passId: string; endpoint: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState("Fetching your one-time pass key…");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    void fetch("/api/pass/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passId }),
      cache: "no-store",
    }).then(async (response) => {
      const payload: TokenResponse = await response.json();
      if (!current) return;
      if (response.ok && payload.token) {
        setToken(payload.token);
        setMessage("Copy this key now. It will not be shown again.");
      } else {
        setMessage(payload.error ?? "This pass key is no longer available.");
      }
    }).catch(() => {
      if (current) setMessage("The pass key could not be loaded. Refresh once; if it was already revealed, revoke and create a new pass.");
    });
    return () => { current = false; };
  }, [passId]);

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setMessage("Copied. Store it somewhere private before leaving this page.");
    } catch {
      setMessage("Clipboard access was blocked. Select and copy the key above.");
    }
  }

  const claudeConfig = JSON.stringify({
    mcpServers: {
      agentshelf: {
        command: "npx",
        args: ["-y", "mcp-remote", endpoint, "--header", "Authorization:${AGENTSHELF_AUTH}"],
        env: { AGENTSHELF_AUTH: "Bearer <paste-your-agent-pass-key>" },
      },
    },
  }, null, 2);

  return (
    <section className="pass-token-panel" aria-labelledby="pass-token-title">
      <div className="pass-token-heading">
        <div className="pass-token-icon"><Check size={18} /></div>
        <div><h2 id="pass-token-title">Your agent key</h2></div>
      </div>
      <p className="pass-token-message" aria-live="polite">{!token && message.startsWith("Fetching") ? <LoaderCircle className="pass-token-spinner" size={14} /> : null}{message}</p>
      {token ? (
        <div className="pass-token-row">
          <code>{token}</code>
          <Button className="pass-token-copy" type="button" variant="outline" onClick={copyToken}>
            {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy key"}
          </Button>
        </div>
      ) : message.includes("already shown") || message.includes("no longer available") ? (
        <div className="pass-token-consumed"><ShieldAlert size={16} /><span>If you did not save it, revoke this pass and create a new one.</span></div>
      ) : null}
      <details className="pass-config-details">
        <summary>Connect it to Claude with mcp-remote</summary>
        <p>Replace the placeholder in <code>AGENTSHELF_AUTH</code> with <code>Bearer</code> followed by your copied key. The header uses mcp-remote’s current <code>--header</code> format.</p>
        <pre><code>{claudeConfig}</code></pre>
      </details>
    </section>
  );
}
