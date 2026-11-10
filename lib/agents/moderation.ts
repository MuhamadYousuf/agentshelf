import type { ModerationData } from "@/lib/db/schema";

type ModerationInput = {
  title: string;
  description: string;
  attributes: Record<string, string | number | boolean>;
  tags: string[];
  modelVerdict?: "allowed" | "review" | "blocked";
  modelReasons?: string[];
};

type Rule = {
  reason: string;
  patterns: RegExp[];
  blocked: boolean;
};

const rules: Rule[] = [
  {
    reason: "Weapons, ammunition, or explosives",
    blocked: true,
    patterns: [
      /\b(?:firearms?|guns?|rifles?|pistols?|swords?|knife|knives|daggers?)\b/i,
      /\b(?:ammunition|ammo|explosives?|grenades?|bombs?)\b/i,
      /\b(?:weapon|weapons)\b/i,
    ],
  },
  {
    reason: "Drugs, cannabis, or drug paraphernalia",
    blocked: true,
    patterns: [
      /\b(?:cocaine|heroin|methamphetamine|fentanyl|marijuana|cannabis|CBD|THC|hashish)\b/i,
      /\b(?:drug paraphernalia|drug pipe|bong|rolling papers)\b/i,
      /\b(?:drugs?|illegal substances?|controlled substances?)\b/i,
    ],
  },
  {
    reason: "Counterfeit or replica goods",
    blocked: true,
    patterns: [
      /\b(?:counterfeit|knockoffs?|replicas?|fake designer|imitation brand)\b/i,
    ],
  },
  {
    reason: "Adult content",
    blocked: true,
    patterns: [
      /\b(?:pornography|pornographic|explicit sexual content|sexually explicit)\b/i,
      /\b(?:adult video|sex toy|sexual services?)\b/i,
      /\badult content\b/i,
    ],
  },
  {
    reason: "Tobacco or vaping products",
    blocked: false,
    patterns: [
      /\b(?:tobacco|cigarettes?|cigars?|e-cigarettes?|vapes?|vaping|nicotine)\b/i,
    ],
  },
  {
    reason: "Alcohol",
    blocked: false,
    patterns: [
      /\b(?:alcohol|wine|beer|liquor|spirits|whiskey|vodka|rum)\b/i,
    ],
  },
  {
    reason: "Prescription drugs or medical claims",
    blocked: false,
    patterns: [
      /\b(?:prescription drugs?|prescription medication|Rx medication)\b/i,
      /\b(?:cures?|treats?|heals?|prevents?)\s+(?:cancer|diabetes|disease|illness|infection|pain|anxiety|depression|eczema)\b/i,
      /\b(?:medical claim|FDA approved|clinically proven)\b/i,
    ],
  },
  {
    reason: "Gift cards, cryptocurrency, or money transfer",
    blocked: false,
    patterns: [
      /\b(?:gift cards?|cryptocurrency|crypto tokens?|bitcoin|ethereum)\b/i,
      /\b(?:money transfer|wire transfer|cash equivalent)\b/i,
    ],
  },
  {
    reason: "Live animals",
    blocked: false,
    patterns: [
      /\b(?:live animals?|puppies|kittens|reptiles for sale|livestock)\b/i,
    ],
  },
  {
    reason: "Hazardous materials",
    blocked: false,
    patterns: [
      /\b(?:hazardous materials?|radioactive materials?|toxic chemicals?|flammable liquids?)\b/i,
    ],
  },
  {
    reason: "Stolen goods",
    blocked: false,
    patterns: [
      /\b(?:stolen goods?|stolen property|stolen merchandise)\b/i,
    ],
  },
];

export function moderateListing(input: ModerationInput): ModerationData {
  const text = [
    input.title,
    input.description,
    ...Object.entries(input.attributes).flatMap(([key, value]) => [key, String(value)]),
    ...input.tags,
  ].join(" ");
  const matchedRules = rules.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(text)),
  );
  const reasons = [...new Set([
    ...(input.modelReasons ?? []),
    ...matchedRules.map((rule) => rule.reason),
  ])];
  const modelVerdict = input.modelVerdict ?? "allowed";
  const blocked = modelVerdict === "blocked" || matchedRules.some((rule) => rule.blocked);
  const review = blocked || modelVerdict === "review" || matchedRules.length > 0;
  const source: ModerationData["source"] = input.modelVerdict
    ? ["model", "rules"]
    : ["rules"];
  if (blocked && reasons.length === 0) reasons.push("The automated policy check blocked this listing.");

  return {
    status: blocked ? "blocked" : review ? "review" : "allowed",
    reasons,
    source,
    checkedAt: new Date().toISOString(),
    ...(input.modelVerdict ? { modelVerdict, modelReasons: input.modelReasons ?? [] } : {}),
  };
}
