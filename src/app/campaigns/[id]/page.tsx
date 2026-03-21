"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  ShieldCheck,
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import CampaignReports from "@/components/CampaignReports";
import { useTranslation } from "@/components/LanguageProvider";

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

// ─── Variables Help ──────────────────────────────────────

const TEMPLATE_VARIABLES = [
  { key: "{{company_name}}", label: "Nom de l'entreprise (prospect)" },
  { key: "{{city}}", label: "Ville (prospect)" },
  { key: "{{contact_name}}", label: "Nom du contact" },
  { key: "{{sender_name}}", label: "Votre entreprise" },
  { key: "{{company_phone}}", label: "Votre téléphone" },
  { key: "{{company_website}}", label: "Votre site web" },
  { key: "{{company_email}}", label: "Votre email" },
];

// ─── Main Page Component ─────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useTranslation();
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

  // Company settings (source of truth for preview)
  const [companySettings, setCompanySettings] = useState({
    name: "", email: "", phone: "", website: "",
    address: "", city: "", province: "", postalCode: "", country: "",
    emailSignature: "",
  });
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
      setToast({ message: t("campaignDetail", "logoUpdated"), type: "success" });
    } else {
      setToast({ message: data.error || t("campaignDetail", "errorUpload"), type: "error" });
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
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [unverifiedStats, setUnverifiedStats] = useState<{ total: number; unverified: number } | null>(null);
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
  const [selectedCount, setSelectedCount] = useState(0);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [contactTypeFilter, setContactTypeFilter] = useState("");
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Batch pending toggle changes and flush to server
  const pendingAdds = useRef<Set<string>>(new Set());
  const pendingRemoves = useRef<Set<string>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flushPendingChanges() {
    const toAdd = [...pendingAdds.current];
    const toRemove = [...pendingRemoves.current];
    pendingAdds.current.clear();
    pendingRemoves.current.clear();

    if (toAdd.length > 0) {
      fetch(`/api/campaigns/${campaignId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: toAdd }),
      }).catch(() => showToast(t("campaignDetail", "errorUpdate"), "error"));
    }
    if (toRemove.length > 0) {
      fetch(`/api/campaigns/${campaignId}/contacts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: toRemove }),
      }).catch(() => showToast(t("campaignDetail", "errorUpdate"), "error"));
    }
  }

  // ─── Drag-to-select for contacts ───────────────────
  const isDragging = useRef(false);
  const dragSelectMode = useRef<boolean>(true);
  const dragStartIndex = useRef<number>(-1);
  const dragLastIndex = useRef<number>(-1);
  const dragPrevSelected = useRef<Set<string>>(new Set());
  const contactsScrollRef = useRef<HTMLDivElement>(null);
  const scrollSpeedRef = useRef(0);
  const rafRef = useRef<number>(0);
  const mouseYRef = useRef(0);
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
  const dragPendingId = useRef<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const DRAG_THRESHOLD = 8;

  const applyContactDragRange = useCallback((currentIdx: number) => {
    if (dragStartIndex.current === -1 || currentIdx === dragLastIndex.current) return;
    dragLastIndex.current = currentIdx;
    const lo = Math.min(dragStartIndex.current, currentIdx);
    const hi = Math.max(dragStartIndex.current, currentIdx);
    const cs = contactsRef.current;
    const rangeIds = new Set<string>();
    for (let i = lo; i <= hi; i++) rangeIds.add(cs[i].id);
    setLocalSelected(() => {
      const next = new Set(dragPrevSelected.current);
      for (const rid of rangeIds) {
        if (dragSelectMode.current) next.add(rid); else next.delete(rid);
      }
      return next;
    });
  }, []);

  const handleContactDragStart = useCallback((id: string, e: React.MouseEvent) => {
    dragPendingId.current = id;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;

    const willSelect = !localSelected.has(id);
    dragSelectMode.current = willSelect;
    dragPrevSelected.current = new Set(localSelected);
    const idx = contacts.findIndex((c) => c.id === id);
    dragStartIndex.current = idx;
    dragLastIndex.current = idx;
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (willSelect) next.add(id); else next.delete(id);
      return next;
    });
    setSelectedCount((prev) => prev + (willSelect ? 1 : -1));
  }, [localSelected, contacts]);

  useEffect(() => {
    let lastTime = 0;
    const loop = (time: number) => {
      if (isDragging.current && contactsScrollRef.current) {
        if (lastTime && scrollSpeedRef.current !== 0) {
          const dt = time - lastTime;
          contactsScrollRef.current.scrollBy(0, scrollSpeedRef.current * (dt / 16));
        }
        const el = document.elementFromPoint(window.innerWidth / 3, mouseYRef.current);
        if (el) {
          const tr = el.closest("tr[data-contact-idx]");
          if (tr) {
            const idx = parseInt(tr.getAttribute("data-contact-idx")!, 10);
            if (!isNaN(idx)) applyContactDragRange(idx);
          }
        }
      }
      lastTime = time;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const handleMouseUp = () => {
      if (isDragging.current || dragPendingId.current) {
        // Compute diff and flush batch changes
        const prev = dragPrevSelected.current;
        setLocalSelected((current) => {
          const toAdd: string[] = [];
          const toRemove: string[] = [];
          current.forEach((id) => { if (!prev.has(id)) toAdd.push(id); });
          prev.forEach((id) => { if (!current.has(id)) toRemove.push(id); });
          // Update selectedCount based on diff
          setSelectedCount(current.size);
          // Queue batch sync (skip the first single-click item already handled)
          if (toAdd.length > 0) {
            toAdd.forEach((id) => {
              pendingRemoves.current.delete(id);
              pendingAdds.current.add(id);
            });
          }
          if (toRemove.length > 0) {
            toRemove.forEach((id) => {
              pendingAdds.current.delete(id);
              pendingRemoves.current.add(id);
            });
          }
          if (toAdd.length > 0 || toRemove.length > 0) {
            if (flushTimer.current) clearTimeout(flushTimer.current);
            flushTimer.current = setTimeout(flushPendingChanges, 300);
          }
          return current;
        });
      }
      isDragging.current = false;
      dragPendingId.current = null;
      dragStartIndex.current = -1;
      dragLastIndex.current = -1;
      scrollSpeedRef.current = 0;
    };
    const handleMouseMove = (e: MouseEvent) => {
      mouseYRef.current = e.clientY;
      if (!isDragging.current && dragPendingId.current) {
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        if (Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD) {
          isDragging.current = true;
          dragPendingId.current = null;
        } else {
          return;
        }
      }
      if (!isDragging.current || !contactsScrollRef.current) { scrollSpeedRef.current = 0; return; }
      const rect = contactsScrollRef.current.getBoundingClientRect();
      const edgeZone = 80;
      if (e.clientY < rect.top + edgeZone && e.clientY >= rect.top) {
        scrollSpeedRef.current = -Math.max(3, Math.round((rect.top + edgeZone - e.clientY) / 3));
      } else if (e.clientY > rect.bottom - edgeZone && e.clientY <= rect.bottom) {
        scrollSpeedRef.current = Math.max(3, Math.round((e.clientY - (rect.bottom - edgeZone)) / 3));
      } else {
        scrollSpeedRef.current = 0;
      }
    };
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [applyContactDragRange]);

  // Scroll-to-top button for contacts table
  useEffect(() => {
    const el = contactsScrollRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 200);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeTab]);

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

  // ─── Fetch unverified email stats for this campaign ─
  useEffect(() => {
    if (!campaignId) return;
    fetch(`/api/verify-emails?campaignId=${campaignId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setUnverifiedStats(data); })
      .catch(console.error);
  }, [campaignId]);

  // ─── Fetch settings (automation + logo) ────────────
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.automation) setAutomationSettings(data.automation);
        if (data?.email?.logoUrl) setLogoUrl(data.email.logoUrl);
        if (typeof data?.email?.logoEnabled === "boolean") setLogoEnabled(data.email.logoEnabled);
        if (data?.company) setCompanySettings((prev: typeof companySettings) => ({ ...prev, ...data.company }));
      })
      .catch(() => {});
  }, []);

  // ─── Fetch contacts ─────────────────────────────────

  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    const params = new URLSearchParams({
      page: "1",
      limit: "10000",
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
  }, [campaignId, search, contactTypeFilter]);

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
      showToast(t("campaignDetail", "messageSaved"), "success");
    } catch {
      showToast(t("campaignDetail", "errorSaving"), "error");
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
        newStatus === "ACTIVE" ? t("campaignDetail", "campaignActivated") : t("campaignDetail", "campaignPaused"),
        "success"
      );
    } catch {
      showToast(t("campaignDetail", "errorStatus"), "error");
    }
  }

  function handleToggleContact(prospectId: string) {
    const isSelected = localSelected.has(prospectId);

    // Instant local update
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

    // Queue for batch server sync
    if (isSelected) {
      pendingAdds.current.delete(prospectId);
      pendingRemoves.current.add(prospectId);
    } else {
      pendingRemoves.current.delete(prospectId);
      pendingAdds.current.add(prospectId);
    }

    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushPendingChanges, 500);
  }

  async function handleSelectAll() {
    // Optimistic: select all visible contacts
    setLocalSelected((prev) => {
      const next = new Set(prev);
      contacts.forEach((c) => next.add(c.id));
      return next;
    });
    const prevSelectedCount = selectedCount;
    setSelectedCount(contactsTotal);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/contacts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "selectAll",
          contactType: contactTypeFilter || undefined,
          search: search || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      showToast(`${data.total} ${t("campaignDetail", "contactsAdded")}`, "success");
      fetchContacts();
    } catch {
      setLocalSelected(new Set());
      setSelectedCount(prevSelectedCount);
      showToast(t("campaignDetail", "errorSelection"), "error");
    }
  }

  async function handleDeselectAll() {
    const prevSelected = new Set(localSelected);
    const prevCount = selectedCount;
    setLocalSelected(new Set());
    setSelectedCount(0);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/contacts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deselectAll" }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      showToast(`${data.removed} ${t("campaignDetail", "contactsRemoved")}`, "success");
      fetchContacts();
    } catch {
      setLocalSelected(prevSelected);
      setSelectedCount(prevCount);
      showToast(t("campaignDetail", "errorDeselection"), "error");
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
        showToast(data.error || t("campaignDetail", "errorSaving"), "error");
      } else {
        setSendResult(data);
        showToast(`${data.sent} ${data.sent !== 1 ? t("campaignDetail", "emailsSentPlural") : t("campaignDetail", "emailsSent")} ${data.sent !== 1 ? t("campaignDetail", "sentPlural") : t("campaignDetail", "sent")}`, data.failed > 0 ? "error" : "success");
      }
    } catch {
      showToast(t("campaignDetail", "errorSaving"), "error");
    } finally {
      setSending(false);
    }
  }

  async function handleSendFollowUp() {
    setSendingFollowUp(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/follow-up`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || t("campaignDetail", "errorSaving"), "error");
      } else if (data.sent === 0) {
        showToast(t("campaignDetail", "noEligibleFollowUp") || "Aucun contact éligible pour la relance", "error");
      } else {
        showToast(`${data.sent} relance${data.sent > 1 ? "s" : ""} envoyée${data.sent > 1 ? "s" : ""}`, "success");
      }
    } catch {
      showToast(t("campaignDetail", "errorSaving"), "error");
    } finally {
      setSendingFollowUp(false);
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
      let msg = t("campaignDetail", "errorSchedule");
      try { msg = JSON.parse(text).error || msg; } catch { if (text) msg = text; }
      throw new Error(msg);
    }
    const saved = await res.json();
    setScheduledEmail(saved);
    setShowScheduleModal(false);
    showToast(isEdit ? t("campaignDetail", "rescheduled") : t("campaignDetail", "scheduledSuccess"), "success");
  }

  async function handleCancelScheduled() {
    if (!scheduledEmail) return;
    try {
      const res = await fetch(`/api/scheduled-emails/${scheduledEmail.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setScheduledEmail(null);
      showToast(t("campaignDetail", "scheduledCancelled"), "success");
    } catch {
      showToast(t("campaignDetail", "errorCancel"), "error");
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
        title={t("campaignDetail", "notFound")}
        description={t("campaignDetail", "notFoundDesc")}
        action={
          <Link href="/campaigns">
            <Button variant="secondary">
              <ArrowLeft />
              {t("campaignDetail", "backToCampaigns")}
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
      .replace(/\{\{contact_name\}\}/g, "Madame, Monsieur")
      .replace(/\{\{company_email\}\}/g, companySettings.email || "")
      .replace(/\{\{company_phone\}\}/g, companySettings.phone || "")
      .replace(/\{\{company_website\}\}/g, companySettings.website || "")
      .replace(/\{\{company_address\}\}/g, companySettings.address || "")
      .replace(/\{\{company_city\}\}/g, companySettings.city || "")
      .replace(/\{\{company_province\}\}/g, companySettings.province || "")
      .replace(/\{\{company_postal_code\}\}/g, companySettings.postalCode || "")
      .replace(/\{\{company_country\}\}/g, companySettings.country || "")
      .replace(/\{\{sender_name\}\}/g, companySettings.name || "");
  }

  function buildEmailHtml(body: string): string {
    const interpolated = renderPreview(body);
    const htmlBody = interpolated
      .split(/\n\n+/)
      .map((para) =>
        `<p style="margin:0 0 16px 0;line-height:1.6;">${para.trim().replace(/\n/g, "<br>")}</p>`
      )
      .join("\n");

    // Use company settings from DB — source of truth
    const cName = companySettings.name || "Mon entreprise";
    const cPhone = companySettings.phone || "";
    const cWebsite = companySettings.website || "";
    const cContactName = companySettings.emailSignature?.split("\n")[0]?.trim() || cName;
    const websiteDisplay = cWebsite.replace(/^https?:\/\//, "");
    const websiteHref = cWebsite.startsWith("http") ? cWebsite : `https://${cWebsite}`;

    // Build contact line
    const phonePart = cPhone ? `<a href="tel:${cPhone}" style="color:#2563eb;text-decoration:none;">${cPhone}</a>` : "";
    const websitePart = cWebsite ? `<a href="${websiteHref}" style="color:#2563eb;text-decoration:none;">${websiteDisplay}</a>` : "";
    const contactLine = [phonePart, websitePart].filter(Boolean).join(" &nbsp;·&nbsp; ");

    // Build address line
    const addressParts = [companySettings.address, companySettings.city, companySettings.province, companySettings.postalCode, companySettings.country].filter(Boolean);
    const addressHtml = addressParts.length > 0 ? `<br><span style="color:#9ca3af;font-size:11px;">${addressParts.join(", ")}</span>` : "";

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
    <strong style="color:#111827;">${cContactName}</strong><br>
    <span style="color:#6b7280;">${cName}</span><br>
    ${contactLine}${addressHtml}
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
    { id: "message", label: t("campaignDetail", "message") },
    { id: "contact", label: t("campaignDetail", "contacts"), count: selectedCount },
    { id: "reports", label: t("campaignDetail", "reports") },
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

      {/* Send Confirm Modal — with smart verification gate */}
      {showSendConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{t("campaignDetail", "confirmSend")}</h2>
            <p className="text-sm text-foreground-secondary">
              {t("campaignDetail", "aboutToSend")}{" "}
              <span className="font-semibold text-foreground">{selectedCount} {selectedCount !== 1 ? t("campaignDetail", "contactPlural") : t("campaignDetail", "contact")}</span>.
              {" "}{t("campaignDetail", "irreversible")}
            </p>

            {/* Unverified emails warning — smart gate */}
            {unverifiedStats && unverifiedStats.unverified > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-warning font-medium">
                      {unverifiedStats.unverified} {unverifiedStats.unverified !== 1 ? t("campaignDetail", "emailsSentPlural") : t("campaignDetail", "emailsSent")} {unverifiedStats.unverified !== 1 ? t("campaignDetail", "unverifiedEmailsPlural") : t("campaignDetail", "unverifiedEmails")}
                    </p>
                    <p className="text-xs text-foreground-muted mt-1">
                      {unverifiedStats.unverified} / {unverifiedStats.total} {t("campaignDetail", "unverifiedWarning")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setShowSendConfirm(false);
                    const params = new URLSearchParams({ from: "campaign", campaign: campaign.name || "" });
                    router.push(`/email-verifier?${params}`);
                  }}
                >
                  <ShieldCheck className="size-4" />
                  {t("campaignDetail", "verifyNow")}
                </Button>
              </div>
            )}

            {(!campaign.emailSubject || !campaign.emailBody) && (
              <p className="text-sm text-warning font-medium">
                {t("campaignDetail", "messageNotConfigured")}
              </p>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setShowSendConfirm(false)}>
                {t("common", "cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!campaign.emailSubject || !campaign.emailBody}
                onClick={handleSend}
              >
                <Send />
                {unverifiedStats && unverifiedStats.unverified > 0 ? t("campaignDetail", "sendAnyway") : t("campaignDetail", "confirmSendBtn")}
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
              {sendResult.sent} {sendResult.sent !== 1 ? t("campaignDetail", "emailsSentPlural") : t("campaignDetail", "emailsSent")} {sendResult.sent !== 1 ? t("campaignDetail", "sentPlural") : t("campaignDetail", "sent")}
              {sendResult.failed > 0 && `, ${sendResult.failed} ${t("prospects", "failed")}`}
              {sendResult.skippedNoEmail > 0 && `, ${sendResult.skippedNoEmail} ${t("campaignDetail", "withoutEmail")}`}
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

      {/* Missing sender email warning */}
      {!companySettings.email && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm flex items-center gap-3 bg-warning-subtle border border-warning/20">
          <AlertTriangle className="size-4 text-warning shrink-0" />
          <p className="text-foreground-secondary">
            {locale === "en"
              ? "No sender email configured. Go to "
              : "Aucun email d'envoi configuré. Allez dans "}
            <a href="/settings" className="text-accent underline font-medium">
              {locale === "en" ? "Settings" : "Paramètres"}
            </a>
            {locale === "en"
              ? " → Company to set your email before sending."
              : " → Entreprise pour configurer votre email avant d'envoyer."}
          </p>
        </div>
      )}

      {/* Scheduled Email Banner */}
      {scheduledEmail && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-4 bg-accent-subtle border border-accent/20">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-accent shrink-0" />
            <div>
              <span className="font-medium text-foreground">{t("campaignDetail", "scheduledSend")} — </span>
              <span className="text-foreground-secondary">
                {new Date(scheduledEmail.scheduledFor).toLocaleString(locale === "en" ? "en-CA" : "fr-CA", {
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
              {t("common", "edit")}
            </button>
            <button
              onClick={handleSendNowFromScheduled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Send className="size-3.5" />
              {t("campaignDetail", "sendNow")}
            </button>
            <button
              onClick={handleCancelScheduled}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-card border border-border hover:bg-danger-subtle hover:text-danger hover:border-danger/30 text-foreground-muted transition-colors"
            >
              <X className="size-3.5" />
              {t("common", "cancel")}
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
              {t("campaigns", "campaigns")}
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
              {t("common", "back")}
            </Button>
          </Link>
          <Button
            variant={campaign.status === "ACTIVE" ? "secondary" : "success"}
            onClick={handleToggleStatus}
          >
            {campaign.status === "ACTIVE" ? <Pause /> : <Play />}
            {campaign.status === "ACTIVE" ? t("campaignDetail", "putOnPause") : t("campaigns", "activate")}
          </Button>
          {/* Split send button */}
          <div ref={sendDropdownRef} className="relative flex">
            <Button
              variant="primary"
              disabled={sending || selectedCount === 0}
              onClick={() => setShowSendConfirm(true)}
              title={selectedCount === 0 ? t("campaignDetail", "selectContactsFirst") : undefined}
              className="rounded-r-none border-r border-primary-dark/30"
            >
              <Send />
              {sending ? t("campaignDetail", "sendInProgress") : `${t("campaignDetail", "send")} (${selectedCount})`}
            </Button>
            <Button
              variant="primary"
              disabled={sending || selectedCount === 0}
              onClick={() => setShowSendDropdown((v) => !v)}
              className="rounded-l-none px-2"
              title={t("campaignDetail", "moreSendOptions")}
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
                  {t("campaignDetail", "sendNow")}
                </button>
                <button
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground hover:bg-card-hover transition-colors"
                  onClick={() => { setShowSendDropdown(false); setShowScheduleModal(true); }}
                >
                  <CalendarClock className="size-4 text-accent" />
                  {t("campaignDetail", "scheduleEmail")}
                </button>
                <button
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground hover:bg-card-hover transition-colors border-t border-border"
                  disabled={sendingFollowUp}
                  onClick={() => { setShowSendDropdown(false); handleSendFollowUp(); }}
                >
                  <RefreshCw className={`size-4 text-warning ${sendingFollowUp ? "animate-spin" : ""}`} />
                  {sendingFollowUp ? "Envoi en cours..." : "Envoyer les relances"}
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
                    <CardTitle className="text-lg">{t("campaignDetail", "mainMessage")}</CardTitle>
                  </div>
                  {hasUnsaved && (
                    <Badge variant="warning">{t("campaignDetail", "unsaved")}</Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      {t("campaignDetail", "emailSubject")}
                    </label>
                    <Input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => {
                        setEmailSubject(e.target.value);
                        setHasUnsaved(true);
                      }}
                      placeholder={t("campaignDetail", "emailSubjectPlaceholder")}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      {t("campaignDetail", "emailBody")}
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
                      {t("campaignDetail", "clickToInsertVariable")}
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
                          {v.key === "{{company_name}}" ? t("campaignDetail", "companyName") : v.key === "{{city}}" ? t("campaignDetail", "cityVar") : t("campaignDetail", "contactName")}
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
                    <CardTitle className="text-lg">{t("campaignDetail", "followUpMessage")}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">
                      {t("campaignDetail", "followUpSubject")}
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
                      {t("campaignDetail", "followUpBody")}
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
                      {t("campaignDetail", "clickToInsertVariable")}
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
                          {v.key === "{{company_name}}" ? t("campaignDetail", "companyName") : v.key === "{{city}}" ? t("campaignDetail", "cityVar") : t("campaignDetail", "contactName")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Automation info */}
                  {automationSettings && (
                    <div className="bg-accent-subtle rounded-md p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Clock className="size-3.5 text-accent" />
                        <p className="text-xs font-medium text-accent">{t("campaignDetail", "followUpAutomation")}</p>
                      </div>
                      <div className="text-xs text-foreground-secondary space-y-1">
                        <p>
                          {automationSettings.autoFollowUp
                            ? <>{t("campaignDetail", "autoFollowUpEnabled")} <span className="font-medium text-success">{t("campaignDetail", "enabled")}</span></>
                            : <>{t("campaignDetail", "autoFollowUpEnabled")} <span className="font-medium text-foreground-muted">{t("campaignDetail", "disabled")}</span> — <a href="/settings?section=automation" className="text-primary hover:underline">{t("campaignDetail", "enableInSettings")}</a></>
                          }
                        </p>
                        <p>{t("campaignDetail", "delayBeforeFollowUp")} : <span className="font-medium">{automationSettings.followUpDelayDays} {automationSettings.followUpDelayDays > 1 ? t("campaignDetail", "days") : t("campaignDetail", "day")}</span></p>
                        <p>{t("campaignDetail", "maximum")} : <span className="font-medium">{automationSettings.maxFollowUps} {automationSettings.maxFollowUps > 1 ? t("campaignDetail", "followUps") : t("campaignDetail", "followUp")}</span> {t("campaignDetail", "perContact")} <span className="font-medium">{automationSettings.followUpIntervalDays} {automationSettings.followUpIntervalDays > 1 ? t("campaignDetail", "days") : t("campaignDetail", "day")}</span></p>
                        {automationSettings.stopOnReply && <p>{t("campaignDetail", "stopOnReply")}</p>}
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
                {saving ? t("campaignDetail", "savingMessages") : t("campaignDetail", "saveMessages")}
              </Button>
            </div>

            {/* Preview */}
            <div className="space-y-6">
              {/* Main email preview */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Send className="size-4 text-primary" />
                    <CardTitle className="text-lg">{t("campaignDetail", "previewMain")}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden">
                  {!emailSubject && !emailBody ? (
                    <p className="text-muted text-sm p-4">
                      {t("campaignDetail", "startWriting")}
                    </p>
                  ) : (
                    <>
                      <div className="px-4 pt-4 pb-3 border-b border-border">
                        <p className="text-xs text-muted uppercase mb-1">Sujet</p>
                        <p className="text-sm font-medium text-foreground">
                          {renderPreview(emailSubject) || t("campaignDetail", "noSubject")}
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
                                  {t("common", "edit")}
                                </button>
                                <button
                                  onClick={handleLogoDelete}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white text-xs rounded-md transition-colors"
                                >
                                  <Trash2 className="size-3.5" />
                                  {t("common", "delete")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-3 py-4">
                              <span className="text-xs text-white/50">{t("campaignDetail", "logoDeleted")}</span>
                              <button
                                onClick={handleLogoRestore}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs rounded-md transition-colors"
                              >
                                <ImageIcon className="size-3.5" />
                                {t("common", "restore")}
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
                                    {logoUploading ? t("campaignDetail", "uploading") : t("campaignDetail", "chooseImage")}
                                  </span>
                                  <span className="text-xs text-foreground-muted">{t("campaignDetail", "imageFormats")}</span>
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
                                  <X className="size-3.5" /> {t("common", "cancel")}
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
                    <CardTitle className="text-lg">{t("campaignDetail", "previewFollowUp")}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-hidden">
                  {!followUpSubject && !followUpBody ? (
                    <p className="text-muted text-sm p-4">
                      {t("campaignDetail", "writeFollowUp")}
                    </p>
                  ) : (
                    <>
                      <div className="px-4 pt-4 pb-3 border-b border-border">
                        <p className="text-xs text-muted uppercase mb-1">Sujet</p>
                        <p className="text-sm font-medium text-foreground">
                          {renderPreview(followUpSubject) || t("campaignDetail", "noSubject")}
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
                  {t("campaignDetail", "variablesInfo")}
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
                      }}
                      placeholder={t("campaignDetail", "searchContacts")}
                      className="pl-9"
                    />
                  </div>

                  {/* Type filter */}
                  <Select
                    value={contactTypeFilter}
                    onChange={(e) => {
                      setContactTypeFilter(e.target.value);
                    }}
                  >
                    <option value="">{t("campaignDetail", "allTypes")}</option>
                    <option value="prospect">{t("campaignDetail", "prospects")}</option>
                    <option value="client">{t("campaignDetail", "clients")}</option>
                    <option value="nouveau_client">{t("campaignDetail", "newClients")}</option>
                  </Select>

                  {/* Selection controls */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                      disabled={allPageSelected}
                    >
                      {t("common", "selectAll")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeselectAll}
                    >
                      {t("common", "deselectAll")}
                    </Button>
                  </div>
                </div>

                {/* Selection count */}
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm text-foreground-muted">
                    {contactsTotal} {contactsTotal !== 1 ? t("campaignDetail", "contactPlural") : t("campaignDetail", "contact")}{" "}
                    {contactTypeFilter && `(${contactTypeFilter})`}
                  </p>
                  <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline cursor-pointer"
                    onClick={() => {
                      const firstSelected = contacts.find((c) => localSelected.has(c.id));
                      if (firstSelected) {
                        const el = document.getElementById(`contact-${firstSelected.id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }
                    }}
                  >
                    {selectedCount} {selectedCount !== 1 ? t("campaignDetail", "contactPlural") : t("campaignDetail", "contact")}{" "}
                    {selectedCount !== 1 ? t("prospects", "selectedPlural") : t("prospects", "selected")}
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="max-h-[600px] overflow-y-auto" ref={contactsScrollRef}>
              <table className="w-full text-sm">
                <thead className="bg-background-subtle border-b border-border sticky top-0 z-10">
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
                      {t("prospects", "company")}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                      Email
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                      {t("prospects", "city")}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                      {t("prospects", "type")}
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-foreground-muted">
                      Statut
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
                              ? t("campaignDetail", "noContactFilter")
                              : t("campaignDetail", "noContactApp")
                          }
                          description={
                            search || contactTypeFilter
                              ? undefined
                              : t("campaignDetail", "noContactDesc")
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    contacts.map((c, idx) => (
                      <tr
                        key={c.id}
                        id={`contact-${c.id}`}
                        data-contact-idx={idx}
                        className={`border-b border-border hover:bg-card-hover cursor-pointer transition-colors ${
                          localSelected.has(c.id) ? "bg-primary-subtle/50" : ""
                        }`}
                        onClick={() => handleToggleContact(c.id)}
                      >
                        <td
                          className="px-4 py-3 select-none"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => { e.preventDefault(); handleContactDragStart(c.id, e); }}
                        >
                          <input
                            type="checkbox"
                            checked={localSelected.has(c.id)}
                            onChange={() => handleToggleContact(c.id)}
                            className="rounded-md border-border pointer-events-none"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{c.companyName}</td>
                        <td className="px-4 py-3 text-foreground-secondary">
                          {c.email || (
                            <span className="text-muted">{t("common", "none")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground-secondary">
                          {c.city || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={contactTypeVariantMap[c.contactType] || "default"}>
                            {c.contactType === "prospect" ? t("contactType", "prospect") : c.contactType === "client" ? t("contactType", "client") : c.contactType === "nouveau_client" ? t("contactType", "nouveau_client") : c.contactType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={c.status === "CONTACTED" || c.status === "REPLIED" || c.status === "QUALIFIED" ? "success" : c.status === "NOT_INTERESTED" ? "danger" : c.status === "SCHEDULED" ? "warning" : "default"}>
                            {t("prospectStatus", c.status as "NEW") || c.status}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {showScrollTop && (
                <button
                  onClick={() => contactsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                  className="sticky bottom-3 left-full mr-3 z-20 bg-foreground text-background w-9 h-9 rounded-full shadow-lg hover:opacity-90 transition-all flex items-center justify-center opacity-80 hover:opacity-100"
                  title="Remonter"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
              )}
              </div>
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
