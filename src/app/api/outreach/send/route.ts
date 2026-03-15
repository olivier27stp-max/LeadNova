import { NextRequest, NextResponse } from "next/server";
import { sendEmail, canSendEmail } from "@/lib/email-sender";
import { logActivity } from "@/lib/activity";
import { requireWorkspaceContext, handleWorkspaceError } from "@/lib/workspace";

export async function POST(request: NextRequest) {
  try {
  await requireWorkspaceContext();
  const body = await request.json();
  const { prospectId, subject, body: emailBody } = body;

  if (!prospectId || !subject || !emailBody) {
    return NextResponse.json(
      { error: "prospectId, subject, and body are required" },
      { status: 400 }
    );
  }

  const { allowed, reason, sentToday } = await canSendEmail();
  if (!allowed) {
    return NextResponse.json(
      { error: reason, sentToday },
      { status: 429 }
    );
  }

  const result = await sendEmail(prospectId, subject, emailBody);

  if (result.success) {
    await logActivity({
      action: "email_sent",
      type: "success",
      title: "Email envoyé",
      details: subject,
      relatedEntityType: "prospect",
      relatedEntityId: prospectId,
    });

    return NextResponse.json({
      message: "Email sent successfully",
      sentToday: sentToday + 1,
    });
  }

  return NextResponse.json(
    { error: result.error },
    { status: 500 }
  );
  } catch (error) {
    return handleWorkspaceError(error);
  }
}
