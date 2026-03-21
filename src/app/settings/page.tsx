"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useLanguage, useTranslation } from "@/components/LanguageProvider";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import AiAssistButton from "@/components/AiAssistButton";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ToastContainer } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Mail,
  Users,
  UserSearch,
  Megaphone,
  Zap,
  FileText,
  Target,
  Archive,
  Palette,
  Shield,
  CreditCard,
  Activity,
  Plus,
  X,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Copy,
  Lock,
  Smartphone,
  Check,
  MapPin,
  AlertTriangle,
  Info,
  Send,
  Loader2,
  Link2,
  Globe,
  Ban,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

interface Settings {
  company: {
    name: string;
    email: string;
    phone: string;
    website: string;
    address: string;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    description: string;
    emailSignature: string;
  };
  email: {
    senderName: string;
    senderEmail: string;
    replyToEmail: string;
    defaultSignature: string;
    defaultFooter: string;
    provider: string;
    providerStatus: string;
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    smtpPass: string;
  };
  prospects: {
    defaultContactType: string;
    defaultSource: string;
    blockDuplicateEmail: boolean;
    blockDuplicatePhone: boolean;
    autoMerge: boolean;
  };
  campaigns: {
    defaultDelayMin: number;
    defaultDelayMax: number;
    dailyLimit: number;
    sendStartHour: number;
    sendEndHour: number;
    timezone: string;
    defaultStatus: string;
    maxContactsPerBatch: number;
    pauseOnError: boolean;
  };
  automation: {
    autoFollowUp: boolean;
    autoReminder: boolean;
    internalNotifications: boolean;
    errorAlerts: boolean;
    followUpDelayDays: number;
    maxFollowUps: number;
    followUpIntervalDays: number;
    stopOnReply: boolean;
    stopOnExcluded: boolean;
    skipWeekends: boolean;
  };
  appearance: {
    language: string;
    theme: string;
    dateFormat: string;
    timeFormat: string;
    timezone: string;
  };
  security: {
    requireConfirmation: boolean;
    sessionTimeoutMinutes: number;
    maxLoginAttempts: number;
    enforceStrongPasswords: boolean;
    ipWhitelist: string[];
    ipWhitelistEnabled: boolean;
    apiKeyEnabled: boolean;
    apiKey: string;
    dataRetentionDays: number;
    autoDeleteArchived: boolean;
    autoDeleteArchivedDays: number;
    exportRequirePassword: boolean;
    auditLogEnabled: boolean;
    auditLogRetentionDays: number;
  };
  targeting: {
    keywords: string[];
    blockedKeywords: string[];
    cities: string[];
    searchQueries: string[];
  };
  subscription: {
    plan: string;
    status: string;
    maxUsers: number;
    maxEmailsPerMonth: number;
  };
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  twoFactorEnabled: boolean;
  passwordHash: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  workspaceRole?: string;
  memberId?: string;
}

interface WorkspaceInvite {
  id: string;
  token: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  isDefault: boolean;
  createdAt: string;
}

interface ActivityLogEntry {
  id: string;
  action: string;
  title: string;
  details: string | null;
  userId: string | null;
  createdAt: string;
}

// ─── Sections config ─────────────────────────────────────

const SECTION_IDS = ["company", "email", "team", "prospects", "campaigns", "automation", "targeting", "archive", "appearance", "language", "security", "subscription", "activity"] as const;

type SectionId = (typeof SECTION_IDS)[number];

const SECTION_ICONS: Record<SectionId, typeof Building2> = {
  company: Building2,
  email: Mail,
  team: Users,
  prospects: UserSearch,
  campaigns: Megaphone,
  automation: Zap,
  targeting: Target,
  archive: Archive,
  appearance: Palette,
  language: Globe,
  security: Shield,
  subscription: CreditCard,
  activity: Activity,
};

// Translation keys for section labels (in "settings" section)
const SECTION_LABEL_KEYS: Record<SectionId, string> = {
  company: "company",
  email: "emailSection",
  team: "team",
  prospects: "prospects",
  campaigns: "campaigns",
  automation: "automation",
  targeting: "targeting",
  archive: "archive",
  appearance: "appearance",
  language: "language",
  security: "security",
  subscription: "subscription",
  activity: "activity",
};

// ─── Shared components ───────────────────────────────────

function FieldGroup({
  label,
  children,
  description,
}: {
  label: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground-secondary mb-1">
        {label}
      </label>
      {children}
      {description && (
        <p className="text-xs text-muted mt-1">{description}</p>
      )}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-input text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-y"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm text-foreground-secondary">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-background-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

function SectionCard({
  title,
  description,
  children,
  onSave,
  saving,
  hasUnsaved,
  unsavedLabel,
  savingLabel,
  saveLabel,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onSave?: () => void;
  saving?: boolean;
  hasUnsaved?: boolean;
  unsavedLabel?: string;
  savingLabel?: string;
  saveLabel?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && (
            <p className="text-sm text-foreground-muted mt-1">{description}</p>
          )}
        </div>
        {hasUnsaved && <Badge variant="warning">{unsavedLabel || "Non sauvegardé"}</Badge>}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">{children}</div>
        {onSave && (
          <Button
            onClick={onSave}
            disabled={saving || !hasUnsaved}
            className="mt-6"
          >
            {saving ? (savingLabel || "Sauvegarde...") : (saveLabel || "Enregistrer")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StatusIndicator({ status, labels }: { status: string; labels?: { connected: string; not_configured: string; error: string } }) {
  const defaultLabels = { connected: "Connecté", not_configured: "Non configuré", error: "Erreur" };
  const l = labels || defaultLabels;
  const map: Record<string, { color: string; label: string }> = {
    connected: { color: "bg-success", label: l.connected },
    not_configured: { color: "bg-muted", label: l.not_configured },
    error: { color: "bg-danger", label: l.error },
  };
  const s = map[status] || map.not_configured;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${s.color}`} />
      <span className="text-sm text-foreground-muted">{s.label}</span>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────

export default function SettingsPage() {
  const { setLocale: setAppLocale } = useLanguage();
  const { t, locale } = useTranslation();
  const [activeSection, setActiveSection] = useState<SectionId>("company");

  // Read ?section= from URL on mount to deep-link to a specific tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section && SECTION_IDS.includes(section as SectionId)) {
      setActiveSection(section as SectionId);
    }
  }, []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Theme
  const { theme, setTheme } = useTheme();

  // Security state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFactorSecret, setTwoFactorSecret] = useState("");
  const [twoFactorQrUrl, setTwoFactorQrUrl] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);
  const [currentUser2FA, setCurrentUser2FA] = useState(false);

  // Team state
  const [users, setUsers] = useState<User[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);


  // Email templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateType, setNewTemplateType] = useState("custom");
  const [newTemplateSubject, setNewTemplateSubject] = useState("");
  const [newTemplateBody, setNewTemplateBody] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/templates");
      if (res.ok) setTemplates(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Targeting state
  const [newKeyword, setNewKeyword] = useState("");
  const [newBlockedKeyword, setNewBlockedKeyword] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [bulkBlockedKeywords, setBulkBlockedKeywords] = useState("");
  const [bulkCities, setBulkCities] = useState("");
  const [showBulkKeywords, setShowBulkKeywords] = useState(false);
  const [showBulkBlockedKeywords, setShowBulkBlockedKeywords] = useState(false);
  const [showBulkCities, setShowBulkCities] = useState(false);

  // Garbage cities state
  const [garbageCities, setGarbageCities] = useState<{ city: string; count: number }[]>([]);
  const [garbageSelected, setGarbageSelected] = useState<Set<string>>(new Set());
  const [garbageLoading, setGarbageLoading] = useState(false);
  const [garbageClearing, setGarbageClearing] = useState(false);
  const [garbageScanned, setGarbageScanned] = useState(false);

  async function detectGarbage() {
    setGarbageLoading(true);
    setGarbageScanned(false);
    const res = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "detectGarbageCities" }),
    });
    const data = await res.json();
    setGarbageCities(data.garbage || []);
    setGarbageSelected(new Set((data.garbage || []).map((g: { city: string }) => g.city)));
    setGarbageScanned(true);
    setGarbageLoading(false);
  }

  async function clearGarbage() {
    if (garbageSelected.size === 0) return;
    setGarbageClearing(true);
    const res = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "clearGarbageCities", cities: [...garbageSelected] }),
    });
    const data = await res.json();
    setToast({ message: `${data.cleared} ${t("settings", "prospectsUpdated")}`, type: "success" });
    setGarbageCities([]);
    setGarbageSelected(new Set());
    setGarbageScanned(false);
    setGarbageClearing(false);
  }

  // Archive state
  const [archivedProspects, setArchivedProspects] = useState<
    Array<{
      id: string;
      companyName: string;
      city: string | null;
      email: string | null;
      phone: string | null;
      website: string | null;
      status: string;
      leadScore: number;
      source: string | null;
      contactType: string;
      archivedAt: string;
    }>
  >([]);
  const [archiveTotal, setArchiveTotal] = useState(0);
  const [archivePage, setArchivePage] = useState(1);
  const [archiveTotalPages, setArchiveTotalPages] = useState(1);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [selectedArchived, setSelectedArchived] = useState<Set<string>>(
    new Set()
  );

  // Activity log state
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  // ─── Load settings ─────────────────────────────────

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!d.error) setSettings(d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ─── Load section-specific data ────────────────────

  const loadUsers = useCallback(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) {
          setUsers(d);
          if (d.length > 0) {
            setCurrentUser2FA(d[0].twoFactorEnabled || false);
          }
        }
      })
      .catch(console.error);
  }, []);

  const loadLogs = useCallback(() => {
    fetch("/api/activity-log?limit=30")
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((d) => setLogs(d.logs || []))
      .catch(console.error);
  }, []);

  const loadArchive = useCallback((pg = 1) => {
    setArchiveLoading(true);
    fetch(`/api/prospects/archive?page=${pg}&limit=50`)
      .then((r) =>
        r.ok
          ? r.json()
          : { prospects: [], total: 0, page: 1, totalPages: 1 }
      )
      .then((d) => {
        setArchivedProspects(d.prospects || []);
        setArchiveTotal(d.total || 0);
        setArchivePage(d.page || 1);
        setArchiveTotalPages(d.totalPages || 1);
        setSelectedArchived(new Set());
      })
      .catch(console.error)
      .finally(() => setArchiveLoading(false));
  }, []);

  useEffect(() => {
    if (activeSection === "team") { loadUsers(); loadInvites(); }
    if (activeSection === "security") loadUsers();
    if (activeSection === "activity") loadLogs();
    if (activeSection === "archive") loadArchive();
  }, [activeSection, loadUsers, loadLogs, loadArchive]);

  // ─── Bulk parsing ──────────────────────────────────

  function parseBulkInput(text: string): string[] {
    return text
      .split(/[\n\r,;\t|]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function handleBulkAddKeywords() {
    if (!settings) return;
    const parsed = parseBulkInput(bulkKeywords);
    if (parsed.length === 0) return;
    const existing = new Set(
      settings.targeting.keywords.map((k) => k.toLowerCase())
    );
    const toAdd = parsed.filter((k) => !existing.has(k.toLowerCase()));
    if (toAdd.length > 0) {
      const updated = [...settings.targeting.keywords, ...toAdd];
      setSettings({
        ...settings,
        targeting: { ...settings.targeting, keywords: updated },
      });
      setHasUnsaved(true);
    }
    setBulkKeywords("");
    setShowBulkKeywords(false);
    if (toAdd.length < parsed.length) {
      const dupes = parsed.length - toAdd.length;
      setToast({
        message: `${toAdd.length} ${toAdd.length > 1 ? t("settings", "addedCountPlural") : t("settings", "addedCount")}, ${dupes} ${dupes > 1 ? t("settings", "duplicateIgnoredPlural") : t("settings", "duplicateIgnored")}`,
        type: "success",
      });
    } else {
      setToast({
        message: `${toAdd.length} ${toAdd.length > 1 ? t("settings", "addedKeywordsPlural") : t("settings", "addedKeywords")}`,
        type: "success",
      });
    }
  }

  function handleBulkAddBlockedKeywords() {
    if (!settings) return;
    const parsed = parseBulkInput(bulkBlockedKeywords);
    if (parsed.length === 0) return;
    const existing = new Set(
      settings.targeting.blockedKeywords.map((k) => k.toLowerCase())
    );
    const toAdd = parsed.filter((k) => !existing.has(k.toLowerCase()));
    if (toAdd.length > 0) {
      const updated = [...settings.targeting.blockedKeywords, ...toAdd];
      setSettings({
        ...settings,
        targeting: { ...settings.targeting, blockedKeywords: updated },
      });
      setHasUnsaved(true);
    }
    setBulkBlockedKeywords("");
    setShowBulkBlockedKeywords(false);
    if (toAdd.length < parsed.length) {
      const dupes = parsed.length - toAdd.length;
      setToast({
        message: `${toAdd.length} ${toAdd.length > 1 ? t("settings", "addedCountPlural") : t("settings", "addedCount")}, ${dupes} ${dupes > 1 ? t("settings", "duplicateIgnoredPlural") : t("settings", "duplicateIgnored")}`,
        type: "success",
      });
    } else {
      setToast({
        message: `${toAdd.length} ${toAdd.length > 1 ? t("settings", "addedKeywordsPlural") : t("settings", "addedKeywords")}`,
        type: "success",
      });
    }
  }

  function handleBulkAddCities() {
    if (!settings) return;
    const parsed = parseBulkInput(bulkCities);
    if (parsed.length === 0) return;
    const existing = new Set(
      settings.targeting.cities.map((c) => c.toLowerCase())
    );
    const toAdd = parsed.filter((c) => !existing.has(c.toLowerCase()));
    if (toAdd.length > 0) {
      const updated = [...settings.targeting.cities, ...toAdd];
      setSettings({
        ...settings,
        targeting: { ...settings.targeting, cities: updated },
      });
      setHasUnsaved(true);
    }
    setBulkCities("");
    setShowBulkCities(false);
    if (toAdd.length < parsed.length) {
      const dupes = parsed.length - toAdd.length;
      setToast({
        message: `${toAdd.length} ${toAdd.length > 1 ? t("settings", "addedFemCountPlural") : t("settings", "addedFemCount")}, ${dupes} ${dupes > 1 ? t("settings", "duplicateIgnoredPlural") : t("settings", "duplicateIgnored")}`,
        type: "success",
      });
    } else {
      setToast({
        message: `${toAdd.length} ${toAdd.length > 1 ? t("settings", "addedCitiesPlural") : t("settings", "addedCities")}`,
        type: "success",
      });
    }
  }

  // ─── Save settings ─────────────────────────────────

  async function saveSection(
    section: string,
    data: Record<string, unknown>
  ) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [section]: data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setSettings(json as Settings);
      setHasUnsaved(false);
      showToast(t("settings", "settingsSaved"), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      showToast(msg || t("settings", "saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  // ─── Auto-save for targeting ──────────────────────
  const targetingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTargetingRef = useRef<string>("");

  useEffect(() => {
    if (!settings) return;
    const json = JSON.stringify(settings.targeting);
    // Skip initial load (prevRef is empty)
    if (prevTargetingRef.current === "") {
      prevTargetingRef.current = json;
      return;
    }
    // Skip if nothing changed
    if (json === prevTargetingRef.current) return;
    prevTargetingRef.current = json;

    // Debounce: auto-save 800ms after last change
    if (targetingTimerRef.current) clearTimeout(targetingTimerRef.current);
    targetingTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targeting: settings.targeting }),
        });
        if (res.ok) {
          setHasUnsaved(false);
        }
      } catch {
        // silent — user can still manually save if auto-save fails
      }
    }, 800);

    return () => {
      if (targetingTimerRef.current) clearTimeout(targetingTimerRef.current);
    };
  }, [settings?.targeting]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateField(
    section: keyof Settings,
    field: string,
    value: unknown
  ) {
    if (!settings) return;
    setSettings({
      ...settings,
      [section]: { ...settings[section], [field]: value },
    });
    setHasUnsaved(true);
  }

  // ─── Security handlers ─────────────────────────────

  async function handleChangePassword() {
    if (!newPassword || newPassword.length < 8) {
      showToast(t("settings", "passwordMinLength"), "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast(t("settings", "passwordMismatch"), "error");
      return;
    }
    // Use first user as current user (no auth system yet)
    const userId = users[0]?.id;
    if (!userId) {
      showToast(t("settings", "noUserFound"), "error");
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch("/api/users/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          currentPassword: currentPassword || undefined,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      showToast(t("settings", "passwordChanged"), "success");
      setShowChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t("settings", "errorGeneric"),
        "error"
      );
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSetup2FA() {
    const userId = users[0]?.id;
    if (!userId) {
      showToast(t("settings", "noUserFound"), "error");
      return;
    }
    setTwoFactorSaving(true);
    try {
      const res = await fetch("/api/users/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "setup" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setTwoFactorSecret(data.secret);
      setTwoFactorQrUrl(data.qrCodeUrl);
      setShow2FASetup(true);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : t("settings", "errorGeneric"),
        "error"
      );
    } finally {
      setTwoFactorSaving(false);
    }
  }

  async function handleEnable2FA() {
    const userId = users[0]?.id;
    if (!userId || !twoFactorCode) return;
    setTwoFactorSaving(true);
    try {
      const res = await fetch("/api/users/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "enable", code: twoFactorCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Code invalide");
      setCurrentUser2FA(true);
      setShow2FASetup(false);
      setTwoFactorCode("");
      setTwoFactorSecret("");
      setTwoFactorQrUrl("");
      showToast(t("settings", "twoFAEnabled"), "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Code invalide",
        "error"
      );
    } finally {
      setTwoFactorSaving(false);
    }
  }

  async function handleDisable2FA() {
    const userId = users[0]?.id;
    if (!userId) return;
    setTwoFactorSaving(true);
    try {
      const res = await fetch("/api/users/two-factor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "disable" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setCurrentUser2FA(false);
      showToast(t("settings", "twoFADisabled"), "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Erreur",
        "error"
      );
    } finally {
      setTwoFactorSaving(false);
    }
  }

  // ─── User handlers ─────────────────────────────────

  async function handleGenerateInvite() {
    setGeneratingInvite(true);
    try {
      const res = await fetch("/api/workspaces/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "MEMBER" }),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error("Invite API error:", res.status, text);
        throw new Error(`HTTP ${res.status}`);
      }
      const data = JSON.parse(text);
      setInviteLink(data.inviteUrl);
      loadInvites();
      showToast(t("settings", "inviteCreated"), "success");
    } catch (err) {
      console.error("Invite error:", err);
      showToast(t("settings", "inviteCreateError"), "error");
    } finally {
      setGeneratingInvite(false);
    }
  }

  async function handleCopyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  async function handleRevokeInvite(id: string) {
    try {
      await fetch(`/api/workspaces/invite?id=${id}`, { method: "DELETE" });
      loadInvites();
      setInviteLink("");
      showToast(t("settings", "inviteRevoked"), "success");
    } catch {
      showToast(t("settings", "errorGeneric"), "error");
    }
  }

  function loadInvites() {
    fetch("/api/workspaces/invite")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (Array.isArray(d)) setInvites(d); })
      .catch(() => {});
  }

  async function handleChangeRole(userId: string, workspaceRole: string) {
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, workspaceRole }),
      });
      loadUsers();
    } catch {
      showToast(t("settings", "errorGeneric"), "error");
    }
  }

  async function handleDeleteUser(id: string) {
    try {
      await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      loadUsers();
      showToast(t("settings", "memberRemoved"), "success");
    } catch {
      showToast(t("settings", "errorGeneric"), "error");
    }
  }

  // ─── Template handlers ─────────────────────────────

  async function handleCreateTemplate() {
    if (!newTemplateName.trim()) return;
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTemplateName,
          type: newTemplateType,
          subject: newTemplateSubject,
          body: newTemplateBody,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setNewTemplateName("");
      setNewTemplateType("custom");
      setNewTemplateSubject("");
      setNewTemplateBody("");
      setShowNewTemplate(false);
      loadTemplates();
      showToast(t("settings", "templateCreated"), "success");
    } catch {
      showToast(t("settings", "errorGeneric"), "error");
    }
  }

  async function handleUpdateTemplate() {
    if (!editingTemplate) return;
    try {
      await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTemplate.id,
          name: editingTemplate.name,
          subject: editingTemplate.subject,
          body: editingTemplate.body,
          isDefault: editingTemplate.isDefault,
        }),
      });
      setEditingTemplate(null);
      loadTemplates();
      showToast(t("settings", "templateUpdated"), "success");
    } catch {
      showToast(t("settings", "errorGeneric"), "error");
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
      loadTemplates();
      showToast(t("settings", "templateArchived"), "success");
    } catch {
      showToast(t("settings", "errorGeneric"), "error");
    }
  }

  // ─── Loading ───────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-6">
          <div className="w-52 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
          <div className="flex-1 space-y-4">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-12">
        <p className="text-foreground-muted">
          {t("settings", "cannotLoadSettings")}
        </p>
      </div>
    );
  }

  // ─── Render sections ───────────────────────────────

  function renderSection() {
    if (!settings) return null;

    switch (activeSection) {
      // === ENTREPRISE ===
      case "company":
        return (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* ── Informations de l'entreprise ── */}
            <SectionCard
              title={t("settings", "companyTitle")}
              description={t("settings", "companyDesc")}
              onSave={() => saveSection("company", settings.company)}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldGroup label={t("settings", "companyName")}>
                  <Input
                    value={settings.company.name}
                    onChange={(e) => updateField("company", "name", e.target.value)}
                    placeholder={t("settings", "companyNamePlaceholder")}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "contactEmail")}>
                  <Input
                    value={settings.company.email}
                    onChange={(e) => updateField("company", "email", e.target.value)}
                    type="email"
                    placeholder={t("settings", "contactEmailPlaceholder")}
                  />
                  {settings.company.email && (
                    <button
                      type="button"
                      onClick={() => setActiveSection("email")}
                      className="mt-1 text-xs text-accent hover:underline"
                    >
                      {locale === "en"
                        ? "Configure SMTP to send from this address →"
                        : "Configurer SMTP pour envoyer depuis cette adresse →"}
                    </button>
                  )}
                </FieldGroup>
                <FieldGroup label={t("settings", "phone")}>
                  <Input
                    value={settings.company.phone}
                    onChange={(e) => updateField("company", "phone", e.target.value)}
                    placeholder={t("settings", "phonePlaceholder")}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "website")}>
                  <Input
                    value={settings.company.website}
                    onChange={(e) => updateField("company", "website", e.target.value)}
                    placeholder={t("settings", "websitePlaceholder")}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "addressLabel")}>
                  <Input
                    value={settings.company.address}
                    onChange={(e) => updateField("company", "address", e.target.value)}
                    placeholder={t("settings", "addressPlaceholder")}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "city")}>
                  <Input
                    value={settings.company.city}
                    onChange={(e) => updateField("company", "city", e.target.value)}
                    placeholder={t("settings", "cityPlaceholder")}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "province")}>
                  <Input
                    value={settings.company.province}
                    onChange={(e) => updateField("company", "province", e.target.value)}
                    placeholder={t("settings", "provincePlaceholder")}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "postalCode")}>
                  <Input
                    value={settings.company.postalCode}
                    onChange={(e) => updateField("company", "postalCode", e.target.value)}
                    placeholder={t("settings", "postalCodePlaceholder")}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "country")}>
                  <Input
                    value={settings.company.country}
                    onChange={(e) => updateField("company", "country", e.target.value)}
                  />
                </FieldGroup>
              </div>
              <FieldGroup label={t("settings", "description")}>
                <TextArea
                  value={settings.company.description}
                  onChange={(v) => updateField("company", "description", v)}
                  placeholder={t("settings", "descriptionPlaceholder")}
                />
              </FieldGroup>
              <FieldGroup label={t("settings", "emailSignature")}>
                <TextArea
                  value={settings.company.emailSignature}
                  onChange={(v) => updateField("company", "emailSignature", v)}
                  placeholder={t("settings", "emailSignaturePlaceholder")}
                  rows={4}
                />
              </FieldGroup>
              <div className="bg-background-subtle rounded-lg p-3 mt-2">
                <p className="text-xs font-medium text-foreground-muted mb-1">
                  {t("settings", "availableVariables")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {["{{company_name}}", "{{company_email}}", "{{company_phone}}", "{{company_website}}", "{{company_address}}", "{{company_city}}"].map((v) => (
                    <span key={v} className="text-xs bg-card border border-border rounded px-2 py-1 text-foreground-muted font-mono">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* ── Email info ── */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-background-subtle border border-border text-xs text-foreground-muted">
              <Mail className="size-3.5 mt-0.5 shrink-0" />
              <span>
                {t("settings", "emailInfoNote")} <span className="font-medium text-foreground">{settings.company.email || t("settings", "emailInfoContact")}</span> {t("settings", "emailInfoSuffix")}
              </span>
            </div>
          </motion.div>
        );

      // === EMAIL / SMTP ===
      case "email": {
        const emailProvider = settings.email.provider || "gmail";
        const isSmtpProvider = emailProvider === "gmail" || emailProvider === "outlook" || emailProvider === "smtp";

        const providerConfigs: Record<string, { host: string; port: string; appPasswordUrl: string; label: string; instructions: string[] }> = {
          gmail: {
            host: "smtp.gmail.com",
            port: "587",
            appPasswordUrl: "https://myaccount.google.com/apppasswords",
            label: "Google",
            instructions: locale === "en" ? [
              "1. Click the link below to open Google App Passwords",
              "2. Sign in to your Google account if needed",
              "3. Enter a name (e.g. \"LeadNova\") and click \"Create\"",
              "4. Copy the 16-character password that appears",
              "5. Paste it in the \"App Password\" field below",
            ] : [
              "1. Cliquez sur le lien ci-dessous pour ouvrir les mots de passe d'application Google",
              "2. Connectez-vous à votre compte Google si nécessaire",
              "3. Entrez un nom (ex : « LeadNova ») et cliquez « Créer »",
              "4. Copiez le mot de passe de 16 caractères qui apparaît",
              "5. Collez-le dans le champ « Mot de passe d'application » ci-dessous",
            ],
          },
          outlook: {
            host: "smtp.office365.com",
            port: "587",
            appPasswordUrl: "https://account.live.com/proofs/AppPassword",
            label: "Microsoft",
            instructions: locale === "en" ? [
              "1. Click the link below to open Microsoft App Passwords",
              "2. Sign in to your Microsoft account",
              "3. Click \"Create a new app password\"",
              "4. Copy the generated password",
              "5. Paste it in the \"App Password\" field below",
            ] : [
              "1. Cliquez sur le lien ci-dessous pour ouvrir les mots de passe d'application Microsoft",
              "2. Connectez-vous à votre compte Microsoft",
              "3. Cliquez « Créer un nouveau mot de passe d'application »",
              "4. Copiez le mot de passe généré",
              "5. Collez-le dans le champ « Mot de passe d'application » ci-dessous",
            ],
          },
        };

        const currentConfig = providerConfigs[emailProvider];

        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title={locale === "en" ? "Email sending" : "Envoi d'emails"}
              description={locale === "en"
                ? "Connect your email account to send campaign emails directly from your address."
                : "Connectez votre compte email pour envoyer les emails de campagne directement depuis votre adresse."}
              onSave={() => {
                // Auto-fill host/port/user based on provider before saving
                const data = { ...settings.email };
                if (emailProvider === "gmail") {
                  data.smtpHost = "smtp.gmail.com";
                  data.smtpPort = "587";
                  if (!data.smtpUser) data.smtpUser = settings.company.email;
                } else if (emailProvider === "outlook") {
                  data.smtpHost = "smtp.office365.com";
                  data.smtpPort = "587";
                  if (!data.smtpUser) data.smtpUser = settings.company.email;
                }
                saveSection("email", data);
              }}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <div className="space-y-5">
                {/* Missing contact email warning */}
                {!settings.company.email && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-warning-subtle border border-warning/20">
                    <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground-secondary">
                      {locale === "en"
                        ? "No Contact Email set. "
                        : "Aucun email de contact configuré. "}
                      <button
                        type="button"
                        onClick={() => setActiveSection("company")}
                        className="text-accent underline font-medium"
                      >
                        {locale === "en" ? "Go to Company settings →" : "Aller dans Entreprise →"}
                      </button>
                    </p>
                  </div>
                )}

                {/* Provider selection — visual cards */}
                <div>
                  <p className="block text-sm font-medium text-foreground-secondary mb-2">
                    {locale === "en" ? "Email provider" : "Fournisseur email"}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "gmail", label: "Gmail" },
                      { id: "outlook", label: "Outlook" },
                      { id: "smtp", label: locale === "en" ? "Custom SMTP" : "SMTP personnalisé" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const cfg = providerConfigs[p.id];
                          const updatedEmail = {
                            ...settings.email,
                            provider: p.id,
                            ...(cfg ? {
                              smtpHost: cfg.host,
                              smtpPort: cfg.port,
                              smtpUser: settings.email.smtpUser || settings.company.email || "",
                            } : {}),
                          };
                          setSettings({ ...settings, email: updatedEmail });
                          setHasUnsaved(true);
                        }}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-sm font-medium cursor-pointer",
                          emailProvider === p.id
                            ? "border-accent bg-accent-subtle text-foreground"
                            : "border-border bg-card hover:border-foreground-muted/30 text-foreground-secondary"
                        )}
                      >
                        {p.id === "gmail" && (
                          <svg className="size-6" viewBox="0 0 24 24">
                            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
                          </svg>
                        )}
                        {p.id === "outlook" && (
                          <svg className="size-6" viewBox="0 0 24 24">
                            <path d="M24 7.387v10.478c0 .23-.08.424-.238.576a.806.806 0 01-.588.234h-8.42v-6.56l1.678 1.2a.272.272 0 00.31 0L24 7.387zm-9.246 5.157V5.811l.37-.249h8.05c.23 0 .424.08.588.234.164.155.238.35.238.576v.725l-7.249 5.197-1.997-1.75z" fill="#0072C6"/>
                            <path d="M7.254 8.348c.375-.553.877-.83 1.508-.83.591 0 1.073.267 1.448.8.375.534.563 1.227.563 2.08 0 .88-.191 1.594-.574 2.143-.383.55-.882.824-1.497.824-.591 0-1.073-.267-1.448-.8-.375-.534-.563-1.234-.563-2.1 0-.86.188-1.564.563-2.117zM0 3.932l8.674-1.25v18.636L0 20.068V3.932zm9.14 9.278c.56-.838.84-1.894.84-3.168 0-1.235-.266-2.26-.797-3.076-.531-.815-1.263-1.222-2.195-1.222-.946 0-1.688.4-2.226 1.2-.538.8-.806 1.836-.806 3.108 0 1.235.26 2.253.78 3.055.52.802 1.246 1.203 2.178 1.203.959 0 1.713-.367 2.226-1.1z" fill="#0072C6"/>
                          </svg>
                        )}
                        {p.id === "smtp" && (
                          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2"/>
                            <path d="M2 7l10 7 10-7"/>
                          </svg>
                        )}
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Provider-specific instructions (Gmail / Outlook) */}
                {currentConfig && (
                  <div className="p-4 rounded-lg border border-accent/20 bg-accent-subtle space-y-3">
                    <div className="flex items-center gap-2">
                      <Info className="size-4 text-accent shrink-0" />
                      <p className="text-sm font-medium text-foreground">
                        {locale === "en"
                          ? `How to connect your ${currentConfig.label} account`
                          : `Comment connecter votre compte ${currentConfig.label}`}
                      </p>
                    </div>
                    <ol className="text-xs text-foreground-secondary space-y-1 ml-1">
                      {currentConfig.instructions.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                    <a
                      href={currentConfig.appPasswordUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      <Link2 className="size-3.5" />
                      {locale === "en"
                        ? `Open ${currentConfig.label} App Passwords`
                        : `Ouvrir les mots de passe d'application ${currentConfig.label}`}
                    </a>
                  </div>
                )}

                {/* SMTP fields */}
                {isSmtpProvider && (
                  <div className="space-y-4">
                    {/* Host & Port — hidden for Gmail/Outlook since auto-configured */}
                    {emailProvider === "smtp" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FieldGroup label={locale === "en" ? "SMTP Server" : "Serveur SMTP"}>
                          <Input
                            value={settings.email.smtpHost}
                            onChange={(e) => updateField("email", "smtpHost", e.target.value)}
                            placeholder="smtp.example.com"
                          />
                        </FieldGroup>
                        <FieldGroup label="Port">
                          <Input
                            value={settings.email.smtpPort}
                            onChange={(e) => updateField("email", "smtpPort", e.target.value)}
                            placeholder="587"
                          />
                        </FieldGroup>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FieldGroup label={locale === "en" ? "Email address" : "Adresse email"}>
                        <Input
                          value={settings.email.smtpUser}
                          onChange={(e) => updateField("email", "smtpUser", e.target.value)}
                          placeholder={settings.company.email || "votre@email.com"}
                        />
                      </FieldGroup>
                      <FieldGroup label={locale === "en" ? "App Password" : "Mot de passe d'application"}>
                        <Input
                          type="password"
                          value={settings.email.smtpPass}
                          onChange={(e) => updateField("email", "smtpPass", e.target.value)}
                          placeholder="••••••••"
                        />
                      </FieldGroup>
                    </div>

                    {/* Test button */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        // Build the final SMTP config to test
                        const testData = { ...settings.email };
                        if (emailProvider === "gmail") {
                          testData.smtpHost = "smtp.gmail.com";
                          testData.smtpPort = "587";
                          testData.provider = "smtp";
                        } else if (emailProvider === "outlook") {
                          testData.smtpHost = "smtp.office365.com";
                          testData.smtpPort = "587";
                          testData.provider = "smtp";
                        }
                        try {
                          const res = await fetch("/api/settings/test-smtp", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(testData),
                          });
                          const data = await res.json();
                          if (data.success) {
                            showToast(locale === "en" ? "Connection successful! You can send emails." : "Connexion réussie ! Vous pouvez envoyer des emails.", "success");
                          } else {
                            showToast(data.error || (locale === "en" ? "Connection failed" : "Connexion échouée"), "error");
                          }
                        } catch {
                          showToast(locale === "en" ? "Connection error" : "Erreur de connexion", "error");
                        }
                      }}
                    >
                      <Send className="size-3.5 mr-1.5" />
                      {locale === "en" ? "Test connection" : "Tester la connexion"}
                    </Button>
                  </div>
                )}
              </div>
            </SectionCard>
          </motion.div>
        );
      }

      // === EQUIPE ===
      case "team":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Invite link section */}
            <SectionCard
              title={t("settings", "inviteMembers")}
              description={t("settings", "inviteMembersDesc")}
            >
              <div className="space-y-3">
                {inviteLink ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={inviteLink}
                      readOnly
                      className="text-xs font-mono flex-1"
                    />
                    <Button onClick={handleCopyInvite} size="sm" variant={inviteCopied ? "success" : "secondary"}>
                      {inviteCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {inviteCopied ? t("settings", "copied") : t("settings", "copy")}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleGenerateInvite} size="sm" disabled={generatingInvite}>
                    <Link2 className="size-4" />
                    {generatingInvite ? t("settings", "generating") : t("settings", "generateInviteLink")}
                  </Button>
                )}
                {invites.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <p className="text-xs text-foreground-muted font-medium">{t("settings", "activeInvites")}</p>
                    {invites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between text-xs p-2 rounded bg-background-subtle">
                        <div className="flex items-center gap-2 text-foreground-secondary">
                          <Link2 className="size-3" />
                          <span>{t("settings", "roleLabel")}: {inv.role === "ADMIN" ? t("settings", "roleAdmin") : t("settings", "roleMember")}</span>
                          <span className="text-foreground-muted">
                            — {t("settings", "expiresOn")} {new Date(inv.expiresAt).toLocaleDateString("fr-CA")}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="text-danger hover:text-danger/80 p-1"
                          title={t("settings", "revoke")}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Members list */}
            <SectionCard
              title={t("settings", "workspaceMembers")}
              description={t("settings", "workspaceMembersDesc")}
            >
              {users.length === 0 ? (
                <p className="text-foreground-muted text-sm py-4">
                  {t("settings", "noMembers")}
                </p>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${u.active ? "bg-primary" : "bg-muted"}`}
                        >
                          {u.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {u.name}{" "}
                            {u.workspaceRole === "OWNER" && (
                              <span className="text-xs text-primary font-normal">({t("settings", "owner")})</span>
                            )}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            {u.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.workspaceRole !== "OWNER" && (
                          <>
                            <Select
                              value={u.workspaceRole || "MEMBER"}
                              onChange={(e) =>
                                handleChangeRole(u.id, e.target.value)
                              }
                              className="text-xs h-7 px-2 py-1"
                            >
                              <option value="ADMIN">{t("settings", "roleAdmin")}</option>
                              <option value="MEMBER">{t("settings", "roleMember")}</option>
                            </Select>
                            <Button
                              onClick={() => handleDeleteUser(u.id)}
                              variant="danger-ghost"
                              size="sm"
                            >
                              {t("settings", "removeBtn")}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </motion.div>
        );

      // === PROSPECTS ===
      case "prospects":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <SectionCard
              title={t("settings", "prospectsTitle")}
              description={t("settings", "prospectsDesc")}
              onSave={() => saveSection("prospects", settings.prospects)}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldGroup label={t("settings", "defaultContactType")}>
                  <Select
                    value={settings.prospects.defaultContactType}
                    onChange={(e) =>
                      updateField(
                        "prospects",
                        "defaultContactType",
                        e.target.value
                      )
                    }
                  >
                    <option value="prospect">{t("settings", "optionProspect")}</option>
                    <option value="client">{t("settings", "optionClient")}</option>
                    <option value="nouveau_client">{t("settings", "optionNewClient")}</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label={t("settings", "defaultSource")}>
                  <Select
                    value={settings.prospects.defaultSource}
                    onChange={(e) =>
                      updateField(
                        "prospects",
                        "defaultSource",
                        e.target.value
                      )
                    }
                  >
                    <option value="google_search">Google Search</option>
                    <option value="manual">{t("settings", "optionManual")}</option>
                    <option value="import">{t("settings", "optionImport")}</option>
                    <option value="referral">{t("settings", "optionReferral")}</option>
                  </Select>
                </FieldGroup>
              </div>
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-sm font-medium text-foreground-secondary mb-2">
                  {t("settings", "deduplication")}
                </p>
                <Toggle
                  checked={settings.prospects.blockDuplicateEmail}
                  onChange={(v) =>
                    updateField("prospects", "blockDuplicateEmail", v)
                  }
                  label={t("settings", "blockDuplicateEmail")}
                />
                <Toggle
                  checked={settings.prospects.blockDuplicatePhone}
                  onChange={(v) =>
                    updateField("prospects", "blockDuplicatePhone", v)
                  }
                  label={t("settings", "blockDuplicatePhone")}
                />
                <Toggle
                  checked={settings.prospects.autoMerge}
                  onChange={(v) =>
                    updateField("prospects", "autoMerge", v)
                  }
                  label={t("settings", "autoMerge")}
                />
              </div>
            </SectionCard>

            {/* Garbage city cleaner */}
            <SectionCard
              title={t("settings", "cityCleaner")}
              description={t("settings", "cityCleanerDesc")}
            >
              <div className="flex items-center gap-3 mb-4">
                <Button
                  onClick={detectGarbage}
                  variant="secondary"
                  size="sm"
                  disabled={garbageLoading}
                >
                  {garbageLoading ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <MapPin className="size-4" />
                  )}
                  {garbageLoading ? t("settings", "scanning") : t("settings", "scanCities")}
                </Button>
                {garbageScanned && garbageCities.length === 0 && (
                  <span className="text-sm text-success flex items-center gap-1.5">
                    <Check className="size-4" /> {t("settings", "noInvalidCities")}
                  </span>
                )}
                {garbageScanned && garbageCities.length > 0 && (
                  <span className="text-sm text-warning flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> {garbageCities.length} {garbageCities.length > 1 ? t("settings", "suspectCityPlural") : t("settings", "suspectCitySingular")}
                  </span>
                )}
              </div>

              <AnimatePresence>
                {garbageCities.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border border-border rounded-lg overflow-hidden mb-3">
                      <div className="flex items-center justify-between px-3 py-2 bg-background-subtle border-b border-border">
                        <label className="flex items-center gap-2 text-sm text-foreground-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={garbageSelected.size === garbageCities.length}
                            onChange={(e) =>
                              setGarbageSelected(
                                e.target.checked
                                  ? new Set(garbageCities.map((g) => g.city))
                                  : new Set()
                              )
                            }
                            className="rounded"
                          />
                          {t("settings", "selectAll")}
                        </label>
                        <span className="text-xs text-foreground-muted">{garbageSelected.size} {garbageSelected.size > 1 ? t("settings", "selectedCountPlural") : t("settings", "selectedCount")}</span>
                      </div>
                      <div className="divide-y divide-border max-h-64 overflow-y-auto">
                        {garbageCities.map(({ city, count }) => (
                          <label key={city} className="flex items-center gap-3 px-3 py-2 hover:bg-background-subtle cursor-pointer">
                            <input
                              type="checkbox"
                              checked={garbageSelected.has(city)}
                              onChange={(e) => {
                                const next = new Set(garbageSelected);
                                e.target.checked ? next.add(city) : next.delete(city);
                                setGarbageSelected(next);
                              }}
                              className="rounded flex-shrink-0"
                            />
                            <span className="text-sm text-foreground flex-1 font-mono truncate">{city}</span>
                            <Badge variant="warning">{count} prospect{count > 1 ? "s" : ""}</Badge>
                          </label>
                        ))}
                      </div>
                    </div>
                    <Button
                      onClick={clearGarbage}
                      variant="danger-ghost"
                      size="sm"
                      disabled={garbageSelected.size === 0 || garbageClearing}
                    >
                      {garbageClearing ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      {garbageClearing
                        ? t("settings", "deleting")
                        : `${t("settings", "clearCityFor")} ${garbageSelected.size} ${garbageSelected.size > 1 ? t("settings", "entryPlural") : t("settings", "entry")}`}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </SectionCard>
          </motion.div>
        );

      // === CAMPAGNES ===
      case "campaigns":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title={t("settings", "campaignsTitle")}
              description={t("settings", "campaignsDesc")}
              onSave={() => saveSection("campaigns", settings.campaigns)}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldGroup label={t("settings", "dailyLimit")}>
                  <Input
                    type="number"
                    value={settings.campaigns.dailyLimit}
                    onChange={(e) =>
                      updateField(
                        "campaigns",
                        "dailyLimit",
                        Number(e.target.value)
                      )
                    }
                    min={1}
                    max={500}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "maxContactsPerBatch")}>
                  <Input
                    type="number"
                    value={settings.campaigns.maxContactsPerBatch}
                    onChange={(e) =>
                      updateField(
                        "campaigns",
                        "maxContactsPerBatch",
                        Number(e.target.value)
                      )
                    }
                    min={1}
                    max={200}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "delayMin")}>
                  <Input
                    type="number"
                    value={settings.campaigns.defaultDelayMin}
                    onChange={(e) =>
                      updateField(
                        "campaigns",
                        "defaultDelayMin",
                        Number(e.target.value)
                      )
                    }
                    min={30}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "delayMax")}>
                  <Input
                    type="number"
                    value={settings.campaigns.defaultDelayMax}
                    onChange={(e) =>
                      updateField(
                        "campaigns",
                        "defaultDelayMax",
                        Number(e.target.value)
                      )
                    }
                    min={60}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "sendStartHour")}>
                  <Input
                    type="number"
                    value={settings.campaigns.sendStartHour}
                    onChange={(e) =>
                      updateField(
                        "campaigns",
                        "sendStartHour",
                        Number(e.target.value)
                      )
                    }
                    min={0}
                    max={23}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "sendEndHour")}>
                  <Input
                    type="number"
                    value={settings.campaigns.sendEndHour}
                    onChange={(e) =>
                      updateField(
                        "campaigns",
                        "sendEndHour",
                        Number(e.target.value)
                      )
                    }
                    min={0}
                    max={23}
                  />
                </FieldGroup>
                <FieldGroup label={t("settings", "timezoneLabel")}>
                  <Select
                    value={settings.campaigns.timezone}
                    onChange={(e) =>
                      updateField("campaigns", "timezone", e.target.value)
                    }
                  >
                    <option value="America/Montreal">
                      Montréal (EST)
                    </option>
                    <option value="America/Toronto">Toronto (EST)</option>
                    <option value="America/Vancouver">
                      Vancouver (PST)
                    </option>
                    <option value="Europe/Paris">Paris (CET)</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label={t("settings", "defaultStatus")}>
                  <Select
                    value={settings.campaigns.defaultStatus}
                    onChange={(e) =>
                      updateField(
                        "campaigns",
                        "defaultStatus",
                        e.target.value
                      )
                    }
                  >
                    <option value="DRAFT">{t("settings", "optionDraft")}</option>
                    <option value="ACTIVE">{t("settings", "optionActive")}</option>
                    <option value="PAUSED">{t("settings", "optionPaused")}</option>
                  </Select>
                </FieldGroup>
              </div>
              <div className="border-t border-border pt-4 mt-2">
                <Toggle
                  checked={settings.campaigns.pauseOnError}
                  onChange={(v) =>
                    updateField("campaigns", "pauseOnError", v)
                  }
                  label={t("settings", "pauseOnError")}
                />
              </div>
            </SectionCard>
          </motion.div>
        );

      // === AUTOMATISATION ===
      case "automation":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title={t("settings", "automationTitle")}
              description={t("settings", "automationDesc")}
              onSave={() => saveSection("automation", settings.automation)}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <div className="space-y-1">
                <Toggle
                  checked={settings.automation.autoFollowUp}
                  onChange={(v) =>
                    updateField("automation", "autoFollowUp", v)
                  }
                  label={t("settings", "autoFollowUp")}
                />
                <Toggle
                  checked={settings.automation.autoReminder}
                  onChange={(v) =>
                    updateField("automation", "autoReminder", v)
                  }
                  label={t("settings", "autoReminder")}
                />
                <Toggle
                  checked={settings.automation.internalNotifications}
                  onChange={(v) =>
                    updateField("automation", "internalNotifications", v)
                  }
                  label={t("settings", "internalNotifications")}
                />
                <Toggle
                  checked={settings.automation.errorAlerts}
                  onChange={(v) =>
                    updateField("automation", "errorAlerts", v)
                  }
                  label={t("settings", "errorAlerts")}
                />
              </div>
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-sm font-medium text-foreground-secondary mb-3">
                  {t("settings", "followUpSettings")}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FieldGroup label={t("settings", "followUpDelayDays")}>
                    <Input
                      type="number"
                      value={settings.automation.followUpDelayDays}
                      onChange={(e) =>
                        updateField(
                          "automation",
                          "followUpDelayDays",
                          Number(e.target.value)
                        )
                      }
                      min={1}
                      max={30}
                    />
                  </FieldGroup>
                  <FieldGroup label={t("settings", "maxFollowUps")}>
                    <Input
                      type="number"
                      value={settings.automation.maxFollowUps}
                      onChange={(e) =>
                        updateField(
                          "automation",
                          "maxFollowUps",
                          Number(e.target.value)
                        )
                      }
                      min={0}
                      max={10}
                    />
                  </FieldGroup>
                  <FieldGroup label={t("settings", "followUpIntervalDays")}>
                    <Input
                      type="number"
                      value={settings.automation.followUpIntervalDays}
                      onChange={(e) =>
                        updateField(
                          "automation",
                          "followUpIntervalDays",
                          Number(e.target.value)
                        )
                      }
                      min={1}
                      max={30}
                    />
                  </FieldGroup>
                </div>
                <div className="mt-3">
                  <Toggle
                    checked={settings.automation.stopOnReply}
                    onChange={(v) =>
                      updateField("automation", "stopOnReply", v)
                    }
                    label={t("settings", "stopOnReply")}
                  />
                  <Toggle
                    checked={settings.automation.stopOnExcluded}
                    onChange={(v) =>
                      updateField("automation", "stopOnExcluded", v)
                    }
                    label={t("settings", "stopOnExcluded")}
                  />
                  <Toggle
                    checked={settings.automation.skipWeekends}
                    onChange={(v) =>
                      updateField("automation", "skipWeekends", v)
                    }
                    label={t("settings", "skipWeekends")}
                  />
                </div>
              </div>
            </SectionCard>
          </motion.div>
        );

      // === CIBLAGE RECHERCHE ===
      case "targeting":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title={t("settings", "targetingTitle")}
              description={t("settings", "targetingDesc")}
            >
              {/* Mots-cles */}
              <div>
                <p className="text-sm font-medium text-foreground-secondary mb-2">
                  {t("settings", "searchKeywords")}
                </p>
                <p className="text-xs text-muted mb-3">
                  {t("settings", "searchKeywordsDesc")}
                </p>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newKeyword.trim()) {
                        e.preventDefault();
                        if (
                          !settings.targeting.keywords.includes(
                            newKeyword.trim()
                          )
                        ) {
                          const updated = [
                            ...settings.targeting.keywords,
                            newKeyword.trim(),
                          ];
                          setSettings({
                            ...settings,
                            targeting: {
                              ...settings.targeting,
                              keywords: updated,
                            },
                          });
                          setHasUnsaved(true);
                        }
                        setNewKeyword("");
                      }
                    }}
                    placeholder={t("settings", "addKeywordPlaceholder")}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (
                        newKeyword.trim() &&
                        !settings.targeting.keywords.includes(
                          newKeyword.trim()
                        )
                      ) {
                        const updated = [
                          ...settings.targeting.keywords,
                          newKeyword.trim(),
                        ];
                        setSettings({
                          ...settings,
                          targeting: {
                            ...settings.targeting,
                            keywords: updated,
                          },
                        });
                        setHasUnsaved(true);
                      }
                      setNewKeyword("");
                    }}
                    size="sm"
                  >
                    {t("settings", "addBtn")}
                  </Button>
                  <Button
                    onClick={() =>
                      setShowBulkKeywords(!showBulkKeywords)
                    }
                    variant="secondary"
                    size="sm"
                    className={
                      showBulkKeywords
                        ? "border-primary text-primary"
                        : ""
                    }
                    title={t("settings", "pasteBulkKeywordsTitle")}
                  >
                    {t("settings", "pasteBulk")}
                  </Button>
                  <AiAssistButton
                    type="keywords"
                    color="blue"
                    currentItems={settings.targeting.keywords}
                    onApply={({ add, remove }) => {
                      let updated = settings.targeting.keywords.filter(
                        (k) => !remove.includes(k)
                      );
                      const newOnes = add.filter(
                        (k) => !updated.includes(k)
                      );
                      updated = [...updated, ...newOnes];
                      setSettings({
                        ...settings,
                        targeting: {
                          ...settings.targeting,
                          keywords: updated,
                        },
                      });
                      setHasUnsaved(true);
                    }}
                  />
                </div>
                <AnimatePresence>
                  {showBulkKeywords && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mb-3 p-3 bg-primary-subtle border border-border rounded-lg">
                        <p className="text-xs text-primary mb-2">
                          {t("settings", "pasteBulkKeywordsDesc")}
                        </p>
                        <textarea
                          value={bulkKeywords}
                          onChange={(e) =>
                            setBulkKeywords(e.target.value)
                          }
                          placeholder={
                            "gestion immobilière, property management\ncondo management; facility management\ngestion d'immeubles"
                          }
                          rows={4}
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-input text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-y mb-2"
                        />
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted">
                            {parseBulkInput(bulkKeywords).length > 0
                              ? `${parseBulkInput(bulkKeywords).length} ${t("settings", "keywordsDetected")}`
                              : t("settings", "noItemDetected")}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                setBulkKeywords("");
                                setShowBulkKeywords(false);
                              }}
                              variant="ghost"
                              size="sm"
                            >
                              {t("settings", "cancelBtn")}
                            </Button>
                            <Button
                              onClick={handleBulkAddKeywords}
                              disabled={
                                parseBulkInput(bulkKeywords).length === 0
                              }
                              size="sm"
                            >
                              {t("settings", "addBtn")}{" "}
                              {parseBulkInput(bulkKeywords).length > 0
                                ? `(${parseBulkInput(bulkKeywords).length})`
                                : ""}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex flex-wrap gap-2">
                  {settings.targeting.keywords.length === 0 ? (
                    <p className="text-sm text-muted italic">
                      {t("settings", "noKeywordsConfigured")}
                    </p>
                  ) : (
                    settings.targeting.keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 bg-primary-subtle text-primary border border-border rounded-full px-3 py-1.5 text-sm"
                      >
                        {kw}
                        <button
                          onClick={() => {
                            const updated =
                              settings.targeting.keywords.filter(
                                (_, idx) => idx !== i
                              );
                            setSettings({
                              ...settings,
                              targeting: {
                                ...settings.targeting,
                                keywords: updated,
                              },
                            });
                            setHasUnsaved(true);
                          }}
                          className="text-primary/60 hover:text-primary ml-0.5"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-border my-2" />

              {/* Mots-cles bloques */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Ban className="size-4 text-danger" />
                  <p className="text-sm font-medium text-foreground-secondary">
                    Mots-clés bloqués
                  </p>
                </div>
                <p className="text-xs text-muted mb-3">
                  Les prospects contenant ces mots-clés seront automatiquement exclus lors du scraping et de la découverte.
                </p>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={newBlockedKeyword}
                    onChange={(e) => setNewBlockedKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newBlockedKeyword.trim()) {
                        e.preventDefault();
                        if (
                          !settings.targeting.blockedKeywords.includes(
                            newBlockedKeyword.trim()
                          )
                        ) {
                          const updated = [
                            ...settings.targeting.blockedKeywords,
                            newBlockedKeyword.trim(),
                          ];
                          setSettings({
                            ...settings,
                            targeting: {
                              ...settings.targeting,
                              blockedKeywords: updated,
                            },
                          });
                          setHasUnsaved(true);
                        }
                        setNewBlockedKeyword("");
                      }
                    }}
                    placeholder="Ajouter un mot-clé à bloquer..."
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (
                        newBlockedKeyword.trim() &&
                        !settings.targeting.blockedKeywords.includes(
                          newBlockedKeyword.trim()
                        )
                      ) {
                        const updated = [
                          ...settings.targeting.blockedKeywords,
                          newBlockedKeyword.trim(),
                        ];
                        setSettings({
                          ...settings,
                          targeting: {
                            ...settings.targeting,
                            blockedKeywords: updated,
                          },
                        });
                        setHasUnsaved(true);
                      }
                      setNewBlockedKeyword("");
                    }}
                    size="sm"
                    variant="danger"
                  >
                    {t("settings", "addBtn")}
                  </Button>
                  <Button
                    onClick={() =>
                      setShowBulkBlockedKeywords(!showBulkBlockedKeywords)
                    }
                    variant="secondary"
                    size="sm"
                    className={
                      showBulkBlockedKeywords
                        ? "border-danger text-danger"
                        : ""
                    }
                    title="Coller une liste de mots-clés bloqués"
                  >
                    {t("settings", "pasteBulk")}
                  </Button>
                  <AiAssistButton
                    type="keywords"
                    color="red"
                    currentItems={settings.targeting.blockedKeywords}
                    onApply={({ add, remove }) => {
                      let updated = settings.targeting.blockedKeywords.filter(
                        (k) => !remove.includes(k)
                      );
                      const newOnes = add.filter(
                        (k) => !updated.includes(k)
                      );
                      updated = [...updated, ...newOnes];
                      setSettings({
                        ...settings,
                        targeting: {
                          ...settings.targeting,
                          blockedKeywords: updated,
                        },
                      });
                      setHasUnsaved(true);
                    }}
                  />
                </div>
                <AnimatePresence>
                  {showBulkBlockedKeywords && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mb-3 p-3 bg-danger-subtle border border-border rounded-lg">
                        <p className="text-xs text-danger mb-2">
                          Collez vos mots-clés bloqués séparés par des virgules, points-virgules ou retours à la ligne.
                        </p>
                        <textarea
                          value={bulkBlockedKeywords}
                          onChange={(e) =>
                            setBulkBlockedKeywords(e.target.value)
                          }
                          placeholder={
                            "déménagement, plomberie\nélectricien; chauffage"
                          }
                          rows={4}
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-input text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-y mb-2"
                        />
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted">
                            {parseBulkInput(bulkBlockedKeywords).length > 0
                              ? `${parseBulkInput(bulkBlockedKeywords).length} ${t("settings", "keywordsDetected")}`
                              : t("settings", "noItemDetected")}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                setBulkBlockedKeywords("");
                                setShowBulkBlockedKeywords(false);
                              }}
                              variant="ghost"
                              size="sm"
                            >
                              {t("settings", "cancelBtn")}
                            </Button>
                            <Button
                              onClick={handleBulkAddBlockedKeywords}
                              disabled={
                                parseBulkInput(bulkBlockedKeywords).length === 0
                              }
                              variant="danger"
                              size="sm"
                            >
                              {t("settings", "addBtn")}{" "}
                              {parseBulkInput(bulkBlockedKeywords).length > 0
                                ? `(${parseBulkInput(bulkBlockedKeywords).length})`
                                : ""}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex flex-wrap gap-2">
                  {settings.targeting.blockedKeywords.length === 0 ? (
                    <p className="text-sm text-muted italic">
                      Aucun mot-clé bloqué configuré
                    </p>
                  ) : (
                    settings.targeting.blockedKeywords.map((kw, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 bg-danger-subtle text-danger border border-border rounded-full px-3 py-1.5 text-sm"
                      >
                        {kw}
                        <button
                          onClick={() => {
                            const updated =
                              settings.targeting.blockedKeywords.filter(
                                (_, idx) => idx !== i
                              );
                            setSettings({
                              ...settings,
                              targeting: {
                                ...settings.targeting,
                                blockedKeywords: updated,
                              },
                            });
                            setHasUnsaved(true);
                          }}
                          className="text-danger/60 hover:text-danger ml-0.5"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-border my-2" />

              {/* Villes */}
              <div>
                <p className="text-sm font-medium text-foreground-secondary mb-2">
                  {t("settings", "targetCities")}
                </p>
                <p className="text-xs text-muted mb-3">
                  {t("settings", "targetCitiesDesc")}
                </p>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCity.trim()) {
                        e.preventDefault();
                        if (
                          !settings.targeting.cities.includes(
                            newCity.trim()
                          )
                        ) {
                          const updated = [
                            ...settings.targeting.cities,
                            newCity.trim(),
                          ];
                          setSettings({
                            ...settings,
                            targeting: {
                              ...settings.targeting,
                              cities: updated,
                            },
                          });
                          setHasUnsaved(true);
                        }
                        setNewCity("");
                      }
                    }}
                    placeholder={t("settings", "addCityPlaceholder")}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (
                        newCity.trim() &&
                        !settings.targeting.cities.includes(
                          newCity.trim()
                        )
                      ) {
                        const updated = [
                          ...settings.targeting.cities,
                          newCity.trim(),
                        ];
                        setSettings({
                          ...settings,
                          targeting: {
                            ...settings.targeting,
                            cities: updated,
                          },
                        });
                        setHasUnsaved(true);
                      }
                      setNewCity("");
                    }}
                    size="sm"
                  >
                    {t("settings", "addBtn")}
                  </Button>
                  <Button
                    onClick={() => setShowBulkCities(!showBulkCities)}
                    variant="secondary"
                    size="sm"
                    className={
                      showBulkCities
                        ? "border-success text-success"
                        : ""
                    }
                    title={t("settings", "pasteBulkCitiesTitle")}
                  >
                    {t("settings", "pasteBulk")}
                  </Button>
                  <AiAssistButton
                    type="cities"
                    color="green"
                    currentItems={settings.targeting.cities}
                    onApply={({ add, remove }) => {
                      let updated = settings.targeting.cities.filter(
                        (c) => !remove.includes(c)
                      );
                      const newOnes = add.filter(
                        (c) => !updated.includes(c)
                      );
                      updated = [...updated, ...newOnes];
                      setSettings({
                        ...settings,
                        targeting: {
                          ...settings.targeting,
                          cities: updated,
                        },
                      });
                      setHasUnsaved(true);
                    }}
                  />
                </div>
                <AnimatePresence>
                  {showBulkCities && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mb-3 p-3 bg-success-subtle border border-border rounded-lg">
                        <p className="text-xs text-success mb-2">
                          {t("settings", "pasteBulkCitiesDesc")}
                        </p>
                        <textarea
                          value={bulkCities}
                          onChange={(e) =>
                            setBulkCities(e.target.value)
                          }
                          placeholder={
                            "Montréal, Québec, Sherbrooke\nTrois-Rivières; Drummondville\nGranby, Laval, Longueuil"
                          }
                          rows={4}
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-input text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-y mb-2"
                        />
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted">
                            {parseBulkInput(bulkCities).length > 0
                              ? `${parseBulkInput(bulkCities).length} ${t("settings", "citiesDetected")}`
                              : t("settings", "noItemDetected")}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                setBulkCities("");
                                setShowBulkCities(false);
                              }}
                              variant="ghost"
                              size="sm"
                            >
                              {t("settings", "cancelBtn")}
                            </Button>
                            <Button
                              onClick={handleBulkAddCities}
                              disabled={
                                parseBulkInput(bulkCities).length === 0
                              }
                              variant="success"
                              size="sm"
                            >
                              {t("settings", "addBtn")}{" "}
                              {parseBulkInput(bulkCities).length > 0
                                ? `(${parseBulkInput(bulkCities).length})`
                                : ""}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex flex-wrap gap-2">
                  {settings.targeting.cities.length === 0 ? (
                    <p className="text-sm text-muted italic">
                      {t("settings", "noCitiesConfigured")}
                    </p>
                  ) : (
                    settings.targeting.cities.map((city, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 bg-success-subtle text-success border border-border rounded-full px-3 py-1.5 text-sm"
                      >
                        {city}
                        <button
                          onClick={() => {
                            const updated =
                              settings.targeting.cities.filter(
                                (_, idx) => idx !== i
                              );
                            setSettings({
                              ...settings,
                              targeting: {
                                ...settings.targeting,
                                cities: updated,
                              },
                            });
                            setHasUnsaved(true);
                          }}
                          className="text-success/60 hover:text-success ml-0.5"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t border-border my-2" />

              {/* Requetes de recherche */}
              <div>
                <p className="text-sm font-medium text-foreground-secondary mb-2">
                  {t("settings", "searchQueries")}
                </p>
                <p className="text-xs text-muted mb-3">
                  {t("settings", "searchQueriesDesc")}{" "}
                  <span className="font-mono bg-background-subtle px-1 rounded">
                    {"{city}"}
                  </span>{" "}
                  {t("settings", "searchQueriesDescSuffix")}
                </p>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newQuery.trim()) {
                        e.preventDefault();
                        if (
                          !settings.targeting.searchQueries.includes(
                            newQuery.trim()
                          )
                        ) {
                          const updated = [
                            ...settings.targeting.searchQueries,
                            newQuery.trim(),
                          ];
                          setSettings({
                            ...settings,
                            targeting: {
                              ...settings.targeting,
                              searchQueries: updated,
                            },
                          });
                          setHasUnsaved(true);
                        }
                        setNewQuery("");
                      }
                    }}
                    placeholder={t("settings", "addQueryPlaceholder")}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (
                        newQuery.trim() &&
                        !settings.targeting.searchQueries.includes(
                          newQuery.trim()
                        )
                      ) {
                        const updated = [
                          ...settings.targeting.searchQueries,
                          newQuery.trim(),
                        ];
                        setSettings({
                          ...settings,
                          targeting: {
                            ...settings.targeting,
                            searchQueries: updated,
                          },
                        });
                        setHasUnsaved(true);
                      }
                      setNewQuery("");
                    }}
                    size="sm"
                  >
                    {t("settings", "addBtn")}
                  </Button>
                  <AiAssistButton
                    type="queries"
                    color="purple"
                    currentItems={settings.targeting.searchQueries}
                    onApply={({ add, remove }) => {
                      let updated =
                        settings.targeting.searchQueries.filter(
                          (q) => !remove.includes(q)
                        );
                      const newOnes = add.filter(
                        (q) => !updated.includes(q)
                      );
                      updated = [...updated, ...newOnes];
                      setSettings({
                        ...settings,
                        targeting: {
                          ...settings.targeting,
                          searchQueries: updated,
                        },
                      });
                      setHasUnsaved(true);
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {settings.targeting.searchQueries.length === 0 ? (
                    <p className="text-sm text-muted italic">
                      {t("settings", "noQueriesConfigured")}
                    </p>
                  ) : (
                    settings.targeting.searchQueries.map((q, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 bg-accent-subtle text-accent border border-border rounded-full px-3 py-1.5 text-sm"
                      >
                        {q}
                        <button
                          onClick={() => {
                            const updated =
                              settings.targeting.searchQueries.filter(
                                (_, idx) => idx !== i
                              );
                            setSettings({
                              ...settings,
                              targeting: {
                                ...settings.targeting,
                                searchQueries: updated,
                              },
                            });
                            setHasUnsaved(true);
                          }}
                          className="text-accent/60 hover:text-accent ml-0.5"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Resume */}
              <div className="bg-background-subtle rounded-lg p-4 mt-2">
                <p className="text-sm font-medium text-foreground-secondary mb-1">
                  {t("settings", "targetingSummary")}
                </p>
                <p className="text-xs text-foreground-muted">
                  {settings.targeting.searchQueries.length} {settings.targeting.searchQueries.length !== 1
                    ? t("settings", "queryLabelPlural")
                    : t("settings", "queryLabel")}{" "}
                  x {settings.targeting.cities.length} {settings.targeting.cities.length !== 1 ? t("settings", "cityLabelPlural") : t("settings", "cityLabelSingular")} ={" "}
                  {settings.targeting.searchQueries.length *
                    settings.targeting.cities.length}{" "}
                  {settings.targeting.searchQueries.length *
                    settings.targeting.cities.length !==
                  1
                    ? t("settings", "combinationLabelPlural")
                    : t("settings", "combinationLabel")}{" "}
                  {t("settings", "ofSearch")}
                </p>
              </div>
            </SectionCard>
          </motion.div>
        );

      // === APPARENCE ===
      case "appearance":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title={t("settings", "appearanceTitle")}
              description={t("settings", "appearanceDesc")}
              onSave={() =>
                saveSection("appearance", settings.appearance)
              }
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldGroup label={t("settings", "dateFormat")}>
                  <Select
                    value={settings.appearance.dateFormat}
                    onChange={(e) =>
                      updateField(
                        "appearance",
                        "dateFormat",
                        e.target.value
                      )
                    }
                  >
                    <option value="YYYY-MM-DD">2026-03-10</option>
                    <option value="DD/MM/YYYY">10/03/2026</option>
                    <option value="MM/DD/YYYY">03/10/2026</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label={t("settings", "timeFormat")}>
                  <Select
                    value={settings.appearance.timeFormat}
                    onChange={(e) =>
                      updateField(
                        "appearance",
                        "timeFormat",
                        e.target.value
                      )
                    }
                  >
                    <option value="24h">24h</option>
                    <option value="12h">12h (AM/PM)</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label={t("settings", "timezoneLabel")}>
                  <Select
                    value={settings.appearance.timezone}
                    onChange={(e) =>
                      updateField(
                        "appearance",
                        "timezone",
                        e.target.value
                      )
                    }
                  >
                    <option value="America/Montreal">
                      Montréal (EST)
                    </option>
                    <option value="America/Toronto">Toronto (EST)</option>
                    <option value="America/Vancouver">
                      Vancouver (PST)
                    </option>
                    <option value="Europe/Paris">Paris (CET)</option>
                  </Select>
                </FieldGroup>
              </div>

              {/* Theme selector */}
              <div className="border-t border-border pt-4 mt-4">
                <p className="text-sm font-medium text-foreground-secondary mb-3">
                  {t("settings", "themeLabel")}
                </p>
                <div className="flex gap-3">
                  {(
                    [
                      { value: "light", labelKey: "themeLight", Icon: Sun },
                      { value: "dark", labelKey: "themeDark", Icon: Moon },
                      {
                        value: "system",
                        labelKey: "themeSystem",
                        Icon: Monitor,
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                        theme === opt.value
                          ? "border-primary bg-primary-subtle text-primary"
                          : "border-border text-foreground-muted hover:bg-card-hover"
                      }`}
                    >
                      <opt.Icon className="size-5" />
                      <span>{t("settings", opt.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </SectionCard>
          </motion.div>
        );

      // === LANGUE ===
      case "language":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title={t("settings", "languageTitle")}
              description={t("settings", "languageDesc")}
              onSave={() =>
                saveSection("appearance", settings.appearance)
              }
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <FieldGroup label={t("settings", "languageLabel")}>
                <Select
                  value={settings.appearance.language}
                  onChange={(e) => {
                    updateField(
                      "appearance",
                      "language",
                      e.target.value
                    );
                    // Also update the language provider immediately
                    if (typeof window !== "undefined") {
                      setAppLocale(e.target.value as "fr" | "en");
                    }
                  }}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </Select>
              </FieldGroup>
              <p className="text-xs text-foreground-muted mt-2">
                {t("settings", "languageChangeNote")}
              </p>
            </SectionCard>
          </motion.div>
        );

      // === SECURITE ===
      case "security":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* ── Authentification ── */}
            <SectionCard
              title={t("settings", "securityAuth")}
              description={t("settings", "securityAuthDesc")}
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <Toggle
                checked={settings.security.enforceStrongPasswords}
                onChange={(v) =>
                  updateField("security", "enforceStrongPasswords", v)
                }
                label={t("settings", "enforceStrongPasswords")}
              />
              <FieldGroup
                label={t("settings", "maxLoginAttempts")}
                description={t("settings", "maxLoginAttemptsDesc")}
              >
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.security.maxLoginAttempts}
                  onChange={(e) =>
                    updateField(
                      "security",
                      "maxLoginAttempts",
                      parseInt(e.target.value) || 5
                    )
                  }
                />
              </FieldGroup>
              <FieldGroup
                label={t("settings", "sessionTimeout")}
                description={t("settings", "sessionTimeoutDesc")}
              >
                <Select
                  value={String(settings.security.sessionTimeoutMinutes)}
                  onChange={(e) =>
                    updateField(
                      "security",
                      "sessionTimeoutMinutes",
                      parseInt(e.target.value)
                    )
                  }
                >
                  <option value="30">{t("settings", "minutes30")}</option>
                  <option value="60">{t("settings", "hour1")}</option>
                  <option value="120">{t("settings", "hours2")}</option>
                  <option value="240">{t("settings", "hours4")}</option>
                  <option value="480">{t("settings", "hours8")}</option>
                  <option value="1440">{t("settings", "hours24")}</option>
                </Select>
              </FieldGroup>

              <div className="border-t border-border pt-4 mt-4 space-y-3">
                <div className="flex items-center justify-between p-3 bg-background-subtle rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t("settings", "changePassword")}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {t("settings", "changePasswordDesc")}
                    </p>
                  </div>
                  <Button disabled variant="secondary" size="sm">
                    {t("settings", "comingSoon")}
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 bg-background-subtle rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t("settings", "twoFactorAuth")}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {t("settings", "twoFactorAuthDesc")}
                    </p>
                  </div>
                  <Button disabled variant="secondary" size="sm">
                    {t("settings", "comingSoon")}
                  </Button>
                </div>
              </div>
            </SectionCard>

            {/* ── Accès & Permissions ── */}
            <SectionCard
              title={t("settings", "accessPermissions")}
              description={t("settings", "accessPermissionsDesc")}
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <Toggle
                checked={settings.security.requireConfirmation}
                onChange={(v) =>
                  updateField("security", "requireConfirmation", v)
                }
                label={t("settings", "requireConfirmation")}
              />
              <Toggle
                checked={settings.security.exportRequirePassword}
                onChange={(v) =>
                  updateField("security", "exportRequirePassword", v)
                }
                label={t("settings", "exportRequirePassword")}
              />
              <Toggle
                checked={settings.security.ipWhitelistEnabled}
                onChange={(v) =>
                  updateField("security", "ipWhitelistEnabled", v)
                }
                label={t("settings", "ipWhitelist")}
              />
              {settings.security.ipWhitelistEnabled && (
                <FieldGroup
                  label={t("settings", "allowedIPs")}
                  description={t("settings", "allowedIPsDesc")}
                >
                  <TextArea
                    value={(settings.security.ipWhitelist || []).join(", ")}
                    onChange={(v) =>
                      updateField(
                        "security",
                        "ipWhitelist",
                        v
                          .split(",")
                          .map((ip) => ip.trim())
                          .filter(Boolean)
                      )
                    }
                    placeholder="192.168.1.1, 10.0.0.0/24"
                    rows={2}
                  />
                </FieldGroup>
              )}
            </SectionCard>

            {/* ── Clé API ── */}
            <SectionCard
              title={t("settings", "apiKeyTitle")}
              description={t("settings", "apiKeyDesc")}
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <Toggle
                checked={settings.security.apiKeyEnabled}
                onChange={(v) =>
                  updateField("security", "apiKeyEnabled", v)
                }
                label={t("settings", "enableApiAccess")}
              />
              {settings.security.apiKeyEnabled && (
                <>
                  <FieldGroup label={t("settings", "apiKeyLabel")}>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        readOnly
                        value={
                          settings.security.apiKey
                            ? `${settings.security.apiKey.slice(0, 8)}${"•".repeat(24)}${settings.security.apiKey.slice(-4)}`
                            : t("settings", "noKeyGenerated")
                        }
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const key = `fls_${crypto.randomUUID().replace(/-/g, "")}`;
                          updateField("security", "apiKey", key);
                        }}
                      >
                        <RefreshCw className="size-3.5" />
                        {settings.security.apiKey ? t("settings", "regenerate") : t("settings", "generate")}
                      </Button>
                    </div>
                  </FieldGroup>
                  {settings.security.apiKey && (
                    <p className="text-xs text-warning flex items-center gap-1.5">
                      <Shield className="size-3.5" />
                      {t("settings", "apiKeySaveWarning")}
                    </p>
                  )}
                </>
              )}
            </SectionCard>

            {/* ── Rétention des données ── */}
            <SectionCard
              title={t("settings", "dataRetention")}
              description={t("settings", "dataRetentionDesc")}
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <FieldGroup
                label={t("settings", "retentionPeriod")}
                description={t("settings", "retentionPeriodDesc")}
              >
                <Select
                  value={String(settings.security.dataRetentionDays)}
                  onChange={(e) =>
                    updateField(
                      "security",
                      "dataRetentionDays",
                      parseInt(e.target.value)
                    )
                  }
                >
                  <option value="90">{t("settings", "days90")}</option>
                  <option value="180">{t("settings", "months6")}</option>
                  <option value="365">{t("settings", "year1")}</option>
                  <option value="730">{t("settings", "years2")}</option>
                  <option value="0">{t("settings", "retentionIndefinite")}</option>
                </Select>
              </FieldGroup>
              <Toggle
                checked={settings.security.autoDeleteArchived}
                onChange={(v) =>
                  updateField("security", "autoDeleteArchived", v)
                }
                label={t("settings", "autoDeleteArchived")}
              />
              {settings.security.autoDeleteArchived && (
                <FieldGroup
                  label={t("settings", "autoDeleteDelay")}
                  description={t("settings", "autoDeleteDelayDesc")}
                >
                  <Input
                    type="number"
                    min={7}
                    max={365}
                    value={settings.security.autoDeleteArchivedDays}
                    onChange={(e) =>
                      updateField(
                        "security",
                        "autoDeleteArchivedDays",
                        parseInt(e.target.value) || 30
                      )
                    }
                  />
                </FieldGroup>
              )}
            </SectionCard>

            {/* ── Journal d'audit ── */}
            <SectionCard
              title={t("settings", "auditLog")}
              description={t("settings", "auditLogDesc")}
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
              unsavedLabel={t("settings", "unsaved")}
              savingLabel={t("settings", "savingBtn")}
              saveLabel={t("settings", "saveBtn")}
            >
              <Toggle
                checked={settings.security.auditLogEnabled}
                onChange={(v) =>
                  updateField("security", "auditLogEnabled", v)
                }
                label={t("settings", "enableAuditLog")}
              />
              {settings.security.auditLogEnabled && (
                <FieldGroup
                  label={t("settings", "auditRetention")}
                  description={t("settings", "auditRetentionDesc")}
                >
                  <Select
                    value={String(settings.security.auditLogRetentionDays)}
                    onChange={(e) =>
                      updateField(
                        "security",
                        "auditLogRetentionDays",
                        parseInt(e.target.value)
                      )
                    }
                  >
                    <option value="30">{t("settings", "auditDays30")}</option>
                    <option value="60">{t("settings", "auditDays60")}</option>
                    <option value="90">{t("settings", "auditDays90")}</option>
                    <option value="180">{t("settings", "auditMonths6")}</option>
                    <option value="365">{t("settings", "auditYear1")}</option>
                  </Select>
                </FieldGroup>
              )}
              <div className="border-t border-border pt-4 mt-2">
                <div className="flex items-center justify-between p-3 bg-background-subtle rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t("settings", "activeSessions")}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {t("settings", "activeSessionsDesc")}
                    </p>
                  </div>
                  <Button disabled variant="secondary" size="sm">
                    {t("settings", "comingSoon")}
                  </Button>
                </div>
              </div>
            </SectionCard>

            {/* ── Zone dangereuse ── */}
            <Card className="border-danger/30">
              <CardHeader>
                <div>
                  <CardTitle className="text-lg text-danger">{t("settings", "dangerZone")}</CardTitle>
                  <p className="text-sm text-foreground-muted mt-1">
                    {t("settings", "dangerZoneDesc")}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-danger-subtle rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("settings", "exportAllData")}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {t("settings", "exportAllDataDesc")}
                      </p>
                    </div>
                    <Button disabled variant="secondary" size="sm">
                      {t("settings", "exportBtn")}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-danger-subtle rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("settings", "deleteAllData")}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {t("settings", "deleteAllDataDesc")}
                      </p>
                    </div>
                    <Button disabled variant="danger" size="sm">
                      {t("settings", "deleteAllBtn")}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-danger-subtle rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("settings", "deleteAccount")}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {t("settings", "deleteAccountDesc")}
                      </p>
                    </div>
                    <Button disabled variant="danger" size="sm">
                      {t("settings", "deleteAccountBtn")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );

      // === ARCHIVE ===
      case "archive":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title={t("settings", "archiveTitle")}
              description={t("settings", "archiveDesc")}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-foreground-muted">
                  {archiveTotal} prospect{archiveTotal !== 1 ? "s" : ""} {archiveTotal !== 1 ? t("settings", "archivedCountPlural") : t("settings", "archivedCount")}
                </p>
                <div className="flex gap-2">
                  {selectedArchived.size > 0 && (
                    <>
                      <Button
                        onClick={async () => {
                          const ids = Array.from(selectedArchived);
                          await fetch("/api/prospects/archive", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              _action: "restore",
                              ids,
                            }),
                          });
                          showToast(
                            `${ids.length} prospect${ids.length > 1 ? "s" : ""} ${ids.length > 1 ? t("settings", "restoredPlural") : t("settings", "restored")}`,
                            "success"
                          );
                          loadArchive(archivePage);
                        }}
                        variant="success"
                        size="sm"
                      >
                        <RotateCcw className="size-3.5" />
                        {t("settings", "restoreBtn")} ({selectedArchived.size})
                      </Button>
                      <Button
                        onClick={async () => {
                          if (
                            !confirm(
                              `${t("settings", "confirmPermanentDelete")} ${selectedArchived.size} prospect${selectedArchived.size > 1 ? "s" : ""} ?`
                            )
                          )
                            return;
                          const ids = Array.from(selectedArchived);
                          await fetch("/api/prospects/archive", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              _action: "permanentDelete",
                              ids,
                            }),
                          });
                          showToast(
                            `${ids.length} prospect${ids.length > 1 ? "s" : ""} ${ids.length > 1 ? t("settings", "deletedPermanentlyPlural") : t("settings", "deletedPermanently")}`,
                            "success"
                          );
                          loadArchive(archivePage);
                        }}
                        variant="danger"
                        size="sm"
                      >
                        <Trash2 className="size-3.5" />
                        {t("settings", "deleteBtn")} ({selectedArchived.size})
                      </Button>
                    </>
                  )}
                  <Button
                    onClick={async () => {
                      const res = await fetch(
                        "/api/prospects/archive",
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ _action: "cleanup" }),
                        }
                      );
                      const data = await res.json();
                      showToast(
                        `${data.deleted || 0} ${(data.deleted || 0) > 1 ? t("settings", "oldCleanedPlural") : t("settings", "oldCleaned")} prospect${(data.deleted || 0) > 1 ? "s" : ""} ${(data.deleted || 0) > 1 ? t("settings", "cleanedPlural") : t("settings", "cleaned")}`,
                        "success"
                      );
                      loadArchive(archivePage);
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    {t("settings", "cleanupBtn")}
                  </Button>
                </div>
              </div>

              {archiveLoading ? (
                <div className="py-8 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="h-10 w-full rounded-lg"
                    />
                  ))}
                </div>
              ) : archivedProspects.length === 0 ? (
                <p className="text-muted text-sm py-8 text-center">
                  {t("settings", "noArchivedProspects")}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-background-subtle">
                        <tr>
                          <th className="px-3 py-2.5 text-left">
                            <input
                              type="checkbox"
                              checked={
                                selectedArchived.size ===
                                  archivedProspects.length &&
                                archivedProspects.length > 0
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedArchived(
                                    new Set(
                                      archivedProspects.map((p) => p.id)
                                    )
                                  );
                                } else {
                                  setSelectedArchived(new Set());
                                }
                              }}
                              className="rounded border-border"
                            />
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            {t("settings", "archiveCompany")}
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            {t("settings", "archiveCity")}
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            {t("settings", "archiveEmail")}
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            {t("settings", "archivePhone")}
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            {t("settings", "archiveScore")}
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            {t("settings", "archiveDeletedAt")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {archivedProspects.map((p) => {
                          const daysLeft = Math.max(
                            0,
                            15 -
                              Math.floor(
                                (Date.now() -
                                  new Date(p.archivedAt).getTime()) /
                                  86400000
                              )
                          );
                          return (
                            <tr
                              key={p.id}
                              className="hover:bg-card-hover"
                            >
                              <td className="px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={selectedArchived.has(p.id)}
                                  onChange={(e) => {
                                    const next = new Set(
                                      selectedArchived
                                    );
                                    if (e.target.checked)
                                      next.add(p.id);
                                    else next.delete(p.id);
                                    setSelectedArchived(next);
                                  }}
                                  className="rounded border-border"
                                />
                              </td>
                              <td className="px-3 py-2.5 font-medium text-foreground">
                                {p.companyName}
                              </td>
                              <td className="px-3 py-2.5 text-foreground-muted">
                                {p.city || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-foreground-muted">
                                {p.email || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-foreground-muted">
                                {p.phone || "—"}
                              </td>
                              <td className="px-3 py-2.5 text-foreground-muted font-mono text-xs">
                                {p.leadScore}
                              </td>
                              <td className="px-3 py-2.5 text-foreground-muted text-xs">
                                {new Date(
                                  p.archivedAt
                                ).toLocaleDateString("fr-CA", {
                                  day: "numeric",
                                  month: "short",
                                })}
                                <span
                                  className={`ml-1.5 ${daysLeft <= 3 ? "text-danger" : "text-muted"}`}
                                >
                                  ({daysLeft}{daysLeft !== 1 ? t("settings", "daysRemainingPlural") : t("settings", "daysRemaining")})
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {archiveTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-muted">
                        {t("settings", "pageOf")} {archivePage} / {archiveTotalPages}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          disabled={archivePage <= 1}
                          onClick={() => loadArchive(archivePage - 1)}
                          variant="secondary"
                          size="sm"
                        >
                          <ChevronLeft className="size-3.5" />
                          {t("settings", "prevPage")}
                        </Button>
                        <Button
                          disabled={archivePage >= archiveTotalPages}
                          onClick={() => loadArchive(archivePage + 1)}
                          variant="secondary"
                          size="sm"
                        >
                          {t("settings", "nextPage")}
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          </motion.div>
        );

      // === ABONNEMENT ===
      case "subscription":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title={t("settings", "subscriptionTitle")}
              description={t("settings", "subscriptionDesc")}
            >
              <div className="bg-primary-subtle rounded-lg p-6 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground-muted uppercase font-medium">
                      {t("settings", "currentPlan")}
                    </p>
                    <p className="text-2xl font-bold text-primary mt-1 capitalize">
                      {settings.subscription.plan}
                    </p>
                  </div>
                  <Badge
                    variant={
                      settings.subscription.status === "active"
                        ? "success"
                        : "default"
                    }
                  >
                    {settings.subscription.status === "active"
                      ? t("settings", "statusActive")
                      : settings.subscription.status}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-border rounded-lg">
                  <p className="text-sm text-foreground-muted">
                    {t("settings", "allowedUsers")}
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {settings.subscription.maxUsers}
                  </p>
                </div>
                <div className="p-4 border border-border rounded-lg">
                  <p className="text-sm text-foreground-muted">
                    {t("settings", "emailsPerMonth")}
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {settings.subscription.maxEmailsPerMonth.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-primary-subtle rounded-lg">
                <p className="text-xs text-primary">
                  {t("settings", "subscriptionComingSoon")}
                </p>
              </div>
            </SectionCard>
          </motion.div>
        );

      // === JOURNAL ===
      case "activity":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title={t("settings", "activityTitle")}
              description={t("settings", "activityDesc")}
            >
              <div className="border border-border rounded-lg overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background-subtle">
                  <span className="text-sm font-medium text-foreground">
                    {logs.length} {logs.length !== 1 ? t("settings", "activityCountPlural") : t("settings", "activityCount")}
                  </span>
                  <button
                    onClick={loadLogs}
                    className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-card transition-colors"
                    title={t("settings", "refresh")}
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                </div>

                {/* List */}
                {logs.length === 0 ? (
                  <p className="text-foreground-muted text-sm text-center py-10">
                    {t("settings", "noActivity")}
                  </p>
                ) : (
                  <div>
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-background-subtle transition-colors"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {log.title && !log.title.includes("_") ? log.title : formatAction(log.action, t as (section: string, key: string) => string)}
                          </p>
                          {log.details && (
                            <p className="text-xs text-foreground-muted">
                              {log.details}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted shrink-0 pt-0.5">
                          {new Date(log.createdAt).toLocaleString("fr-CA")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          </motion.div>
        );

    }
  }

  return (
    <div>
      <ToastContainer toast={toast} onClose={() => setToast(null)} />

      <PageHeader
        title={t("settings", "pageTitle")}
        description={t("settings", "pageDesc")}
      />

      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-52 shrink-0">
          <div className="sticky top-24 space-y-4">
            {([
              {
                labelKey: "groupAccount",
                ids: ["company", "team"],
              },
              {
                labelKey: "groupProspecting",
                ids: ["prospects", "targeting", "archive"],
              },
              {
                labelKey: "groupCampaigns",
                ids: ["campaigns", "automation"],
              },
              {
                labelKey: "groupPlatform",
                ids: ["appearance", "language", "security", "subscription", "activity"],
              },
            ] as const).map((group) => (
              <div key={group.labelKey}>
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-foreground-muted/60">
                  {t("settings", group.labelKey)}
                </p>
                <div className="space-y-0.5">
                  {group.ids.map((id) => {
                    const Icon = SECTION_ICONS[id as SectionId];
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          setActiveSection(id as SectionId);
                          setHasUnsaved(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5 ${
                          activeSection === id
                            ? "bg-primary-subtle text-primary font-medium"
                            : "text-foreground-muted hover:bg-card-hover"
                        }`}
                      >
                        <Icon className="size-4 shrink-0" />
                        {t("settings", id as any)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{renderSection()}</div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────

function formatAction(action: string, t: (section: string, key: string) => string): string {
  const map: Record<string, string> = {
    import_csv: "actionImportCsv",
    import_text: "actionImportText",
    scrape_import: "actionScrapeImport",
    discovery_started: "actionDiscoveryStarted",
    discovery_completed: "actionDiscoveryCompleted",
    discovery_error: "actionDiscoveryError",
    enrichment_started: "actionEnrichmentStarted",
    enrichment_completed: "actionEnrichmentCompleted",
    enrichment_error: "actionEnrichmentError",
    campaign_created: "actionCampaignCreated",
    campaign_updated: "actionCampaignUpdated",
    campaign_paused: "actionCampaignPaused",
    campaign_activated: "actionCampaignActivated",
    prospect_created: "actionProspectCreated",
    prospect_deleted: "actionProspectDeleted",
    prospect_deduplicated: "actionProspectDeduplicated",
    blacklist_added: "actionBlacklistAdded",
    email_sent: "actionEmailSent",
    keywords_generated: "actionKeywordsGenerated",
    settings_updated: "actionSettingsUpdated",
    user_created: "actionUserCreated",
    user_updated: "actionUserUpdated",
    user_deleted: "actionUserDeleted",
  };
  const key = map[action];
  return key ? t("settings", key) : action;
}
