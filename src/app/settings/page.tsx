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
  Crown,
  Rocket,
  Sparkles,
  ArrowRight,
  StickyNote,
  SendHorizonal,
  Play,
  Pause,
  Flame,
  Upload,
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
    gmailConnectedEmail: string;
    gmailConnectedAt: string;
    gmailTokens: string;
    trackingDomain: string;
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
    followUpDelays: number[];
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
    region: string;
    minReviews?: number;
    maxReviews?: number;
  };
  subscription: {
    plan: "starter" | "growth" | "pro";
    status: string;
    maxUsers: number;
    maxEmailsPerMonth: number;
    maxDiscoveriesPerMonth: number;
    discoveriesUsedThisMonth: number;
    currentPeriodStart: string;
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

const SECTION_IDS = ["company", "email", "emailAccounts", "team", "prospects", "campaigns", "automation", "targeting", "archive", "appearance", "language", "security", "subscription", "activity"] as const;

type SectionId = (typeof SECTION_IDS)[number];

const SECTION_ICONS: Record<SectionId, typeof Building2> = {
  company: Building2,
  email: Mail,
  emailAccounts: SendHorizonal,
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
  emailAccounts: "emailAccounts",
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
  const [isAdmin, setIsAdmin] = useState(false);

  // Read ?section= from URL on mount to deep-link to a specific tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section && SECTION_IDS.includes(section as SectionId)) {
      setActiveSection(section as SectionId);
    }
  }, []);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d.user?.role === "ADMIN") setIsAdmin(true); })
      .catch(() => {});
  }, []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Email accounts (multi-sender)
  interface EmailAccountRow {
    id: string; email: string; displayName: string | null; domain: string;
    smtpHost: string; smtpPort: number; smtpUser: string;
    imapHost: string | null; imapPort: number | null; imapUser: string | null;
    dailyLimit: number; sentToday: number; sentTodayDate: string | null;
    totalSent: number; status: string; warmupStartedAt: string | null;
    warmupDayNumber: number; bounceCount: number; lastError: string | null;
    lastUsedAt: string | null; sortOrder: number; createdAt: string;
  }
  const [emailAccounts, setEmailAccounts] = useState<EmailAccountRow[]>([]);
  const [emailAccountsLoading, setEmailAccountsLoading] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showProviderGuide, setShowProviderGuide] = useState(false);
  const [newAccount, setNewAccount] = useState({ email: "", smtpHost: "", smtpPort: "587", smtpUser: "", smtpPass: "", imapHost: "", imapPort: "993", imapUser: "", imapPass: "", dailyLimit: "100", displayName: "" });
  const [bulkText, setBulkText] = useState("");
  const [bulkHost, setBulkHost] = useState("");
  const [bulkPort, setBulkPort] = useState("587");
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);

  // Interactive schema demo
  interface SchemaEmail { id: string; address: string; limit: number; }
  interface SchemaDomain { id: string; name: string; emails: SchemaEmail[]; }
  const [schemaDomains, setSchemaDomains] = useState<SchemaDomain[]>([
    {
      id: "d1",
      name: "",
      emails: [
        { id: "e1", address: "", limit: 100 },
        { id: "e2", address: "", limit: 100 },
        { id: "e3", address: "", limit: 100 },
        { id: "e4", address: "", limit: 100 },
        { id: "e5", address: "", limit: 100 },
      ],
    },
  ]);
  const [schemaNewDomain, setSchemaNewDomain] = useState("");
  const [schemaAddingDomain, setSchemaAddingDomain] = useState(false);
  const [schemaAddingEmailTo, setSchemaAddingEmailTo] = useState<string | null>(null);
  const [schemaNewEmail, setSchemaNewEmail] = useState("");
  const [schemaEditingDomain, setSchemaEditingDomain] = useState<string | null>(null);
  const [schemaEditValue, setSchemaEditValue] = useState("");
  // Node config popup — opens when clicking a domain or email node
  interface SchemaNodeConfig {
    domainId: string;
    emailId?: string; // if editing email, otherwise editing domain
    email: string;
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    smtpPass: string;
    imapHost: string;
    imapPort: string;
    imapUser: string;
    imapPass: string;
    dailyLimit: string;
    displayName: string;
  }
  const [schemaNodeConfig, setSchemaNodeConfig] = useState<SchemaNodeConfig | null>(null);
  const [activeDnsProvider, setActiveDnsProvider] = useState("zoho");
  const schemaTotalEmails = schemaDomains.reduce((s, d) => s + d.emails.filter(e => e.address).length, 0);
  const schemaTotalCapacity = schemaDomains.reduce((s, d) => s + d.emails.filter(e => e.address).reduce((s2, e) => s2 + e.limit, 0), 0);

  const fetchEmailAccounts = useCallback(async () => {
    setEmailAccountsLoading(true);
    try {
      const res = await fetch("/api/email-accounts");
      if (res.ok) {
        const data = await res.json();
        setEmailAccounts(data.accounts || []);
      }
    } catch { /* ignore */ }
    setEmailAccountsLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection === "emailAccounts") fetchEmailAccounts();
  }, [activeSection, fetchEmailAccounts]);

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

  // ─── Gmail OAuth callback handler ─────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailStatus = params.get("gmail");
    if (gmailStatus === "connected") {
      showToast(locale === "en" ? "Gmail connected successfully!" : "Gmail connecté avec succès !", "success");
      setActiveSection("email");
      // Clean URL
      window.history.replaceState({}, "", "/settings");
      // Reload settings to get the new Gmail state
      fetch("/api/settings").then((r) => r.json()).then((d) => { if (!d.error) setSettings(d); });
    } else if (gmailStatus === "error") {
      showToast(locale === "en" ? "Gmail connection failed" : "Connexion Gmail échouée", "error");
      setActiveSection("email");
      window.history.replaceState({}, "", "/settings");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const isGmailOAuth = emailProvider === "gmail_oauth";
        const gmailConnectedEmail = settings.email.gmailConnectedEmail || "";

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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { id: "gmail_oauth", label: locale === "en" ? "Gmail (OAuth)" : "Gmail (OAuth)" },
                      { id: "gmail", label: locale === "en" ? "Gmail (SMTP)" : "Gmail (SMTP)" },
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
                        {(p.id === "gmail" || p.id === "gmail_oauth") && (
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

                {/* Gmail OAuth connect/disconnect */}
                {isGmailOAuth && (
                  <div className="p-4 rounded-lg border border-accent/20 bg-accent-subtle space-y-3">
                    {gmailConnectedEmail ? (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="size-2 rounded-full bg-green-500" />
                          <p className="text-sm font-medium text-foreground">
                            {locale === "en" ? "Connected as" : "Connecté en tant que"}{" "}
                            <span className="text-accent">{gmailConnectedEmail}</span>
                          </p>
                        </div>
                        <p className="text-xs text-foreground-secondary">
                          {locale === "en"
                            ? "Emails are sent via Gmail API from your account. Bounces and replies are tracked automatically."
                            : "Les emails sont envoyés via l'API Gmail depuis votre compte. Les bounces et réponses sont trackés automatiquement."}
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/auth/gmail/disconnect", { method: "POST" });
                              if (res.ok) {
                                setSettings({
                                  ...settings,
                                  email: {
                                    ...settings.email,
                                    provider: "gmail",
                                    gmailConnectedEmail: "",
                                    gmailTokens: "",
                                    gmailConnectedAt: "",
                                  },
                                });
                                showToast(locale === "en" ? "Gmail disconnected" : "Gmail déconnecté", "success");
                              }
                            } catch {
                              showToast(locale === "en" ? "Error disconnecting" : "Erreur de déconnexion", "error");
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors"
                        >
                          {locale === "en" ? "Disconnect Gmail" : "Déconnecter Gmail"}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Info className="size-4 text-accent shrink-0" />
                          <p className="text-sm font-medium text-foreground">
                            {locale === "en"
                              ? "Connect your Gmail account with one click"
                              : "Connectez votre compte Gmail en un clic"}
                          </p>
                        </div>
                        <ul className="text-xs text-foreground-secondary space-y-1 ml-1">
                          <li>{locale === "en" ? "• Sends from your Gmail address" : "• Envoi depuis votre adresse Gmail"}</li>
                          <li>{locale === "en" ? "• Automatic bounce detection" : "• Détection automatique des bounces"}</li>
                          <li>{locale === "en" ? "• Automatic reply tracking" : "• Tracking automatique des réponses"}</li>
                          <li>{locale === "en" ? "• No app password needed" : "• Aucun mot de passe d'application requis"}</li>
                        </ul>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/auth/gmail");
                              const data = await res.json();
                              if (data.url) {
                                window.location.href = data.url;
                              } else {
                                showToast(data.error || "Erreur OAuth", "error");
                              }
                            } catch {
                              showToast(locale === "en" ? "Connection error" : "Erreur de connexion", "error");
                            }
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                          <svg className="size-4" viewBox="0 0 24 24">
                            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="currentColor"/>
                          </svg>
                          {locale === "en" ? "Connect Gmail" : "Connecter Gmail"}
                        </button>
                      </>
                    )}
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

                {/* Custom Tracking Domain */}
                <div className="border-t border-border pt-5 mt-5">
                  <p className="text-sm font-semibold text-foreground mb-1">
                    {locale === "en" ? "Custom Tracking Domain" : "Domaine de tracking personnalisé"}
                  </p>
                  <p className="text-xs text-muted mb-3">
                    {locale === "en"
                      ? "Use your own domain for open tracking pixels and unsubscribe links instead of the default app domain. This improves deliverability."
                      : "Utilisez votre propre domaine pour les pixels de tracking et les liens de désinscription au lieu du domaine par défaut. Ça améliore la délivrabilité."}
                  </p>
                  <FieldGroup
                    label={locale === "en" ? "Tracking domain" : "Domaine de tracking"}
                    description={locale === "en"
                      ? "e.g. track.yourdomain.com — Add a CNAME record pointing to your app domain."
                      : "ex : track.votredomaine.com — Ajoutez un enregistrement CNAME pointant vers votre domaine app."}
                  >
                    <div className="flex gap-2">
                      <Input
                        value={settings.email.trackingDomain || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setSettings({
                            ...settings,
                            email: { ...settings.email, trackingDomain: e.target.value.trim().replace(/^https?:\/\//, "").replace(/\/$/, "") },
                          });
                          setHasUnsaved(true);
                        }}
                        placeholder="track.yourdomain.com"
                      />
                      {settings.email.trackingDomain && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/settings/verify-tracking-domain?domain=${encodeURIComponent(settings.email.trackingDomain)}`);
                              const data = await res.json();
                              if (data.valid) {
                                showToast(locale === "en" ? "CNAME verified! Tracking domain is active." : "CNAME vérifié ! Le domaine de tracking est actif.", "success");
                              } else {
                                showToast(data.error || (locale === "en" ? "CNAME not found. Make sure your DNS is configured." : "CNAME introuvable. Vérifiez votre configuration DNS."), "error");
                              }
                            } catch {
                              showToast(locale === "en" ? "Verification error" : "Erreur de vérification", "error");
                            }
                          }}
                        >
                          {locale === "en" ? "Verify" : "Vérifier"}
                        </Button>
                      )}
                    </div>
                  </FieldGroup>
                  {settings.email.trackingDomain && (
                    <div className="mt-3 p-3 rounded-md bg-background-subtle border border-border">
                      <p className="text-xs font-medium text-foreground-secondary mb-1.5">
                        {locale === "en" ? "DNS Configuration" : "Configuration DNS"}
                      </p>
                      <div className="font-mono text-xs bg-background rounded border border-border p-2 select-all">
                        <span className="text-foreground-muted">CNAME</span>{" "}
                        <span className="text-foreground">{settings.email.trackingDomain}</span>{" "}
                        <span className="text-foreground-muted">→</span>{" "}
                        <span className="text-primary">{typeof window !== "undefined" ? window.location.hostname : "leadnova.one"}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </motion.div>
        );
      }

      // === COMPTES EMAIL (MULTI-SENDER) ===
      case "emailAccounts": {
        const STATUS_BADGE: Record<string, { label: string; class: string }> = {
          ACTIVE: { label: locale === "en" ? "Active" : "Actif", class: "bg-success-subtle text-success border-success/20" },
          WARMING: { label: locale === "en" ? "Warming up" : "Préchauffage", class: "bg-warning-subtle text-warning border-warning/20" },
          PAUSED: { label: locale === "en" ? "Paused" : "En pause", class: "bg-background-muted text-foreground-muted border-border" },
          ERROR: { label: locale === "en" ? "Error" : "Erreur", class: "bg-danger-subtle text-danger border-danger/20" },
        };

        async function handleAddAccount() {
          const res = await fetch("/api/email-accounts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newAccount),
          });
          const data = await res.json();
          if (res.ok) {
            showToast(locale === "en" ? "Account added" : "Compte ajouté", "success");
            setShowAddAccount(false);
            setNewAccount({ email: "", smtpHost: "", smtpPort: "587", smtpUser: "", smtpPass: "", imapHost: "", imapPort: "993", imapUser: "", imapPass: "", dailyLimit: "100", displayName: "" });
            fetchEmailAccounts();
          } else {
            showToast(data.error || "Erreur", "error");
          }
        }

        async function handleBulkImport() {
          const res = await fetch("/api/email-accounts/bulk-import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lines: bulkText, smtpHost: bulkHost, smtpPort: bulkPort }),
          });
          const data = await res.json();
          if (res.ok) {
            showToast(`${data.created} ${locale === "en" ? "accounts imported" : "comptes importés"}, ${data.skipped} ${locale === "en" ? "skipped" : "ignorés"}`, "success");
            setShowBulkImport(false);
            setBulkText("");
            fetchEmailAccounts();
          } else {
            showToast(data.error || "Erreur", "error");
          }
        }

        async function handleDeleteAccount(id: string) {
          if (!confirm(locale === "en" ? "Delete this account?" : "Supprimer ce compte ?")) return;
          await fetch(`/api/email-accounts/${id}`, { method: "DELETE" });
          fetchEmailAccounts();
        }

        async function handleTestAccount(id: string) {
          setTestingAccountId(id);
          try {
            const res = await fetch(`/api/email-accounts/${id}/test`, { method: "POST" });
            const data = await res.json();
            showToast(data.success ? (locale === "en" ? "Connection OK!" : "Connexion réussie !") : (data.error || "Erreur"), data.success ? "success" : "error");
          } catch {
            showToast("Erreur de connexion", "error");
          }
          setTestingAccountId(null);
          fetchEmailAccounts();
        }

        async function handleToggleStatus(id: string, current: string) {
          const newStatus = current === "ACTIVE" ? "PAUSED" : current === "PAUSED" ? "ACTIVE" : current === "WARMING" ? "PAUSED" : "ACTIVE";
          await fetch(`/api/email-accounts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          fetchEmailAccounts();
        }

        async function handleUpdateLimit(id: string, limit: number) {
          await fetch(`/api/email-accounts/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dailyLimit: limit }),
          });
        }

        // Group by domain
        const domainGroups = new Map<string, EmailAccountRow[]>();
        for (const a of emailAccounts) {
          const list = domainGroups.get(a.domain) || [];
          list.push(a);
          domainGroups.set(a.domain, list);
        }

        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Header */}
            <SectionCard
              title={locale === "en" ? "Email Accounts" : "Comptes email"}
              description={locale === "en"
                ? "Connect multiple SMTP accounts for rotation. Emails are distributed automatically across active accounts."
                : "Connectez plusieurs comptes SMTP pour la rotation. Les emails sont distribués automatiquement entre les comptes actifs."}
            >
              <div className="space-y-4">
                {/* Warning banner */}
                <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-foreground">
                      {locale === "en" ? "Important — Read before sending" : "Important — Lire avant d'envoyer"}
                    </p>
                  </div>
                  <div className="space-y-2 text-xs text-foreground-secondary ml-6">
                    <p className="font-semibold text-danger">
                      {locale === "en"
                        ? "Never use your company's main domain or primary email addresses for cold outreach."
                        : "N'utilisez jamais le domaine principal ou les adresses email principales de votre entreprise pour la prospection à froid."}
                    </p>
                    <p>
                      {locale === "en"
                        ? "If your sending domain gets flagged as spam, ALL emails from that domain will be affected — including your regular business emails, invoices, and client communications."
                        : "Si votre domaine d'envoi est signalé comme spam, TOUS les emails de ce domaine seront affectés — y compris vos emails professionnels, factures et communications clients."}
                    </p>
                    <div className="border-t border-warning/20 pt-2 mt-2">
                      <p className="font-medium text-foreground mb-1">
                        {locale === "en" ? "Best practices:" : "Bonnes pratiques :"}
                      </p>
                      <ul className="space-y-1 list-disc list-inside text-foreground-muted">
                        <li>{locale === "en" ? "Buy separate domains for outreach (e.g. yourcompany-mail.com)" : "Achetez des domaines séparés pour la prospection (ex : votreentreprise-mail.com)"}</li>
                        <li>{locale === "en" ? "Configure SPF, DKIM, and DMARC on each domain" : "Configurez SPF, DKIM et DMARC sur chaque domaine"}</li>
                        <li>{locale === "en" ? "Use warm-up before sending at full volume (auto-enabled)" : "Utilisez le préchauffage avant d'envoyer à plein volume (activé auto)"}</li>
                        <li>{locale === "en" ? "Keep under 100-150 emails/day per account" : "Restez sous 100-150 emails/jour par compte"}</li>
                        <li>{locale === "en" ? "Keep under 1000 emails/day per domain" : "Restez sous 1000 emails/jour par domaine"}</li>
                        <li>{locale === "en" ? "Monitor your bounce rate — above 5% is dangerous" : "Surveillez votre taux de bounce — au-dessus de 5% c'est dangereux"}</li>
                        <li>{locale === "en" ? "Stop sending to addresses that bounce or unsubscribe" : "Arrêtez d'envoyer aux adresses qui bounce ou se désabonnent"}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Interactive flow schema — Zapier-style */}
                <div className="rounded-xl border border-border bg-background overflow-x-auto">
                  {/* Header bar */}
                  <div className="px-5 py-4 border-b border-border bg-background-subtle flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {locale === "en" ? "Sending Architecture" : "Architecture d'envoi"}
                      </p>
                      <p className="text-xs text-foreground-muted mt-0.5">
                        {locale === "en" ? "Visual overview of your sending infrastructure" : "Vue visuelle de votre infrastructure d'envoi"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-lg font-bold text-foreground tabular-nums leading-none">{schemaDomains.length}</p>
                        <p className="text-[9px] text-foreground-muted uppercase tracking-wider">{locale === "en" ? "domains" : "domaines"}</p>
                      </div>
                      <div className="w-px h-8 bg-border" />
                      <div className="text-center">
                        <p className="text-lg font-bold text-foreground tabular-nums leading-none">{schemaTotalEmails}</p>
                        <p className="text-[9px] text-foreground-muted uppercase tracking-wider">{locale === "en" ? "accounts" : "comptes"}</p>
                      </div>
                      <div className="w-px h-8 bg-border" />
                      <div className="text-center">
                        <p className="text-lg font-bold text-primary tabular-nums leading-none">{schemaTotalCapacity.toLocaleString()}</p>
                        <p className="text-[9px] text-foreground-muted uppercase tracking-wider">{locale === "en" ? "emails/day" : "emails/jour"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Flow canvas */}
                  <div className="p-6 min-w-[600px]">
                    <div className="flex flex-col items-center">

                      {/* ── Workspace node (root) ── */}
                      <div className="relative rounded-xl border-2 border-primary bg-primary-subtle px-6 py-3 shadow-sm">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
                            <SendHorizonal className="size-4 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">LeadNova</p>
                            <p className="text-[10px] text-foreground-muted">{locale === "en" ? "Multi-sender rotation" : "Rotation multi-expéditeur"}</p>
                          </div>
                        </div>
                      </div>

                      {/* Vertical connector from workspace */}
                      <div className="w-0.5 h-6 bg-border" />

                      {/* Horizontal branch line */}
                      {schemaDomains.length > 1 && (
                        <div className="relative w-full flex justify-center" style={{ height: 2 }}>
                          <div
                            className="absolute bg-border"
                            style={{
                              height: 2,
                              left: `calc(${100 / (schemaDomains.length * 2)}% + 0px)`,
                              right: `calc(${100 / (schemaDomains.length * 2)}% + 0px)`,
                            }}
                          />
                        </div>
                      )}

                      {/* ── Domain columns ── */}
                      <div className="flex gap-4 justify-center w-full">
                        {schemaDomains.map((domain) => {
                          const connectedEmails = domain.emails.filter(e => e.address);
                          const domainCapacity = connectedEmails.reduce((s, e) => s + e.limit, 0);
                          return (
                            <div key={domain.id} className="flex flex-col items-center flex-1 min-w-[180px] max-w-[260px]">
                              {/* Vertical connector to domain */}
                              <div className="w-0.5 h-5 bg-border" />

                              {/* Domain node */}
                              <div
                                className={cn(
                                  "relative w-full rounded-xl border-2 shadow-sm transition-colors group cursor-pointer",
                                  domain.name
                                    ? "border-border bg-card hover:border-primary/40"
                                    : "border-dashed border-foreground-muted/30 bg-background-subtle hover:border-primary/40"
                                )}
                                onClick={() => {
                                  if (schemaEditingDomain !== domain.id) {
                                    setSchemaEditingDomain(domain.id);
                                    setSchemaEditValue(domain.name);
                                  }
                                }}
                              >
                                <div className="px-4 py-3">
                                  {schemaEditingDomain === domain.id ? (
                                    <div className="flex items-center gap-2">
                                      <Globe className="size-4 text-primary shrink-0" />
                                      <input
                                        autoFocus
                                        value={schemaEditValue}
                                        onChange={(e) => setSchemaEditValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            setSchemaDomains(prev => prev.map(d => d.id === domain.id ? { ...d, name: schemaEditValue.trim() } : d));
                                            setSchemaEditingDomain(null);
                                          }
                                          if (e.key === "Escape") setSchemaEditingDomain(null);
                                        }}
                                        onBlur={() => {
                                          setSchemaDomains(prev => prev.map(d => d.id === domain.id ? { ...d, name: schemaEditValue.trim() } : d));
                                          setSchemaEditingDomain(null);
                                        }}
                                        placeholder="domain.com"
                                        className="flex-1 h-6 bg-transparent text-[13px] font-bold text-foreground outline-none placeholder:text-foreground-muted/40"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Globe className={cn("size-4 shrink-0", domain.name ? "text-primary" : "text-foreground-muted/40")} />
                                        {domain.name ? (
                                          <span className="text-[13px] font-bold text-foreground truncate">{domain.name}</span>
                                        ) : (
                                          <span className="text-[13px] font-semibold text-foreground-muted/50 italic">Connect</span>
                                        )}
                                      </div>
                                      {domain.name && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setSchemaDomains(prev => prev.filter(d => d.id !== domain.id)); }}
                                          className="p-0.5 rounded text-foreground-muted/0 group-hover:text-foreground-muted hover:!text-danger transition-all shrink-0"
                                        >
                                          <X className="size-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {domain.name && (
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-background-subtle text-foreground-muted border border-border">
                                        {domain.emails.length} emails
                                      </span>
                                      <span className="text-[10px] font-mono text-foreground-secondary tabular-nums">
                                        {domainCapacity}/{locale === "en" ? "day" : "jour"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Vertical connector to emails */}
                              <div className="w-0.5 h-4 bg-border" />

                              {/* Email nodes */}
                              <div className="w-full space-y-2">
                                {domain.emails.map((email, emailIdx) => (
                                  <div key={email.id} className="flex flex-col items-center">
                                    {emailIdx > 0 && <div className="w-0.5 h-2 bg-border" />}
                                    <div
                                      className={cn(
                                        "w-full rounded-lg border px-3 py-2 transition-all cursor-pointer group",
                                        email.address
                                          ? "border-border bg-card hover:border-primary/30 hover:shadow-sm"
                                          : "border-dashed border-foreground-muted/25 bg-background-subtle/50 hover:border-primary/40 hover:bg-primary-subtle/20"
                                      )}
                                      onClick={() => setSchemaNodeConfig({
                                        domainId: domain.id,
                                        emailId: email.id,
                                        email: email.address,
                                        smtpHost: "", smtpPort: "587", smtpUser: email.address, smtpPass: "",
                                        imapHost: "", imapPort: "993", imapUser: "", imapPass: "",
                                        dailyLimit: String(email.limit),
                                        displayName: "",
                                      })}
                                    >
                                      <div className="flex items-center gap-2">
                                        <Mail className={cn("size-3 shrink-0", email.address ? "text-foreground-muted" : "text-foreground-muted/30")} />
                                        {email.address ? (
                                          <span className="text-[11px] text-foreground truncate flex-1">{email.address}</span>
                                        ) : (
                                          <span className="text-[11px] text-foreground-muted/40 italic flex-1">Connect</span>
                                        )}
                                        {email.address && (
                                          <span className="text-[9px] font-mono text-primary font-bold tabular-nums">{email.limit}/j</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}

                                {/* Add email button */}
                                {schemaAddingEmailTo === domain.id ? (
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <input
                                      autoFocus
                                      value={schemaNewEmail}
                                      onChange={(e) => setSchemaNewEmail(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && schemaNewEmail.trim()) {
                                          const addr = schemaNewEmail.trim().includes("@") ? schemaNewEmail.trim() : `${schemaNewEmail.trim()}@${domain.name}`;
                                          setSchemaDomains(prev => prev.map(d => d.id === domain.id ? {
                                            ...d,
                                            emails: [...d.emails, { id: `e${Date.now()}`, address: addr, limit: 100 }],
                                          } : d));
                                          setSchemaNewEmail("");
                                          setSchemaAddingEmailTo(null);
                                        }
                                        if (e.key === "Escape") { setSchemaAddingEmailTo(null); setSchemaNewEmail(""); }
                                      }}
                                      placeholder={`user@${domain.name}`}
                                      className="flex-1 h-7 rounded border border-border bg-card px-2 text-[11px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                    <button
                                      onClick={() => {
                                        if (schemaNewEmail.trim()) {
                                          const addr = schemaNewEmail.trim().includes("@") ? schemaNewEmail.trim() : `${schemaNewEmail.trim()}@${domain.name}`;
                                          setSchemaDomains(prev => prev.map(d => d.id === domain.id ? {
                                            ...d,
                                            emails: [...d.emails, { id: `e${Date.now()}`, address: addr, limit: 100 }],
                                          } : d));
                                          setSchemaNewEmail("");
                                          setSchemaAddingEmailTo(null);
                                        }
                                      }}
                                      className="p-1 text-success hover:bg-success-subtle rounded shrink-0"
                                    ><Check className="size-3" /></button>
                                    <button onClick={() => { setSchemaAddingEmailTo(null); setSchemaNewEmail(""); }} className="p-1 text-foreground-muted hover:bg-background-muted rounded shrink-0">
                                      <X className="size-3" /></button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setSchemaAddingEmailTo(domain.id); setSchemaNewEmail(""); }}
                                    className="w-full py-1.5 rounded-lg border border-dashed border-border text-[10px] text-foreground-muted hover:text-primary hover:border-primary/40 hover:bg-primary-subtle/30 transition-all flex items-center justify-center gap-1"
                                  >
                                    <Plus className="size-3" />
                                    {locale === "en" ? "Add email" : "Ajouter un email"}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Add domain column */}
                        <div className="flex flex-col items-center min-w-[160px] max-w-[200px]">
                          <div className="w-0.5 h-5 bg-border" />
                          {schemaAddingDomain ? (
                            <div className="w-full space-y-2">
                              <input
                                autoFocus
                                value={schemaNewDomain}
                                onChange={(e) => setSchemaNewDomain(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && schemaNewDomain.trim()) {
                                    const name = schemaNewDomain.trim();
                                    setSchemaDomains(prev => [...prev, {
                                      id: `d${Date.now()}`,
                                      name,
                                      emails: [{ id: `e${Date.now()}`, address: `contact@${name}`, limit: 100 }],
                                    }]);
                                    setSchemaNewDomain("");
                                    setSchemaAddingDomain(false);
                                  }
                                  if (e.key === "Escape") { setSchemaAddingDomain(false); setSchemaNewDomain(""); }
                                }}
                                placeholder="domain.com"
                                className="w-full h-8 rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                              />
                              <div className="flex gap-1.5 justify-center">
                                <button
                                  onClick={() => {
                                    if (schemaNewDomain.trim()) {
                                      const name = schemaNewDomain.trim();
                                      setSchemaDomains(prev => [...prev, {
                                        id: `d${Date.now()}`,
                                        name,
                                        emails: [{ id: `e${Date.now()}`, address: `contact@${name}`, limit: 100 }],
                                      }]);
                                      setSchemaNewDomain("");
                                      setSchemaAddingDomain(false);
                                    }
                                  }}
                                  className="p-1.5 text-success hover:bg-success-subtle rounded"
                                ><Check className="size-3.5" /></button>
                                <button onClick={() => { setSchemaAddingDomain(false); setSchemaNewDomain(""); }} className="p-1.5 text-foreground-muted hover:bg-background-muted rounded">
                                  <X className="size-3.5" /></button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setSchemaAddingDomain(true); setSchemaNewDomain(""); }}
                              className="w-full h-[72px] rounded-xl border-2 border-dashed border-border text-foreground-muted hover:text-primary hover:border-primary/40 hover:bg-primary-subtle/20 transition-all flex flex-col items-center justify-center gap-1"
                            >
                              <Plus className="size-5" />
                              <span className="text-[10px] font-medium">{locale === "en" ? "Add domain" : "Ajouter un domaine"}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" onClick={() => setShowAddAccount(true)}>
                    <Plus className="size-4 mr-1" />
                    {locale === "en" ? "Add account" : "Ajouter un compte"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowBulkImport(true)}>
                    <Upload className="size-4 mr-1" />
                    {locale === "en" ? "Bulk import" : "Import en masse"}
                  </Button>
                  <span className="text-xs text-foreground-muted ml-auto">
                    {emailAccounts.length}/100 {locale === "en" ? "accounts" : "comptes"}
                  </span>
                </div>

                {/* Stats bar */}
                {emailAccounts.length > 0 && (
                  <div className="flex gap-4 p-3 rounded-lg bg-background-subtle border border-border text-xs">
                    <div>
                      <span className="text-foreground-muted">{locale === "en" ? "Active" : "Actifs"}: </span>
                      <span className="font-semibold text-success">{emailAccounts.filter(a => a.status === "ACTIVE").length}</span>
                    </div>
                    <div>
                      <span className="text-foreground-muted">{locale === "en" ? "Warming" : "Préchauffage"}: </span>
                      <span className="font-semibold text-warning">{emailAccounts.filter(a => a.status === "WARMING").length}</span>
                    </div>
                    <div>
                      <span className="text-foreground-muted">{locale === "en" ? "Capacity/day" : "Capacité/jour"}: </span>
                      <span className="font-semibold text-foreground">{emailAccounts.filter(a => a.status === "ACTIVE").reduce((sum, a) => sum + a.dailyLimit, 0)}</span>
                    </div>
                    <div>
                      <span className="text-foreground-muted">{locale === "en" ? "Sent today" : "Envoyés aujourd'hui"}: </span>
                      <span className="font-semibold text-foreground">{emailAccounts.reduce((sum, a) => sum + (a.sentTodayDate === new Date().toISOString().split("T")[0] ? a.sentToday : 0), 0)}</span>
                    </div>
                  </div>
                )}

                {/* Loading */}
                {emailAccountsLoading && emailAccounts.length === 0 && (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full rounded-md" />
                    <Skeleton className="h-16 w-full rounded-md" />
                  </div>
                )}

                {/* Empty state */}
                {!emailAccountsLoading && emailAccounts.length === 0 && (
                  <div className="text-center py-8">
                    <SendHorizonal className="size-8 text-foreground-muted/30 mx-auto mb-2" />
                    <p className="text-sm text-foreground-muted">
                      {locale === "en" ? "No email accounts configured yet." : "Aucun compte email configuré."}
                    </p>
                    <p className="text-xs text-foreground-muted/60 mt-1">
                      {locale === "en" ? "Add accounts to enable multi-sender rotation." : "Ajoutez des comptes pour activer la rotation multi-expéditeur."}
                    </p>
                  </div>
                )}

                {/* Account list grouped by domain */}
                {Array.from(domainGroups.entries()).map(([domain, accounts]) => (
                  <div key={domain} className="border border-border rounded-lg overflow-hidden">
                    {/* Domain header */}
                    <div className="px-4 py-2 bg-background-subtle border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe className="size-3.5 text-foreground-muted" />
                        <span className="text-sm font-semibold text-foreground">{domain}</span>
                        <span className="text-xs text-foreground-muted">({accounts.length})</span>
                      </div>
                      {accounts.some(a => a.imapHost) ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-success-subtle text-success border border-success/20">IMAP</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-background-muted text-foreground-muted border border-border">
                          {locale === "en" ? "No IMAP" : "Pas d'IMAP"}
                        </span>
                      )}
                    </div>

                    {/* Accounts */}
                    {accounts.map((account) => {
                      const badge = STATUS_BADGE[account.status] || STATUS_BADGE.ERROR;
                      const today = new Date().toISOString().split("T")[0];
                      const sentToday = account.sentTodayDate === today ? account.sentToday : 0;

                      return (
                        <div key={account.id} className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-background-subtle/50 transition-colors">
                          <div className="flex items-center gap-3">
                            {/* Email + status */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">{account.email}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${badge.class}`}>{badge.label}</span>
                              </div>
                              {account.lastError && (
                                <p className="text-[10px] text-danger mt-0.5 truncate">{account.lastError}</p>
                              )}
                            </div>

                            {/* Daily progress */}
                            <div className="text-right shrink-0 w-20">
                              <div className="text-xs font-mono tabular-nums text-foreground">
                                {sentToday}/{account.dailyLimit}
                              </div>
                              <div className="w-full h-1 bg-background-muted rounded-full mt-1">
                                <div
                                  className="h-1 bg-primary rounded-full transition-all"
                                  style={{ width: `${Math.min(100, (sentToday / account.dailyLimit) * 100)}%` }}
                                />
                              </div>
                            </div>

                            {/* Warm-up indicator */}
                            {account.status === "WARMING" && (
                              <div className="text-center shrink-0 w-14">
                                <Flame className="size-3.5 text-warning mx-auto" />
                                <p className="text-[10px] text-foreground-muted">J{account.warmupDayNumber}</p>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleToggleStatus(account.id, account.status)}
                                className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-muted transition-colors"
                                title={account.status === "ACTIVE" || account.status === "WARMING" ? "Pause" : "Activer"}
                              >
                                {account.status === "ACTIVE" || account.status === "WARMING" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                              </button>
                              <button
                                onClick={() => handleTestAccount(account.id)}
                                className="p-1.5 rounded-md text-foreground-muted hover:text-primary hover:bg-primary-subtle transition-colors"
                                title={locale === "en" ? "Test connection" : "Tester"}
                              >
                                {testingAccountId === account.id ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(account.id)}
                                className="p-1.5 rounded-md text-foreground-muted hover:text-danger hover:bg-danger-subtle transition-colors"
                                title={locale === "en" ? "Delete" : "Supprimer"}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Limit slider */}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] text-foreground-muted w-24 shrink-0">
                              {locale === "en" ? "Daily limit" : "Limite/jour"}
                            </span>
                            <input
                              type="range"
                              min="5"
                              max="500"
                              step="5"
                              value={account.dailyLimit}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setEmailAccounts(prev => prev.map(a => a.id === account.id ? { ...a, dailyLimit: val } : a));
                              }}
                              onMouseUp={(e) => handleUpdateLimit(account.id, parseInt((e.target as HTMLInputElement).value))}
                              onTouchEnd={(e) => handleUpdateLimit(account.id, parseInt((e.target as HTMLInputElement).value))}
                              className="flex-1 h-1 accent-primary cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-foreground w-8 text-right">{account.dailyLimit}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Add Account Modal */}
            {showAddAccount && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-md mx-4 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">
                      {locale === "en" ? "Add Email Account" : "Ajouter un compte email"}
                    </h3>
                    <button onClick={() => setShowAddAccount(false)} className="p-1 text-foreground-muted hover:text-foreground"><X className="size-4" /></button>
                  </div>
                  <div className="space-y-3">
                    <FieldGroup label="Email">
                      <Input value={newAccount.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, email: e.target.value })} placeholder="contact@domain.com" />
                    </FieldGroup>
                    <FieldGroup label={locale === "en" ? "Display name" : "Nom d'affichage"}>
                      <Input value={newAccount.displayName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, displayName: e.target.value })} placeholder="John Doe" />
                    </FieldGroup>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldGroup label={locale === "en" ? "SMTP Host" : "Hôte SMTP"}>
                        <Input value={newAccount.smtpHost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, smtpHost: e.target.value })} placeholder="smtp.zoho.com" />
                      </FieldGroup>
                      <FieldGroup label="Port">
                        <Input value={newAccount.smtpPort} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, smtpPort: e.target.value })} placeholder="587" />
                      </FieldGroup>
                    </div>
                    <FieldGroup label={locale === "en" ? "SMTP User" : "Utilisateur SMTP"}>
                      <Input value={newAccount.smtpUser} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, smtpUser: e.target.value })} placeholder={newAccount.email || "email@domain.com"} />
                    </FieldGroup>
                    <FieldGroup label={locale === "en" ? "Password" : "Mot de passe"}>
                      <Input type="password" value={newAccount.smtpPass} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, smtpPass: e.target.value })} placeholder="••••••••" />
                    </FieldGroup>
                    <FieldGroup label={locale === "en" ? "Daily limit" : "Limite journalière"}>
                      <Input type="number" value={newAccount.dailyLimit} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, dailyLimit: e.target.value })} min="5" max="500" />
                    </FieldGroup>

                    {/* Optional IMAP */}
                    <details className="group">
                      <summary className="text-xs text-foreground-muted cursor-pointer hover:text-foreground">
                        IMAP ({locale === "en" ? "optional, for reply detection" : "optionnel, pour détecter les réponses"})
                      </summary>
                      <div className="mt-2 space-y-3 pl-2 border-l-2 border-border">
                        <div className="grid grid-cols-2 gap-3">
                          <FieldGroup label={locale === "en" ? "IMAP Host" : "Hôte IMAP"}>
                            <Input value={newAccount.imapHost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, imapHost: e.target.value })} placeholder="imap.zoho.com" />
                          </FieldGroup>
                          <FieldGroup label="Port">
                            <Input value={newAccount.imapPort} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, imapPort: e.target.value })} placeholder="993" />
                          </FieldGroup>
                        </div>
                        <FieldGroup label={locale === "en" ? "IMAP User" : "Utilisateur IMAP"}>
                          <Input value={newAccount.imapUser} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, imapUser: e.target.value })} placeholder={newAccount.email || "email@domain.com"} />
                        </FieldGroup>
                        <FieldGroup label={locale === "en" ? "IMAP Password" : "Mot de passe IMAP"}>
                          <Input type="password" value={newAccount.imapPass} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAccount({ ...newAccount, imapPass: e.target.value })} placeholder="••••••••" />
                        </FieldGroup>
                      </div>
                    </details>
                  </div>
                  <div className="flex justify-end gap-2 mt-5">
                    <Button variant="secondary" size="sm" onClick={() => setShowAddAccount(false)}>
                      {locale === "en" ? "Cancel" : "Annuler"}
                    </Button>
                    <Button size="sm" onClick={handleAddAccount}>
                      <Plus className="size-4 mr-1" />
                      {locale === "en" ? "Add" : "Ajouter"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* No account? Create one — Provider guide */}
            <SectionCard
              title={locale === "en" ? "No SMTP account?" : "Pas de compte SMTP ?"}
              description={locale === "en"
                ? "Choose a provider and create your sending accounts in minutes."
                : "Choisissez un fournisseur et créez vos comptes d'envoi en quelques minutes."}
            >
              <Button variant="secondary" size="sm" onClick={() => setShowProviderGuide(true)}>
                <Plus className="size-4 mr-1" />
                {locale === "en" ? "See providers" : "Voir les fournisseurs"}
              </Button>
            </SectionCard>

            {/* DNS Setup Guide */}
            <SectionCard
              title={locale === "en" ? "Domain setup guide" : "Guide de configuration du domaine"}
              description={locale === "en"
                ? "Follow these steps to properly configure your sending domain for maximum deliverability."
                : "Suivez ces étapes pour configurer correctement votre domaine d'envoi et maximiser la délivrabilité."}
            >
              <div className="space-y-4">
                {/* Step 1 */}
                <div className="flex gap-3">
                  <div className="shrink-0 size-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">1</div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {locale === "en" ? "Buy a dedicated domain" : "Acheter un domaine dédié"}
                    </p>
                    <p className="text-xs text-foreground-muted mt-1">
                      {locale === "en"
                        ? "Use a separate domain for outreach (e.g. yourcompany-mail.com). Never use your main business domain. We recommend Cloudflare (~$10/year) or Namecheap (~$11/year)."
                        : "Utilisez un domaine séparé pour la prospection (ex : votreentreprise-mail.com). N'utilisez jamais votre domaine principal. On recommande Cloudflare (~10$/an) ou Namecheap (~11$/an)."}
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-3">
                  <div className="shrink-0 size-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">2</div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {locale === "en" ? "Create email accounts" : "Créer des comptes email"}
                    </p>
                    <p className="text-xs text-foreground-muted mt-1">
                      {locale === "en"
                        ? "Sign up with an email provider (Zoho $1/mailbox, Google Workspace $7.20/user) and create your mailboxes (contact@, info@, hello@, etc.)."
                        : "Inscrivez-vous chez un fournisseur email (Zoho 1$/boîte, Google Workspace 7,20$/user) et créez vos boîtes mail (contact@, info@, hello@, etc.)."}
                    </p>
                  </div>
                </div>

                {/* Step 3 — DNS per provider */}
                {(() => {
                  const dnsProviders = [
                    {
                      id: "zoho",
                      name: "Zoho Mail",
                      logo: <svg className="size-5" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#D4382C"/><text x="6" y="16" fill="white" fontSize="10" fontWeight="bold" fontFamily="sans-serif">Z</text></svg>,
                      spf: 'v=spf1 include:zoho.com ~all',
                      spfGuide: locale === "en" ? "Zoho Admin → Mail Admin → your domain → Email Configuration → SPF → copy the TXT record" : "Zoho Admin → Mail Admin → votre domaine → Configuration Email → SPF → copier le record TXT",
                      dkimSelector: "zmail._domainkey",
                      dkimGuide: locale === "en" ? "Zoho Admin → Mail Admin → your domain → Email Configuration → DKIM" : "Zoho Admin → Mail Admin → votre domaine → Configuration Email → DKIM",
                    },
                    {
                      id: "google",
                      name: "Google Workspace",
                      logo: <svg className="size-5" viewBox="0 0 24 24"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/></svg>,
                      spf: 'v=spf1 include:_spf.google.com ~all',
                      spfGuide: locale === "en" ? "Admin Console → Apps → Google Workspace → Gmail → SPF → use the value above" : "Console Admin → Apps → Google Workspace → Gmail → SPF → utilisez la valeur ci-dessus",
                      dkimSelector: "google._domainkey",
                      dkimGuide: locale === "en" ? "Admin Console → Apps → Google Workspace → Gmail → Authenticate email → Generate new record" : "Console Admin → Apps → Google Workspace → Gmail → Authentifier l'email → Générer un nouvel enregistrement",
                    },
                    {
                      id: "outlook",
                      name: "Microsoft 365",
                      logo: <svg className="size-5" viewBox="0 0 24 24"><path d="M24 7.387v10.478c0 .23-.08.424-.238.576a.806.806 0 01-.588.234h-8.42v-6.56l1.678 1.2a.272.272 0 00.31 0L24 7.387zm-9.246 5.157V5.811l.37-.249h8.05c.23 0 .424.08.588.234.164.155.238.35.238.576v.725l-7.249 5.197-1.997-1.75z" fill="#0072C6"/><path d="M7.254 8.348c.375-.553.877-.83 1.508-.83.591 0 1.073.267 1.448.8.375.534.563 1.227.563 2.08 0 .88-.191 1.594-.574 2.143-.383.55-.882.824-1.497.824-.591 0-1.073-.267-1.448-.8-.375-.534-.563-1.234-.563-2.1 0-.86.188-1.564.563-2.117zM0 3.932l8.674-1.25v18.636L0 20.068V3.932z" fill="#0072C6"/></svg>,
                      spf: 'v=spf1 include:spf.protection.outlook.com ~all',
                      spfGuide: locale === "en" ? "Microsoft 365 Admin → Settings → Domains → your domain → DNS records → add TXT record with the value above" : "Admin Microsoft 365 → Paramètres → Domaines → votre domaine → Enregistrements DNS → ajouter un record TXT avec la valeur ci-dessus",
                      dkimSelector: "selector1._domainkey",
                      dkimGuide: locale === "en" ? "Microsoft 365 Admin → Settings → Domains → your domain → DNS records → DKIM" : "Admin Microsoft 365 → Paramètres → Domaines → votre domaine → Enregistrements DNS → DKIM",
                    },
                    {
                      id: "ses",
                      name: "Amazon SES",
                      logo: <svg className="size-5" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="#FF9900"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#FF9900" fill="none" strokeWidth="1.5"/></svg>,
                      spf: 'v=spf1 include:amazonses.com ~all',
                      spfGuide: locale === "en" ? "AWS SES Console → Verified Identities → your domain → SPF → custom MAIL FROM domain → copy TXT value" : "Console AWS SES → Identités vérifiées → votre domaine → SPF → domaine MAIL FROM personnalisé → copier la valeur TXT",
                      dkimSelector: "*._domainkey",
                      dkimGuide: locale === "en" ? "AWS SES Console → Verified Identities → your domain → DKIM → Easy DKIM → Generate 3 CNAME records" : "Console AWS SES → Identités vérifiées → votre domaine → DKIM → Easy DKIM → Générer 3 enregistrements CNAME",
                    },
                    {
                      id: "sendgrid",
                      name: "SendGrid",
                      logo: <svg className="size-5" viewBox="0 0 24 24"><rect x="0" y="0" width="8" height="8" fill="#1A82E2"/><rect x="8" y="0" width="8" height="8" fill="#1A82E2" opacity="0.6"/><rect x="8" y="8" width="8" height="8" fill="#1A82E2"/><rect x="16" y="8" width="8" height="8" fill="#1A82E2" opacity="0.6"/><rect x="16" y="16" width="8" height="8" fill="#1A82E2"/><rect x="8" y="16" width="8" height="8" fill="#1A82E2" opacity="0.4"/></svg>,
                      spf: 'v=spf1 include:sendgrid.net ~all',
                      spfGuide: locale === "en" ? "SendGrid Dashboard → Settings → Sender Authentication → Authenticate your domain → copy TXT value for SPF" : "Dashboard SendGrid → Paramètres → Authentification d'expéditeur → Authentifier votre domaine → copier la valeur TXT pour SPF",
                      dkimSelector: "s1._domainkey",
                      dkimGuide: locale === "en" ? "SendGrid Dashboard → Settings → Sender Authentication → Authenticate your domain" : "Dashboard SendGrid → Paramètres → Authentification d'expéditeur → Authentifier votre domaine",
                    },
                    {
                      id: "namecheap",
                      name: "Namecheap Email",
                      logo: <svg className="size-5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#DE3723"/><text x="6.5" y="16.5" fill="white" fontSize="11" fontWeight="bold" fontFamily="sans-serif">N</text></svg>,
                      spf: 'v=spf1 include:spf.privateemail.com ~all',
                      spfGuide: locale === "en" ? "Namecheap → Private Email → Domain → DNS Records → copy the SPF TXT value" : "Namecheap → Private Email → Domaine → Enregistrements DNS → copier la valeur TXT du SPF",
                      dkimSelector: "default._domainkey",
                      dkimGuide: locale === "en" ? "Namecheap → Private Email → Domain → DNS Records → copy DKIM value" : "Namecheap → Private Email → Domaine → Enregistrements DNS → copier la valeur DKIM",
                    },
                  ];

                  const activeProvider = dnsProviders.find(p => p.id === activeDnsProvider) || dnsProviders[0];

                  return (
                    <div className="flex gap-3">
                      <div className="shrink-0 size-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">3</div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm font-semibold text-foreground">
                          {locale === "en" ? "Configure DNS records" : "Configurer les enregistrements DNS"}
                        </p>
                        <p className="text-xs text-foreground-muted mt-1 mb-3">
                          {locale === "en"
                            ? "Select your provider below to see the exact DNS records to add."
                            : "Sélectionnez votre fournisseur ci-dessous pour voir les enregistrements DNS exacts à ajouter."}
                        </p>

                        {/* Provider selector */}
                        <div className="flex gap-1.5 flex-wrap mb-4">
                          {dnsProviders.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setActiveDnsProvider(p.id)}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                                activeDnsProvider === p.id
                                  ? "border-primary bg-primary-subtle text-foreground shadow-sm"
                                  : "border-border bg-card text-foreground-muted hover:border-primary/30 hover:text-foreground"
                              )}
                            >
                              {p.logo}
                              {p.name}
                            </button>
                          ))}
                        </div>

                        {/* DNS records for selected provider */}
                        <div className="space-y-2.5">
                          {/* SPF */}
                          <div className="rounded-lg border border-border bg-background-subtle p-3">
                            <div className="flex items-center gap-2 mb-2">
                              {activeProvider.logo}
                              <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary-subtle px-1.5 py-0.5 rounded">SPF</span>
                              <span className="text-xs font-medium text-foreground">
                                {locale === "en" ? "Sender authorization" : "Autorisation d'envoi"}
                              </span>
                            </div>
                            <div className="font-mono text-[11px] bg-background rounded border border-border p-2.5 select-all text-foreground leading-relaxed">
                              TXT &nbsp; @ &nbsp; &quot;{activeProvider.spf}&quot;
                            </div>
                            <div className="flex items-start gap-1.5 mt-2">
                              <Info className="size-3 text-foreground-muted shrink-0 mt-0.5" />
                              <p className="text-[10px] text-foreground-muted leading-relaxed">
                                {activeProvider.spfGuide}
                              </p>
                            </div>
                          </div>

                          {/* DKIM */}
                          <div className="rounded-lg border border-border bg-background-subtle p-3">
                            <div className="flex items-center gap-2 mb-2">
                              {activeProvider.logo}
                              <span className="text-[10px] font-bold uppercase tracking-wider text-success bg-success-subtle px-1.5 py-0.5 rounded">DKIM</span>
                              <span className="text-xs font-medium text-foreground">
                                {locale === "en" ? "Email signature" : "Signature email"}
                              </span>
                            </div>
                            <div className="font-mono text-[11px] bg-background rounded border border-border p-2.5 select-all text-foreground leading-relaxed">
                              TXT &nbsp; <span className="text-success">{activeProvider.dkimSelector}</span> &nbsp; &quot;v=DKIM1; k=rsa; p=<span className="text-foreground-muted">...</span>&quot;
                            </div>
                            <div className="flex items-start gap-1.5 mt-2">
                              <Info className="size-3 text-foreground-muted shrink-0 mt-0.5" />
                              <p className="text-[10px] text-foreground-muted leading-relaxed">
                                {activeProvider.dkimGuide}
                              </p>
                            </div>
                          </div>

                          {/* DMARC — same for all providers */}
                          <div className="rounded-lg border border-border bg-background-subtle p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Shield className="size-4 text-warning" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-warning bg-warning-subtle px-1.5 py-0.5 rounded">DMARC</span>
                              <span className="text-xs font-medium text-foreground">
                                {locale === "en" ? "Anti-spoofing policy" : "Politique anti-usurpation"}
                              </span>
                              <span className="text-[9px] text-foreground-muted ml-auto">
                                {locale === "en" ? "Same for all providers" : "Identique pour tous les fournisseurs"}
                              </span>
                            </div>
                            <div className="font-mono text-[11px] bg-background rounded border border-border p-2.5 select-all text-foreground leading-relaxed">
                              TXT &nbsp; <span className="text-warning">_dmarc</span> &nbsp; &quot;v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com&quot;
                            </div>
                            <p className="text-[10px] text-foreground-muted mt-1.5">
                              {locale === "en"
                                ? "Start with p=none (monitoring). After 2-4 weeks → p=quarantine → p=reject."
                                : "Commencez avec p=none (surveillance). Après 2-4 semaines → p=quarantine → p=reject."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Step 4 — Tracking domain */}
                <div className="flex gap-3">
                  <div className="shrink-0 size-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">4</div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {locale === "en" ? "Custom tracking domain (optional)" : "Domaine de tracking personnalisé (optionnel)"}
                    </p>
                    <p className="text-xs text-foreground-muted mt-1 mb-2">
                      {locale === "en"
                        ? "Add a CNAME record so open tracking and unsubscribe links use your domain instead of LeadNova's."
                        : "Ajoutez un enregistrement CNAME pour que les pixels de tracking et liens de désinscription utilisent votre domaine au lieu de celui de LeadNova."}
                    </p>
                    <div className="rounded-lg border border-border bg-background-subtle p-3">
                      <div className="font-mono text-[11px] bg-background rounded border border-border p-2 select-all text-foreground">
                        CNAME &nbsp; <span className="text-primary">track</span> &nbsp; → &nbsp; {typeof window !== "undefined" ? window.location.hostname : "leadnova.one"}
                      </div>
                      <p className="text-[10px] text-foreground-muted mt-1.5">
                        {locale === "en"
                          ? "Then go to Settings → Email → Custom Tracking Domain and enter track.yourdomain.com"
                          : "Puis allez dans Paramètres → Email → Domaine de tracking personnalisé et entrez track.votredomaine.com"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 5 — Connect */}
                <div className="flex gap-3">
                  <div className="shrink-0 size-7 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">5</div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {locale === "en" ? "Connect in LeadNova" : "Connecter dans LeadNova"}
                    </p>
                    <p className="text-xs text-foreground-muted mt-1">
                      {locale === "en"
                        ? "Click on the nodes in the architecture diagram above or use the \"Add account\" button to enter your SMTP credentials. The warm-up process starts automatically — your accounts will be promoted to Active once ready."
                        : "Cliquez sur les nodes dans le diagramme d'architecture ci-dessus ou utilisez le bouton « Ajouter un compte » pour entrer vos identifiants SMTP. Le processus de préchauffage démarre automatiquement — vos comptes seront promus en Actif une fois prêts."}
                    </p>
                  </div>
                </div>

                {/* Wait times */}
                <div className="rounded-lg border border-border bg-background-subtle p-4">
                  <p className="text-xs font-semibold text-foreground mb-2">
                    {locale === "en" ? "Typical timeline" : "Calendrier typique"}
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-foreground">24h</p>
                      <p className="text-[10px] text-foreground-muted">{locale === "en" ? "DNS propagation" : "Propagation DNS"}</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">2-4</p>
                      <p className="text-[10px] text-foreground-muted">{locale === "en" ? "weeks warm-up" : "semaines préchauffage"}</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-success">100%</p>
                      <p className="text-[10px] text-foreground-muted">{locale === "en" ? "full capacity" : "pleine capacité"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Node Config Popup */}
            {schemaNodeConfig && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-md mx-4 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">
                      {schemaNodeConfig.email
                        ? (locale === "en" ? "Edit account" : "Modifier le compte")
                        : (locale === "en" ? "Connect account" : "Connecter un compte")}
                    </h3>
                    <button onClick={() => setSchemaNodeConfig(null)} className="p-1 text-foreground-muted hover:text-foreground"><X className="size-4" /></button>
                  </div>
                  <div className="space-y-3">
                    <FieldGroup label="Email">
                      <Input
                        value={schemaNodeConfig.email}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, email: e.target.value })}
                        placeholder="contact@domain.com"
                      />
                    </FieldGroup>
                    <FieldGroup label={locale === "en" ? "Display name" : "Nom d'affichage"}>
                      <Input
                        value={schemaNodeConfig.displayName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, displayName: e.target.value })}
                        placeholder="John Doe"
                      />
                    </FieldGroup>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldGroup label={locale === "en" ? "SMTP Host" : "Hôte SMTP"}>
                        <Input
                          value={schemaNodeConfig.smtpHost}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, smtpHost: e.target.value })}
                          placeholder="smtp.zoho.com"
                        />
                      </FieldGroup>
                      <FieldGroup label="Port">
                        <Input
                          value={schemaNodeConfig.smtpPort}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, smtpPort: e.target.value })}
                          placeholder="587"
                        />
                      </FieldGroup>
                    </div>
                    <FieldGroup label={locale === "en" ? "SMTP User" : "Utilisateur SMTP"}>
                      <Input
                        value={schemaNodeConfig.smtpUser}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, smtpUser: e.target.value })}
                        placeholder={schemaNodeConfig.email || "email@domain.com"}
                      />
                    </FieldGroup>
                    <FieldGroup label={locale === "en" ? "Password" : "Mot de passe"}>
                      <Input
                        type="password"
                        value={schemaNodeConfig.smtpPass}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, smtpPass: e.target.value })}
                        placeholder="••••••••"
                      />
                    </FieldGroup>
                    <FieldGroup label={locale === "en" ? "Daily send limit" : "Limite d'envoi par jour"}>
                      <Input
                        type="number"
                        value={schemaNodeConfig.dailyLimit}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, dailyLimit: e.target.value })}
                        min="5"
                        max="500"
                      />
                    </FieldGroup>

                    {/* IMAP */}
                    <details className="group">
                      <summary className="text-xs text-foreground-muted cursor-pointer hover:text-foreground">
                        IMAP ({locale === "en" ? "optional, for reply detection" : "optionnel, pour détecter les réponses"})
                      </summary>
                      <div className="mt-2 space-y-3 pl-2 border-l-2 border-border">
                        <div className="grid grid-cols-2 gap-3">
                          <FieldGroup label={locale === "en" ? "IMAP Host" : "Hôte IMAP"}>
                            <Input
                              value={schemaNodeConfig.imapHost}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, imapHost: e.target.value })}
                              placeholder="imap.zoho.com"
                            />
                          </FieldGroup>
                          <FieldGroup label="Port">
                            <Input
                              value={schemaNodeConfig.imapPort}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, imapPort: e.target.value })}
                              placeholder="993"
                            />
                          </FieldGroup>
                        </div>
                        <FieldGroup label={locale === "en" ? "IMAP User" : "Utilisateur IMAP"}>
                          <Input
                            value={schemaNodeConfig.imapUser}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, imapUser: e.target.value })}
                            placeholder={schemaNodeConfig.email || "email@domain.com"}
                          />
                        </FieldGroup>
                        <FieldGroup label={locale === "en" ? "IMAP Password" : "Mot de passe IMAP"}>
                          <Input
                            type="password"
                            value={schemaNodeConfig.imapPass}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSchemaNodeConfig({ ...schemaNodeConfig, imapPass: e.target.value })}
                            placeholder="••••••••"
                          />
                        </FieldGroup>
                      </div>
                    </details>
                  </div>
                  <div className="flex justify-between mt-5">
                    <div>
                      {schemaNodeConfig.emailId && schemaNodeConfig.email && (
                        <Button
                          variant="danger-ghost"
                          size="sm"
                          onClick={() => {
                            setSchemaDomains(prev => prev.map(d => d.id === schemaNodeConfig.domainId ? {
                              ...d,
                              emails: d.emails.filter(em => em.id !== schemaNodeConfig.emailId),
                            } : d));
                            setSchemaNodeConfig(null);
                          }}
                        >
                          <Trash2 className="size-3.5 mr-1" />
                          {locale === "en" ? "Remove" : "Supprimer"}
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setSchemaNodeConfig(null)}>
                        {locale === "en" ? "Cancel" : "Annuler"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          const cfg = schemaNodeConfig;
                          const emailAddr = cfg.email.trim();
                          if (!emailAddr || !emailAddr.includes("@")) {
                            showToast(locale === "en" ? "Enter a valid email" : "Entrez un email valide", "error");
                            return;
                          }
                          // Update the schema visual
                          setSchemaDomains(prev => prev.map(d => d.id === cfg.domainId ? {
                            ...d,
                            name: d.name || emailAddr.split("@")[1],
                            emails: d.emails.map(em => em.id === cfg.emailId ? {
                              ...em,
                              address: emailAddr,
                              limit: parseInt(cfg.dailyLimit) || 100,
                            } : em),
                          } : d));
                          // Also create the real account via API
                          if (cfg.smtpHost && cfg.smtpPass) {
                            const res = await fetch("/api/email-accounts", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                email: emailAddr,
                                displayName: cfg.displayName || null,
                                smtpHost: cfg.smtpHost,
                                smtpPort: cfg.smtpPort,
                                smtpUser: cfg.smtpUser || emailAddr,
                                smtpPass: cfg.smtpPass,
                                imapHost: cfg.imapHost || null,
                                imapPort: cfg.imapPort || "993",
                                imapUser: cfg.imapUser || null,
                                imapPass: cfg.imapPass || null,
                                dailyLimit: cfg.dailyLimit || "100",
                              }),
                            });
                            const data = await res.json();
                            if (res.ok) {
                              showToast(locale === "en" ? "Account connected!" : "Compte connecté !", "success");
                              fetchEmailAccounts();
                            } else {
                              showToast(data.error || "Erreur", "error");
                            }
                          }
                          setSchemaNodeConfig(null);
                        }}
                      >
                        <Check className="size-4 mr-1" />
                        {locale === "en" ? "Connect" : "Connecter"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Provider Guide Modal */}
            {showProviderGuide && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[85vh] overflow-y-auto">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-semibold text-foreground text-lg">
                      {locale === "en" ? "Choose an email provider" : "Choisir un fournisseur email"}
                    </h3>
                    <button onClick={() => setShowProviderGuide(false)} className="p-1 text-foreground-muted hover:text-foreground"><X className="size-4" /></button>
                  </div>
                  <p className="text-xs text-foreground-muted mb-4">
                    {locale === "en"
                      ? "Create accounts with one of these providers, then add them in LeadNova with their SMTP credentials."
                      : "Créez des comptes chez un de ces fournisseurs, puis ajoutez-les dans LeadNova avec leurs identifiants SMTP."}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      {
                        name: "Zoho Mail",
                        price: locale === "en" ? "$1/mailbox/mo" : "1$/boîte/mois",
                        smtp: "smtp.zoho.com:587",
                        imap: "imap.zoho.com:993",
                        url: "https://www.zoho.com/mail/",
                        recommended: true,
                        desc: locale === "en"
                          ? "Best value. $1/mailbox, easy setup, good deliverability. Recommended for cold outreach."
                          : "Meilleur rapport qualité/prix. 1$/boîte, setup facile, bonne délivrabilité. Recommandé pour la prospection.",
                      },
                      {
                        name: "Google Workspace",
                        price: locale === "en" ? "$7.20/user/mo" : "7,20$/user/mois",
                        smtp: "smtp.gmail.com:587",
                        imap: "imap.gmail.com:993",
                        url: "https://workspace.google.com/",
                        recommended: false,
                        desc: locale === "en"
                          ? "Premium reputation. Higher cost but excellent deliverability. Use App Passwords for SMTP."
                          : "Réputation premium. Plus cher mais excellente délivrabilité. Utilisez les mots de passe d'application.",
                      },
                      {
                        name: "Microsoft 365",
                        price: locale === "en" ? "$6/user/mo" : "6$/user/mois",
                        smtp: "smtp.office365.com:587",
                        imap: "outlook.office365.com:993",
                        url: "https://www.microsoft.com/en-us/microsoft-365/business/",
                        recommended: false,
                        desc: locale === "en"
                          ? "Good for B2B. Strong reputation with corporate recipients."
                          : "Bon pour le B2B. Forte réputation auprès des destinataires corporatifs.",
                      },
                      {
                        name: "Amazon SES",
                        price: locale === "en" ? "$0.10/1000 emails" : "0,10$/1000 emails",
                        smtp: "email-smtp.us-east-1.amazonaws.com:587",
                        imap: "—",
                        url: "https://aws.amazon.com/ses/",
                        recommended: false,
                        desc: locale === "en"
                          ? "Cheapest at volume. No mailbox — SMTP only. No IMAP (use another provider for replies)."
                          : "Le moins cher en volume. Pas de boîte mail — SMTP seulement. Pas d'IMAP (utilisez un autre fournisseur pour les réponses).",
                      },
                      {
                        name: "SendGrid",
                        price: locale === "en" ? "$19.95/mo (50k emails)" : "19,95$/mois (50k emails)",
                        smtp: "smtp.sendgrid.net:587",
                        imap: "—",
                        url: "https://sendgrid.com/",
                        recommended: false,
                        desc: locale === "en"
                          ? "Transactional email platform. API key as SMTP password. No IMAP."
                          : "Plateforme email transactionnelle. Clé API comme mot de passe SMTP. Pas d'IMAP.",
                      },
                      {
                        name: "Namecheap Email",
                        price: locale === "en" ? "$1.09/mailbox/mo" : "1,09$/boîte/mois",
                        smtp: "mail.privateemail.com:587",
                        imap: "mail.privateemail.com:993",
                        url: "https://www.namecheap.com/hosting/email/",
                        recommended: false,
                        desc: locale === "en"
                          ? "Affordable with domain purchase. Good for secondary domains."
                          : "Abordable avec achat de domaine. Bon pour les domaines secondaires.",
                      },
                      {
                        name: "Hostinger Email",
                        price: locale === "en" ? "$0.99/mailbox/mo" : "0,99$/boîte/mois",
                        smtp: "smtp.hostinger.com:465",
                        imap: "imap.hostinger.com:993",
                        url: "https://www.hostinger.com/email",
                        recommended: false,
                        desc: locale === "en"
                          ? "Budget option. Good enough for outreach with proper warm-up."
                          : "Option budget. Suffisant pour la prospection avec un bon préchauffage.",
                      },
                      {
                        name: "Mailgun",
                        price: locale === "en" ? "$0.80/1000 emails" : "0,80$/1000 emails",
                        smtp: "smtp.mailgun.org:587",
                        imap: "—",
                        url: "https://www.mailgun.com/",
                        recommended: false,
                        desc: locale === "en"
                          ? "Developer-friendly API + SMTP. Good analytics. No IMAP."
                          : "API + SMTP orienté développeurs. Bonnes analytics. Pas d'IMAP.",
                      },
                    ].map((provider) => (
                      <div
                        key={provider.name}
                        className={cn(
                          "rounded-xl border p-5 flex flex-col transition-all",
                          provider.recommended
                            ? "border-primary/40 bg-primary-subtle shadow-sm"
                            : "border-border bg-card hover:border-primary/20 hover:shadow-sm"
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-[15px] tracking-tight text-foreground">{provider.name}</span>
                          {provider.recommended && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-white font-semibold tracking-wide uppercase">
                              {locale === "en" ? "Recommended" : "Recommandé"}
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] leading-relaxed text-foreground-secondary mb-3 flex-1">{provider.desc}</p>
                        <div className="rounded-md bg-background-subtle border border-border px-3 py-2 space-y-1 mb-3">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-foreground-muted font-medium">SMTP</span>
                            <span className="font-mono text-foreground">{provider.smtp}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-foreground-muted font-medium">IMAP</span>
                            <span className="font-mono text-foreground">{provider.imap}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border">
                            <span className="text-foreground-muted font-medium">{locale === "en" ? "Price" : "Prix"}</span>
                            <span className="font-semibold text-foreground text-xs">{provider.price}</span>
                          </div>
                        </div>
                        <a
                          href={provider.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:text-primary-hover font-semibold transition-colors mt-auto"
                        >
                          {locale === "en" ? "Create account" : "Créer un compte"} <ArrowRight className="size-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-5">
                    <Button variant="secondary" size="sm" onClick={() => setShowProviderGuide(false)}>
                      {locale === "en" ? "Close" : "Fermer"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Bulk Import Modal */}
            {showBulkImport && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-lg mx-4 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground">
                      {locale === "en" ? "Bulk Import" : "Import en masse"}
                    </h3>
                    <button onClick={() => setShowBulkImport(false)} className="p-1 text-foreground-muted hover:text-foreground"><X className="size-4" /></button>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs text-foreground-muted">
                      {locale === "en"
                        ? "One account per line: email:password or email:password:host:port"
                        : "Un compte par ligne : email:motdepasse ou email:motdepasse:host:port"}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldGroup label={locale === "en" ? "Default SMTP host" : "Hôte SMTP par défaut"}>
                        <Input value={bulkHost} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBulkHost(e.target.value)} placeholder="smtp.zoho.com" />
                      </FieldGroup>
                      <FieldGroup label={locale === "en" ? "Default port" : "Port par défaut"}>
                        <Input value={bulkPort} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBulkPort(e.target.value)} placeholder="587" />
                      </FieldGroup>
                    </div>
                    <textarea
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      rows={8}
                      className="w-full rounded-md border border-border bg-background p-3 text-xs font-mono text-foreground placeholder:text-foreground-muted/50 outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder={`contact1@domain1.com:password123\ninfo@domain2.com:password456\nhello@domain3.com:pass789:smtp.custom.com:587`}
                    />
                    <p className="text-xs text-foreground-muted">
                      {bulkText.split("\n").filter(l => l.trim() && l.includes(":")).length} {locale === "en" ? "accounts detected" : "comptes détectés"}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2 mt-5">
                    <Button variant="secondary" size="sm" onClick={() => setShowBulkImport(false)}>
                      {locale === "en" ? "Cancel" : "Annuler"}
                    </Button>
                    <Button size="sm" onClick={handleBulkImport}>
                      <Upload className="size-4 mr-1" />
                      {locale === "en" ? "Import" : "Importer"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
                      max={5}
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

                {/* Per-follow-up delay configuration */}
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-sm font-medium text-foreground-secondary mb-1">
                    {t("settings", "followUpDelaysTitle")}
                  </p>
                  <p className="text-xs text-muted mb-3">
                    {t("settings", "followUpDelaysDesc")}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {Array.from({ length: 5 }).map((_, idx) => {
                      const delays = settings.automation.followUpDelays || [3, 5, 7, 10, 14];
                      return (
                        <div key={idx}>
                          <label className="text-xs text-foreground-muted block mb-1">
                            Follow-up {idx + 1}
                          </label>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={1}
                              max={60}
                              value={delays[idx] ?? (idx + 1) * 3}
                              onChange={(e) => {
                                const updated = [...delays];
                                updated[idx] = Math.max(1, Number(e.target.value) || 1);
                                updateField("automation", "followUpDelays", updated);
                              }}
                              disabled={idx >= (settings.automation.maxFollowUps || 5)}
                              className={idx >= (settings.automation.maxFollowUps || 5) ? "opacity-40" : ""}
                            />
                            <span className="text-xs text-foreground-muted shrink-0">{t("settings", "daysUnit")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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

              {/* Région / Pays */}
              <div>
                <p className="text-sm font-medium text-foreground-secondary mb-2">
                  Région de recherche
                </p>
                <p className="text-xs text-muted mb-3">
                  Pays utilisé pour les recherches Google Maps
                </p>
                <select
                  value={settings.targeting.region || "CA"}
                  onChange={(e) => {
                    setSettings({
                      ...settings,
                      targeting: { ...settings.targeting, region: e.target.value },
                    });
                    setHasUnsaved(true);
                  }}
                  className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
                >
                  <option value="CA">🇨🇦 Canada</option>
                  <option value="US">🇺🇸 États-Unis</option>
                  <option value="FR">🇫🇷 France</option>
                  <option value="BE">🇧🇪 Belgique</option>
                  <option value="CH">🇨🇭 Suisse</option>
                  <option value="GB">🇬🇧 Royaume-Uni</option>
                  <option value="AU">🇦🇺 Australie</option>
                </select>
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

              {/* Review count filter */}
              <div className="pt-4 border-t border-border">
                <p className="text-sm font-medium text-foreground-secondary mb-1">
                  {t("settings", "reviewFilter")}
                </p>
                <p className="text-xs text-muted mb-3">
                  {t("settings", "reviewFilterDesc")}
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-foreground-muted mb-1 block">Min</label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={(settings.targeting as Record<string, unknown>).minReviews as number ?? ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value) || 0);
                        setSettings({
                          ...settings,
                          targeting: { ...settings.targeting, minReviews: val } as typeof settings.targeting,
                        });
                        setHasUnsaved(true);
                      }}
                    />
                  </div>
                  <span className="text-foreground-muted text-sm mt-5">—</span>
                  <div className="flex-1">
                    <label className="text-xs text-foreground-muted mb-1 block">Max</label>
                    <Input
                      type="number"
                      min={0}
                      placeholder={t("settings", "noLimit")}
                      value={(settings.targeting as Record<string, unknown>).maxReviews as number ?? ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? undefined : Math.max(0, parseInt(e.target.value) || 0);
                        setSettings({
                          ...settings,
                          targeting: { ...settings.targeting, maxReviews: val } as typeof settings.targeting,
                        });
                        setHasUnsaved(true);
                      }}
                    />
                  </div>
                </div>
                {(() => {
                  const t_min = (settings.targeting as Record<string, unknown>).minReviews as number | undefined;
                  const t_max = (settings.targeting as Record<string, unknown>).maxReviews as number | undefined;
                  if (t_min != null && t_max != null && t_min > t_max) {
                    return <p className="text-xs text-danger mt-1">{t("settings", "reviewFilterError")}</p>;
                  }
                  return null;
                })()}
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

      // === PLANS & TARIFICATION ===
      case "subscription": {
        const PLANS = [
          {
            id: "starter" as const,
            name: t("settings", "planStarter"),
            price: 39,
            icon: Sparkles,
            maxDiscoveries: 5000,
            maxEnrichments: 5000,
            maxEmails: 1000,
            campaigns: 5,
            badge: null,
            color: "primary",
          },
          {
            id: "growth" as const,
            name: t("settings", "planGrowth"),
            price: 109,
            icon: Rocket,
            maxDiscoveries: 15000,
            maxEnrichments: 15000,
            maxEmails: 5000,
            campaigns: 20,
            badge: t("settings", "mostPopular"),
            color: "accent",
          },
          {
            id: "pro" as const,
            name: t("settings", "planPro"),
            price: 209,
            icon: Crown,
            maxDiscoveries: 50000,
            maxEnrichments: 50000,
            maxEmails: 15000,
            campaigns: -1,
            badge: t("settings", "bestValue"),
            color: "success",
          },
        ];

        const currentPlan = settings.subscription.plan;
        const currentPlanIndex = PLANS.findIndex((p) => p.id === currentPlan);
        const used = settings.subscription.discoveriesUsedThisMonth || 0;
        const max = settings.subscription.maxDiscoveriesPerMonth || 5000;
        const usagePercent = Math.min(100, Math.round((used / max) * 100));

        async function handlePlanChange(planId: "starter" | "growth" | "pro") {
          if (!settings || planId === currentPlan) return;
          const plan = PLANS.find((p) => p.id === planId)!;
          if (!confirm(`${t("settings", "confirmPlanChangeDesc")} ${plan.name} (${plan.price}$ USD${t("settings", "perMonth")}) ?`)) return;
          const updated = {
            ...settings.subscription,
            plan: planId,
            maxDiscoveriesPerMonth: plan.maxDiscoveries,
            maxEmailsPerMonth: plan.maxEmails,
          };
          setSettings({ ...settings, subscription: updated } as Settings);
          await saveSection("subscription", updated as unknown as Record<string, unknown>);
          showToast(t("settings", "planChanged"), "success");
        }

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
              {/* Usage bar */}
              <div className="bg-background-subtle rounded-lg p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-foreground">{t("settings", "usageThisPeriod")}</p>
                  <Badge variant={usagePercent >= 90 ? "danger" : usagePercent >= 70 ? "warning" : "success"}>
                    {used.toLocaleString()} / {max.toLocaleString()} {t("settings", "discoveries")}
                  </Badge>
                </div>
                <div className="w-full bg-background-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      usagePercent >= 90 ? "bg-danger" : usagePercent >= 70 ? "bg-warning" : "bg-success"
                    )}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <p className="text-xs text-foreground-muted mt-2">{usagePercent}% {t("settings", "discoveriesUsed").toLowerCase()}</p>
              </div>

              {/* Plan cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLANS.map((plan, idx) => {
                  const isCurrent = plan.id === currentPlan;
                  const isUpgrade = idx > currentPlanIndex;
                  const PlanIcon = plan.icon;

                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        "relative rounded-xl border-2 p-5 transition-all",
                        isCurrent
                          ? "border-primary bg-primary-subtle shadow-md"
                          : "border-border hover:border-foreground-muted hover:shadow-sm"
                      )}
                    >
                      {/* Badge */}
                      {plan.badge && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                          <span className="bg-accent text-white text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full whitespace-nowrap">
                            {plan.badge}
                          </span>
                        </div>
                      )}

                      {/* Header */}
                      <div className="flex items-center gap-2 mb-3">
                        <PlanIcon className={cn("w-5 h-5", isCurrent ? "text-primary" : "text-foreground-muted")} />
                        <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                      </div>

                      {/* Price */}
                      <div className="mb-4">
                        <span className="text-3xl font-extrabold text-foreground">{plan.price}$</span>
                        <span className="text-sm text-foreground-muted ml-1">USD{t("settings", "perMonth")}</span>
                      </div>

                      {/* Features */}
                      <ul className="space-y-2 mb-5 text-sm">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-success shrink-0" />
                          <span className="text-foreground">{plan.maxDiscoveries.toLocaleString()} {t("settings", "planFeatureDiscoveries")}</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-success shrink-0" />
                          <span className="text-foreground">{plan.maxEnrichments.toLocaleString()} {t("settings", "planFeatureEnrichments")}</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-success shrink-0" />
                          <span className="text-foreground">{plan.maxEmails.toLocaleString()} {t("settings", "planFeatureEmails")}</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-success shrink-0" />
                          <span className="text-foreground">{plan.campaigns === -1 ? t("settings", "planFeatureUnlimited") : plan.campaigns} {t("settings", "planFeatureCampaigns")}</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-success shrink-0" />
                          <span className="text-foreground">{t("settings", "planFeatureVerification")}</span>
                        </li>
                        {plan.id === "pro" && (
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-success shrink-0" />
                            <span className="text-foreground">{t("settings", "planFeatureSupport")}</span>
                          </li>
                        )}
                      </ul>

                      {/* CTA */}
                      {isCurrent ? (
                        <div className="w-full py-2 px-4 rounded-lg bg-primary/10 text-primary text-sm font-semibold text-center">
                          {t("settings", "currentPlanBadge")}
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePlanChange(plan.id)}
                          disabled={saving}
                          className={cn(
                            "w-full py-2 px-4 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5",
                            isUpgrade
                              ? "bg-primary text-white hover:bg-primary/90"
                              : "bg-background-muted text-foreground-secondary hover:bg-background-subtle"
                          )}
                        >
                          {isUpgrade ? t("settings", "upgradePlan") : t("settings", "downgradePlan")}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </motion.div>
        );
      }

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
                ids: ["email", "emailAccounts", "campaigns", "automation"],
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
            {isAdmin && (
              <div>
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-foreground-muted/60">
                  Admin
                </p>
                <div className="space-y-0.5">
                  <a
                    href="/notes"
                    className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5 text-foreground-muted hover:bg-card-hover"
                  >
                    <StickyNote className="size-4 shrink-0" />
                    Notes
                  </a>
                </div>
              </div>
            )}
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
