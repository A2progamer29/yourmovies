import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Plus, Trash2, Edit2, Crown, Baby, Lock } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import Header from "@/components/Header";

const COLORS = ["#E8D2A6", "#8AB4F8", "#F28B82", "#81C995", "#C58AF9", "#FDD663", "#F5F5F5"];
const EMOJIS = ["🎬", "🍿", "👑", "⭐", "🎭", "🚀", "🦄", "🐱", "🎨", "🎧"];

export default function ProfilesPage() {
    const { user, loading, selectProfile, setUser } = useAuth();

    /** Ne plus passer par cet écran à la connexion. Le réglage suit le compte, et
     *  non l'appareil : quelqu'un qui a fait ce choix ne veut pas le refaire sur
     *  son téléphone. Il reste modifiable dans les préférences. */
    const basculerAffichage = async () => {
        const desormais = !user?.skip_profile_picker;
        setUser((c) => (c ? { ...c, skip_profile_picker: desormais } : c));
        try {
            await api.patch("/settings", { skip_profile_picker: desormais });
        } catch (e) {
            setUser((c) => (c ? { ...c, skip_profile_picker: !desormais } : c));
            showError(toast, e, "Préférence non enregistrée");
        }
    };
    const navigate = useNavigate();
    const [profiles, setProfiles] = useState([]);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: "", avatar_color: COLORS[0], avatar_emoji: EMOJIS[0], is_kid: false, min_age: null });
    const [pinPrompt, setPinPrompt] = useState(null); // { profile, pin }
    const [pinManage, setPinManage] = useState(null); // { profile, pin }

    const load = async () => {
        try {
            const r = await api.get("/profiles");
            setProfiles(r.data);
        } catch (e) { }
    };

    useEffect(() => { if (user) load(); }, [user]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;

    const isPremium = user.premium;

    const openCreate = () => {
        if (!isPremium) { navigate("/pricing"); return; }
        if (profiles.length >= 4) { toast.error("Maximum 4 profils"); return; }
        setEditing(null);
        setForm({ name: "", avatar_color: COLORS[0], avatar_emoji: EMOJIS[0], is_kid: false, min_age: null });
        setOpen(true);
    };
    const openEdit = (p) => {
        setEditing(p);
        setForm({
            name: p.name,
            avatar_color: p.avatar_color || COLORS[0],
            avatar_emoji: p.avatar_emoji || EMOJIS[0],
            is_kid: !!p.is_kid,
            min_age: p.min_age ?? null,
        });
        setOpen(true);
    };
    const save = async () => {
        try {
            const payload = { ...form, min_age: form.min_age ? Number(form.min_age) : null };
            if (editing) {
                await api.put(`/profiles/${editing.id}`, payload);
                toast.success("Profil mis à jour");
            } else {
                await api.post("/profiles", payload);
                toast.success("Profil créé");
            }
            setOpen(false);
            load();
        } catch (e) { showError(toast, e); }
    };
    const remove = async (id) => {
        if (!window.confirm("Supprimer ce profil et ses données ?")) return;
        try {
            await api.delete(`/profiles/${id}`);
            toast.success("Supprimé");
            load();
        } catch (e) { showError(toast, e); }
    };
    const setPin = async () => {
        if (!/^\d{4,6}$/.test(pinManage.pin)) { toast.error("Le PIN doit contenir 4 à 6 chiffres"); return; }
        try {
            await api.post(`/profiles/${pinManage.profile.id}/pin`, { pin: pinManage.pin });
            toast.success("PIN activé");
            setPinManage(null);
            load();
        } catch (e) { showError(toast, e); }
    };
    const removePin = async (profile) => {
        try {
            await api.delete(`/profiles/${profile.id}/pin`);
            toast.success("PIN désactivé");
            load();
        } catch (e) { showError(toast, e); }
    };

    const trySelect = (p) => {
        if (p.has_pin) {
            setPinPrompt({ profile: p, pin: "" });
        } else {
            confirmSelect(p);
        }
    };
    const verifyAndSelect = async () => {
        try {
            await api.post(`/profiles/${pinPrompt.profile.id}/verify-pin`, { pin: pinPrompt.pin });
            confirmSelect(pinPrompt.profile);
            setPinPrompt(null);
        } catch (e) { showError(toast, e, "PIN incorrect"); }
    };
    const confirmSelect = (p) => {
        selectProfile(p);
        toast.success(`Profil actif : ${p.name}`);
        navigate("/");
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Compte</div>
                <h1 className="font-display text-4xl tracking-tighter mb-3">Qui regarde ?</h1>
                <p className="text-neutral-400 mb-6">
                    {isPremium
                        ? "Créez jusqu'à 4 profils avec chacun leurs favoris, leur suivi de lecture et un PIN parental optionnel."
                        : "Les profils multiples sont réservés aux abonnés Premium."}
                </p>

                {isPremium && (
                    <label className="mb-10 inline-flex cursor-pointer items-center gap-2.5 text-sm text-neutral-400 hover:text-neutral-200">
                        <input
                            type="checkbox"
                            checked={!!user?.skip_profile_picker}
                            onChange={basculerAffichage}
                            data-testid="profils-ne-plus-afficher"
                            className="h-4 w-4 accent-[#E8D2A6]"
                        />
                        Ne plus me demander à la connexion
                    </label>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {profiles.map((p) => (
                        <div key={p.id} className="group text-center">
                            <button
                                onClick={() => trySelect(p)}
                                data-testid={`profile-${p.id}`}
                                className="w-24 h-24 mx-auto rounded-2xl flex items-center justify-center text-4xl border-2 border-transparent hover:border-[#E8D2A6] transition-colors relative"
                                style={{ background: p.avatar_color }}
                            >
                                <span>{p.avatar_emoji || "🎬"}</span>
                                {p.has_pin && (
                                    <span className="absolute -top-1 -right-1 bg-black text-[#E8D2A6] rounded-full w-6 h-6 flex items-center justify-center border border-[#E8D2A6]/30">
                                        <Lock size={10} />
                                    </span>
                                )}
                            </button>
                            <div className="mt-3 text-white text-sm flex items-center justify-center gap-1">
                                {p.name}
                                {p.is_kid && <Baby size={12} className="text-[#E8D2A6]" />}
                            </div>
                            {p.is_kid && p.min_age != null && (
                                <div className="text-[10px] text-neutral-500">max {p.min_age}+</div>
                            )}
                            <div className="mt-2 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEdit(p)} className="text-xs text-neutral-500 hover:text-[#E8D2A6]"><Edit2 size={12} /></button>
                                <button
                                    onClick={() => p.has_pin ? removePin(p) : setPinManage({ profile: p, pin: "" })}
                                    data-testid={`profile-pin-${p.id}`}
                                    className={`text-xs ${p.has_pin ? "text-[#E8D2A6]" : "text-neutral-500"} hover:text-white`}
                                >
                                    <Lock size={12} />
                                </button>
                                <button onClick={() => remove(p.id)} className="text-xs text-neutral-500 hover:text-red-400"><Trash2 size={12} /></button>
                            </div>
                        </div>
                    ))}
                    {profiles.length < 4 && (
                        <div className="text-center">
                            <button
                                onClick={openCreate}
                                data-testid="add-profile-btn"
                                className="w-24 h-24 mx-auto rounded-2xl border-2 border-dashed border-[#262626] hover:border-[#E8D2A6]/50 flex items-center justify-center text-neutral-500 hover:text-[#E8D2A6] transition-colors relative"
                            >
                                <Plus size={24} />
                                {!isPremium && (
                                    <span className="absolute -top-2 -right-2 bg-[#E8D2A6] text-black rounded-full w-6 h-6 flex items-center justify-center">
                                        <Crown size={12} />
                                    </span>
                                )}
                            </button>
                            <div className="mt-3 text-sm text-neutral-500">{isPremium ? "Ajouter" : "Premium"}</div>
                        </div>
                    )}
                </div>

                {!isPremium && (
                    <div className="mt-16 text-center">
                        <Button onClick={() => navigate("/pricing")} className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold">
                            <Crown size={14} className="mr-2" /> Passer Premium pour débloquer
                        </Button>
                    </div>
                )}
            </div>

            {/* Create / Edit dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl">{editing ? "Modifier le profil" : "Nouveau profil"}</DialogTitle>
                        <DialogDescription className="sr-only">Gestion des profils de votre compte.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label className="text-neutral-300">Nom</Label>
                            <Input data-testid="profile-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-[#111] border-[#262626] text-white mt-1.5" />
                        </div>
                        <div>
                            <Label className="text-neutral-300">Emoji</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {EMOJIS.map((e) => (
                                    <button key={e} onClick={() => setForm({ ...form, avatar_emoji: e })} className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl border ${form.avatar_emoji === e ? "border-[#E8D2A6] bg-[#E8D2A6]/10" : "border-[#262626] hover:border-white/40"}`}>{e}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <Label className="text-neutral-300">Couleur</Label>
                            <div className="flex gap-2 mt-2">
                                {COLORS.map((c) => (
                                    <button key={c} onClick={() => setForm({ ...form, avatar_color: c })} className={`w-8 h-8 rounded-full border-2 ${form.avatar_color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-md border border-[#262626] bg-[#111]">
                            <div>
                                <div className="text-white">Profil enfant</div>
                                <div className="text-xs text-neutral-500">Contenu filtré par âge</div>
                            </div>
                            <Switch checked={form.is_kid} onCheckedChange={(v) => setForm({ ...form, is_kid: v })} />
                        </div>
                        {form.is_kid && (
                            <div>
                                <Label className="text-neutral-300">Âge maximum autorisé</Label>
                                <Select value={String(form.min_age || "")} onValueChange={(v) => setForm({ ...form, min_age: v ? Number(v) : null })}>
                                    <SelectTrigger className="bg-[#111] border-[#262626] text-white mt-1.5"><SelectValue placeholder="Choisir un âge max" /></SelectTrigger>
                                    <SelectContent className="bg-[#111] border-[#262626] text-white">
                                        <SelectItem value="6">6+</SelectItem>
                                        <SelectItem value="10">10+</SelectItem>
                                        <SelectItem value="12">12+</SelectItem>
                                        <SelectItem value="16">16+</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <Button variant="outline" onClick={() => setOpen(false)} className="border-[#262626] text-white bg-transparent hover:bg-white/5 rounded-full">Annuler</Button>
                        <Button onClick={save} data-testid="save-profile-btn" disabled={!form.name} className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold">Enregistrer</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* PIN prompt on selection */}
            <Dialog open={!!pinPrompt} onOpenChange={(v) => !v && setPinPrompt(null)}>
                <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl flex items-center gap-2">
                            <Lock size={18} className="text-[#E8D2A6]" /> PIN parental
                        </DialogTitle>
                        <DialogDescription className="sr-only">Gestion des profils de votre compte.</DialogDescription>
                    </DialogHeader>
                    <p className="text-sm text-neutral-400 mt-1">Entrez le PIN pour accéder à <span className="text-white">{pinPrompt?.profile?.name}</span>.</p>
                    <Input
                        data-testid="profile-pin-input"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={pinPrompt?.pin || ""}
                        onChange={(e) => setPinPrompt((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "") }))}
                        onKeyDown={(e) => e.key === "Enter" && verifyAndSelect()}
                        className="bg-[#111] border-[#262626] text-white mt-4 text-center text-2xl tracking-widest"
                        placeholder="••••"
                    />
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setPinPrompt(null)} className="border-[#262626] text-white bg-transparent hover:bg-white/5 rounded-full">Annuler</Button>
                        <Button onClick={verifyAndSelect} data-testid="verify-pin-btn" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold">Valider</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Set PIN dialog */}
            <Dialog open={!!pinManage} onOpenChange={(v) => !v && setPinManage(null)}>
                <DialogContent className="bg-[#0a0a0a] border-[#262626] text-white max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-display text-2xl flex items-center gap-2">
                            <Lock size={18} className="text-[#E8D2A6]" /> Activer un PIN
                        </DialogTitle>
                        <DialogDescription className="sr-only">Gestion des profils de votre compte.</DialogDescription>
                    </DialogHeader>
                    <p className="text-sm text-neutral-400 mt-1">Ajoutez un PIN à 4-6 chiffres à <span className="text-white">{pinManage?.profile?.name}</span>.</p>
                    <Input
                        data-testid="set-profile-pin-input"
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={pinManage?.pin || ""}
                        onChange={(e) => setPinManage((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "") }))}
                        className="bg-[#111] border-[#262626] text-white mt-4 text-center text-2xl tracking-widest"
                        placeholder="••••"
                    />
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="outline" onClick={() => setPinManage(null)} className="border-[#262626] text-white bg-transparent hover:bg-white/5 rounded-full">Annuler</Button>
                        <Button onClick={setPin} data-testid="save-profile-pin-btn" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold">Activer</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
