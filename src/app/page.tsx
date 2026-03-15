"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  Users,
  Mail,
  MessageSquare,
  Target,
  Sparkles,
  Zap,
  Phone,
  XCircle,
  Inbox,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { useTranslation } from "@/components/LanguageProvider";

interface DashboardStats {
  totalProspects: number;
  prospectsByStatus: Record<string, number>;
  emailsSentToday: number;
  totalEmailsSent: number;
  totalReplies: number;
  replyRate: string;
  bounceRate: string;
  qualifiedLeads: number;
  recentProspects: Array<{
    id: string;
    companyName: string;
    city: string;
    status: string;
    leadScore: number;
    dateDiscovered: string;
  }>;
  recentEmails: Array<{
    id: string;
    emailSubject: string;
    sentAt: string;
    replyReceived: boolean;
    bounce: boolean;
    prospect: { companyName: string };
  }>;
}

const STATUS_VARIANT: Record<
  string,
  "primary" | "default" | "warning" | "success" | "danger"
> = {
  NEW: "primary",
  ENRICHED: "default",
  CONTACTED: "warning",
  REPLIED: "success",
  QUALIFIED: "success",
  NOT_INTERESTED: "default",
};

const PIPELINE_STEPS = [
  { key: "NEW", labelKey: "newProspects" as const, icon: Sparkles },
  { key: "ENRICHED", labelKey: "enrichedProspects" as const, icon: Zap },
  { key: "CONTACTED", labelKey: "contactedProspects" as const, icon: Phone },
  { key: "REPLIED", labelKey: "repliedProspects" as const, icon: MessageSquare },
  { key: "NOT_INTERESTED", labelKey: "notInterested" as const, icon: XCircle },
];

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-7 w-16 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-7 w-10" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-4 w-32 mb-4" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex justify-between py-3 border-b border-border last:border-0">
                <div>
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t, locale } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data.error) setStats(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;

  if (!stats) {
    return (
      <EmptyState
        icon={<Inbox />}
        title={t("dashboard", "cannotLoadStats")}
        description={t("dashboard", "checkDbConnection")}
      />
    );
  }

  return (
    <div>
      <PageHeader title={t("dashboard", "title")} />

      {/* ── Primary Metrics ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <StatCard
            label={t("dashboard", "totalProspects")}
            value={stats.totalProspects}
            icon={<Users className="size-3.5" />}
            iconColor="bg-background-muted text-foreground-muted"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <StatCard
            label={t("dashboard", "emailsSentToday")}
            value={stats.emailsSentToday}
            subtitle={`${stats.totalEmailsSent} ${t("dashboard", "totalSent")}`}
            icon={<Mail className="size-3.5" />}
            iconColor="bg-background-muted text-foreground-muted"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard
            label={t("dashboard", "replyRate")}
            value={stats.replyRate}
            subtitle={`${stats.totalReplies} ${t("dashboard", "replies")}`}
            icon={<MessageSquare className="size-3.5" />}
            iconColor="bg-background-muted text-foreground-muted"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <StatCard
            label={t("dashboard", "qualifiedLeads")}
            value={stats.qualifiedLeads}
            icon={<Target className="size-3.5" />}
            iconColor="bg-background-muted text-foreground-muted"
          />
        </motion.div>
      </div>

      {/* ── Pipeline ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {PIPELINE_STEPS.map((step, i) => (
          <motion.div
            key={step.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.03 }}
          >
            <StatCard
              label={t("dashboard", step.labelKey)}
              value={stats.prospectsByStatus[step.key] || 0}
              icon={<step.icon className="size-3.5" />}
              iconColor="bg-background-muted text-foreground-muted"
            />
          </motion.div>
        ))}
      </div>

      {/* ── Recent Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-background-muted text-foreground-muted">
                  <Users className="size-3.5" />
                </div>
                <CardTitle>{t("dashboard", "recentProspects")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {stats.recentProspects.length === 0 ? (
                <EmptyState
                  icon={<Users />}
                  title={t("dashboard", "noProspects")}
                  description={t("dashboard", "noProspectsDesc")}
                  className="py-8"
                />
              ) : (
                <div className="-mx-5">
                  {stats.recentProspects.map((p) => {
                    const variant = STATUS_VARIANT[p.status];
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-5 py-2.5 hover:bg-card-hover transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {p.companyName}
                          </p>
                          <p className="text-xs text-foreground-muted">
                            {p.city}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-4">
                          <span className="text-xs text-foreground-muted tabular-nums font-mono">
                            {p.leadScore}
                          </span>
                          <Badge variant={variant}>
                            {t("status", p.status as "NEW" | "ENRICHED" | "CONTACTED" | "REPLIED" | "QUALIFIED" | "NOT_INTERESTED")}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-background-muted text-foreground-muted">
                  <Mail className="size-3.5" />
                </div>
                <CardTitle>{t("dashboard", "recentEmails")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {stats.recentEmails.length === 0 ? (
                <EmptyState
                  icon={<Mail />}
                  title={t("dashboard", "noEmails")}
                  description={t("dashboard", "noEmailsDesc")}
                  className="py-8"
                />
              ) : (
                <div className="-mx-5">
                  {stats.recentEmails.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between px-5 py-2.5 hover:bg-card-hover transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {e.prospect.companyName}
                        </p>
                        <p className="text-xs text-foreground-muted truncate">
                          {e.emailSubject}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        {e.bounce && <Badge variant="danger">{t("dashboard", "bounce")}</Badge>}
                        {e.replyReceived && (
                          <Badge variant="success">{t("dashboard", "replied")}</Badge>
                        )}
                        <span className="text-xs text-foreground-muted tabular-nums">
                          {new Date(e.sentAt).toLocaleDateString(locale === "en" ? "en-CA" : "fr-CA")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
