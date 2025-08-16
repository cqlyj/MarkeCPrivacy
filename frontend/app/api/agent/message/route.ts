import { NextRequest, NextResponse } from "next/server";
import { verifyDynamicToken, isEmailAllowed } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or malformed Authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.substring("Bearer ".length);

    // Verify the JWT using Dynamic's JWKS
    let decoded;
    try {
      decoded = await verifyDynamicToken(token);
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const email = (decoded as any).email as string | undefined;
    if (!isEmailAllowed(email)) {
      return NextResponse.json(
        { error: "Email not authorized" },
        { status: 403 }
      );
    }

    // parse request body json
    const { message, ...data } = await request.json();

    // Simple processing (e.g., logging)
    console.log("[Agent] Received message from", email, { message, ...data });

    return NextResponse.json({ success: true, echo: { message, ...data } });
  } catch (error: any) {
    console.error("[Agent] Error handling request", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
