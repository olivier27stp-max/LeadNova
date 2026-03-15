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

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "primary" | "default" | "warning" | "success" | "danger" }
> = {
  NEW: { label: "Nouveau", variant: "primary" },
  ENRICHED: { label: "Enrichi", variant: "default" },
  CONTACTED: { label: "Contacté", variant: "warning" },
  REPLIED: { label: "Répondu", variant: "success" },
  QUALIFIED: { label: "Qualifié", variant: "success" },
  NOT_INTERESTED: { label: "Pas intéressé", variant: "default" },
};

const PIPELINE_STEPS = [
  { key: "NEW", label: "Nouveaux", icon: Sparkles },
  { key: "ENRICHED", label: "Enrichis", icon: Zap },
  { key: "CONTACTED", label: "Contactés", icon: Phone },
  { key: "REPLIED", label: "Répondu", icon: MessageSquare },
  { key: "NOT_INTERESTED", label: "Non intéressé", icon: XCircle },
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
        title="Impossible de charger les statistiques"
        description="Vérifiez la connexion à la base de données."
      />
    );
  }

  return (
    <div>
      <PageHeader title="Tableau de bord" />

      {/* ── Primary Metrics ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <StatCard
            label="Total Prospects"
            value={stats.totalProspects}
            icon={<Users className="size-3.5" />}
            iconColor="bg-background-muted text-foreground-muted"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <StatCard
            label="Emails envoyés aujourd'hui"
            value={stats.emailsSentToday}
            subtitle={`${stats.totalEmailsSent} au total`}
            icon={<Mail className="size-3.5" />}
            iconColor="bg-background-muted text-foreground-muted"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard
            label="Taux de réponse"
            value={stats.replyRate}
            subtitle={`${stats.totalReplies} réponses`}
            icon={<MessageSquare className="size-3.5" />}
            iconColor="bg-background-muted text-foreground-muted"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <StatCard
            label="Leads qualifiés"
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
              label={step.label}
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
                <CardTitle>Prospects récents</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {stats.recentProspects.length === 0 ? (
                <EmptyState
                  icon={<Users />}
                  title="Aucun prospect"
                  description="Lancez une découverte depuis la page Prospects."
                  className="py-8"
                />
              ) : (
                <div className="-mx-5">
                  {stats.recentProspects.map((p) => {
                    const config = STATUS_CONFIG[p.status];
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
                          <Badge variant={config?.variant}>
                            {config?.label || p.status}
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
                <CardTitle>Emails récents</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {stats.recentEmails.length === 0 ? (
                <EmptyState
                  icon={<Mail />}
                  title="Aucun email envoyé"
                  description="Configurez une campagne pour commencer."
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
                        {e.bounce && <Badge variant="danger">Bounce</Badge>}
                        {e.replyReceived && (
                          <Badge variant="success">Répondu</Badge>
                        )}
                        <span className="text-xs text-foreground-muted tabular-nums">
                          {new Date(e.sentAt).toLocaleDateString("fr-CA")}
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
