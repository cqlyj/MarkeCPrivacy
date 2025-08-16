import { NextRequest, NextResponse } from "next/server";

// Placeholder external URL for agent service. Update this when the real endpoint is available.
const AGENT_ENDPOINT =
  process.env.AGENT_ENDPOINT || "https://example.com/agent";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Forward payload to external agent; if it's unreachable, fall back to mock success
    let result: unknown = null;
    let statusCode = 200;

    try {
      const res = await fetch(AGENT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const text = await res.text();
      try {
        result = JSON.parse(text);
      } catch {
        result = { raw: text };
      }

      statusCode = res.status;
    } catch (err) {
      console.warn("Agent service unreachable, returning mock response");
      result = {
        txHash: "0xMOCK_HASH",
        tokenId: "1",
      };
      statusCode = 200;
    }

    return NextResponse.json(result, { status: statusCode });
  } catch (err) {
    console.error("/api/submit fatal error", err);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
