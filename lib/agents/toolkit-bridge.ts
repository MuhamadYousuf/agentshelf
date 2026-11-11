export type LegacyToolkitMethod = {
  description?: string;
  parameters?: unknown;
  execute: (input: unknown) => Promise<unknown> | unknown;
};

export class ToolkitMethodError extends Error {
  constructor() {
    super("That PayPal action is not available right now.");
    this.name = "ToolkitMethodError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stripToolkitSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripToolkitSecrets);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/(?:access[_-]?token|client[_-]?secret|authorization)/i.test(key))
      .map(([key, entry]) => [key, stripToolkitSecrets(entry)]),
  );
}

/**
 * The Agent Toolkit catches PayPal failures and *returns* them as a JSON string
 * (`{"error":{...}}` or a serialized PayPal error with `name`/`debug_id`) instead of
 * throwing. Treat those results as failures so callers never report false success.
 */
export class ToolkitResultError extends Error {
  constructor(readonly debugId?: string, readonly paypalName?: string) {
    super("PayPal did not accept that action.");
    this.name = "ToolkitResultError";
  }
}

function parseToolkitResult(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function findDebugId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["debug_id", "debugId"]) {
    if (typeof value[key] === "string") return value[key];
  }
  for (const nested of Object.values(value)) {
    const found = findDebugId(nested);
    if (found) return found;
  }
  return undefined;
}

export function toolkitFailure(result: unknown): ToolkitResultError | undefined {
  if (typeof result === "string" && /^(failed|error)\b/i.test(result.trim())) return new ToolkitResultError();
  if (!isRecord(result)) return undefined;
  const debugId = findDebugId(result);
  // Batch endpoints (e.g. /v1/shipping/trackers-batch) return HTTP 200 with per-item `errors`.
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    const first: unknown = result.errors[0];
    const name = isRecord(first) && typeof first.name === "string" ? first.name : undefined;
    return new ToolkitResultError(debugId, name);
  }
  if ("error" in result && result.error) {
    const name = isRecord(result.error) && typeof result.error.name === "string" ? result.error.name : undefined;
    return new ToolkitResultError(debugId, name);
  }
  const name = typeof result.name === "string" ? result.name : undefined;
  const looksLikePayPalError = name !== undefined && (debugId !== undefined || "details" in result || "message" in result) &&
    !("id" in result) && !("status" in result);
  if (looksLikePayPalError) return new ToolkitResultError(debugId, name);
  return undefined;
}

export async function delegateToolkitMethod(
  methods: Record<string, unknown>,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const candidate = methods[name];
  if (typeof candidate !== "object" || candidate === null || !("execute" in candidate)) {
    throw new ToolkitMethodError();
  }
  const method = candidate as LegacyToolkitMethod;
  if (typeof method.execute !== "function") throw new ToolkitMethodError();
  const result = parseToolkitResult(await method.execute(input));
  const failure = toolkitFailure(result);
  if (failure) throw failure;
  return stripToolkitSecrets(result);
}

export function paypalRequestId(action: string, stableKey: string): string {
  const bytes = new TextEncoder().encode(`${action}:${stableKey}`);
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  const encoded = (hash >>> 0).toString(16).padStart(8, "0");
  return `${action}-${encoded}-${bytes.length.toString(16).padStart(4, "0")}`.slice(0, 38);
}
