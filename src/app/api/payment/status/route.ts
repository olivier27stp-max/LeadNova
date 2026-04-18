import { NextResponse } from "next/server";
import { hasPaidAccess } from "@/lib/payment";

export async function GET() {
  const paid = await hasPaidAccess();
  return NextResponse.json({ paid });
}
