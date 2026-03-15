"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  User,
  Mail,
  Shield,
  Key,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  ADMIN: "Administrateur",
  MANAGER: "Gestionnaire",
  USER: "Utilisateur",
};

const roleVariants: Record<string, "success" | "primary" | "default"> = {
  ADMIN: "success",
  MANAGER: "primary",
  USER: "default",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile edit state
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) { router.replace("/login"); return; }
        setUser(d.user);
        setName(d.user.name);
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      setUser((u) => u ? { ...u, name: name.trim() } : u);
      setProfileMsg({ text: "Profil mis à jour avec succès.", ok: true });
    } catch {
      setProfileMsg({ text: "Erreur lors de la mise à jour.", ok: false });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: "Les mots de passe ne correspondent pas.", ok: false });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ text: "Le mot de passe doit contenir au moins 8 caractères.", ok: false });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      const res = await fetch("/api/users/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordMsg({ text: data.error || "Erreur lors du changement.", ok: false });
      } else {
        setPasswordMsg({ text: "Mot de passe mis à jour avec succès.", ok: true });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordMsg({ text: "Erreur réseau.", ok: false });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mon compte</h1>
          <p className="text-sm text-foreground-muted mt-0.5">Gérez vos informations personnelles</p>
        </div>
        <Button variant="secondary" onClick={handleLogout}>
          <LogOut className="size-4" />
          Se déconnecter
        </Button>
      </div>

      {/* Profile overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full bg-primary/15 border-2 border-primary/25 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-primary">{getInitials(user.name)}</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{user.name}</h2>
              <p className="text-sm text-foreground-muted">{user.email}</p>
              <div className="mt-1.5">
                <Badge variant={roleVariants[user.role] ?? "default"}>
                  {roleLabels[user.role] ?? user.role}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="size-4 text-primary" />
            <CardTitle>Informations personnelles</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                Nom complet
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Votre nom"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                Adresse email
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  value={user.email}
                  disabled
                  className="flex-1"
                />
                <div className="shrink-0 p-2 rounded-md bg-background-subtle border border-border">
                  <Mail className="size-4 text-foreground-muted" />
                </div>
              </div>
              <p className="text-xs text-foreground-muted mt-1">
                L&apos;email ne peut pas être modifié ici. Contactez un administrateur.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                Rôle
              </label>
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-background-subtle text-sm text-foreground-muted">
                <Shield className="size-4" />
                {roleLabels[user.role] ?? user.role}
              </div>
              <p className="text-xs text-foreground-muted mt-1">
                Le rôle est géré par un administrateur.
              </p>
            </div>

            {profileMsg && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2.5 ${profileMsg.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>
                {profileMsg.ok ? <CheckCircle className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
                {profileMsg.text}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={savingProfile || name.trim() === user.name}
            >
              <Save className="size-4" />
              {savingProfile ? "Sauvegarde…" : "Enregistrer"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="size-4 text-accent" />
            <CardTitle>Mot de passe</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                Mot de passe actuel
              </label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-secondary mb-1.5">
                Confirmer le nouveau mot de passe
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-danger mt-1">Les mots de passe ne correspondent pas.</p>
              )}
            </div>

            {passwordMsg && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2.5 ${passwordMsg.ok ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>
                {passwordMsg.ok ? <CheckCircle className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
                {passwordMsg.text}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={savingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
            >
              <Key className="size-4" />
              {savingPassword ? "Mise à jour…" : "Changer le mot de passe"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
