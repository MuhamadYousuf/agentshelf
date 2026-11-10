import "server-only";

import { getPaypalConfiguration } from "@/lib/env";

export type PayPalErrorDetail = {
  issue?: string;
  description?: string;
  field?: string;
  value?: string;
  [key: string]: unknown;
};

export class PayPalError extends Error {
  readonly status: number;
  readonly details: unknown;
  readonly debugId?: string;

  constructor(options: {
    status: number;
    name: string;
    message: string;
    details?: unknown;
    debugId?: string;
  }) {
    super(options.message);
    this.name = options.name || "PAYPAL_ERROR";
    this.status = options.status;
    this.details = options.details;
    this.debugId = options.debugId;
  }
}

type TokenCache = { accessToken: string; expiresAt: number };

let tokenCache: TokenCache | undefined;
let pendingToken: Promise<string> | undefined;

function baseUrl(): string {
  return getPaypalConfiguration().environment === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function redact(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") {
    return secrets.reduce(
      (safe, secret) => (secret ? safe.split(secret).join("[redacted]") : safe),
      value,
    );
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry, secrets));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redact(entry, secrets)]),
    );
  }
  return value;
}

function errorFromResponse(
  response: Response,
  payload: unknown,
  secrets: string[],
): PayPalError {
  const body =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  return new PayPalError({
    status: response.status,
    name: typeof body.name === "string" ? body.name : "PAYPAL_ERROR",
    message:
      typeof body.message === "string"
        ? String(redact(body.message, secrets))
        : typeof body.error_description === "string"
          ? String(redact(body.error_description, secrets))
          : "PayPal could not complete the request.",
    details: redact(body.details, secrets),
    debugId: response.headers.get("paypal-debug-id") ?? undefined,
  });
}

async function requestAccessToken(
  fetcher: typeof fetch,
  now: () => number,
): Promise<string> {
  const config = getPaypalConfiguration();
  const clientId = config.clientId;
  const clientSecret = config.clientSecret;
  if (!clientId || !clientSecret) {
    throw new PayPalError({
      status: 0,
      name: "PAYPAL_CONFIGURATION_ERROR",
      message: "PayPal Catalog sync is not configured.",
    });
  }

  if (tokenCache && tokenCache.expiresAt > now()) return tokenCache.accessToken;
  if (pendingToken) return pendingToken;

  pendingToken = (async () => {
    const response = await fetcher(`${baseUrl()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15_000),
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw errorFromResponse(response, payload, [clientId, clientSecret]);
    }
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as Record<string, unknown>).access_token !== "string" ||
      typeof (payload as Record<string, unknown>).expires_in !== "number"
    ) {
      throw new PayPalError({
        status: response.status,
        name: "PAYPAL_TOKEN_RESPONSE_ERROR",
        message: "PayPal returned an invalid access token response.",
      });
    }

    const data = payload as { access_token: string; expires_in: number };
    const safeExpiry = Math.max(0, data.expires_in - 60) * 1_000;
    tokenCache = { accessToken: data.access_token, expiresAt: now() + safeExpiry };
    return data.access_token;
  })();

  try {
    return await pendingToken;
  } finally {
    pendingToken = undefined;
  }
}

export function resetPaypalTokenCacheForTests(): void {
  tokenCache = undefined;
  pendingToken = undefined;
}

export type PayPalFetchOptions = {
  method: string;
  body?: unknown;
  requestId?: string;
  headers?: HeadersInit;
};

export async function paypalFetch<T>(
  path: string,
  options: PayPalFetchOptions,
): Promise<T> {
  const config = getPaypalConfiguration();
  const token = await requestAccessToken(fetch, Date.now);
  const headers = new Headers();
  if (options.headers) {
    new Headers(options.headers).forEach((value, key) => {
      if (!["authorization", "prefer", "paypal-request-id", "content-type"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
  }
  headers.set("Accept", "application/json");
  headers.set("Prefer", "return=representation");
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.requestId) headers.set("PayPal-Request-Id", options.requestId);

  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw errorFromResponse(response, payload, [
      config.clientId ?? "",
      config.clientSecret ?? "",
      token,
    ]);
  }
  return payload as T;
}
