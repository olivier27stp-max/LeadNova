"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
      } else {
        setSent(true);
      }
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
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
          <p className="text-sm text-foreground-muted mt-1">Réinitialisation du mot de passe</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-6 space-y-5">
          {sent ? (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 bg-success-subtle rounded-full flex items-center justify-center">
                <CheckCircle2 className="size-6 text-success" />
              </div>
              <p className="text-sm text-foreground-secondary">
                Si un compte existe avec cet email, vous recevrez un lien de réinitialisation.
              </p>
              <p className="text-xs text-foreground-muted">Vérifiez aussi votre dossier spam.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-foreground-secondary">
                Entrez votre adresse email. Si un compte existe, nous vous enverrons un lien pour réinitialiser votre mot de passe.
              </p>

              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                  Adresse email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-danger bg-danger-subtle rounded-lg px-3 py-2.5">
                  <AlertTriangle className="size-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full" disabled={loading || !email}>
                <Mail className="size-4" />
                {loading ? "Envoi…" : "Envoyer le lien"}
              </Button>
            </form>
          )}

          <div className="text-center pt-1">
            <Link href="/login" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="size-3.5" />
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
