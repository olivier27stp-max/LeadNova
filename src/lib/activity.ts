import { prisma } from "@/lib/db";

export type ActivityType = "info" | "success" | "warning" | "error";

export interface LogActivityParams {
  action: string;
  type?: ActivityType;
  title: string;
  details?: string;
  userId?: string;
  workspaceId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  importBatchId?: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(params: LogActivityParams) {
  try {
    return await prisma.activityLog.create({
      data: {
        action: params.action,
        type: params.type || "info",
        title: params.title,
        details: params.details || null,
        userId: params.userId || null,
        workspaceId: params.workspaceId || null,
        relatedEntityType: params.relatedEntityType || null,
        relatedEntityId: params.relatedEntityId || null,
        importBatchId: params.importBatchId || null,
        metadata: (params.metadata || {}) as Record<string, string | number | boolean>,
      },
    });
  } catch (error) {
    console.error("[logActivity] Failed:", error);
    return null;
  }
}

export function generateBatchId() {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
