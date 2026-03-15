"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Play, Pause, ShieldBan, Trash2, Megaphone, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/components/LanguageProvider";

interface Campaign {
  id: string;
  name: string;
  status: string;
  maxPerDay: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  sentToday: number;
  lastSentAt: string | null;
  requireApproval: boolean;
  createdAt: string;
}

interface BlacklistEntry {
  id: string;
  email: string | null;
  domain: string | null;
  reason: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "default"> = {
  ACTIVE: "success",
  PAUSED: "warning",
  DRAFT: "default",
};

function CampaignsSkeleton() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-40" />
      </div>
      <Card className="mb-6">
        <CardContent className="pt-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div>
                <Skeleton className="h-4 w-40 mb-2" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CampaignsPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newBlacklistEmail, setNewBlacklistEmail] = useState("");
  const [newBlacklistDomain, setNewBlacklistDomain] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns").then((r) => {
        if (!r.ok) return [];
        return r.json().then((d) => (Array.isArray(d) ? d : []));
      }),
      fetch("/api/blacklist").then((r) => {
        if (!r.ok) return [];
        return r.json().then((d) => (Array.isArray(d) ? d : []));
      }),
    ])
      .then(([c, b]) => {
        setCampaigns(c);
        setBlacklist(b);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function createCampaign() {
    if (!newCampaignName.trim()) return;
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCampaignName }),
    });
    const campaign = await res.json();
    setCampaigns([campaign, ...campaigns]);
    setNewCampaignName("");
    setShowNewCampaign(false);
  }

  async function toggleCampaignStatus(campaign: Campaign) {
    const newStatus =
      campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const res = await fetch("/api/campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: campaign.id, status: newStatus }),
    });
    const updated = await res.json();
    setCampaigns(
      campaigns.map((c) => (c.id === updated.id ? updated : c))
    );
  }

  async function addToBlacklist() {
    if (!newBlacklistEmail && !newBlacklistDomain) return;
    const res = await fetch("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newBlacklistEmail || undefined,
        domain: newBlacklistDomain || undefined,
      }),
    });
    const entry = await res.json();
    setBlacklist([entry, ...blacklist]);
    setNewBlacklistEmail("");
    setNewBlacklistDomain("");
  }

  async function removeFromBlacklist(id: string) {
    await fetch(`/api/blacklist?id=${id}`, { method: "DELETE" });
    setBlacklist(blacklist.filter((b) => b.id !== id));
  }

  if (loading) return <CampaignsSkeleton />;

  return (
    <div>
      <PageHeader
        title={t("campaigns", "title")}
        actions={
          <Button onClick={() => setShowNewCampaign(!showNewCampaign)}>
            <Plus className="size-4" />
            {t("campaigns", "newCampaign")}
          </Button>
        }
      />

      {/* New campaign form */}
      <AnimatePresence>
        {showNewCampaign && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-4"
          >
            <div className="flex gap-2 p-4 rounded-lg border border-border bg-card">
              <Input
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder={t("campaigns", "campaignNamePlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && createCampaign()}
                className="flex-1"
              />
              <Button onClick={createCampaign} variant="success">
                {t("common", "create")}
              </Button>
              <Button variant="ghost" onClick={() => setShowNewCampaign(false)}>
                {t("common", "cancel")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Campaigns */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0 }}
      >
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-4 text-foreground-muted" />
              {t("campaigns", "campaigns")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title={t("campaigns", "noCampaigns")}
                description={t("campaigns", "noCampaignsDesc")}
                className="py-8"
              />
            ) : (
              <div className="-mx-5">
                {campaigns.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center justify-between px-5 py-3 hover:bg-card-hover transition-colors border-b border-border last:border-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-foreground-muted mt-0.5">
                        {t("campaigns", "maxPerDay")}: {c.maxPerDay}{t("campaigns", "perDay")} — {t("campaigns", "delay")}: {c.delayMinSeconds}-{c.delayMaxSeconds}s — {t("campaigns", "sentToday")}: {c.sentToday}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Badge variant={STATUS_VARIANT[c.status] || "default"}>
                        {t("status", c.status as "ACTIVE" | "PAUSED" | "DRAFT")}
                      </Badge>
                      <Button
                        variant={c.status === "ACTIVE" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => toggleCampaignStatus(c)}
                      >
                        {c.status === "ACTIVE" ? (
                          <><Pause className="size-3.5" /> {t("campaigns", "pause")}</>
                        ) : (
                          <><Play className="size-3.5" /> {t("campaigns", "activate")}</>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Blacklist */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldBan className="size-4 text-foreground-muted" />
              {t("campaigns", "blacklist")}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowBlacklist(!showBlacklist)}
            >
              {showBlacklist ? t("common", "close") : t("common", "add")}
            </Button>
          </CardHeader>
          <CardContent>
            <AnimatePresence>
              {showBlacklist && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={newBlacklistEmail}
                      onChange={(e) => setNewBlacklistEmail(e.target.value)}
                      placeholder="Email"
                      className="flex-1"
                    />
                    <Input
                      type="text"
                      value={newBlacklistDomain}
                      onChange={(e) => setNewBlacklistDomain(e.target.value)}
                      placeholder={t("campaigns", "domain")}
                      className="flex-1"
                    />
                    <Button variant="danger" onClick={addToBlacklist}>
                      {t("campaigns", "block")}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {blacklist.length === 0 ? (
              <EmptyState
                icon={<ShieldBan />}
                title={t("campaigns", "blacklistEmpty")}
                description={t("campaigns", "blacklistEmptyDesc")}
                className="py-8"
              />
            ) : (
              <div className="-mx-5">
                {blacklist.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between px-5 py-2.5 hover:bg-card-hover transition-colors border-b border-border last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        {b.email || b.domain}
                        {b.reason && (
                          <span className="text-foreground-muted ml-2">
                            — {b.reason}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="danger-ghost"
                      size="sm"
                      onClick={() => removeFromBlacklist(b.id)}
                    >
                      <Trash2 className="size-3.5" />
                      {t("common", "remove")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
