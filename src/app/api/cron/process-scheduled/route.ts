import { NextResponse } from "next/server";
import { processScheduledEmails } from "@/lib/process-scheduled-emails";

export async function POST() {
  const result = await processScheduledEmails();
  return NextResponse.json(result);
}

// Allow GET for manual testing
export async function GET() {
  const result = await processScheduledEmails();
  return NextResponse.json(result);
}
