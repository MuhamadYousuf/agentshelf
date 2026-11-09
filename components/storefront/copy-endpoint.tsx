"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyEndpoint({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState(false);

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy the endpoint. Select the address and copy it.");
    }
  }

  return (
    <div className="mcp-chip">
      <span className="mcp-chip-label">MCP endpoint</span>
      <code>{endpoint}</code>
      <Button
        aria-label={copied ? "Endpoint copied" : "Copy MCP endpoint"}
        className="copy-endpoint-button"
        onClick={copyEndpoint}
        size="icon"
        type="button"
        variant="ghost"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "MCP endpoint copied" : ""}
      </span>
    </div>
  );
}
