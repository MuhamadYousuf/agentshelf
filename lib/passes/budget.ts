import type { PassMandate } from "@/lib/db/schema";

export type PassUseErrorCode = "INVALID" | "EXPIRED" | "CATEGORY" | "PER_ORDER_LIMIT" | "BUDGET_EXCEEDED";

const passUseMessages: Record<PassUseErrorCode, string> = {
  INVALID: "This Agent Pass is not valid. Ask your human for a new one.",
  EXPIRED: "This Agent Pass has expired. Ask your human for a new one.",
  CATEGORY: "This item is outside the categories allowed by your Agent Pass.",
  PER_ORDER_LIMIT: "This order is above the Agent Pass per-order limit.",
  BUDGET_EXCEEDED: "This order is above the remaining Agent Pass budget.",
};

export class PassUseError extends Error {
  constructor(readonly code: PassUseErrorCode, message = passUseMessages[code]) {
    super(message);
    this.name = "PassUseError";
  }
}

export function remainingPassBudget(totalBudgetCents: number, spentCents: number, pendingCents: number): number {
  return Math.max(0, totalBudgetCents - spentCents - pendingCents);
}

export function canReservePassBudget(input: {
  totalBudgetCents: number;
  spentCents: number;
  pendingCents: number;
  amountCents: number;
}): boolean {
  return Number.isInteger(input.totalBudgetCents) && input.totalBudgetCents >= 0 &&
    Number.isInteger(input.spentCents) && input.spentCents >= 0 &&
    Number.isInteger(input.pendingCents) && input.pendingCents >= 0 &&
    Number.isInteger(input.amountCents) && input.amountCents > 0 &&
    input.spentCents + input.pendingCents + input.amountCents <= input.totalBudgetCents;
}

export function transitionPassBudget(input: {
  spentCents: number;
  pendingCents: number;
  amountCents: number;
  action: "reserve" | "commit" | "release";
  totalBudgetCents?: number;
}): { spentCents: number; pendingCents: number } | undefined {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1) return undefined;
  if (input.action === "reserve") {
    if (input.totalBudgetCents === undefined || !canReservePassBudget({
      totalBudgetCents: input.totalBudgetCents,
      spentCents: input.spentCents,
      pendingCents: input.pendingCents,
      amountCents: input.amountCents,
    })) return undefined;
    return { spentCents: input.spentCents, pendingCents: input.pendingCents + input.amountCents };
  }
  if (!Number.isInteger(input.pendingCents) || input.pendingCents < input.amountCents) return undefined;
  return {
    spentCents: input.action === "commit" ? input.spentCents + input.amountCents : input.spentCents,
    pendingCents: input.pendingCents - input.amountCents,
  };
}

export function evaluatePassPurchase(input: {
  mandate: PassMandate;
  category: string;
  amountCents: number;
  spentCents: number;
  pendingCents: number;
  now?: Date;
}): { flow: "agent_pass" | "approval_link"; remainingCents: number } {
  const now = input.now ?? new Date();
  if (new Date(input.mandate.expiresAt).getTime() <= now.getTime()) throw new PassUseError("EXPIRED");
  if (!input.mandate.categories.includes(input.category)) throw new PassUseError("CATEGORY");
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1) throw new PassUseError("INVALID");
  if (input.amountCents > input.mandate.perOrderMaxCents) throw new PassUseError("PER_ORDER_LIMIT");
  const remainingCents = remainingPassBudget(
    input.mandate.totalBudgetCents,
    input.spentCents,
    input.pendingCents,
  );
  if (input.amountCents > remainingCents) {
    throw new PassUseError(
      "BUDGET_EXCEEDED",
      `Agent Pass budget exceeded. Remaining budget: $${(remainingCents / 100).toFixed(2)}.`,
    );
  }
  return {
    flow: input.amountCents > input.mandate.stepUpOverCents ? "approval_link" : "agent_pass",
    remainingCents: remainingCents - input.amountCents,
  };
}
