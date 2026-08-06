import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate, Link } from "react-router-dom";
import { ChevronLeft, Shield, Crown, Trash2, Save, ExternalLink, Coins, Calendar, MessageSquare, Ban } from "lucide-react";
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
import Header from "@/components/Header";

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
    const level = user?.admin_level || 0;

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
                <div className="max-w-3xl mx-auto px-6 py-20 text-neutral-500">Chargement...</div>
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

                {/* Édition — super-admin uniquement */}
                {level >= 3 && (
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
                        {level >= 3 && (
                            <Button variant="outline" onClick={() => setRoleOpen(true)} className="border-[#262626] bg-transparent text-white hover:bg-white/5 rounded-full">
                                <Shield size={14} className="mr-2" /> Gérer le rôle admin
                            </Button>
                        )}
                        {level >= 3 && (
                            <Button variant="outline" onClick={() => setPremiumOpen(true)} className="border-[#262626] bg-transparent text-white hover:bg-white/5 rounded-full">
                                <Crown size={14} className="mr-2" /> {target.premium ? "Gérer le Premium" : "Donner un Premium"}
                            </Button>
                        )}
                        {level >= 2 && (
                            <Button variant="outline" onClick={toggleBlock} className={`rounded-full bg-transparent ${target.blocked ? "border-[#262626] text-white hover:bg-white/5" : "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}`}>
                                <Ban size={14} className="mr-2" /> {target.blocked ? "Débloquer" : "Bloquer le compte"}
                            </Button>
                        )}
                        {level >= 3 && (
                            <Button variant="outline" onClick={removeUser} className="border-red-500/40 text-red-400 bg-transparent hover:bg-red-500/10 rounded-full">
                                <Trash2 size={14} className="mr-2" /> Supprimer le compte
                            </Button>
                        )}
                        {level < 2 && <span className="text-sm text-neutral-500">Consultation seule (Éditeur).</span>}
                    </div>
                </div>
            </div>

            <GivePremiumDialog user={target} open={premiumOpen} onOpenChange={setPremiumOpen} onDone={load} />
            <AdminRoleDialog user={target} open={roleOpen} onOpenChange={setRoleOpen} onDone={load} />
        </div>
    );
}
