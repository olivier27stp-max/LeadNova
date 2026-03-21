import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const notes = await prisma.note.findMany({
    where: { userId: user.id },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      content: true,
      pinned: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const title = (body.title as string) || "";
    const content = (body.content as string) || "";

    const note = await prisma.note.create({
      data: { userId: user.id, title, content },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    console.error("Error creating note:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
