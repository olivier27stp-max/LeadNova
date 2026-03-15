"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { motion, AnimatePresence } from "motion/react";
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
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────

interface Settings {
  company: {
    name: string;
    brandName: string;
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
    autoSend: boolean;
    autoFollowUp: boolean;
    autoReminder: boolean;
    internalNotifications: boolean;
    errorAlerts: boolean;
    followUpDelayDays: number;
    maxFollowUps: number;
    followUpIntervalDays: number;
    stopOnReply: boolean;
    stopOnExcluded: boolean;
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

const SECTIONS = [
  { id: "company", label: "Entreprise", icon: Building2 },
  { id: "team", label: "Équipe", icon: Users },
  { id: "prospects", label: "Prospects", icon: UserSearch },
  { id: "campaigns", label: "Campagnes", icon: Megaphone },
  { id: "automation", label: "Automatisation", icon: Zap },
  { id: "templates", label: "Templates email", icon: FileText },
  { id: "targeting", label: "Ciblage recherche", icon: Target },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "appearance", label: "Apparence", icon: Palette },
  { id: "security", label: "Sécurité", icon: Shield },
  { id: "subscription", label: "Abonnement", icon: CreditCard },
  { id: "activity", label: "Centre des activités", icon: Activity },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

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
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onSave?: () => void;
  saving?: boolean;
  hasUnsaved?: boolean;
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
        {hasUnsaved && <Badge variant="warning">Non sauvegard&eacute;</Badge>}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">{children}</div>
        {onSave && (
          <Button
            onClick={onSave}
            disabled={saving || !hasUnsaved}
            className="mt-6"
          >
            {saving ? "Sauvegarde..." : "Enregistrer"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    connected: { color: "bg-success", label: "Connecté" },
    not_configured: { color: "bg-muted", label: "Non configuré" },
    error: { color: "bg-danger", label: "Erreur" },
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
  const [activeSection, setActiveSection] = useState<SectionId>("company");

  // Read ?section= from URL on mount to deep-link to a specific tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    if (section && SECTIONS.some((s) => s.id === section)) {
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
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("USER");


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
  const [newCity, setNewCity] = useState("");
  const [newQuery, setNewQuery] = useState("");
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [bulkCities, setBulkCities] = useState("");
  const [showBulkKeywords, setShowBulkKeywords] = useState(false);
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
    setToast({ message: `${data.cleared} prospects mis à jour`, type: "success" });
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
    if (activeSection === "team") loadUsers();
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
      setToast({
        message: `${toAdd.length} ajouté${toAdd.length > 1 ? "s" : ""}, ${parsed.length - toAdd.length} doublon${parsed.length - toAdd.length > 1 ? "s" : ""} ignoré${parsed.length - toAdd.length > 1 ? "s" : ""}`,
        type: "success",
      });
    } else {
      setToast({
        message: `${toAdd.length} mot${toAdd.length > 1 ? "s" : ""}-clé${toAdd.length > 1 ? "s" : ""} ajouté${toAdd.length > 1 ? "s" : ""}`,
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
      setToast({
        message: `${toAdd.length} ajoutée${toAdd.length > 1 ? "s" : ""}, ${parsed.length - toAdd.length} doublon${parsed.length - toAdd.length > 1 ? "s" : ""} ignoré${parsed.length - toAdd.length > 1 ? "s" : ""}`,
        type: "success",
      });
    } else {
      setToast({
        message: `${toAdd.length} ville${toAdd.length > 1 ? "s" : ""} ajoutée${toAdd.length > 1 ? "s" : ""}`,
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
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      setSettings(updated as Settings);
      setHasUnsaved(false);
      showToast("Paramètres enregistrés", "success");
    } catch {
      showToast("Erreur lors de la sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  }

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
      showToast("Le mot de passe doit contenir au moins 8 caractères", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Les mots de passe ne correspondent pas", "error");
      return;
    }
    // Use first user as current user (no auth system yet)
    const userId = users[0]?.id;
    if (!userId) {
      showToast("Aucun utilisateur trouvé", "error");
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
      showToast("Mot de passe modifié avec succès", "success");
      setShowChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Erreur lors du changement",
        "error"
      );
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSetup2FA() {
    const userId = users[0]?.id;
    if (!userId) {
      showToast("Aucun utilisateur trouvé", "error");
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
        err instanceof Error ? err.message : "Erreur 2FA",
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
      showToast("Authentification 2FA activée", "success");
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
      showToast("Authentification 2FA désactivée", "success");
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

  async function handleAddUser() {
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          role: newUserRole,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      setNewUserName("");
      setNewUserEmail("");
      setNewUserRole("USER");
      setShowAddUser(false);
      loadUsers();
      showToast("Utilisateur ajouté", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erreur", "error");
    }
  }

  async function handleToggleUser(user: User) {
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, active: !user.active }),
      });
      loadUsers();
    } catch {
      showToast("Erreur", "error");
    }
  }

  async function handleChangeRole(userId: string, role: string) {
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, role }),
      });
      loadUsers();
    } catch {
      showToast("Erreur", "error");
    }
  }

  async function handleDeleteUser(id: string) {
    try {
      await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      loadUsers();
      showToast("Utilisateur supprimé", "success");
    } catch {
      showToast("Erreur", "error");
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
      showToast("Template créé", "success");
    } catch {
      showToast("Erreur", "error");
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
      showToast("Template modifié", "success");
    } catch {
      showToast("Erreur", "error");
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
      loadTemplates();
      showToast("Template archivé", "success");
    } catch {
      showToast("Erreur", "error");
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
          Impossible de charger les param&egrave;tres.
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
              title="Informations de l'entreprise"
              description="Ces donn&eacute;es sont utilis&eacute;es dans les emails, campagnes et templates."
              onSave={() => saveSection("company", settings.company)}
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldGroup label="Nom de l'entreprise">
                  <Input
                    value={settings.company.name}
                    onChange={(e) => updateField("company", "name", e.target.value)}
                    placeholder="Mon entreprise inc."
                  />
                </FieldGroup>
                <FieldGroup label="Nom commercial">
                  <Input
                    value={settings.company.brandName}
                    onChange={(e) => updateField("company", "brandName", e.target.value)}
                    placeholder="Free Leads"
                  />
                </FieldGroup>
                <FieldGroup label="Email de contact">
                  <Input
                    value={settings.company.email}
                    onChange={(e) => updateField("company", "email", e.target.value)}
                    type="email"
                    placeholder="info@monentreprise.com"
                  />
                </FieldGroup>
                <FieldGroup label="T&eacute;l&eacute;phone">
                  <Input
                    value={settings.company.phone}
                    onChange={(e) => updateField("company", "phone", e.target.value)}
                    placeholder="(514) 555-0000"
                  />
                </FieldGroup>
                <FieldGroup label="Site web">
                  <Input
                    value={settings.company.website}
                    onChange={(e) => updateField("company", "website", e.target.value)}
                    placeholder="https://monentreprise.com"
                  />
                </FieldGroup>
                <FieldGroup label="Adresse">
                  <Input
                    value={settings.company.address}
                    onChange={(e) => updateField("company", "address", e.target.value)}
                    placeholder="123 Rue Principale"
                  />
                </FieldGroup>
                <FieldGroup label="Ville">
                  <Input
                    value={settings.company.city}
                    onChange={(e) => updateField("company", "city", e.target.value)}
                    placeholder="Montr&eacute;al"
                  />
                </FieldGroup>
                <FieldGroup label="Province">
                  <Input
                    value={settings.company.province}
                    onChange={(e) => updateField("company", "province", e.target.value)}
                    placeholder="Qu&eacute;bec"
                  />
                </FieldGroup>
                <FieldGroup label="Code postal">
                  <Input
                    value={settings.company.postalCode}
                    onChange={(e) => updateField("company", "postalCode", e.target.value)}
                    placeholder="H1A 1A1"
                  />
                </FieldGroup>
                <FieldGroup label="Pays">
                  <Input
                    value={settings.company.country}
                    onChange={(e) => updateField("company", "country", e.target.value)}
                  />
                </FieldGroup>
              </div>
              <FieldGroup label="Description">
                <TextArea
                  value={settings.company.description}
                  onChange={(v) => updateField("company", "description", v)}
                  placeholder="Description courte de votre entreprise..."
                />
              </FieldGroup>
              <FieldGroup label="Signature email par d&eacute;faut">
                <TextArea
                  value={settings.company.emailSignature}
                  onChange={(v) => updateField("company", "emailSignature", v)}
                  placeholder={"Cordialement,\nOlivier\nMon Entreprise"}
                  rows={4}
                />
              </FieldGroup>
              <div className="bg-background-subtle rounded-lg p-3 mt-2">
                <p className="text-xs font-medium text-foreground-muted mb-1">
                  Variables disponibles dans les emails
                </p>
                <div className="flex flex-wrap gap-2">
                  {["{{company_name}}", "{{company_email}}", "{{company_phone}}", "{{company_website}}"].map((v) => (
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
                Les emails de campagne sont envoy&eacute;s au nom de votre entreprise.
                Les r&eacute;ponses des prospects arrivent &agrave; l&apos;adresse <span className="font-medium text-foreground">{settings.company.email || "email de contact"}</span> ci-dessus.
              </span>
            </div>
          </motion.div>
        );

      // email section removed — sending is handled via Resend with company info as reply-to

      // === EQUIPE ===
      case "team":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title="&Eacute;quipe et utilisateurs"
              description="G&eacute;rez les membres de votre &eacute;quipe et leurs r&ocirc;les."
            >
              <div className="flex justify-end mb-2">
                <Button
                  onClick={() => setShowAddUser(!showAddUser)}
                  size="sm"
                >
                  <Plus className="size-4" />
                  Ajouter un utilisateur
                </Button>
              </div>
              <AnimatePresence>
                {showAddUser && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-background-subtle rounded-lg p-4 mb-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          value={newUserName}
                          onChange={(e) => setNewUserName(e.target.value)}
                          placeholder="Nom"
                        />
                        <Input
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          placeholder="Email"
                          type="email"
                        />
                        <Select
                          value={newUserRole}
                          onChange={(e) => setNewUserRole(e.target.value)}
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="MANAGER">Manager</option>
                          <option value="USER">Utilisateur</option>
                        </Select>
                      </div>
                      <Button
                        onClick={handleAddUser}
                        variant="success"
                        size="sm"
                      >
                        Cr&eacute;er
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {users.length === 0 ? (
                <p className="text-foreground-muted text-sm py-4">
                  Aucun utilisateur. Ajoutez votre premier membre
                  d&apos;&eacute;quipe.
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
                            {!u.active && (
                              <span className="text-muted">(inactif)</span>
                            )}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            {u.email}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={u.role}
                          onChange={(e) =>
                            handleChangeRole(u.id, e.target.value)
                          }
                          className="text-xs h-7 px-2 py-1"
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="MANAGER">Manager</option>
                          <option value="USER">Utilisateur</option>
                        </Select>
                        <Button
                          onClick={() => handleToggleUser(u)}
                          variant="ghost"
                          size="sm"
                          className={
                            u.active ? "text-warning" : "text-success"
                          }
                        >
                          {u.active ? "Désactiver" : "Activer"}
                        </Button>
                        <Button
                          onClick={() => handleDeleteUser(u.id)}
                          variant="danger-ghost"
                          size="sm"
                        >
                          Supprimer
                        </Button>
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
              title="Prospects et contacts"
              description="Comportements par défaut pour les prospects et contacts."
              onSave={() => saveSection("prospects", settings.prospects)}
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldGroup label="Type de contact par défaut">
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
                    <option value="prospect">Prospect</option>
                    <option value="client">Client</option>
                    <option value="nouveau_client">Nouveau client</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Source par défaut">
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
                    <option value="manual">Manuel</option>
                    <option value="import">Import</option>
                    <option value="referral">Référence</option>
                  </Select>
                </FieldGroup>
              </div>
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-sm font-medium text-foreground-secondary mb-2">
                  Déduplication
                </p>
                <Toggle
                  checked={settings.prospects.blockDuplicateEmail}
                  onChange={(v) =>
                    updateField("prospects", "blockDuplicateEmail", v)
                  }
                  label="Bloquer les doublons par email"
                />
                <Toggle
                  checked={settings.prospects.blockDuplicatePhone}
                  onChange={(v) =>
                    updateField("prospects", "blockDuplicatePhone", v)
                  }
                  label="Bloquer les doublons par téléphone"
                />
                <Toggle
                  checked={settings.prospects.autoMerge}
                  onChange={(v) =>
                    updateField("prospects", "autoMerge", v)
                  }
                  label="Fusionner automatiquement les doublons"
                />
              </div>
            </SectionCard>

            {/* Garbage city cleaner */}
            <SectionCard
              title="Nettoyage des villes"
              description="Détecte et supprime les valeurs de ville invalides captées par erreur lors du scraping."
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
                  {garbageLoading ? "Analyse en cours…" : "Scanner les villes"}
                </Button>
                {garbageScanned && garbageCities.length === 0 && (
                  <span className="text-sm text-success flex items-center gap-1.5">
                    <Check className="size-4" /> Aucune ville invalide détectée
                  </span>
                )}
                {garbageScanned && garbageCities.length > 0 && (
                  <span className="text-sm text-warning flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> {garbageCities.length} ville{garbageCities.length > 1 ? "s" : ""} suspecte{garbageCities.length > 1 ? "s" : ""} détectée{garbageCities.length > 1 ? "s" : ""}
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
                          Tout sélectionner
                        </label>
                        <span className="text-xs text-foreground-muted">{garbageSelected.size} sélectionné{garbageSelected.size > 1 ? "s" : ""}</span>
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
                        ? "Suppression…"
                        : `Effacer la ville pour ${garbageSelected.size} entrée${garbageSelected.size > 1 ? "s" : ""}`}
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
              title="Campagnes"
              description="Paramètres par défaut pour les nouvelles campagnes."
              onSave={() => saveSection("campaigns", settings.campaigns)}
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldGroup label="Limite d'envois par jour">
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
                <FieldGroup label="Max contacts par batch">
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
                <FieldGroup label="Délai min (secondes)">
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
                <FieldGroup label="Délai max (secondes)">
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
                <FieldGroup label="Heure de début">
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
                <FieldGroup label="Heure de fin">
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
                <FieldGroup label="Fuseau horaire">
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
                <FieldGroup label="Statut par défaut">
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
                    <option value="DRAFT">Brouillon</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">En pause</option>
                  </Select>
                </FieldGroup>
              </div>
              <div className="border-t border-border pt-4 mt-2">
                <Toggle
                  checked={settings.campaigns.pauseOnError}
                  onChange={(v) =>
                    updateField("campaigns", "pauseOnError", v)
                  }
                  label="Pause automatique en cas d'erreur"
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
              title="Automatisation"
              description="Configurez les automatismes de la plateforme."
              onSave={() => saveSection("automation", settings.automation)}
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <div className="space-y-1">
                <Toggle
                  checked={settings.automation.autoSend}
                  onChange={(v) =>
                    updateField("automation", "autoSend", v)
                  }
                  label="Envois automatiques"
                />
                <Toggle
                  checked={settings.automation.autoFollowUp}
                  onChange={(v) =>
                    updateField("automation", "autoFollowUp", v)
                  }
                  label="Follow-ups automatiques"
                />
                <Toggle
                  checked={settings.automation.autoReminder}
                  onChange={(v) =>
                    updateField("automation", "autoReminder", v)
                  }
                  label="Relances automatiques"
                />
                <Toggle
                  checked={settings.automation.internalNotifications}
                  onChange={(v) =>
                    updateField("automation", "internalNotifications", v)
                  }
                  label="Notifications internes"
                />
                <Toggle
                  checked={settings.automation.errorAlerts}
                  onChange={(v) =>
                    updateField("automation", "errorAlerts", v)
                  }
                  label="Alertes d'erreur"
                />
              </div>
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-sm font-medium text-foreground-secondary mb-3">
                  Paramètres de relance
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FieldGroup label="Délai avant follow-up (jours)">
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
                  <FieldGroup label="Nombre max de relances">
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
                  <FieldGroup label="Intervalle entre relances (jours)">
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
                    label="Arrêter les relances si réponse reçue"
                  />
                  <Toggle
                    checked={settings.automation.stopOnExcluded}
                    onChange={(v) =>
                      updateField("automation", "stopOnExcluded", v)
                    }
                    label="Arrêter si contact exclu"
                  />
                </div>
              </div>
            </SectionCard>
          </motion.div>
        );

      // === TEMPLATES ===
      case "templates":
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SectionCard
              title="Templates d'email"
              description="Gérez vos modèles de messages réutilisables."
            >
              <div className="flex justify-end mb-2">
                <Button
                  onClick={() => setShowNewTemplate(!showNewTemplate)}
                  size="sm"
                >
                  <Plus className="size-4" />
                  Nouveau template
                </Button>
              </div>

              <AnimatePresence>
                {showNewTemplate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-background-subtle rounded-lg p-4 mb-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                          value={newTemplateName}
                          onChange={(e) =>
                            setNewTemplateName(e.target.value)
                          }
                          placeholder="Nom du template"
                        />
                        <Select
                          value={newTemplateType}
                          onChange={(e) =>
                            setNewTemplateType(e.target.value)
                          }
                        >
                          <option value="premier_contact">
                            Premier contact
                          </option>
                          <option value="follow_up">Follow-up</option>
                          <option value="relance">Relance</option>
                          <option value="reponse">
                            Réponse simple
                          </option>
                          <option value="custom">Personnalisé</option>
                        </Select>
                      </div>
                      <Input
                        value={newTemplateSubject}
                        onChange={(e) =>
                          setNewTemplateSubject(e.target.value)
                        }
                        placeholder="Sujet du email"
                      />
                      <TextArea
                        value={newTemplateBody}
                        onChange={setNewTemplateBody}
                        placeholder="Corps du email..."
                        rows={6}
                      />
                      <Button
                        onClick={handleCreateTemplate}
                        variant="success"
                        size="sm"
                      >
                        Créer
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Editing modal */}
              <AnimatePresence>
                {editingTemplate && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-card rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto border border-border"
                    >
                      <div className="flex justify-between mb-4">
                        <h3 className="text-lg font-semibold text-foreground">
                          Modifier le template
                        </h3>
                        <Button
                          onClick={() => setEditingTemplate(null)}
                          variant="ghost"
                          size="icon-sm"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <div className="space-y-3">
                        <FieldGroup label="Nom">
                          <Input
                            value={editingTemplate.name}
                            onChange={(e) =>
                              setEditingTemplate({
                                ...editingTemplate,
                                name: e.target.value,
                              })
                            }
                          />
                        </FieldGroup>
                        <FieldGroup label="Sujet">
                          <Input
                            value={editingTemplate.subject}
                            onChange={(e) =>
                              setEditingTemplate({
                                ...editingTemplate,
                                subject: e.target.value,
                              })
                            }
                          />
                        </FieldGroup>
                        <FieldGroup label="Corps">
                          <TextArea
                            value={editingTemplate.body}
                            onChange={(v) =>
                              setEditingTemplate({
                                ...editingTemplate,
                                body: v,
                              })
                            }
                            rows={8}
                          />
                        </FieldGroup>
                        <Toggle
                          checked={editingTemplate.isDefault}
                          onChange={(v) =>
                            setEditingTemplate({
                              ...editingTemplate,
                              isDefault: v,
                            })
                          }
                          label="Template par défaut"
                        />
                        <Button onClick={handleUpdateTemplate}>
                          Enregistrer
                        </Button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {templates.length === 0 ? (
                <p className="text-foreground-muted text-sm py-4">
                  Aucun template. Créez votre premier modèle
                  d&apos;email.
                </p>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-card-hover transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {t.name}
                          </p>
                          {t.isDefault && (
                            <Badge variant="primary">
                              Par défaut
                            </Badge>
                          )}
                          <Badge variant="default">{t.type}</Badge>
                        </div>
                        <p className="text-xs text-foreground-muted mt-0.5">
                          {t.subject || "(aucun sujet)"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setEditingTemplate(t)}
                          variant="ghost"
                          size="sm"
                        >
                          Modifier
                        </Button>
                        <Button
                          onClick={() => handleDeleteTemplate(t.id)}
                          variant="danger-ghost"
                          size="sm"
                        >
                          Archiver
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              title="Ciblage de recherche"
              description="Définissez les mots-clés et les villes utilisés pour la découverte de prospects."
              onSave={() =>
                saveSection(
                  "targeting",
                  settings.targeting as unknown as Record<string, unknown>
                )
              }
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              {/* Mots-cles */}
              <div>
                <p className="text-sm font-medium text-foreground-secondary mb-2">
                  Mots-clés de recherche
                </p>
                <p className="text-xs text-muted mb-3">
                  Ces mots-clés seront utilisés pour trouver des
                  prospects sur Google. Exemple : &quot;gestion
                  immobilière&quot;, &quot;property management&quot;,
                  &quot;condo management&quot;
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
                    placeholder="Ajouter un mot-clé et appuyer Entrée..."
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
                    Ajouter
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
                    title="Coller plusieurs mots-clés d'un coup"
                  >
                    Coller en lot
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
                          Collez vos mots-clés ci-dessous. Ils seront
                          automatiquement séparés par virgules,
                          retours de ligne, points-virgules ou tabulations.
                          Les doublons seront ignorés.
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
                              ? `${parseBulkInput(bulkKeywords).length} mot(s)-clé(s) détecté(s)`
                              : "Aucun élément détecté"}
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
                              Annuler
                            </Button>
                            <Button
                              onClick={handleBulkAddKeywords}
                              disabled={
                                parseBulkInput(bulkKeywords).length === 0
                              }
                              size="sm"
                            >
                              Ajouter{" "}
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
                      Aucun mot-clé configuré
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

              {/* Villes */}
              <div>
                <p className="text-sm font-medium text-foreground-secondary mb-2">
                  Villes à cibler
                </p>
                <p className="text-xs text-muted mb-3">
                  Les recherches seront effectuées dans chacune de ces
                  villes. Chaque mot-clé sera combiné avec chaque
                  ville.
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
                    placeholder="Ajouter une ville et appuyer Entrée..."
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
                    Ajouter
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
                    title="Coller plusieurs villes d'un coup"
                  >
                    Coller en lot
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
                          Collez vos villes ci-dessous. Elles seront
                          automatiquement séparées par virgules,
                          retours de ligne, points-virgules ou tabulations.
                          Les doublons seront ignorés.
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
                              ? `${parseBulkInput(bulkCities).length} ville(s) détectée(s)`
                              : "Aucun élément détecté"}
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
                              Annuler
                            </Button>
                            <Button
                              onClick={handleBulkAddCities}
                              disabled={
                                parseBulkInput(bulkCities).length === 0
                              }
                              variant="success"
                              size="sm"
                            >
                              Ajouter{" "}
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
                      Aucune ville configurée
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
                  Requêtes de recherche
                </p>
                <p className="text-xs text-muted mb-3">
                  Requêtes envoyées à Google. Utilisez{" "}
                  <span className="font-mono bg-background-subtle px-1 rounded">
                    {"{city}"}
                  </span>{" "}
                  comme placeholder -- il sera remplacé par chaque
                  ville ci-dessus.
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
                    placeholder="Ex: property management {city}"
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
                    Ajouter
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
                      Aucune requête configurée
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
                  Résumé du ciblage
                </p>
                <p className="text-xs text-foreground-muted">
                  {settings.targeting.searchQueries.length} requête
                  {settings.targeting.searchQueries.length !== 1
                    ? "s"
                    : ""}{" "}
                  x {settings.targeting.cities.length} ville
                  {settings.targeting.cities.length !== 1 ? "s" : ""} ={" "}
                  {settings.targeting.searchQueries.length *
                    settings.targeting.cities.length}{" "}
                  combinaison
                  {settings.targeting.searchQueries.length *
                    settings.targeting.cities.length !==
                  1
                    ? "s"
                    : ""}{" "}
                  de recherche
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
              title="Apparence et langue"
              description="Personnalisez l'affichage de l'application."
              onSave={() =>
                saveSection("appearance", settings.appearance)
              }
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldGroup label="Langue">
                  <Select
                    value={settings.appearance.language}
                    onChange={(e) =>
                      updateField(
                        "appearance",
                        "language",
                        e.target.value
                      )
                    }
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </Select>
                </FieldGroup>
                <FieldGroup label="Format de date">
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
                <FieldGroup label="Format d'heure">
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
                <FieldGroup label="Fuseau horaire">
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
                  Thème de l&apos;application
                </p>
                <div className="flex gap-3">
                  {(
                    [
                      { value: "light", label: "Clair", Icon: Sun },
                      { value: "dark", label: "Sombre", Icon: Moon },
                      {
                        value: "system",
                        label: "Système",
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
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
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
              title="Authentification"
              description="Contrôlez comment les utilisateurs se connectent à l'application."
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <Toggle
                checked={settings.security.enforceStrongPasswords}
                onChange={(v) =>
                  updateField("security", "enforceStrongPasswords", v)
                }
                label="Exiger des mots de passe forts (min. 8 car., majuscule, chiffre)"
              />
              <FieldGroup
                label="Tentatives de connexion max"
                description="Nombre de tentatives avant le verrouillage temporaire du compte."
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
                label="Expiration de session (minutes)"
                description="Durée d'inactivité avant déconnexion automatique."
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
                  <option value="30">30 minutes</option>
                  <option value="60">1 heure</option>
                  <option value="120">2 heures</option>
                  <option value="240">4 heures</option>
                  <option value="480">8 heures (défaut)</option>
                  <option value="1440">24 heures</option>
                </Select>
              </FieldGroup>

              <div className="border-t border-border pt-4 mt-4 space-y-3">
                <div className="flex items-center justify-between p-3 bg-background-subtle rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Changement de mot de passe
                    </p>
                    <p className="text-xs text-foreground-muted">
                      Modifiez votre mot de passe régulièrement
                    </p>
                  </div>
                  <Button disabled variant="secondary" size="sm">
                    Bientôt
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 bg-background-subtle rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Authentification à deux facteurs (2FA)
                    </p>
                    <p className="text-xs text-foreground-muted">
                      Ajoutez une couche de sécurité supplémentaire avec une app TOTP
                    </p>
                  </div>
                  <Button disabled variant="secondary" size="sm">
                    Bientôt
                  </Button>
                </div>
              </div>
            </SectionCard>

            {/* ── Accès & Permissions ── */}
            <SectionCard
              title="Accès et permissions"
              description="Gérez les contrôles d'accès et les restrictions."
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <Toggle
                checked={settings.security.requireConfirmation}
                onChange={(v) =>
                  updateField("security", "requireConfirmation", v)
                }
                label="Demander confirmation sur les actions sensibles"
              />
              <Toggle
                checked={settings.security.exportRequirePassword}
                onChange={(v) =>
                  updateField("security", "exportRequirePassword", v)
                }
                label="Exiger le mot de passe pour exporter les données"
              />
              <Toggle
                checked={settings.security.ipWhitelistEnabled}
                onChange={(v) =>
                  updateField("security", "ipWhitelistEnabled", v)
                }
                label="Activer la liste blanche d'adresses IP"
              />
              {settings.security.ipWhitelistEnabled && (
                <FieldGroup
                  label="Adresses IP autorisées"
                  description="Entrez les adresses IP séparées par des virgules. Seules ces IP pourront accéder à l'application."
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
              title="Clé API"
              description="Gérez l'accès programmatique à votre compte."
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <Toggle
                checked={settings.security.apiKeyEnabled}
                onChange={(v) =>
                  updateField("security", "apiKeyEnabled", v)
                }
                label="Activer l'accès API"
              />
              {settings.security.apiKeyEnabled && (
                <>
                  <FieldGroup label="Clé API">
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        readOnly
                        value={
                          settings.security.apiKey
                            ? `${settings.security.apiKey.slice(0, 8)}${"•".repeat(24)}${settings.security.apiKey.slice(-4)}`
                            : "Aucune clé générée"
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
                        {settings.security.apiKey ? "Régénérer" : "Générer"}
                      </Button>
                    </div>
                  </FieldGroup>
                  {settings.security.apiKey && (
                    <p className="text-xs text-warning flex items-center gap-1.5">
                      <Shield className="size-3.5" />
                      Sauvegardez pour appliquer. La clé ne sera plus visible en entier après rechargement.
                    </p>
                  )}
                </>
              )}
            </SectionCard>

            {/* ── Rétention des données ── */}
            <SectionCard
              title="Rétention des données"
              description="Configurez la durée de conservation des données."
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <FieldGroup
                label="Conservation des données (jours)"
                description="Les prospects et emails plus anciens que cette durée pourront être purgés."
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
                  <option value="90">90 jours</option>
                  <option value="180">6 mois</option>
                  <option value="365">1 an (défaut)</option>
                  <option value="730">2 ans</option>
                  <option value="0">Indéfiniment</option>
                </Select>
              </FieldGroup>
              <Toggle
                checked={settings.security.autoDeleteArchived}
                onChange={(v) =>
                  updateField("security", "autoDeleteArchived", v)
                }
                label="Supprimer automatiquement les prospects archivés"
              />
              {settings.security.autoDeleteArchived && (
                <FieldGroup
                  label="Délai avant suppression définitive (jours)"
                  description="Les prospects archivés seront supprimés définitivement après ce délai."
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
              title="Journal d'audit"
              description="Suivi des actions effectuées dans l'application."
              onSave={() => saveSection("security", settings.security)}
              saving={saving}
              hasUnsaved={hasUnsaved}
            >
              <Toggle
                checked={settings.security.auditLogEnabled}
                onChange={(v) =>
                  updateField("security", "auditLogEnabled", v)
                }
                label="Activer le journal d'audit"
              />
              {settings.security.auditLogEnabled && (
                <FieldGroup
                  label="Conservation du journal (jours)"
                  description="Les entrées plus anciennes seront automatiquement supprimées."
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
                    <option value="30">30 jours</option>
                    <option value="60">60 jours</option>
                    <option value="90">90 jours (défaut)</option>
                    <option value="180">6 mois</option>
                    <option value="365">1 an</option>
                  </Select>
                </FieldGroup>
              )}
              <div className="border-t border-border pt-4 mt-2">
                <div className="flex items-center justify-between p-3 bg-background-subtle rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Sessions actives
                    </p>
                    <p className="text-xs text-foreground-muted">
                      Visualisez et révoquez les sessions de connexion
                    </p>
                  </div>
                  <Button disabled variant="secondary" size="sm">
                    Bientôt
                  </Button>
                </div>
              </div>
            </SectionCard>

            {/* ── Zone dangereuse ── */}
            <Card className="border-danger/30">
              <CardHeader>
                <div>
                  <CardTitle className="text-lg text-danger">Zone dangereuse</CardTitle>
                  <p className="text-sm text-foreground-muted mt-1">
                    Actions irréversibles. Procédez avec prudence.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-danger-subtle rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Exporter toutes les données
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Téléchargez une copie complète de vos données (prospects, emails, campagnes)
                      </p>
                    </div>
                    <Button disabled variant="secondary" size="sm">
                      Exporter
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-danger-subtle rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Supprimer toutes les données
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Efface définitivement tous les prospects, emails et campagnes
                      </p>
                    </div>
                    <Button disabled variant="danger" size="sm">
                      Supprimer tout
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-danger-subtle rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Supprimer le compte
                      </p>
                      <p className="text-xs text-foreground-muted">
                        Supprime définitivement votre compte et toutes les données associées
                      </p>
                    </div>
                    <Button disabled variant="danger" size="sm">
                      Supprimer le compte
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
              title="Prospects archivés"
              description="Prospects supprimés récemment. Ils seront définitivement supprimés après 15 jours."
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-foreground-muted">
                  {archiveTotal} prospect
                  {archiveTotal !== 1 ? "s" : ""} archivé
                  {archiveTotal !== 1 ? "s" : ""}
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
                            `${ids.length} prospect${ids.length > 1 ? "s" : ""} restauré${ids.length > 1 ? "s" : ""}`,
                            "success"
                          );
                          loadArchive(archivePage);
                        }}
                        variant="success"
                        size="sm"
                      >
                        <RotateCcw className="size-3.5" />
                        Restaurer ({selectedArchived.size})
                      </Button>
                      <Button
                        onClick={async () => {
                          if (
                            !confirm(
                              `Supprimer définitivement ${selectedArchived.size} prospect${selectedArchived.size > 1 ? "s" : ""} ?`
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
                            `${ids.length} prospect${ids.length > 1 ? "s" : ""} supprimé${ids.length > 1 ? "s" : ""} définitivement`,
                            "success"
                          );
                          loadArchive(archivePage);
                        }}
                        variant="danger"
                        size="sm"
                      >
                        <Trash2 className="size-3.5" />
                        Supprimer ({selectedArchived.size})
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
                        `${data.deleted || 0} ancien${(data.deleted || 0) > 1 ? "s" : ""} prospect${(data.deleted || 0) > 1 ? "s" : ""} nettoyé${(data.deleted || 0) > 1 ? "s" : ""}`,
                        "success"
                      );
                      loadArchive(archivePage);
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Nettoyer (+15 jours)
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
                  Aucun prospect archivé
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
                            Entreprise
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            Ville
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            Email
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            Tél.
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            Score
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-medium text-foreground-muted">
                            Supprimé le
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
                                  ({daysLeft}j restant
                                  {daysLeft !== 1 ? "s" : ""})
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
                        Page {archivePage} / {archiveTotalPages}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          disabled={archivePage <= 1}
                          onClick={() => loadArchive(archivePage - 1)}
                          variant="secondary"
                          size="sm"
                        >
                          <ChevronLeft className="size-3.5" />
                          Préc.
                        </Button>
                        <Button
                          disabled={archivePage >= archiveTotalPages}
                          onClick={() => loadArchive(archivePage + 1)}
                          variant="secondary"
                          size="sm"
                        >
                          Suiv.
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
              title="Abonnement"
              description="Votre plan et vos limites d'utilisation."
            >
              <div className="bg-primary-subtle rounded-lg p-6 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground-muted uppercase font-medium">
                      Plan actuel
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
                      ? "Actif"
                      : settings.subscription.status}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-border rounded-lg">
                  <p className="text-sm text-foreground-muted">
                    Utilisateurs permis
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {settings.subscription.maxUsers}
                  </p>
                </div>
                <div className="p-4 border border-border rounded-lg">
                  <p className="text-sm text-foreground-muted">
                    Emails par mois
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {settings.subscription.maxEmailsPerMonth.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-primary-subtle rounded-lg">
                <p className="text-xs text-primary">
                  La gestion des abonnements et la facturation seront
                  disponibles prochainement.
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
              title="Centre des activités"
              description="Historique des actions récentes sur la plateforme."
            >
              <div className="border border-border rounded-lg overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background-subtle">
                  <span className="text-sm font-medium text-foreground">
                    {logs.length} activité{logs.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={loadLogs}
                    className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-card transition-colors"
                    title="Rafraîchir"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                </div>

                {/* List */}
                {logs.length === 0 ? (
                  <p className="text-foreground-muted text-sm text-center py-10">
                    Aucune activité enregistrée.
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
                            {log.title && !log.title.includes("_") ? log.title : formatAction(log.action)}
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
        title="Paramètres"
        description="Configurez votre plateforme de prospection"
      />

      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-52 shrink-0">
          <div className="sticky top-24 space-y-0.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveSection(s.id);
                    setHasUnsaved(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5 ${
                    activeSection === s.id
                      ? "bg-primary-subtle text-primary font-medium"
                      : "text-foreground-muted hover:bg-card-hover"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{renderSection()}</div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────

function formatAction(action: string): string {
  const map: Record<string, string> = {
    import_csv: "Import CSV",
    import_text: "Import texte",
    scrape_import: "Import scrape",
    discovery_started: "Découverte démarrée",
    discovery_completed: "Découverte terminée",
    discovery_error: "Erreur de découverte",
    enrichment_started: "Enrichissement démarré",
    enrichment_completed: "Enrichissement terminé",
    enrichment_error: "Erreur d'enrichissement",
    campaign_created: "Campagne créée",
    campaign_updated: "Campagne modifiée",
    campaign_paused: "Campagne en pause",
    campaign_activated: "Campagne activée",
    prospect_created: "Prospect créé",
    prospect_deleted: "Prospect supprimé",
    prospect_deduplicated: "Doublons supprimés",
    blacklist_added: "Blacklist ajouté",
    email_sent: "Email envoyé",
    keywords_generated: "Mots-clés générés",
    settings_updated: "Paramètres modifiés",
    user_created: "Utilisateur créé",
    user_updated: "Utilisateur modifié",
    user_deleted: "Utilisateur supprimé",
  };
  return map[action] || action;
}
