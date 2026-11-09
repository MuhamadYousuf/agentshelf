import "server-only";

import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32).optional(),
  QUOTE_SIGNING_SECRET: z.string().min(32).optional(),
  PAYPAL_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
  PAYPAL_CLIENT_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ServerEnvironment = z.infer<typeof environmentSchema>;

let parsedEnvironment: ServerEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  parsedEnvironment ??= environmentSchema.parse(process.env);
  return parsedEnvironment;
}

export function getDatabaseUrl(): string {
  const value = getServerEnvironment().DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required to use the database.");
  }
  return value;
}

export function getAppUrl(): string {
  return getServerEnvironment().APP_URL;
}

export function getSessionSecret(): string {
  const value = getServerEnvironment().SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET is required to create or verify a session.");
  }
  return value;
}

export function getQuoteSigningSecret(): string {
  const value = getServerEnvironment().QUOTE_SIGNING_SECRET;
  if (!value) {
    throw new Error("QUOTE_SIGNING_SECRET is required to sign quotes.");
  }
  return value;
}

export function getPaypalConfiguration() {
  const env = getServerEnvironment();
  return {
    environment: env.PAYPAL_ENV,
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    webhookId: env.PAYPAL_WEBHOOK_ID,
  };
}

export function getLlmConfiguration() {
  const env = getServerEnvironment();
  return {
    googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    groqApiKey: env.GROQ_API_KEY,
  };
}

export function isDemoMode(): boolean {
  return getServerEnvironment().DEMO_MODE;
}
