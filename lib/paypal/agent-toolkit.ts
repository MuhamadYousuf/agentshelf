import "server-only";

import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { getPaypalConfiguration } from "@/lib/env";
import { delegateToolkitMethod } from "@/lib/agents/toolkit-bridge";

export type PayPalToolkitAction =
  | "create_shipment_tracking"
  | "get_shipment_tracking"
  | "get_order"
  | "list_transactions"
  | "create_refund";

export type ToolkitOptions = { requestId?: string };

export function createPaypalAgentToolkit(options: ToolkitOptions = {}): PayPalAgentToolkit {
  const config = getPaypalConfiguration();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("PayPal Agent Toolkit is not configured.");
  }

  return new PayPalAgentToolkit({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    configuration: {
      actions: {
        shipment: { create: true, get: true },
        orders: { get: true },
        payments: { createRefund: true },
        transactions: { list: true },
      },
      context: {
        sandbox: config.environment === "sandbox",
        ...(options.requestId ? { request_id: options.requestId } : {}),
        source: "AgentShelf Merchant Copilot",
      },
    },
  });
}

export async function executePaypalToolkitAction(
  action: PayPalToolkitAction,
  args: Record<string, unknown>,
  options: ToolkitOptions = {},
): Promise<unknown> {
  const toolkit = createPaypalAgentToolkit(options);
  const tools = toolkit.getTools() as unknown as Record<string, unknown>;
  return delegateToolkitMethod(tools, action, args);
}
