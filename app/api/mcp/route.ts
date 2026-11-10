import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { getAppUrl } from "@/lib/env";
import { resolveMcpRequestContext } from "@/lib/mcp/request-context";
import { createAgentShelfMcpServer } from "@/lib/mcp/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const mcpHandler = createMcpHandler(
  async ({ requestInfo }) => createAgentShelfMcpServer(await resolveMcpRequestContext(requestInfo)),
  {
    legacy: "stateless",
    responseMode: "json",
    onerror: () => undefined,
  },
);

function allowedHostnames(): string[] {
  return [...new Set([
    new URL(getAppUrl()).hostname,
    ...localhostAllowedHostnames(),
  ])];
}

function allowedOriginHostnames(): string[] {
  return [...new Set([
    new URL(getAppUrl()).hostname,
    ...localhostAllowedOrigins(),
  ])];
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handle(request: Request): Promise<Response> {
  try {
    const hostError = hostHeaderValidationResponse(request, allowedHostnames());
    if (hostError) return withCors(hostError);
    const originError = originValidationResponse(request, allowedOriginHostnames());
    if (originError) return withCors(originError);
    return withCors(await mcpHandler.fetch(request));
  } catch {
    return withCors(Response.json({ error: "AgentShelf could not process this MCP request." }, { status: 400 }));
  }
}

export function GET(request: Request): Promise<Response> {
  return handle(request);
}

export function POST(request: Request): Promise<Response> {
  return handle(request);
}

export function DELETE(request: Request): Promise<Response> {
  return handle(request);
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}
