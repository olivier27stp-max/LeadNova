import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace";
import { encrypt, decrypt, isEncrypted } from "@/lib/crypto";

// Fields that must be encrypted in DB
const SENSITIVE_FIELDS: Record<string, string[]> = {
  email: ["smtpPass"],
  security: ["apiKey"],
};

// Default settings structure
const DEFAULT_SETTINGS = {
  company: {
    name: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    country: "Canada",
    description: "",
    emailSignature: "",
  },
  email: {
    senderName: "",
    senderEmail: "",
    replyToEmail: "",
    defaultSignature: "",
    defaultFooter: "",
    provider: "smtp",
    providerStatus: "not_configured",
    logoUrl: "/leadnova-logo.png",
    logoEnabled: true,
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
  },
  prospects: {
    defaultContactType: "prospect",
    defaultSource: "google_search",
    blockDuplicateEmail: true,
    blockDuplicatePhone: false,
    autoMerge: false,
  },
  campaigns: {
    defaultDelayMin: 120,
    defaultDelayMax: 300,
    dailyLimit: 30,
    sendStartHour: 8,
    sendEndHour: 18,
    timezone: "America/Montreal",
    defaultStatus: "DRAFT",
    maxContactsPerBatch: 50,
    pauseOnError: true,
  },
  automation: {
    autoSend: false,
    autoFollowUp: false,
    autoReminder: false,
    internalNotifications: true,
    errorAlerts: true,
    followUpDelayDays: 3,
    maxFollowUps: 3,
    followUpIntervalDays: 5,
    stopOnReply: true,
    stopOnExcluded: true,
    skipWeekends: true,
  },
  targeting: {
    keywords: [],
    blockedKeywords: [],
    cities: [],
    searchQueries: [],
  },
  appearance: {
    language: "fr",
    theme: "light",
    dateFormat: "YYYY-MM-DD",
    timeFormat: "24h",
    timezone: "America/Montreal",
  },
  security: {
    requireConfirmation: true,
    sessionTimeoutMinutes: 480,
    maxLoginAttempts: 5,
    enforceStrongPasswords: true,
    ipWhitelist: [] as string[],
    ipWhitelistEnabled: false,
    apiKeyEnabled: false,
    apiKey: "",
    dataRetentionDays: 365,
    autoDeleteArchived: true,
    autoDeleteArchivedDays: 30,
    exportRequirePassword: false,
    auditLogEnabled: true,
    auditLogRetentionDays: 90,
  },
  subscription: {
    plan: "free",
    status: "active",
    maxUsers: 5,
    maxEmailsPerMonth: 1000,
  },
};

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    const record = await prisma.appSettings.findUnique({
      where: { workspaceId: ctx.workspaceId },
    });

    if (!record) {
      // Create defaults for this workspace
      const created = await prisma.appSettings.create({
        data: { workspaceId: ctx.workspaceId, data: DEFAULT_SETTINGS as never },
      });
      return NextResponse.json(created.data);
    }

    // Merge with defaults to ensure new keys are present
    const stored = record.data as Record<string, unknown>;
    const merged = deepMerge(DEFAULT_SETTINGS, stored);
    // Decrypt sensitive fields before sending to client
    decryptSensitiveFields(merged);
    return NextResponse.json(merged);
  } catch (error) {
    console.error("Settings fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Get existing settings for this workspace
    const existing = await prisma.appSettings.findUnique({
      where: { workspaceId: ctx.workspaceId },
    });

    const currentData = (existing?.data || DEFAULT_SETTINGS) as Record<string, unknown>;
    // Encrypt sensitive fields before saving to DB
    encryptSensitiveFields(body);
    const merged = deepMerge(currentData, body);

    const record = await prisma.appSettings.upsert({
      where: { workspaceId: ctx.workspaceId },
      update: { data: merged as never },
      create: { workspaceId: ctx.workspaceId, data: merged as never },
    });

    // Log the change
    await prisma.activityLog.create({
      data: {
        action: "settings_updated",
        workspaceId: ctx.workspaceId,
        details: `Sections modifiées: ${Object.keys(body).join(", ")}`,
      },
    });

    // Decrypt before returning to client
    const responseData = record.data as Record<string, unknown>;
    decryptSensitiveFields(responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 500 }
    );
  }
}

function encryptSensitiveFields(data: Record<string, unknown>) {
  for (const [section, fields] of Object.entries(SENSITIVE_FIELDS)) {
    const sectionData = data[section] as Record<string, string> | undefined;
    if (!sectionData) continue;
    for (const field of fields) {
      if (sectionData[field] && !isEncrypted(sectionData[field])) {
        sectionData[field] = encrypt(sectionData[field]);
      }
    }
  }
}

function decryptSensitiveFields(data: Record<string, unknown>) {
  for (const [section, fields] of Object.entries(SENSITIVE_FIELDS)) {
    const sectionData = data[section] as Record<string, string> | undefined;
    if (!sectionData) continue;
    for (const field of fields) {
      if (sectionData[field] && isEncrypted(sectionData[field])) {
        sectionData[field] = decrypt(sectionData[field]);
      }
    }
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
