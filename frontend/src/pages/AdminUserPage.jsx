import React, { useEffect, useState } from "react";
import Chargement from "@/components/Chargement";
import { useParams, useNavigate, Navigate, Link } from "react-router-dom";
import { ChevronLeft, Shield, Crown, Trash2, Save, ExternalLink, Coins, Calendar, MessageSquare, Ban, Play, Clock3, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import GivePremiumDialog from "@/components/GivePremiumDialog";
import AdminRoleDialog from "@/components/AdminRoleDialog";
import { can, canAny } from "@/lib/perms";
import Header from "@/components/Header";

function formatPlaybackTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
        : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function AdminUserPage() {
    const { id } = useParams();
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [target, setTarget] = useState(null);
    const [notFound, setNotFound] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", bio: "", password: "" });
    const [saving, setSaving] = useState(false);
    const [premiumOpen, setPremiumOpen] = useState(false);
    const [roleOpen, setRoleOpen] = useState(false);
    const [watchActivity, setWatchActivity] = useState(null);

    const load = async () => {
        try {
            const r = await api.get(`/admin/users/${id}`);
            setTarget(r.data);
            setForm({ name: r.data.name || "", email: r.data.email || "", bio: r.data.bio || "", password: "" });
        } catch (e) {
            setNotFound(true);
        }
    };

    useEffect(() => { if (user?.is_admin) load(); }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!user?.is_admin) return undefined;
        let mounted = true;
        const refreshActivity = async () => {
            try {
                const r = await api.get(`/admin/users/${id}/watching`, { silent: true });
                if (mounted) setWatchActivity(r.data);
            } catch (e) {
                if (mounted) setWatchActivity({ watching: false });
            }
        };
        refreshActivity();
        const interval = window.setInterval(refreshActivity, 20_000);
        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [id, user?.is_admin]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!user.is_admin) return <Navigate to="/" replace />;

    const save = async () => {
        setSaving(true);
        try {
            const payload = { name: form.name, email: form.email, bio: form.bio };
            if (form.password.trim()) payload.password = form.password.trim();
            const r = await api.patch(`/admin/users/${id}`, payload);
            setTarget(r.data);
            setForm((f) => ({ ...f, password: "" }));
            toast.success("Utilisateur mis à jour");
        } catch (e) {
            showError(toast, e, "Mise à jour impossible");
        } finally {
            setSaving(false);
        }
    };

    const toggleBlock = async () => {
        const willBlock = !target.blocked;
        if (willBlock && !window.confirm(`Bloquer ${target.email} ?\n\nLe compte sera automatiquement SUPPRIMÉ au bout de 15 jours s'il reste bloqué.`)) return;
        try { await api.post(`/admin/users/${id}/toggle-block`); toast.success(willBlock ? "Compte bloqué" : "Compte débloqué"); load(); }
        catch (e) { showError(toast, e, "Action impossible"); }
    };
    const removeUser = async () => {
        if (id === user.user_id) { toast.error("Impossible de supprimer votre propre compte"); return; }
        if (!window.confirm(`Supprimer ${target?.email} et toutes ses données ?`)) return;
        try { await api.delete(`/admin/users/${id}`); toast.success("Utilisateur supprimé"); navigate("/admin?tab=users"); }
        catch (e) { showError(toast, e, "Suppression impossible"); }
    };

    if (notFound) {
        return (
            <div className="min-h-screen bg-[#050505] text-white">
                <Header />
                <div className="max-w-3xl mx-auto px-6 py-20 text-center text-neutral-400">Utilisateur introuvable.</div>
            </div>
        );
    }
    if (!target) {
        return (
            <div className="min-h-screen bg-[#050505] text-white">
                <Header />
                <div className="max-w-3xl mx-auto px-6"><Chargement pleinePage /></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-3xl mx-auto px-6 py-12">
                <button onClick={() => navigate("/admin?tab=users")} className="flex items-center gap-1 text-neutral-400 hover:text-[#E8D2A6] transition-colors mb-8">
                    <ChevronLeft size={16} /> Retour aux utilisateurs
                </button>

                <div className="flex items-center gap-4 mb-8">
                    {target.picture ? (
                        <img src={target.picture} alt="" className="w-16 h-16 rounded-full object-cover border border-[#262626]" />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center text-2xl font-semibold">{target.name?.[0]?.toUpperCase() || "U"}</div>
                    )}
                    <div>
                        <h1 className="font-display text-3xl tracking-tight flex items-center gap-2">
                            {target.name}
                            {target.premium && <Crown size={16} className="text-[#E8D2A6]" />}
                            {target.is_admin && <Shield size={15} className="text-[#E8D2A6]" />}
                        </h1>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${target.online ? "bg-emerald-400" : "bg-neutral-600"}`} />
                                <span className={target.online ? "text-emerald-400" : "text-neutral-500"}>{target.online ? "En ligne" : "Hors ligne"}</span>
                            </span>
                            <Link to={`/u/${id}`} className="text-xs text-neutral-500 hover:text-[#E8D2A6] flex items-center gap-1">
                                Profil public <ExternalLink size={11} />
                            </Link>
                        </div>
                    </div>
                </div>

                {target.blocked && (
                    <div className="mb-6 p-4 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-300 flex items-start gap-2">
                        <Ban size={16} className="shrink-0 mt-0.5" />
                        <span>
                            Compte <b>bloqué</b>{target.blocked_at ? ` depuis le ${new Date(target.blocked_at).toLocaleDateString("fr-FR")}` : ""}. Il ne peut plus se connecter.
                            {target.blocked_at && <> Suppression automatique le <b>{new Date(new Date(target.blocked_at).getTime() + 15 * 86400000).toLocaleDateString("fr-FR")}</b> (15 jours).</>}
                        </span>
                    </div>
                )}

                {/* Infos en lecture seule */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                    {[
                        { label: "Auth", val: target.auth_provider },
                        { label: "Freemium", val: target.coins ?? 0, icon: <Coins size={12} /> },
                        { label: "Avis", val: target.review_count ?? 0, icon: <MessageSquare size={12} /> },
                        { label: "Inscrit", val: target.created_at ? new Date(target.created_at).toLocaleDateString("fr-FR") : "—", icon: <Calendar size={12} /> },
                    ].map((s) => (
                        <div key={s.label} className="p-3 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            <div className="text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-1">{s.icon} {s.label}</div>
                            <div className="text-sm mt-1 truncate">{s.val}</div>
                        </div>
                    ))}
                </div>

                {/* Activité de lecture — visible uniquement dans cette fiche admin */}
                <div className={`mb-8 overflow-hidden rounded-2xl border bg-[#0a0a0a] ${watchActivity?.watching ? "border-[#E8D2A6]/35" : "border-[#262626]"}`}>
                    <div className="flex items-center justify-between gap-3 border-b border-[#262626] px-5 py-4">
                        <div className="flex items-center gap-2">
                            <Play size={15} className={watchActivity?.watching ? "text-[#E8D2A6]" : "text-neutral-600"} fill={watchActivity?.watching ? "currentColor" : "none"} />
                            <h2 className="font-display text-lg">Lecture en cours</h2>
                        </div>
                        <span className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest ${watchActivity?.watching ? "text-emerald-400" : "text-neutral-600"}`}>
                            <span className={`h-2 w-2 rounded-full ${watchActivity?.watching ? "bg-emerald-400 animate-pulse" : "bg-neutral-700"}`} />
                            {watchActivity?.watching ? "Actif" : "Inactif"}
                        </span>
                    </div>

                    {watchActivity === null ? (
                        <div className="px-5 py-7 text-sm text-neutral-500">Vérification de l’activité…</div>
                    ) : watchActivity.watching ? (
                        <div className="flex gap-4 p-5">
                            {watchActivity.media?.poster_url ? (
                                <img src={watchActivity.media.poster_url} alt="" className="h-28 w-20 shrink-0 rounded-lg border border-[#262626] object-cover" />
                            ) : (
                                <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg border border-[#262626] bg-[#111]">
                                    <Play size={20} className="text-neutral-600" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-widest text-[#E8D2A6]">
                                    {watchActivity.media?.type === "movie" ? "Film" : watchActivity.media?.type === "anime" ? "Animé" : "Série"}
                                </div>
                                <Link to={`/media/${watchActivity.media?.id}`} className="mt-1 block truncate font-display text-2xl tracking-tight hover:text-[#E8D2A6] transition-colors">
                                    {watchActivity.media?.title}
                                </Link>
                                {watchActivity.media?.type !== "movie" && (
                                    <p className="mt-1 truncate text-sm text-neutral-400">
                                        Saison {watchActivity.season_number ?? "—"} · Épisode {watchActivity.episode_number ?? "—"}
                                        {watchActivity.episode_title ? ` — ${watchActivity.episode_title}` : ""}
                                    </p>
                                )}
                                {watchActivity.profile_name && (
                                    <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500">
                                        <UserRound size={12} /> Profil : {watchActivity.profile_name}
                                    </p>
                                )}
                                <div className="mt-4">
                                    <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] text-neutral-500">
                                        <span className="flex items-center gap-1"><Clock3 size={11} /> Progression</span>
                                        <span>
                                            {watchActivity.position_seconds > 0
                                                ? formatPlaybackTime(watchActivity.position_seconds)
                                                : "démarrage…"}
                                            {watchActivity.duration_seconds > 0 ? ` / ${formatPlaybackTime(watchActivity.duration_seconds)}` : ""}
                                            {watchActivity.progress_percent != null ? ` · ${watchActivity.progress_percent}%` : ""}
                                        </span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-[#1d1d1d]">
                                        <div className="h-full rounded-full bg-[#E8D2A6] transition-[width] duration-500" style={{ width: `${watchActivity.progress_percent ?? 0}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="px-5 py-7">
                            <p className="text-sm text-neutral-400">Ne regarde rien actuellement.</p>
                            <p className="mt-1 text-xs text-neutral-600">L’activité apparaîtra ici dès qu’une lecture commencera.</p>
                        </div>
                    )}
                </div>

                {/* Édition — super-admin uniquement */}
                {can(user, "users.edit") && (
                <div className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a] space-y-4">
                    <h2 className="font-display text-xl">Modifier le compte</h2>
                    <div>
                        <Label className="text-neutral-300">Pseudo</Label>
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="admin-user-name" className="bg-[#111] border-[#262626] text-white mt-1.5" />
                    </div>
                    <div>
                        <Label className="text-neutral-300">Adresse email</Label>
                        <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="admin-user-email" className="bg-[#111] border-[#262626] text-white mt-1.5" />
                    </div>
                    <div>
                        <Label className="text-neutral-300">Nouveau mot de passe</Label>
                        <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Laisser vide pour ne pas changer" data-testid="admin-user-password" className="bg-[#111] border-[#262626] text-white mt-1.5" />
                        <p className="text-[11px] text-neutral-600 mt-1">Min. 6 caractères. Définit un mot de passe (permet la connexion par email même pour un compte Google).</p>
                    </div>
                    <div>
                        <Label className="text-neutral-300">Bio</Label>
                        <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5 placeholder:text-neutral-600" />
                    </div>
                    <div className="text-right">
                        <Button onClick={save} disabled={saving} data-testid="admin-user-save" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold">
                            <Save size={14} className="mr-2" /> {saving ? "Enregistrement…" : "Enregistrer"}
                        </Button>
                    </div>
                </div>
                )}

                {/* Actions */}
                <div className="mt-6 p-5 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                    <div className="text-xs uppercase tracking-widest text-neutral-500 mb-3">Actions rapides</div>
                    <div className="flex flex-wrap gap-2">
                        {can(user, "roles.manage") && (
                            <Button variant="outline" onClick={() => setRoleOpen(true)} className="border-[#262626] bg-transparent text-white hover:bg-white/5 rounded-full">
                                <Shield size={14} className="mr-2" /> Gérer le rôle admin
                            </Button>
                        )}
                        {can(user, "users.premium") && (
                            <Button variant="outline" onClick={() => setPremiumOpen(true)} className="border-[#262626] bg-transparent text-white hover:bg-white/5 rounded-full">
                                <Crown size={14} className="mr-2" /> {target.premium ? "Gérer le Premium" : "Donner un Premium"}
                            </Button>
                        )}
                        {can(user, "users.block") && (
                            <Button variant="outline" onClick={toggleBlock} className={`rounded-full bg-transparent ${target.blocked ? "border-[#262626] text-white hover:bg-white/5" : "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}`}>
                                <Ban size={14} className="mr-2" /> {target.blocked ? "Débloquer" : "Bloquer le compte"}
                            </Button>
                        )}
                        {can(user, "users.delete") && (
                            <Button variant="outline" onClick={removeUser} className="border-red-500/40 text-red-400 bg-transparent hover:bg-red-500/10 rounded-full">
                                <Trash2 size={14} className="mr-2" /> Supprimer le compte
                            </Button>
                        )}
                        {!canAny(user, "roles.manage", "users.premium", "users.block", "users.delete") && <span className="text-sm text-neutral-500">Consultation seule.</span>}
                    </div>
                </div>
            </div>

            <GivePremiumDialog user={target} open={premiumOpen} onOpenChange={setPremiumOpen} onDone={load} />
            <AdminRoleDialog user={target} open={roleOpen} onOpenChange={setRoleOpen} onDone={load} />
        </div>
    );
}
