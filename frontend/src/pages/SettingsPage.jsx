import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Save, Upload, Palette, Lock, Crown, Play, Zap, User as UserIcon, Calendar, CreditCard, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Header from "@/components/Header";

const ACCENT_PRESETS = [
    { name: "Or pâle (défaut)", value: "#E8D2A6" },
    { name: "Rose flamant", value: "#F4A6B8" },
    { name: "Émeraude", value: "#7ADAB2" },
    { name: "Bleu ciel", value: "#9CC5F2" },
    { name: "Lavande", value: "#C7B4F0" },
    { name: "Terracotta", value: "#E5A57C" },
    { name: "Menthe glacée", value: "#A8E0D4" },
    { name: "Rouge cinéma", value: "#E8564A" },
];

export default function SettingsPage() {
    const { user, loading, refresh } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState("profile"); // profile | preferences | security
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [pin, setPin] = useState("");
    const [currentPin, setCurrentPin] = useState("");
    const [sub, setSub] = useState(null);
    const [subBusy, setSubBusy] = useState(false);

    useEffect(() => {
        if (user?.premium) api.get("/subscription/current").then((r) => setSub(r.data)).catch(() => {});
    }, [user]);

    useEffect(() => {
        if (user) {
            setForm({
                name: user.name || "",
                bio: user.bio || "",
                picture: user.picture || "",
                preferred_quality: user.preferred_quality || "auto",
                autoplay_hero: user.autoplay_hero !== false,
                accent_color: user.accent_color || "#E8D2A6",
            });
        }
    }, [user]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;

    const save = async () => {
        setSaving(true);
        try {
            const payload = {
                name: form.name,
                bio: form.bio,
                picture: form.picture || null,
                preferred_quality: form.preferred_quality,
                autoplay_hero: form.autoplay_hero,
            };
            if (user.premium) {
                payload.accent_color = form.accent_color;
            }
            await api.patch("/settings", payload);
            await refresh();
            toast.success("Paramètres enregistrés");
        } catch (e) {
            showError(toast, e, "Enregistrement impossible");
        } finally {
            setSaving(false);
        }
    };

    // Applique la couleur immédiatement (aperçu en direct), en plus de l'enregistrer.
    const pickAccent = (color) => {
        setForm((f) => ({ ...f, accent_color: color }));
        const root = document.documentElement;
        root.style.setProperty("--accent", color);
        root.style.setProperty("--accent-hover", color);
    };

    const cancelSub = async () => {
        if (!window.confirm("Confirmez-vous l'annulation à la fin de la période en cours ?")) return;
        setSubBusy(true);
        try {
            await api.post("/subscription/cancel");
            const r = await api.get("/subscription/current"); setSub(r.data);
            toast.success("Abonnement annulé à la fin de la période");
        } catch (e) { showError(toast, e, "Annulation impossible"); }
        finally { setSubBusy(false); }
    };
    const resumeSub = async () => {
        setSubBusy(true);
        try {
            await api.post("/subscription/resume");
            const r = await api.get("/subscription/current"); setSub(r.data);
            toast.success("Abonnement réactivé");
        } catch (e) { showError(toast, e, "Réactivation impossible"); }
        finally { setSubBusy(false); }
    };
    const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch { return iso; } };
    const fmtMoney = (cents, cur) => cents == null ? "—" : `${(cents / 100).toFixed(2)} ${(cur || "eur").toUpperCase()}`;

    const uploadPicture = async (file) => {
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("kind", "image");
            const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setForm((f) => ({ ...f, picture: r.data.url }));
            await api.patch("/settings", { picture: r.data.url });
            await refresh();
            toast.success("Photo mise à jour");
        } catch (e) { showError(toast, e, "Téléversement impossible"); }
    };

    const removePicture = async () => {
        setForm((f) => ({ ...f, picture: "" }));
        try {
            await api.patch("/settings", { picture: null });
            await refresh();
        } catch (e) { showError(toast, e, "Erreur"); }
    };

    const setPinNow = async () => {
        if (!/^\d{4,6}$/.test(pin)) {
            toast.error("Le PIN doit contenir 4 à 6 chiffres");
            return;
        }
        try {
            await api.post("/settings/pin", { pin, current_pin: currentPin || undefined });
            toast.success(user.has_pin ? "PIN mis à jour" : "PIN activé");
            setPin(""); setCurrentPin("");
            refresh();
        } catch (e) { showError(toast, e, "Impossible de définir le PIN"); }
    };

    const removePin = async () => {
        if (!/^\d{4,6}$/.test(pin)) { toast.error("Entrez votre PIN actuel pour le désactiver"); return; }
        try {
            await api.delete("/settings/pin", { data: { pin } });
            toast.success("PIN désactivé");
            setPin(""); refresh();
        } catch (e) { showError(toast, e, "Impossible de désactiver le PIN"); }
    };

    const TABS = [
        { id: "profile", label: "Profil", icon: <UserIcon size={14} /> },
        { id: "preferences", label: "Préférences", icon: <Play size={14} /> },
        { id: "subscription", label: "Abonnement", icon: <Crown size={14} /> },
        { id: "security", label: "Sécurité", icon: <Lock size={14} /> },
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Compte</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-10">Paramètres</h1>

                <div className="flex gap-2 mb-8 border-b border-[#262626]">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            data-testid={`settings-tab-${t.id}`}
                            className={`flex items-center gap-2 px-4 py-3 border-b-2 -mb-px text-sm transition-colors ${tab === t.id
                                ? "border-[#E8D2A6] text-[#E8D2A6]"
                                : "border-transparent text-neutral-400 hover:text-white"
                                }`}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {tab === "profile" && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-5 p-5 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            {form.picture ? (
                                <img src={form.picture} alt="" className="w-16 h-16 rounded-full object-cover" />
                            ) : (
                                <div className="w-16 h-16 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center text-2xl font-semibold">
                                    {form.name?.[0]?.toUpperCase() || "U"}
                                </div>
                            )}
                            <div>
                                <div className="text-white">Photo de profil</div>
                                <label className="cursor-pointer inline-flex items-center gap-2 text-sm text-[#E8D2A6] hover:underline mt-1">
                                    <Upload size={12} />
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPicture(e.target.files[0])} />
                                    Changer
                                </label>
                                {form.picture && (
                                    <button
                                        onClick={removePicture}
                                        className="ml-3 text-sm text-neutral-500 hover:text-red-400"
                                    >Retirer</button>
                                )}
                            </div>
                        </div>

                        <div>
                            <Label className="text-neutral-300">Nom affiché *</Label>
                            <Input data-testid="settings-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5" />
                        </div>
                        <div>
                            <Label className="text-neutral-300">Description / bio</Label>
                            <Textarea data-testid="settings-bio" value={form.bio || ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Parlez de vous, de vos genres préférés..." className="bg-[#111] border-[#262626] text-white mt-1.5 min-h-[100px]" />
                            <div className="text-xs text-neutral-500 mt-1">{(form.bio || "").length}/500 caractères</div>
                        </div>
                    </div>
                )}

                {tab === "preferences" && (
                    <div className="space-y-6">
                        <div>
                            <Label className="text-neutral-300 flex items-center gap-2">Qualité préférée par défaut</Label>
                            <Select value={form.preferred_quality || "auto"} onValueChange={(v) => setForm({ ...form, preferred_quality: v })}>
                                <SelectTrigger data-testid="settings-quality" className="bg-[#111] border-[#262626] text-white mt-1.5 max-w-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="bg-[#111] border-[#262626] text-white">
                                    <SelectItem value="auto">Auto (max autorisé par l&apos;abonnement)</SelectItem>
                                    <SelectItem value="4k">4K UHD (Premium)</SelectItem>
                                    <SelectItem value="1080p">Full HD 1080p</SelectItem>
                                    <SelectItem value="720p">HD 720p</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="text-xs text-neutral-500 mt-1">La qualité de départ dans le lecteur. Vous pouvez la changer à tout moment.</div>
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            <div>
                                <div className="text-white flex items-center gap-2">
                                    Bande-annonce cinéma sur l&apos;accueil
                                    {!user.premium && <Crown size={12} className="text-[#E8D2A6]" />}
                                </div>
                                <div className="text-xs text-neutral-500 mt-1">La vidéo de mise en avant se lit automatiquement en fond du hero.</div>
                            </div>
                            <Switch
                                data-testid="settings-autoplay"
                                checked={!!form.autoplay_hero}
                                disabled={!user.premium}
                                onCheckedChange={(v) => setForm({ ...form, autoplay_hero: v })}
                            />
                        </div>

                        <div className="p-5 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            <div className="flex items-center gap-2 mb-3">
                                <Palette size={14} className="text-[#E8D2A6]" />
                                <div className="text-white">Couleur d&apos;accent</div>
                                {!user.premium && <Crown size={12} className="text-[#E8D2A6]" />}
                            </div>
                            <div className="text-xs text-neutral-500 mb-4">Personnalisez la couleur principale de votre YourMovie&apos;s. Réservé aux abonnés.</div>
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                                {ACCENT_PRESETS.map((c) => (
                                    <button
                                        key={c.value}
                                        disabled={!user.premium}
                                        onClick={() => pickAccent(c.value)}
                                        data-testid={`accent-${c.value.replace('#', '')}`}
                                        className={`aspect-square rounded-lg border-2 transition-transform hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed ${form.accent_color === c.value ? "border-white ring-2 ring-white/40" : "border-transparent"}`}
                                        style={{ background: c.value }}
                                        title={c.name}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {tab === "subscription" && (
                    <div className="space-y-6">
                        {!user.premium ? (
                            <div className="p-8 rounded-2xl border border-[#262626] bg-[#0a0a0a] text-center">
                                <Crown size={36} className="mx-auto text-[#E8D2A6] mb-4" />
                                <div className="font-display text-2xl mb-2">Aucun abonnement actif</div>
                                <p className="text-neutral-400 mb-6">Passez Premium pour du contenu sans pub, en 4K, avec multi-profils.</p>
                                <Button onClick={() => navigate("/pricing")} className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold">Voir les plans</Button>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-[#262626] bg-[#0a0a0a] p-8">
                                <div className="flex items-center justify-between gap-4 mb-6">
                                    <div>
                                        <div className="text-xs uppercase tracking-widest text-[#E8D2A6]">Plan actuel</div>
                                        <div className="font-display text-3xl capitalize mt-1" data-testid="sub-plan">{user.premium_plan || sub?.plan || "premium"}</div>
                                        <div className="text-sm text-neutral-400 mt-1">Facturation {sub?.interval === "yearly" ? "annuelle" : "mensuelle"}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-display text-3xl">{fmtMoney(sub?.amount, sub?.currency)}</div>
                                        <div className="text-xs text-neutral-500">/ {sub?.interval === "yearly" ? "an" : "mois"}</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6 py-6 border-y border-[#262626]">
                                    <div>
                                        <div className="text-xs uppercase tracking-widest text-neutral-500 flex items-center gap-1.5 mb-1"><Calendar size={12} /> Prochaine facture</div>
                                        <div className="text-white">{fmtDate(sub?.next_billing_date || user.premium_until)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase tracking-widest text-neutral-500 flex items-center gap-1.5 mb-1"><CreditCard size={12} /> Statut</div>
                                        <div className="text-white">{sub?.cancel_at_period_end ? <span className="text-yellow-400">Annulation à la fin de la période</span> : <span className="text-emerald-400">Actif</span>}</div>
                                    </div>
                                </div>
                                <div className="mt-6 flex flex-wrap gap-3">
                                    {sub?.stripe_subscription_id && (sub?.cancel_at_period_end ? (
                                        <Button onClick={resumeSub} disabled={subBusy} data-testid="resume-btn" className="bg-emerald-500 text-black hover:bg-emerald-400 rounded-full h-11 px-6 font-semibold"><RefreshCw size={14} className="mr-2" /> Réactiver</Button>
                                    ) : (
                                        <Button onClick={cancelSub} disabled={subBusy} data-testid="cancel-btn" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-full h-11 px-6 bg-transparent"><XCircle size={14} className="mr-2" /> Annuler l&apos;abonnement</Button>
                                    ))}
                                    <Button onClick={() => navigate("/pricing")} variant="outline" className="border-[#262626] text-white hover:bg-white/5 rounded-full h-11 px-6 bg-transparent">Changer de plan</Button>
                                    <Button onClick={() => navigate("/profiles")} variant="outline" className="border-[#262626] text-white hover:bg-white/5 rounded-full h-11 px-6 bg-transparent">Gérer mes profils</Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {tab === "security" && (
                    <div className="space-y-6">
                        <div className="p-5 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            <div className="flex items-center gap-2 mb-1">
                                <Lock size={14} className="text-[#E8D2A6]" />
                                <div className="text-white font-medium">Code PIN du compte</div>
                                {user.has_pin && <span className="ml-2 text-[10px] uppercase tracking-widest text-emerald-400">Activé</span>}
                            </div>
                            <div className="text-xs text-neutral-500 mb-4">Un PIN à 4-6 chiffres protège les paramètres sensibles (changement de plan, admin, sortie de profil enfant).</div>
                            {user.has_pin && (
                                <div className="mb-3">
                                    <Label className="text-neutral-300 text-xs">PIN actuel</Label>
                                    <Input
                                        data-testid="settings-current-pin"
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={currentPin}
                                        onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                                        className="bg-[#111] border-[#262626] text-white mt-1.5 max-w-xs tracking-widest"
                                        placeholder="••••"
                                    />
                                </div>
                            )}
                            <div>
                                <Label className="text-neutral-300 text-xs">{user.has_pin ? "Nouveau PIN" : "Nouveau PIN"}</Label>
                                <Input
                                    data-testid="settings-new-pin"
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                                    className="bg-[#111] border-[#262626] text-white mt-1.5 max-w-xs tracking-widest"
                                    placeholder="••••"
                                />
                            </div>
                            <div className="flex flex-wrap gap-2 mt-4">
                                <Button
                                    onClick={setPinNow}
                                    data-testid="save-pin-btn"
                                    className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-10 px-5 font-semibold"
                                >
                                    <Zap size={14} className="mr-2" /> {user.has_pin ? "Mettre à jour le PIN" : "Activer le PIN"}
                                </Button>
                                {user.has_pin && (
                                    <Button
                                        onClick={removePin}
                                        variant="outline"
                                        className="border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-full h-10 px-5 bg-transparent"
                                    >
                                        Désactiver
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {tab !== "security" && tab !== "subscription" && (
                    <div className="mt-10 flex justify-end gap-2 border-t border-[#262626] pt-6">
                        <Button
                            onClick={save}
                            disabled={saving}
                            data-testid="save-settings-btn"
                            className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold"
                        >
                            <Save size={14} className="mr-2" /> {saving ? "..." : "Enregistrer"}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
