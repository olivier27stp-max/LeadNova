"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Save,
  Play,
  Pause,
  Send,
  Search,
  Users,
  AlertTriangle,
  RefreshCw,
  Clock,
  Pencil,
  Trash2,
  X,
  ImageIcon,
  CalendarClock,
  ChevronDown,
} from "lucide-react";
import ScheduleModal from "@/components/ScheduleModal";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { ToastContainer } from "@/components/ui/toast";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import CampaignReports from "@/components/CampaignReports";

// ─── Types ───────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  status: string;
  emailSubject: string | null;
  emailBody: string | null;
  followUpSubject: string | null;
  followUpBody: string | null;
  maxPerDay: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  sentToday: number;
  lastSentAt: string | null;
  requireApproval: boolean;
  contacts: Array<{
    id: string;
    prospect: ContactProspect;
  }>;
}

interface ContactProspect {
  id: string;
  companyName: string;
  email: string | null;
  city: string | null;
  status: string;
  contactType: string;
  leadScore: number;
  selected: boolean;
}

// ─── Badge Variant Mappings ─────────────────────────────

const statusVariantMap: Record<string, "success" | "warning" | "default" | "primary"> = {
  DRAFT: "default",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "primary",
};

const contactTypeVariantMap: Record<string, "primary" | "success" | "accent"> = {
  prospect: "primary",
  client: "success",
  nouveau_client: "accent",
};

const contactTypeLabels: Record<string, string> = {
  prospect: "Prospect",
  client: "Client",
  nouveau_client: "Nouveau client",
};

// ─── Variables Help ──────────────────────────────────────

const TEMPLATE_VARIABLES = [
  { key: "{{company_name}}", label: "Nom de l'entreprise" },
  { key: "{{city}}", label: "Ville" },
  { key: "{{contact_name}}", label: "Nom du contact" },
];

// Display-friendly labels for variable buttons
const VARIABLE_DISPLAY: Record<string, string> = {
  "{{company_name}}": "Nom de l'entreprise",
  "{{city}}": "Ville",
  "{{contact_name}}": "Nom du contact",
};

// ─── Main Page Component ─────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"message" | "contact" | "reports">("message");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Message tab state
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [followUpSubject, setFollowUpSubject] = useState("");
  const [followUpBody, setFollowUpBody] = useState("");
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Logo state
  const [logoUrl, setLogoUrl] = useState("/leadnova-logo.png");
  const [logoEnabled, setLogoEnabled] = useState(true);
  const [editingLogo, setEditingLogo] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  async function saveLogo(url: string, enabled: boolean) {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: { logoUrl: url, logoEnabled: enabled } }),
    });
  }

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url) {
      setLogoUrl(data.url);
      setLogoEnabled(true);
      setEditingLogo(false);
      await saveLogo(data.url, true);
      setToast({ message: "Logo mis à jour", type: "success" });
    } else {
      setToast({ message: data.error || "Erreur upload", type: "error" });
    }
    setLogoUploading(false);
  }

  async function handleLogoDelete() {
    setLogoEnabled(false);
    await saveLogo(logoUrl, false);
  }

  async function handleLogoRestore() {
    setLogoEnabled(true);
    await saveLogo(logoUrl, true);
  }

  // Automation settings (from global settings)
  const [automationSettings, setAutomationSettings] = useState<{
    autoFollowUp: boolean;
    followUpDelayDays: number;
    maxFollowUps: number;
    followUpIntervalDays: number;
    stopOnReply: boolean;
    stopOnExcluded: boolean;
  } | null>(null);

  // Send state
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    sent: number;
    failed: number;
    skippedNoEmail: number;
    errors: string[];
  } | null>(null);

  // Send dropdown + schedule state
  const [showSendDropdown, setShowSendDropdown] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledEmail, setScheduledEmail] = useState<{
    id: string;
    scheduledFor: string;
    timezone: string;
    status: string;
  } | null>(null);
  const sendDropdownRef = useRef<HTMLDivElement>(null);

  // Contact tab state
  const [contacts, setContacts] = useState<ContactProspect[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsTotalPages, setContactsTotalPages] = useState(1);
  const [selectedCount, setSelectedCount] = useState(0);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState("");
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());

  // ─── Fetch campaign ─────────────────────────────────

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data && !data.error) {
          setCampaign(data);
          setEmailSubject(data.emailSubject || "");
          setEmailBody(data.emailBody || "");
          setFollowUpSubject(data.followUpSubject || "");
          setFollowUpBody(data.followUpBody || "");
          // Pre-fill selected from campaign contacts
          const ids = new Set<string>(
            data.contacts?.map((c: { prospect: { id: string } }) => c.prospect.id) || []
          );
          setLocalSelected(ids);
          setSelectedCount(ids.size);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [campaignId]);

  // ─── Fetch settings (automation + logo) ────────────
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.automation) setAutomationSettings(data.automation);
        if (data?.email?.logoUrl) setLogoUrl(data.email.logoUrl);
        if (typeof data?.email?.logoEnabled === "boolean") setLogoEnabled(data.email.logoEnabled);
      })
      .catch(() => {});
  }, []);

  // ─── Fetch contacts ─────────────────────────────────

  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    const params = new URLSearchParams({
      page: String(contactsPage),
      limit: "25",
    });
    if (search) params.set("search", search);
    if (contactTypeFilter) params.set("contactType", contactTypeFilter);

    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/contacts?${params}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setContacts(data.prospects || []);
      setContactsTotal(data.total || 0);
      setContactsTotalPages(data.totalPages || 1);
      setSelectedCount(data.selectedCount || 0);

      // Merge server selection into local
      const serverSelected = new Set<string>(
        (data.prospects || [])
          .filter((p: ContactProspect) => p.selected)
          .map((p: ContactProspect) => p.id)
      );
      setLocalSelected((prev) => {
        const merged = new Set(prev);
        serverSelected.forEach((id: string) => merged.add(id));
        return merged;
      });
    } catch (error) {
      console.error("Failed to fetch contacts:", error);
    } finally {
      setContactsLoading(false);
    }
  }, [campaignId, contactsPage, search, contactTypeFilter]);

  useEffect(() => {
    if (activeTab === "contact") {
      fetchContacts();
    }
  }, [activeTab, fetchContacts]);

  // ─── Handlers ───────────────────────────────────────

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  async function handleSaveMessage() {
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailSubject, emailBody, followUpSubject, followUpBody }),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      setCampaign((prev) => (prev ? { ...prev, ...updated } : prev));
      setHasUnsaved(false);
      showToast("Message sauvegardé", "success");
    } catch {
      showToast("Erreur lors de la sauvegarde", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!campaign) return;
    const newStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Status update failed");
      const updated = await res.json();
      setCampaign((prev) => (prev ? { ...prev, ...updated } : prev));
      showToast(
        newStatus === "ACTIVE" ? "Campagne activée" : "Campagne en pause",
        "success"
      );
    } catch {
      showToast("Erreur lors du changement de statut", "error");
    }
  }

  async function handleToggleContact(prospectId: string) {
    const isSelected = localSelected.has(prospectId);

    // Optimistic update
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) {
        next.delete(prospectId);
      } else {
        next.add(prospectId);
      }
      return next;
    });
    setSelectedCount((prev) => prev + (isSelected ? -1 : 1));

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/contacts`, {
        method: isSelected ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: [prospectId] }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Revert on failure
      setLocalSelected((prev) => {
        const next = new Set(prev);
        if (isSelected) {
          next.add(prospectId);
        } else {
          next.delete(prospectId);
        }
        return next;
      });
      setSelectedCount((prev) => prev + (isSelected ? 1 : -1));
      showToast("Erreur lors de la mise à jour", "error");
    }
  }

  async function handleSelectAll() {
    const unselectedIds = contacts
      .filter((c) => !localSelected.has(c.id))
      .map((c) => c.id);
    if (unselectedIds.length === 0) return;

    // Optimistic update
    setLocalSelected((prev) => {
      const next = new Set(prev);
      unselectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedCount((prev) => prev + unselectedIds.length);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: unselectedIds }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast(`${unselectedIds.length} contacts ajoutés`, "success");
    } catch {
      // Revert
      setLocalSelected((prev) => {
        const next = new Set(prev);
        unselectedIds.forEach((id) => next.delete(id));
        return next;
      });
      setSelectedCount((prev) => prev - unselectedIds.length);
      showToast("Erreur lors de la sélection", "error");
    }
  }

  async function handleDeselectAll() {
    const selectedIds = contacts
      .filter((c) => localSelected.has(c.id))
      .map((c) => c.id);
    if (selectedIds.length === 0) return;

    setLocalSelected((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.delete(id));
      return next;
    });
    setSelectedCount((prev) => prev - selectedIds.length);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/contacts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: selectedIds }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast(`${selectedIds.length} contacts retirés`, "success");
    } catch {
      setLocalSelected((prev) => {
        const next = new Set(prev);
        selectedIds.forEach((id) => next.add(id));
        return next;
      });
      setSelectedCount((prev) => prev + selectedIds.length);
      showToast("Erreur lors de la désélection", "error");
    }
  }

  async function handleSend() {
    setSending(true);
    setSendResult(null);
    setShowSendConfirm(false);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Erreur lors de l'envoi", "error");
      } else {
        setSendResult(data);
        showToast(`${data.sent} email${data.sent !== 1 ? "s" : ""} envoyé${data.sent !== 1 ? "s" : ""}`, data.failed > 0 ? "error" : "success");
      }
    } catch {
      showToast("Erreur lors de l'envoi", "error");
    } finally {
      setSending(false);
    }
  }

  const loadScheduledEmail = useCallback(async () => {
    try {
      const res = await fetch(`/api/scheduled-emails?campaignId=${campaignId}&status=PENDING`);
      if (!res.ok) return;
      const data = await res.json();
      setScheduledEmail(data.length > 0 ? data[0] : null);
    } catch {
      // ignore
    }
  }, [campaignId]);

  useEffect(() => { loadScheduledEmail(); }, [loadScheduledEmail]);

  // Close send dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (sendDropdownRef.current && !sendDropdownRef.current.contains(e.target as Node)) {
        setShowSendDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSchedule(date: Date, timezone: string) {
    // If there's already a pending scheduled email, patch it; otherwise create new
    const isEdit = !!scheduledEmail;
    const url = isEdit
      ? `/api/scheduled-emails/${scheduledEmail!.id}`
      : "/api/scheduled-emails";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, scheduledFor: date.toISOString(), timezone }),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = "Erreur lors de la planification";
      try { msg = JSON.parse(text).error || msg; } catch { if (text) msg = text; }
      throw new Error(msg);
    }
    const saved = await res.json();
    setScheduledEmail(saved);
    setShowScheduleModal(false);
    showToast(isEdit ? "Envoi replanifié" : "Envoi planifié avec succès", "success");
  }

  async function handleCancelScheduled() {
    if (!scheduledEmail) return;
    try {
      const res = await fetch(`/api/scheduled-emails/${scheduledEmail.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setScheduledEmail(null);
      showToast("Envoi planifié annulé", "success");
    } catch {
      showToast("Erreur lors de l'annulation", "error");
    }
  }

  async function handleSendNowFromScheduled() {
    await handleCancelScheduled();
    setShowSendConfirm(true);
  }

  // ─── Loading State ─────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-44" />
          </div>
        </div>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 rounded-md" />
          <Skeleton className="h-96 rounded-md" />
        </div>
      </div>
    );
  }

  // ─── Not Found State ───────────────────────────────

  if (notFound || !campaign) {
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title="Campagne introuvable"
        description="La campagne que vous recherchez n'existe pas ou a été supprimée."
        action={
          <Link href="/campaigns">
            <Button variant="secondary">
              <ArrowLeft />
              Retour aux campagnes
            </Button>
          </Link>
        }
      />
    );
  }

  // ─── Preview helpers ─────────────────────────────────

  function renderPreview(text: string) {
    return text
      .replace(/\{\{company_name\}\}/g, "Acme Corp")
      .replace(/\{\{city\}\}/g, "Montréal")
      .replace(/\{\{contact_name\}\}/g, "Madame, Monsieur");
  }

  function buildEmailHtml(body: string): string {
    const interpolated = renderPreview(body);
    const htmlBody = interpolated
      .split(/\n\n+/)
      .map((para) =>
        `<p style="margin:0 0 16px 0;line-height:1.6;">${para.trim().replace(/\n/g, "<br>")}</p>`
      )
      .join("\n");

    return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:24px 16px;">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
  <tr><td style="padding:32px 32px 24px 32px;color:#1a1a1a;font-size:14px;">${htmlBody}</td></tr>
  <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;"></td></tr>
  <tr><td style="padding:20px 32px 0 32px;color:#374151;font-size:13px;line-height:1.6;">
    <strong style="color:#111827;">Olivier</strong><br>
    <span style="color:#6b7280;">LeadNova</span><br>
    <a href="tel:819-388-9150" style="color:#2563eb;text-decoration:none;">819-388-9150</a>
    &nbsp;·&nbsp;
    <a href="https://leadnova.one" style="color:#2563eb;text-decoration:none;">leadnova.one</a>
  </td></tr>
  ${logoEnabled ? `<tr><td style="padding:16px 32px 0 32px;">
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#000;border-radius:6px;overflow:hidden;">
      <tr><td align="center" style="padding:16px;">
        <img src="${logoUrl}" alt="Logo" width="120" height="120" style="display:block;width:120px;height:120px;object-fit:contain;" />
      </td></tr>
    </table>
  </td></tr>` : ""}
  <tr><td style="padding:12px 32px 24px 32px;text-align:center;color:#9ca3af;font-size:10px;">
    Pour vous désabonner, répondez avec « DÉSABONNER » dans le sujet.
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  }

  // ─── Render ─────────────────────────────────────────

  const allPageSelected =
    contacts.length > 0 && contacts.every((c) => localSelected.has(c.id));

  const tabItems = [
    { id: "message", label: "Message" },
    { id: "contact", label: "Contacts", count: selectedCount },
    { id: "reports", label: "Rapports" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <ToastContainer toast={toast} onClose={() => setToast(null)} />

      {/* Schedule Modal */}
      {showScheduleModal && (
        <ScheduleModal
          selectedCount={selectedCount}
          onConfirm={handleSchedule}
          onClose={() => setShowScheduleModal(false)}
        />
      )}

      {/* Send Confirm Modal */}
      {showSendConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Confirmer l'envoi</h2>
            <p className="text-sm text-foreground-secondary">
              Vous êtes sur le point d'envoyer le message de cette campagne à{" "}
              <span className="font-semibold text-foreground">{selectedCount} contact{selectedCount !== 1 ? "s" : ""}</span>.
              Cette action est irréversible.
            </p>
            {(!campaign.emailSubject || !campaign.emailBody) && (
              <p className="text-sm text-warning font-medium">
                ⚠ Le message n'est pas encore configuré. Renseignez le sujet et le corps dans l'onglet Message.
              </p>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setShowSendConfirm(false)}>
                Annuler
              </Button>
              <Button
                variant="primary"
                disabled={!campaign.emailSubject || !campaign.emailBody}
                onClick={handleSend}
              >
                <Send />
                Confirmer l'envoi
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send Result Banner */}
      {sendResult && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm flex items-start justify-between gap-4 ${sendResult.failed > 0 ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success"}`}>
          <div>
            <p className="font-medium">
              {sendResult.sent} email{sendResult.sent !== 1 ? "s" : ""} envoyé{sendResult.sent !== 1 ? "s" : ""}
              {sendResult.failed > 0 && `, ${sendResult.failed} échoué${sendResult.failed !== 1 ? "s" : ""}`}
              {sendResult.skippedNoEmail > 0 && `, ${sendResult.skippedNoEmail} sans adresse email`}
            </p>
            {sendResult.errors.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs opacity-80">
                {sendResult.errors.slice(0, 3).map((e, i) => <li key={i}>• {e}</li>)}
                {sendResult.errors.length > 3 && <li>• … et {sendResult.errors.length - 3} autre(s)</li>}
              </ul>
            )}
          </div>
          <button onClick={() => setSendResult(null)} className="shrink-0 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Scheduled Email Banner */}
      {scheduledEmail && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-4 bg-accent-subtle border border-accent/20">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-accent shrink-0" />
            <div>
              <span className="font-medium text-foreground">Envoi planifié — </span>
              <span className="text-foreground-secondary">
                {new Date(scheduledEmail.scheduledFor).toLocaleString("fr-CA", {
                  timeZone: scheduledEmail.timezone,
                  weekday: "long", month: "long", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
              <span className="text-foreground-muted text-xs ml-1">({scheduledEmail.timezone})</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowScheduleModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-card border border-border hover:bg-card-hover text-foreground transition-colors"
            >
              <Pencil className="size-3.5" />
              Modifier
            </button>
            <button
              onClick={handleSendNowFromScheduled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Send className="size-3.5" />
              Envoyer maintenant
            </button>
            <button
              onClick={handleCancelScheduled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-card border border-border hover:bg-danger-subtle hover:text-danger hover:border-danger/30 text-foreground-muted transition-colors"
            >
              <X className="size-3.5" />
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link
              href="/campaigns"
              className="text-foreground-muted hover:text-foreground-secondary text-sm transition-colors"
            >
              Campagnes
            </Link>
            <span className="text-muted">/</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
            <Badge variant={statusVariantMap[campaign.status] || "default"}>
              {campaign.status}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/campaigns">
            <Button variant="secondary">
              <ArrowLeft />
              Retour
            </Button>
          </Link>
          <Button
            variant={campaign.status === "ACTIVE" ? "secondary" : "success"}
            onClick={handleToggleStatus}
          >
            {campaign.status === "ACTIVE" ? <Pause /> : <Play />}
            {campaign.status === "ACTIVE" ? "Mettre en pause" : "Activer"}
          </Button>
          {/* Split send button */}
          <div ref={sendDropdownRef} className="relative flex">
            <Button
              variant="primary"
              disabled={sending || selectedCount === 0}
              onClick={() => setShowSendConfirm(true)}
              title={selectedCount === 0 ? "Sélectionnez des contacts d'abord" : undefined}
              className="rounded-r-none border-r border-primary-dark/30"
            >
              <Send />
              {sending ? "Envoi en cours…" : `Envoyer (${selectedCount})`}
            </Button>
            <Button
              variant="primary"
              disabled={sending || selectedCount === 0}
              onClick={() => setShowSendDropdown((v) => !v)}
              className="rounded-l-none px-2"
              title="Plus d'options d'envoi"
            >
              <ChevronDown className="size-4" />
            </Button>
            {showSendDropdown && (
              <div className="absolute right-0 top-full mt-1 z-40 w-52 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                <button
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground hover:bg-card-hover transition-colors"
                  onClick={() => { setShowSendDropdown(false); setShowSendConfirm(true); }}
                >
                  <Send className="size-4 text-primary" />
                  Envoyer maintenant
                </button>
                <button
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground hover:bg-card-hover transition-colors"
                  onClick={() => { setShowSendDropdown(false); setShowScheduleModal(true); }}
                >
                  <CalendarClock className="size-4 text-accent" />
                  Planifier l'envoi
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabItems}
        active={activeTab}
        onChange={(id) => setActiveTab(id as "message" | "contact")}
        className="mb-6"
      />

      {/* ═══ Message Tab ═══ */}
      <AnimatePresence mode="wait">
        {activeTab === "message" && (
          <motion.div
            key="message-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Editors */}
            <div className="space-y-6">
              {/* Main email editor */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Send className="size-4 text-primary" />
                    <CardTitle className="text-lg">Message principal</CardTitle>
                  </div>
                  {hasUnsaved && (
                    <Badge variant="warning">Non sauvegardé</Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      Sujet de l'email
                    </label>
                    <Input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => {
                        setEmailSubject(e.target.value);
                        setHasUnsaved(true);
                      }}
                      placeholder="Ex: Services d'entretien pour vos propriétés à [Ville]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      Corps de l'email
                    </label>
                    <textarea
                      value={emailBody}
                      onChange={(e) => {
                        setEmailBody(e.target.value);
                        setHasUnsaved(true);
                      }}
                      rows={12}
                      placeholder="Bonjour,&#10;&#10;J'ai remarqué que [Nom de l'entreprise] gère des propriétés dans la région de [Ville]..."
                      className="flex w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-y"
                    />
                  </div>

                  {/* Variables */}
                  <div className="bg-background-subtle rounded-md p-3">
                    <p className="text-xs font-medium text-foreground-muted mb-2">
                      Cliquez pour insérer une variable
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TEMPLATE_VARIABLES.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => {
                            setEmailBody((prev) => prev + v.key);
                            setHasUnsaved(true);
                          }}
                          className="text-xs bg-card border border-border rounded-md px-2 py-1 hover:bg-card-hover hover:border-primary/30 text-foreground-secondary transition-colors cursor-pointer"
                          title={`Insère ${v.key}`}
                        >
                          {VARIABLE_DISPLAY[v.key] || v.key}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Follow-up email editor */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="size-4 text-accent" />
                    <CardTitle className="text-lg">Message de relance (follow-up)</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      Sujet du follow-up
                    </label>
                    <Input
                      type="text"
                      value={followUpSubject}
                      onChange={(e) => {
                        setFollowUpSubject(e.target.value);
                        setHasUnsaved(true);
                      }}
                      placeholder="Ex: Re: Services d'entretien pour [Nom de l'entreprise]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      Corps du follow-up
                    </label>
                    <textarea
                      value={followUpBody}
                      onChange={(e) => {
                        setFollowUpBody(e.target.value);
                        setHasUnsaved(true);
                      }}
                      rows={8}
                      placeholder="Bonjour,&#10;&#10;Je me permets de faire suite à mon message précédent concernant nos services pour [Nom de l'entreprise]..."
                      className="flex w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-y"
                    />
                  </div>

                  {/* Variables */}
                  <div className="bg-background-subtle rounded-md p-3">
                    <p className="text-xs font-medium text-foreground-muted mb-2">
                      Cliquez pour insérer une variable
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {TEMPLATE_VARIABLES.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => {
                            setFollowUpBody((prev) => prev + v.key);
                            setHasUnsaved(true);
                          }}
                          className="text-xs bg-card border border-border rounded-md px-2 py-1 hover:bg-card-hover hover:border-primary/30 text-foreground-secondary transition-colors cursor-pointer"
                          title={`Insère ${v.key}`}
                        >
                          {VARIABLE_DISPLAY[v.key] || v.key}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Automation info */}
                  {automationSettings && (
                    <div className="bg-accent-subtle rounded-md p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Clock className="size-3.5 text-accent" />
                        <p className="text-xs font-medium text-accent">Automatisation de relance</p>
                      </div>
                      <div className="text-xs text-foreground-secondary space-y-1">
                        <p>
                          {automationSettings.autoFollowUp
                            ? <>Relance automatique <span className="font-medium text-success">activée</span></>
                            : <>Relance automatique <span className="font-medium text-foreground-muted">désactivée</span> — <a href="/settings?section=automation" className="text-primary hover:underline">activer dans les paramètres</a></>
                          }
                        </p>
                        <p>Délai avant relance : <span className="font-medium">{automationSettings.followUpDelayDays} jour{automationSettings.followUpDelayDays > 1 ? "s" : ""}</span></p>
                        <p>Maximum : <span className="font-medium">{automationSettings.maxFollowUps} relance{automationSettings.maxFollowUps > 1 ? "s" : ""}</span> par contact, espacées de <span className="font-medium">{automationSettings.followUpIntervalDays} jour{automationSettings.followUpIntervalDays > 1 ? "s" : ""}</span></p>
                        {automationSettings.stopOnReply && <p>Arrêt automatique si le contact répond</p>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Save button */}
              <Button
                variant="primary"
                className="w-full"
                onClick={handleSaveMessage}
                disabled={saving || !hasUnsaved}
              >
                <Save />
                {saving ? "Sauvegarde..." : "Enregistrer les messages"}
              </Button>
            </div>

            {/* Preview */}
            <div className="space-y-6">
              {/* Main email preview */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Send className="size-4 text-primary" />
                    <CardTitle className="text-lg">Aperçu — Message principal</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden">
                  {!emailSubject && !emailBody ? (
                    <p className="text-muted text-sm p-4">
                      Commencez à rédiger votre message pour voir l&apos;aperçu ici.
                    </p>
                  ) : (
                    <>
                      <div className="px-4 pt-4 pb-3 border-b border-border">
                        <p className="text-xs text-muted uppercase mb-1">Sujet</p>
                        <p className="text-sm font-medium text-foreground">
                          {renderPreview(emailSubject) || "(aucun sujet)"}
                        </p>
                      </div>
                      <iframe
                        srcDoc={buildEmailHtml(emailBody)}
                        className="w-full border-0"
                        style={{ height: "520px" }}
                        sandbox="allow-same-origin"
                        title="Aperçu email principal"
                      />

                      {/* Logo interactif */}
                      <div className="mx-4 mb-4 mt-1">
                        <div className="bg-black rounded-md overflow-hidden">
                          {logoEnabled ? (
                            <div className="group relative flex justify-center py-4">
                              <img
                                src={logoUrl}
                                alt="Logo"
                                className="h-[120px] w-[120px] object-contain"
                              />
                              {/* Overlay on hover */}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                <button
                                  onClick={() => setEditingLogo(true)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-md transition-colors"
                                >
                                  <Pencil className="size-3.5" />
                                  Modifier
                                </button>
                                <button
                                  onClick={handleLogoDelete}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white text-xs rounded-md transition-colors"
                                >
                                  <Trash2 className="size-3.5" />
                                  Supprimer
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-3 py-4">
                              <span className="text-xs text-white/50">Logo supprimé</span>
                              <button
                                onClick={handleLogoRestore}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-md transition-colors"
                              >
                                <ImageIcon className="size-3.5" />
                                Restaurer
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Edit logo — file upload */}
                        <AnimatePresence>
                          {editingLogo && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 p-3 border border-border rounded-lg bg-background-subtle space-y-2">
                                <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-md p-5 cursor-pointer hover:border-primary/50 hover:bg-primary-subtle transition-colors ${logoUploading ? "opacity-50 pointer-events-none" : ""}`}>
                                  {logoUploading ? (
                                    <RefreshCw className="size-5 text-primary animate-spin" />
                                  ) : (
                                    <ImageIcon className="size-5 text-foreground-muted" />
                                  )}
                                  <span className="text-sm text-foreground-secondary">
                                    {logoUploading ? "Upload en cours…" : "Cliquer pour choisir une image"}
                                  </span>
                                  <span className="text-xs text-foreground-muted">PNG, JPG, SVG, WebP — max 5 Mo</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleLogoUpload(file);
                                    }}
                                  />
                                </label>
                                <button
                                  onClick={() => setEditingLogo(false)}
                                  className="flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground transition-colors"
                                >
                                  <X className="size-3.5" /> Annuler
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Follow-up preview */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="size-4 text-accent" />
                    <CardTitle className="text-lg">Aperçu — Follow-up</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden">
                  {!followUpSubject && !followUpBody ? (
                    <p className="text-muted text-sm p-4">
                      Rédigez votre message de relance pour voir l&apos;aperçu ici.
                    </p>
                  ) : (
                    <>
                      <div className="px-4 pt-4 pb-3 border-b border-border">
                        <p className="text-xs text-muted uppercase mb-1">Sujet</p>
                        <p className="text-sm font-medium text-foreground">
                          {renderPreview(followUpSubject) || "(aucun sujet)"}
                        </p>
                      </div>
                      <iframe
                        srcDoc={buildEmailHtml(followUpBody)}
                        className="w-full border-0"
                        style={{ height: "520px" }}
                        sandbox="allow-same-origin"
                        title="Aperçu follow-up"
                      />
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="p-3 bg-primary-subtle rounded-md">
                <p className="text-xs text-primary">
                  Les variables insérées seront automatiquement remplacées par les vraies données de chaque contact lors de l&apos;envoi.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══ Contact Tab ═══ */}
        {activeTab === "contact" && (
          <motion.div
            key="contact-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              {/* Controls */}
              <div className="p-4 border-b border-border">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search */}
                  <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-foreground-muted" />
                    <Input
                      type="text"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setContactsPage(1);
                      }}
                      placeholder="Rechercher par nom, entreprise, email..."
                      className="pl-9"
                    />
                  </div>

                  {/* Type filter */}
                  <Select
                    value={contactTypeFilter}
                    onChange={(e) => {
                      setContactTypeFilter(e.target.value);
                      setContactsPage(1);
                    }}
                  >
                    <option value="">Tous les types</option>
                    <option value="prospect">Prospects</option>
                    <option value="client">Clients</option>
                    <option value="nouveau_client">Nouveaux clients</option>
                  </Select>

                  {/* Selection controls */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                      disabled={allPageSelected}
                    >
                      Tout sélectionner
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeselectAll}
                    >
                      Tout désélectionner
                    </Button>
                  </div>
                </div>

                {/* Selection count */}
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-foreground-muted">
                    {contactsTotal} contact{contactsTotal !== 1 ? "s" : ""}{" "}
                    {contactTypeFilter && `(${contactTypeFilter})`}
                  </p>
                  <p className="text-sm font-medium text-primary">
                    {selectedCount} contact{selectedCount !== 1 ? "s" : ""}{" "}
                    sélectionné{selectedCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {/* Table */}
              <table className="w-full text-sm">
                <thead className="bg-background-subtle border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted w-10">
                      <input
                        type="checkbox"
                        checked={allPageSelected && contacts.length > 0}
                        onChange={() =>
                          allPageSelected ? handleDeselectAll() : handleSelectAll()
                        }
                        className="rounded-md border-border"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                      Entreprise
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                      Email
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                      Ville
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contactsLoading ? (
                    <tr>
                      <td colSpan={6} className="p-4">
                        <div className="space-y-3">
                          {[...Array(5)].map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : contacts.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={<Users />}
                          title={
                            search || contactTypeFilter
                              ? "Aucun contact trouvé pour ce filtre."
                              : "Aucun contact dans l'application."
                          }
                          description={
                            search || contactTypeFilter
                              ? undefined
                              : "Lancez une découverte depuis la page Prospects."
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    contacts.map((c) => (
                      <tr
                        key={c.id}
                        className={`border-b border-border hover:bg-card-hover cursor-pointer transition-colors ${
                          localSelected.has(c.id) ? "bg-primary-subtle/50" : ""
                        }`}
                        onClick={() => handleToggleContact(c.id)}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={localSelected.has(c.id)}
                            onChange={() => handleToggleContact(c.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-md border-border"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{c.companyName}</td>
                        <td className="px-4 py-3 text-foreground-secondary">
                          {c.email || (
                            <span className="text-muted">Aucun</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground-secondary">
                          {c.city || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={contactTypeVariantMap[c.contactType] || "default"}>
                            {contactTypeLabels[c.contactType] || c.contactType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-foreground">{c.leadScore}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {contactsTotalPages > 1 && (
                <div className="p-4 border-t border-border">
                  <Pagination
                    page={contactsPage}
                    totalPages={contactsTotalPages}
                    onPageChange={setContactsPage}
                  />
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* ═══ Reports Tab ═══ */}
        {activeTab === "reports" && (
          <motion.div
            key="reports-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <CampaignReports campaignId={campaignId} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
