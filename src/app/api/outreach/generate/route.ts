import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateOutreachEmail, generateFallbackEmail } from "@/lib/outreach";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prospectId } = body;

  if (!prospectId) {
    return NextResponse.json(
      { error: "prospectId is required" },
      { status: 400 }
    );
  }

  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
  });

  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect not found" },
      { status: 404 }
    );
  }

  try {
    const email = await generateOutreachEmail({
      companyName: prospect.companyName,
      city: prospect.city,
      industry: prospect.industry,
    });

    return NextResponse.json(email);
  } catch (error) {
    console.error("AI generation failed, using fallback:", error);
    const fallback = generateFallbackEmail({
      companyName: prospect.companyName,
      city: prospect.city,
      industry: prospect.industry,
    });
    return NextResponse.json({ ...fallback, fallback: true });
  }
}
