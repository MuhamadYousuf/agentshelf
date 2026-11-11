import { describe, expect, it } from "vitest";
import { findSecretLeaks } from "@/lib/security/secrets-scan";
import { buildDemoDeletionPlan } from "@/lib/db/demo-reset-plan";
import { generateDemoHistory } from "@/lib/db/demo-history";

describe("P08 attack and hardening checks", () => {
  it("detects synthetic PayPal, pass, Google, Groq, database, and private-key samples without returning values", () => {
    const paypalName = ["PAYPAL", "CLIENT", "SECRET"].join("_");
    const paypalLine = `${paypalName}=A${"b".repeat(45)}`;
    const paypalJsonLine = `${paypalName}: "B${"c".repeat(45)}"`;
    const passLine = ["asp", "_", "T".repeat(43)].join("");
    const googleLine = ["AIza", "K".repeat(36)].join("");
    const groqLine = ["gsk", "_", "G".repeat(40)].join("");
    const databaseLine = ["postgresql://demo-user:", "highly-sensitive-password", "@db.example.dev/demo"].join("");
    const privateKeyLine = ["-----BEGIN ", "PRIVATE KEY", "-----"].join("");
    const hits = findSecretLeaks([{ file: "synthetic.txt", contents: [paypalLine, paypalJsonLine, passLine, googleLine, groqLine, databaseLine, privateKeyLine].join("\n") }]);
    expect(hits).toEqual([1, 2, 3, 4, 5, 6, 7].map((line) => ({ file: "synthetic.txt", line })));
    expect(JSON.stringify(hits)).not.toContain("highly-sensitive-password");
  });

  it("does not flag common environment-example placeholders", () => {
    const hits = findSecretLeaks([{ file: ".env.example", contents: [
      "PAYPAL_CLIENT_ID=your_client_id",
      "PAYPAL_CLIENT_ID=your-paypal-client-id",
      "PAYPAL_CLIENT_SECRET=replace_me",
      "DATABASE_URL=postgresql://demo:password@localhost/demo",
      "const schema = { PAYPAL_CLIENT_SECRET: z.string().min(1).optional() }",
    ].join("\n") }]);
    expect(hits).toEqual([]);
  });

  it("protects demo generation from consuming real PayPal IDs or buyer details", () => {
    const products = Array.from({ length: 9 }, (_, index) => ({
      id: `p-${index}`,
      merchantId: index < 5 ? "maya" : "lahore",
      title: `Product ${index}`,
      listPriceCents: 2_000 + index * 100,
      floorPriceCents: 1_500 + index * 80,
      costCents: 1_000 + index * 50,
    }));
    const data = generateDemoHistory({ seed: "hardening", products, now: new Date("2026-11-11T00:00:00.000Z") });
    expect(data.orders.every((order) => order.captureId === null && order.paypalOrderId === null && order.buyerEmail === null)).toBe(true);
  });

  it("keeps the reset planner merchant-scoped and never schedules completed or refunded live orders", () => {
    const now = new Date("2026-11-11T00:00:00.000Z");
    const plan = buildDemoDeletionPlan({
      merchantIds: ["maya", "lahore"],
      orders: [
        { id: "complete", merchantId: "maya", quoteId: "q1", status: "completed", isDemo: false, buyerNote: null, createdAt: now },
        { id: "refund", merchantId: "lahore", quoteId: "q2", status: "refunded", isDemo: false, buyerNote: null, createdAt: now },
        { id: "outside", merchantId: "other", quoteId: "q3", status: "failed", isDemo: false, buyerNote: null, createdAt: now },
        { id: "demo", merchantId: "maya", quoteId: "q4", status: "completed", isDemo: true, buyerNote: null, createdAt: now },
      ],
      negotiations: [],
      quotes: [],
      now,
    });
    expect(plan.orderIds).toEqual(["demo"]);
  });
});
