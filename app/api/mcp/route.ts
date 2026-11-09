function unavailable() {
  return Response.json(
    { error: "Agent access is not available in this foundation release." },
    {
      status: 501,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function GET() {
  return unavailable();
}

export function POST() {
  return unavailable();
}
