"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Eye, EyeOff, KeyRound, CheckCircle2, ArrowLeft, ShieldCheck, ShieldAlert } from "lucide-react";

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordPageInner /></Suspense>;
}

function ResetPasswordPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Password strength
  const pwLen = password.length;
  const hasMinLength = pwLen >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const strengthScore = [hasMinLength, hasUppercase, hasNumber, hasSpecial].filter(Boolean).length;
  const passwordsMatch = password.length > 0 && confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = hasMinLength && passwordsMatch && !loading;

  function getStrengthLabel(): { text: string; color: string } {
    if (pwLen === 0) return { text: "", color: "" };
    if (!hasMinLength) return { text: `Encore ${8 - pwLen} caractere(s) requis`, color: "text-warning" };
    if (strengthScore <= 1) return { text: "Faible", color: "text-danger" };
    if (strengthScore === 2) return { text: "Moyen", color: "text-warning" };
    if (strengthScore === 3) return { text: "Fort", color: "text-success" };
    return { text: "Excellent", color: "text-success" };
  }

  function getStrengthBarWidth(): string {
    if (pwLen === 0) return "0%";
    if (!hasMinLength) return `${Math.min((pwLen / 8) * 25, 25)}%`;
    return `${strengthScore * 25}%`;
  }

  function getStrengthBarColor(): string {
    if (!hasMinLength) return "bg-warning";
    if (strengthScore <= 1) return "bg-danger";
    if (strengthScore === 2) return "bg-warning";
    return "bg-success";
  }

  const strength = getStrengthLabel();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    if (!hasMinLength) {
      setError("Le mot de passe doit contenir au moins 8 caracteres");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
      } else {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 3000);
      }
    } catch {
      setError("Erreur reseau. Veuillez reessayer.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="mb-4 p-3 bg-primary/10 rounded-2xl border border-primary/20">
              <Logo variant="icon" size={36} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-foreground">Lead</span>
              <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Nova</span>
            </h1>
          </div>
          <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-4 text-center">
            <div className="mx-auto w-12 h-12 bg-danger-subtle rounded-full flex items-center justify-center">
              <ShieldAlert className="size-6 text-danger" />
            </div>
            <p className="text-sm font-medium text-foreground">Lien invalide</p>
            <p className="text-xs text-foreground-muted">Ce lien de reinitialisation est invalide ou a expire. Veuillez faire une nouvelle demande.</p>
            <Link href="/forgot-password">
              <Button variant="primary" className="w-full mt-2">
                <KeyRound className="size-4" />
                Demander un nouveau lien
              </Button>
            </Link>
            <Link href="/login" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="size-3.5" />
              Retour a la connexion
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 p-3 bg-primary/10 rounded-2xl border border-primary/20">
            <Logo variant="icon" size={36} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-foreground">Lead</span>
            <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Nova</span>
          </h1>
          <p className="text-sm text-foreground-muted mt-1">Nouveau mot de passe</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-5">
          {success ? (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 bg-success-subtle rounded-full flex items-center justify-center">
                <CheckCircle2 className="size-6 text-success" />
              </div>
              <p className="text-sm font-medium text-foreground">Mot de passe modifie avec succes !</p>
              <p className="text-xs text-foreground-muted">Redirection vers la connexion...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                  Nouveau mot de passe
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 caracteres"
                    required
                    autoFocus
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>

                {/* Strength bar */}
                {pwLen > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="w-full h-1.5 bg-background-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getStrengthBarColor()}`}
                        style={{ width: getStrengthBarWidth() }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${strength.color}`}>{strength.text}</span>
                      {hasMinLength && (
                        <div className="flex items-center gap-1">
                          <ShieldCheck className="size-3 text-success" />
                          <span className="text-[10px] text-foreground-muted">8+ car.</span>
                        </div>
                      )}
                    </div>
                    {hasMinLength && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-foreground-muted">
                        <span className={hasUppercase ? "text-success" : ""}>
                          {hasUppercase ? "+" : "-"} Majuscule
                        </span>
                        <span className={hasNumber ? "text-success" : ""}>
                          {hasNumber ? "+" : "-"} Chiffre
                        </span>
                        <span className={hasSpecial ? "text-success" : ""}>
                          {hasSpecial ? "+" : "-"} Special
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                  Confirmer le mot de passe
                </label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Retapez le mot de passe"
                  required
                  autoComplete="new-password"
                />
                {passwordsMatch && (
                  <p className="flex items-center gap-1 text-xs text-success mt-1">
                    <CheckCircle2 className="size-3" />
                    Les mots de passe correspondent
                  </p>
                )}
                {passwordsMismatch && (
                  <p className="flex items-center gap-1 text-xs text-danger mt-1">
                    <AlertTriangle className="size-3" />
                    Les mots de passe ne correspondent pas
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-danger bg-danger-subtle rounded-lg px-3 py-2.5">
                  <AlertTriangle className="size-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" disabled={!canSubmit}>
                <KeyRound className="size-4" />
                {loading ? "Modification..." : "Reinitialiser le mot de passe"}
              </Button>
            </form>
          )}

          <div className="text-center pt-1">
            <Link href="/login" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="size-3.5" />
              Retour a la connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
