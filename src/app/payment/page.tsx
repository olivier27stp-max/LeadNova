"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Rocket,
  Lock,
  CreditCard,
  TicketPercent,
  Zap,
  Target,
  Mail,
  Users,
  LineChart,
  Globe,
  Star,
  ArrowRight,
} from "lucide-react";

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentPageInner />
    </Suspense>
  );
}

function PaymentPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/login";

  const [promoCode, setPromoCode] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState<"card" | "promo">("card");

  useEffect(() => {
    fetch("/api/payment/status")
      .then((r) => r.json())
      .then((d) => {
        if (d?.paid) router.replace(redirectTo);
      })
      .catch(() => {});
  }, [router, redirectTo]);

  async function submitPromo(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/payment/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de la validation du code.");
      } else {
        setSuccess("Code validé. Redirection en cours…");
        setTimeout(() => {
          router.push(redirectTo);
          router.refresh();
        }, 600);
      }
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/payment/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardNumber, cardName, cardExp, cardCvc }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Paiement refusé.");
      } else {
        setSuccess("Paiement confirmé. Redirection…");
        setTimeout(() => {
          router.push(redirectTo);
          router.refresh();
        }, 600);
      }
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  function formatCardNumber(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 19);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  }
  function formatExp(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    if (digits.length < 3) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background z-10">
      {/* Background decorative gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 size-[600px] rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 size-[500px] rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 size-[500px] rounded-full bg-gradient-to-br from-cyan-500/15 to-blue-500/10 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-10 lg:py-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-12 lg:mb-16">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
              <Logo variant="icon" size={28} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-foreground">Lead</span>
                <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                  Nova
                </span>
              </h1>
              <p className="text-[11px] uppercase tracking-wider text-foreground-muted">
                Enterprise Edition
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-foreground-muted">
            <Lock className="size-3.5" />
            Paiement sécurisé · SSL 256-bit
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16 items-start">
          {/* LEFT — Pitch */}
          <div className="space-y-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-5">
                <Sparkles className="size-3.5" />
                Plateforme de prospection IA · Édition Enterprise
              </div>

              <h2 className="text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1]">
                La machine à <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">leads qualifiés</span> qui remplace votre équipe SDR.
              </h2>

              <p className="mt-5 text-base lg:text-lg text-foreground-secondary leading-relaxed max-w-xl">
                LeadNova découvre, enrichit, score et contacte vos prospects B2B
                automatiquement grâce à une IA spécialisée — 24h/24, sans friction,
                sans erreur humaine.
              </p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              <StatBlock value="12×" label="Pipeline accéléré" />
              <StatBlock value="87%" label="Leads qualifiés" />
              <StatBlock value="24/7" label="Sans intervention" />
            </div>

            {/* Features */}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Rocket className="size-5 text-primary" />
                Tout inclus dans l'abonnement Enterprise
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <Feature
                  icon={<Target className="size-4" />}
                  title="Découverte IA illimitée"
                  desc="Scraping multi-sources Google, Maps, SERP, annuaires pro."
                />
                <Feature
                  icon={<Zap className="size-4" />}
                  title="Enrichissement automatique"
                  desc="Emails, numéros, dirigeants, stack tech, signaux d'achat."
                />
                <Feature
                  icon={<Mail className="size-4" />}
                  title="Campagnes IA personnalisées"
                  desc="Emails hyper-ciblés rédigés par Claude Sonnet 4.5."
                />
                <Feature
                  icon={<LineChart className="size-4" />}
                  title="Scoring prédictif"
                  desc="Probabilité de conversion calculée en temps réel."
                />
                <Feature
                  icon={<Users className="size-4" />}
                  title="Comptes & workspaces illimités"
                  desc="Multi-utilisateurs, rôles, permissions granulaires."
                />
                <Feature
                  icon={<Globe className="size-4" />}
                  title="Support prioritaire"
                  desc="Account manager dédié, SLA 4h, onboarding inclus."
                />
              </div>
            </div>

            {/* Social proof */}
            <div className="rounded-2xl border border-border bg-card/50 backdrop-blur p-6 space-y-4">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-4 fill-amber-400 text-amber-400" />
                ))}
                <span className="ml-2 text-sm font-medium text-foreground-secondary">
                  4.9/5 · 120+ équipes commerciales
                </span>
              </div>
              <blockquote className="text-sm text-foreground-secondary leading-relaxed italic">
                « LeadNova a remplacé notre stack complète. En 6 semaines,
                nous avons fermé 3 deals qualifiés venus directement de
                l'outil, sans qu'aucun SDR humain n'intervienne. »
              </blockquote>
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-semibold text-sm">
                  M
                </div>
                <div>
                  <p className="text-sm font-medium">Marc L.</p>
                  <p className="text-xs text-foreground-muted">
                    VP Sales · Cabinet de gestion immobilière, Montréal
                  </p>
                </div>
              </div>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-4 border-t border-border text-xs text-foreground-muted">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" /> SOC 2 Type II
              </div>
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-success" /> Chiffrement AES-256
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" /> Conforme GDPR / Loi 25
              </div>
            </div>
          </div>

          {/* RIGHT — Payment card */}
          <div className="lg:sticky lg:top-10">
            <div className="relative rounded-3xl border border-border bg-card shadow-2xl shadow-primary/5 overflow-hidden">
              {/* Price header */}
              <div className="relative bg-gradient-to-br from-blue-600 via-violet-600 to-fuchsia-600 text-white px-7 py-8">
                <div className="absolute inset-0 opacity-20 mix-blend-overlay bg-[radial-gradient(circle_at_30%_20%,white,transparent_50%)]" />
                <div className="relative">
                  <p className="text-xs uppercase tracking-widest font-semibold text-white/80">
                    Plan Enterprise — Mensuel
                  </p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-5xl font-bold tracking-tight">
                      8 750 $
                    </span>
                    <span className="text-lg text-white/80">USD</span>
                  </div>
                  <p className="mt-1 text-sm text-white/80">
                    par mois · facturation annuelle disponible
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-medium">
                    <Sparkles className="size-3.5" />
                    Sans engagement · annulable à tout moment
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-7 space-y-6">
                {/* Mode tabs */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-background-subtle rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("card");
                      setError("");
                      setSuccess("");
                    }}
                    className={`flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-colors ${
                      mode === "card"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    <CreditCard className="size-4" />
                    Carte bancaire
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("promo");
                      setError("");
                      setSuccess("");
                    }}
                    className={`flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-colors ${
                      mode === "promo"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-foreground-muted hover:text-foreground"
                    }`}
                  >
                    <TicketPercent className="size-4" />
                    Code promotionnel
                  </button>
                </div>

                {mode === "card" ? (
                  <form onSubmit={submitCard} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                        Numéro de carte
                      </label>
                      <Input
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="4242 4242 4242 4242"
                        value={cardNumber}
                        onChange={(e) =>
                          setCardNumber(formatCardNumber(e.target.value))
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                        Titulaire de la carte
                      </label>
                      <Input
                        autoComplete="cc-name"
                        placeholder="OLIVIER TREMBLAY"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                          Expiration
                        </label>
                        <Input
                          inputMode="numeric"
                          autoComplete="cc-exp"
                          placeholder="MM/AA"
                          value={cardExp}
                          onChange={(e) =>
                            setCardExp(formatExp(e.target.value))
                          }
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                          CVC
                        </label>
                        <Input
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          placeholder="123"
                          maxLength={4}
                          value={cardCvc}
                          onChange={(e) =>
                            setCardCvc(e.target.value.replace(/\D/g, ""))
                          }
                          required
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 text-sm text-danger bg-danger-subtle rounded-lg px-3 py-2.5">
                        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    )}
                    {success && (
                      <div className="flex items-start gap-2 text-sm text-success bg-success/10 rounded-lg px-3 py-2.5">
                        <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                        <span>{success}</span>
                      </div>
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      className="w-full"
                      disabled={loading}
                    >
                      {loading ? (
                        "Traitement…"
                      ) : (
                        <>
                          Payer 8 750 $ USD
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>

                    <p className="text-center text-xs text-foreground-muted">
                      En confirmant, vous acceptez les Conditions générales et la
                      Politique de confidentialité.
                    </p>
                  </form>
                ) : (
                  <form onSubmit={submitPromo} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                        Code promotionnel
                      </label>
                      <Input
                        placeholder="Entrez votre code"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value)}
                        required
                        autoFocus
                      />
                      <p className="mt-2 text-xs text-foreground-muted">
                        Certains codes partenaires donnent accès à l'édition
                        Enterprise à tarif réduit ou gratuit.
                      </p>
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 text-sm text-danger bg-danger-subtle rounded-lg px-3 py-2.5">
                        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    )}
                    {success && (
                      <div className="flex items-start gap-2 text-sm text-success bg-success/10 rounded-lg px-3 py-2.5">
                        <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                        <span>{success}</span>
                      </div>
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      className="w-full"
                      disabled={loading || !promoCode.trim()}
                    >
                      {loading ? (
                        "Validation…"
                      ) : (
                        <>
                          Valider le code
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  </form>
                )}

                {/* Summary */}
                <div className="pt-5 border-t border-border space-y-2 text-sm">
                  <SummaryRow label="Plan Enterprise" value="8 750,00 $" />
                  <SummaryRow label="Taxes (estimation)" value="0,00 $" />
                  <div className="flex items-center justify-between pt-2 border-t border-border-subtle font-semibold">
                    <span>Total aujourd'hui</span>
                    <span className="text-lg">8 750,00 $ USD</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-foreground-muted mt-5">
              Besoin d'aide ?{" "}
              <a
                href="mailto:support@leadnova.app"
                className="text-primary hover:underline"
              >
                support@leadnova.app
              </a>
            </p>
          </div>
        </div>

        <footer className="mt-20 pt-8 border-t border-border text-xs text-foreground-muted flex flex-wrap items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} LeadNova — Tous droits réservés.</p>
          <div className="flex items-center gap-5">
            <span>Conditions</span>
            <span>Confidentialité</span>
            <span>Sécurité</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card/40 hover:bg-card/70 hover:border-primary/30 transition-colors">
      <div className="shrink-0 size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-xs text-foreground-muted mt-0.5 leading-snug">
          {desc}
        </p>
      </div>
    </div>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur px-4 py-4">
      <p className="text-2xl font-bold tracking-tight bg-gradient-to-br from-blue-600 to-violet-600 bg-clip-text text-transparent">
        {value}
      </p>
      <p className="text-xs text-foreground-muted mt-1">{label}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-foreground-secondary">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
