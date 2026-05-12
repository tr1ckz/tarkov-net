import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function disabled(method: string) {
  return NextResponse.json(
    {
      ok: false,
      disabled: true,
      mode: "pubg_report_only",
      routeStatus: "disabled",
      method,
      message: "This route is disabled in pubg.report-only mode.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return disabled("GET");
}

export async function POST() {
  return disabled("POST");
}
