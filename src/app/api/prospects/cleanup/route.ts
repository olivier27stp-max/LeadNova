import { NextResponse } from "next/server";
import { getCleanupProgress, requestCancelCleanup } from "@/lib/cleanup-progress";

export async function GET() {
  const progress = getCleanupProgress();
  return NextResponse.json(progress || { status: "idle" });
}

export async function DELETE() {
  requestCancelCleanup();
  return NextResponse.json({ cancelled: true });
}
