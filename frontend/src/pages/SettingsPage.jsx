import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Upload, Palette, Lock, Crown, Play, Zap, User as UserIcon, Calendar, CreditCard, XCircle, RefreshCw, Link2, Copy, Unlink, Eye, EyeOff, KeyRound, SkipForward, Volume2, Info, Sliders, Check, Clapperboard, MonitorSmartphone, History, ChartPie } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Header from "@/components/Header";
import MesAppareils from "@/components/MesAppareils";
import MonActivite from "@/components/MonActivite";
import MesStatistiques from "@/components/MesStatistiques";
import SupportWithAds from "@/components/SupportWithAds";
import ReferralCard from "@/components/ReferralCard";

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

const PROFILE_BACKGROUND_PRESETS = [
    { name: "Noir cinéma", value: "#050505" },
    { name: "Anthracite", value: "#111111" },
    { name: "Bleu nuit", value: "#08111F" },
    { name: "Bordeaux", value: "#1B090D" },
    { name: "Vert profond", value: "#07150F" },
    { name: "Violet nuit", value: "#120B1C" },
];

const AUTOSAVE_FIELDS = [
    "name",
    "bio",
    "audio_boost",
    "profile_public",
    "reviews_public",
    "history_public",
];

const PREMIUM_AUTOSAVE_FIELDS = [
    "autoplay_next",
    "accent_color",
    "profile_background_color",
    "autoplay_hero",
];

const AUTOSAVE_SUCCESS_MESSAGES = {
    name: "Nom enregistré",
    bio: "Bio enregistrée",
    audio_boost: "Amplification du son enregistrée",
    autoplay_next: "Lecture automatique enregistrée",
    profile_public: "Visibilité du profil enregistrée",
    reviews_public: "Visibilité des avis enregistrée",
    history_public: "Visibilité de l’historique enregistrée",
    accent_color: "Couleur d’accent enregistrée",
    profile_background_color: "Fond du profil enregistré",
    autoplay_hero: "Préférence de bande-annonce enregistrée",
};

const getAutosaveSuccessMessage = (fields) => {
    if (fields.length !== 1) return "Modifications enregistrées";
    return AUTOSAVE_SUCCESS_MESSAGES[fields[0]] || "Modification enregistrée";
};

export default function SettingsPage() {
    const { user, loading, refresh, setUser } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState("profile"); // profile | preferences | security
    const [form, setForm] = useState({});
    const [, setSaveStatus] = useState("idle");
    const lastSavedForm = useRef({});
    const formReady = useRef(false);
    const initializedUserId = useRef(null);
    const saveRequest = useRef(0);
    const [pin, setPin] = useState("");
    const [currentPin, setCurrentPin] = useState("");
    const [sub, setSub] = useState(null);
    const [subBusy, setSubBusy] = useState(false);
    const [discordCode, setDiscordCode] = useState(null);
    const [discordCodeExpiresAt, setDiscordCodeExpiresAt] = useState(null);
    const [discordBusy, setDiscordBusy] = useState(false);
    const [discordSecondsLeft, setDiscordSecondsLeft] = useState(0);
    const [licenseKey, setLicenseKey] = useState("");
    const [licenseBusy, setLicenseBusy] = useState(false);
    const [licenseVisible, setLicenseVisible] = useState(false);

    useEffect(() => {
        if (user?.premium) api.get("/subscription/current").then((r) => setSub(r.data)).catch(() => {});
    }, [user]);

    useEffect(() => {
        if (user && initializedUserId.current !== user.user_id) {
            const nextForm = {
                name: user.name || "",
                bio: user.bio || "",
                audio_boost: Number(user.audio_boost) || 1,
                autoplay_next: user.autoplay_next !== false,
                picture: user.picture || "",
                banner: user.banner || "",
                autoplay_hero: user.autoplay_hero !== false,
                accent_color: user.accent_color || "#E8D2A6",
                profile_background_color: user.profile_background_color || "#050505",
                profile_public: user.profile_public !== false,
                reviews_public: user.reviews_public !== false,
                history_public: user.history_public !== false,
            };
            initializedUserId.current = user.user_id;
            lastSavedForm.current = nextForm;
            formReady.current = true;
            setForm(nextForm);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.user_id]);

    useEffect(() => {
        if (!user || !formReady.current || !Object.keys(form).length) return undefined;

        const allowedFields = user.premium
            ? [...AUTOSAVE_FIELDS, ...PREMIUM_AUTOSAVE_FIELDS]
            : AUTOSAVE_FIELDS;
        const changedFields = allowedFields.filter(
            (field) => form[field] !== lastSavedForm.current[field],
        );

        if (!changedFields.length) return undefined;

        const previousValues = Object.fromEntries(
            changedFields.map((field) => [field, lastSavedForm.current[field]]),
        );
        const payload = Object.fromEntries(
            changedFields.map((field) => [field, form[field]]),
        );
        const requestId = ++saveRequest.current;
        setSaveStatus("pending");

        const timer = window.setTimeout(async () => {
            setSaveStatus("saving");
            try {
                const response = await api.patch("/settings", payload);
                const confirmed = Object.fromEntries(
                    changedFields.map((field) => [
                        field,
                        response.data?.[field] !== undefined ? response.data[field] : payload[field],
                    ]),
                );
                lastSavedForm.current = { ...lastSavedForm.current, ...confirmed };
                // Sans cette ligne, le reste du site gardait l'ancienne valeur
                // jusqu'au prochain rechargement complet de la page.
                setUser((courant) => (courant ? { ...courant, ...confirmed } : courant));
                try { localStorage.setItem("ym_reglages_touch", String(Date.now())); } catch { }
                setForm((current) => {
                    const synchronized = { ...current };
                    changedFields.forEach((field) => {
                        if (current[field] === payload[field]) synchronized[field] = confirmed[field];
                    });
                    return synchronized;
                });
                if (requestId === saveRequest.current) {
                    setSaveStatus("saved");
                    toast.success(getAutosaveSuccessMessage(changedFields), {
                        id: "settings-autosave-success",
                    });
                }
            } catch (error) {
                if (requestId !== saveRequest.current) return;
                setForm((current) => {
                    const restored = { ...current };
                    changedFields.forEach((field) => {
                        if (current[field] === payload[field]) restored[field] = previousValues[field];
                    });
                    return restored;
                });
                setSaveStatus("error");
                showError(toast, error, "Modification non enregistrée");
            }
        }, changedFields.some((field) => field === "name" || field === "bio") ? 650 : 80);

        return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form, user?.user_id, user?.premium]);

    useEffect(() => {
        if (tab !== "discord" || !user || user.discord_linked) return undefined;

        let active = true;
        let generating = false;

        const generateCode = async () => {
            if (generating) return;
            generating = true;
            setDiscordBusy(true);
            try {
                const response = await api.post("/discord/link-code");
                if (!active) return;
                setDiscordCode(response.data.code);
                setDiscordCodeExpiresAt(response.data.expires_at);
                setDiscordSecondsLeft(Math.max(0, Math.ceil((new Date(response.data.expires_at).getTime() - Date.now()) / 1000)));
            } catch (error) {
                if (active) showError(toast, error, "Impossible de générer le code Discord");
            } finally {
                generating = false;
                if (active) setDiscordBusy(false);
            }
        };

        generateCode();
        const timer = window.setInterval(() => {
            setDiscordCodeExpiresAt((expiresAt) => {
                if (!expiresAt) return expiresAt;
                const secondsLeft = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
                setDiscordSecondsLeft(secondsLeft);
                if (secondsLeft === 0) generateCode();
                return expiresAt;
            });
        }, 1000);

        return () => {
            active = false;
            window.clearInterval(timer);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, user?.user_id, user?.discord_linked]);

    useEffect(() => {
        if (tab !== "discord" || !user || user.discord_linked) return undefined;

        let active = true;
        let checking = false;
        const checkDiscordLink = async () => {
            if (checking || document.visibilityState !== "visible") return;
            checking = true;
            try {
                await refresh();
            } catch {
                // Une vérification suivante sera retentée automatiquement.
            } finally {
                checking = false;
            }
        };

        const timer = window.setInterval(checkDiscordLink, 2000);
        const onVisibilityChange = () => {
            if (active && document.visibilityState === "visible") checkDiscordLink();
        };
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            active = false;
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, user?.user_id, user?.discord_linked, refresh]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;

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

    const uploadBanner = async (file) => {
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("kind", "image");
            const r = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setForm((f) => ({ ...f, banner: r.data.url }));
            await api.patch("/settings", { banner: r.data.url });
            await refresh();
            toast.success("Bannière mise à jour");
        } catch (e) { showError(toast, e, "Téléversement de la bannière impossible"); }
    };

    const removeBanner = async () => {
        setForm((f) => ({ ...f, banner: "" }));
        try {
            await api.patch("/settings", { banner: "" });
            await refresh();
            toast.success("Bannière retirée");
        } catch (e) { showError(toast, e, "Impossible de retirer la bannière"); }
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

    const createDiscordCode = async () => {
        setDiscordBusy(true);
        try {
            const r = await api.post("/discord/link-code");
            setDiscordCode(r.data.code);
            setDiscordCodeExpiresAt(r.data.expires_at);
            setDiscordSecondsLeft(Math.max(0, Math.ceil((new Date(r.data.expires_at).getTime() - Date.now()) / 1000)));
            toast.success("Nouveau code Discord généré");
        } catch (e) { showError(toast, e, "Impossible de générer le code"); }
        finally { setDiscordBusy(false); }
    };

    const copyDiscordCode = async () => {
        if (!discordCode) return;
        try {
            await navigator.clipboard.writeText(discordCode);
            toast.success("Code copié");
        } catch {
            toast.error("Copie impossible : sélectionnez le code manuellement");
        }
    };

    const unlinkDiscord = async () => {
        if (!window.confirm("Délier votre compte Discord ? Le bonus de boost Discord sera retiré.")) return;
        setDiscordBusy(true);
        try {
            await api.delete("/discord/link");
            setDiscordCode(null);
            await refresh();
            toast.success("Compte Discord délié");
        } catch (e) { showError(toast, e, "Impossible de délier le compte"); }
        finally { setDiscordBusy(false); }
    };

    const activateLicenseKey = async () => {
        const key = licenseKey.trim();
        if (!key) { toast.error("Saisissez votre clé d’activation"); return; }
        setLicenseBusy(true);
        try {
            const response = await api.post("/license/activate", { key });
            setLicenseKey("");
            setLicenseVisible(false);
            await refresh();
            const current = await api.get("/subscription/current").catch(() => null);
            if (current?.data) setSub(current.data);
            const planName = response.data.plan?.charAt(0).toUpperCase() + response.data.plan?.slice(1);
            toast.success(`Clé activée : formule ${planName}`);
        } catch (e) { showError(toast, e, "Activation impossible"); }
        finally { setLicenseBusy(false); }
    };

    const TABS = [
        // Trois familles, dans cet ordre : qui je suis, ce que je fais,
        // ce qui gère mon compte.
        { id: "profile", label: "Profil", icon: <UserIcon size={14} /> },
        { id: "preferences", label: "Préférences", icon: <Sliders size={14} /> },
        { id: "activity", label: "Activité", icon: <History size={14} /> },
        { id: "stats", label: "Statistiques", icon: <ChartPie size={14} /> },
        { id: "devices", label: "Appareils", icon: <MonitorSmartphone size={14} /> },
        { id: "security", label: "Sécurité", icon: <Lock size={14} /> },
        { id: "subscription", label: "Abonnement", icon: <Crown size={14} /> },
        { id: "activation", label: "Activation", icon: <KeyRound size={14} /> },
        { id: "discord", label: "Discord", icon: <Link2 size={14} /> },
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Compte</div>
                <div className="mb-10 flex min-h-14 flex-wrap items-end justify-between gap-3">
                    <h1 className="font-display text-4xl sm:text-5xl tracking-tighter">Paramètres</h1>
                </div>

                <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar border-b border-[#262626]">
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

                        <div className="overflow-hidden rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            <div className="relative aspect-[4/1] min-h-[120px] bg-[#111]">
                                {form.banner ? (
                                    <img src={form.banner} alt="Aperçu de la bannière" className="absolute inset-0 h-full w-full object-cover" />
                                ) : (
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(232,210,166,0.16),transparent_38%),linear-gradient(135deg,#17130d_0%,#0a0a0a_52%,#111_100%)]" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10" />
                                <div className="absolute bottom-4 left-5">
                                    <div className="text-sm font-medium text-white">Bannière du profil</div>
                                    <div className="mt-0.5 text-xs text-white/55">Visible en arrière-plan dans la partie haute de votre profil.</div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="text-xs text-neutral-400">Format recommandé : 1600 × 400 px (4:1)</div>
                                    <div className="mt-1 text-[11px] text-neutral-600">JPG, PNG ou WebP. Le centre de l’image reste visible sur mobile.</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-[#E8D2A6] px-4 text-xs font-semibold text-[#E8D2A6] transition-colors hover:bg-[#E8D2A6] hover:text-black">
                                        <Upload size={12} />
                                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} />
                                        {form.banner ? "Changer" : "Ajouter"}
                                    </label>
                                    {form.banner && (
                                        <button type="button" onClick={removeBanner} className="text-xs text-neutral-500 transition-colors hover:text-red-400">Retirer</button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-5">
                            <div className="mb-2 flex items-center gap-2">
                                <Palette size={14} className="text-[#E8D2A6]" />
                                <div className="text-sm font-medium text-white">Fond du profil</div>
                                {!user.premium && <Crown size={12} className="text-[#E8D2A6]" />}
                            </div>
                            <p className="mb-4 text-xs text-neutral-500">
                                {user.premium
                                    ? "Choisissez la couleur affichée derrière le contenu de votre profil."
                                    : "Choisissez la couleur affichée derrière le contenu de votre profil. Réservé aux abonnés Premium."}
                            </p>
                            <div className="flex flex-wrap gap-3">
                                {PROFILE_BACKGROUND_PRESETS.map((color) => (
                                    <button
                                        key={color.value}
                                        type="button"
                                        disabled={!user.premium}
                                        onClick={() => setForm((current) => ({ ...current, profile_background_color: color.value }))}
                                        data-testid={`profile-background-${color.value.slice(1)}`}
                                        aria-label={color.name}
                                        title={color.name}
                                        className={`h-11 w-11 rounded-full border-2 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-35 ${form.profile_background_color === color.value ? "border-[#E8D2A6]" : "border-[#343434]"}`}
                                        style={{ backgroundColor: color.value }}
                                    />
                                ))}
                                <label className={`relative flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-full border px-4 text-xs font-semibold transition-colors ${user.premium ? "cursor-pointer border-[#343434] text-neutral-300 hover:border-[#E8D2A6]/60 hover:text-white" : "cursor-not-allowed border-[#262626] text-neutral-600"}`}>
                                    <Palette size={13} /> Sur mesure
                                    <input
                                        type="color"
                                        disabled={!user.premium}
                                        value={form.profile_background_color || "#050505"}
                                        onChange={(event) => setForm((current) => ({ ...current, profile_background_color: event.target.value.toUpperCase() }))}
                                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                                        aria-label="Choisir une couleur de fond personnalisée"
                                    />
                                </label>
                            </div>
                            <div className="mt-4 flex items-center gap-3 rounded-md border border-[#262626] bg-black/20 p-3">
                                <span className="h-7 w-7 rounded-full border border-white/10" style={{ backgroundColor: form.profile_background_color || "#050505" }} />
                                <span className="text-xs text-neutral-400">Aperçu : <span className="font-mono text-neutral-200">{form.profile_background_color || "#050505"}</span></span>
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

                        <div className="pt-4 border-t border-[#262626]">
                            <div className="text-xs uppercase tracking-widest text-neutral-500 mb-3">Confidentialité du profil</div>
                            {[
                                { key: "profile_public", title: "Visibilité du profil", desc: "Choisissez si les autres membres peuvent consulter votre profil." },
                                { key: "history_public", title: "Visibilité de l’historique", desc: "Choisissez si votre top 10 des derniers visionnages apparaît sur votre profil." },
                                { key: "reviews_public", title: "Visibilité des avis", desc: "Choisissez si vos avis publiés apparaissent sur votre profil." },
                            ].map((row) => (
                                <div key={row.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-b border-[#262626] last:border-b-0">
                                    <div className="min-w-0">
                                        <div className="text-white text-sm font-medium">{row.title}</div>
                                        <div className="text-xs text-neutral-500 mt-1">{row.desc}</div>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={form[row.key] !== false}
                                        onClick={() => setForm((current) => ({ ...current, [row.key]: current[row.key] === false }))}
                                        data-testid={`toggle-${row.key}`}
                                        className={`inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:border-white ${form[row.key] !== false
                                            ? "border-[#E8D2A6] bg-[#E8D2A6] text-black hover:bg-[#D4BB8B]"
                                            : "border-[#343434] bg-[#111] text-neutral-300 hover:border-[#E8D2A6]/50 hover:text-white"
                                            }`}
                                    >
                                        {form[row.key] !== false ? <Eye size={14} /> : <EyeOff size={14} />}
                                        {form[row.key] !== false ? "Public" : "Privé"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {tab === "preferences" && (
                    <div className="space-y-6">
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500">
                            Lecture
                        </div>

                        <div className="pb-5 border-b border-[#262626]">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-white flex items-center gap-2">
                                    <Volume2 size={14} className="text-[#E8D2A6]" />
                                    Amplification du son
                                </div>
                                <span className="rounded-full bg-[#E8D2A6]/10 px-3 py-1 text-xs font-semibold tabular-nums text-[#E8D2A6]">
                                    {Math.round((form.audio_boost || 1) * 100)} %
                                </span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="2.5"
                                step="0.1"
                                value={form.audio_boost || 1}
                                data-testid="settings-audio-boost"
                                onChange={(e) => setForm((current) => ({ ...current, audio_boost: Number(e.target.value) }))}
                                className="mt-4 w-full cursor-pointer accent-[#E8D2A6]"
                            />
                            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-widest text-neutral-600">
                                <span>Normal</span>
                                <span>250 %</span>
                            </div>
                            <div className="mt-3 text-xs leading-relaxed text-neutral-500">
                                Pour les films dont la piste sonore est trop basse, même à fond.
                                Au-delà de 100 %, le son peut saturer selon la piste.
                            </div>
                            {(form.audio_boost || 1) > 1 && (
                                <div className="mt-3 flex gap-2.5 rounded-lg border border-[#262626] bg-[#0a0a0a] p-3 text-xs leading-relaxed text-neutral-400">
                                    <Info size={14} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                                    <span>
                                        Amplifier exige un autre lecteur : celui d&apos;origine appartient à
                                        l&apos;hébergeur et son volume est hors d&apos;atteinte. Tant que le curseur
                                        reste sur Normal, rien ne change ; au-delà, la lecture bascule sur le
                                        lecteur du site. S&apos;il ne parvient pas à lire un titre, le lecteur
                                        habituel reprend la main tout seul.
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#262626]">
                            <div className="min-w-0">
                                <div className="text-white flex items-center gap-2">
                                    <SkipForward size={14} className="text-[#E8D2A6]" />
                                    Lecture automatique de la suite
                                    {!user.premium && <Crown size={12} className="text-[#E8D2A6]" />}
                                </div>
                                <div className="text-xs text-neutral-500 mt-1">
                                    {user.premium
                                        ? "Vers la fin d’un épisode, enchaîne sur le suivant. Pour un film, enchaîne sur le titre d’après dans sa chronologie. Un compte à rebours de dix secondes laisse le temps d’annuler."
                                        : "Enchaîne sur l’épisode suivant, ou sur le titre d’après dans la chronologie d’un film. Cette préférence est réservée aux abonnés Premium."}
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={!!form.autoplay_next}
                                data-testid="settings-autoplay-next"
                                disabled={!user.premium}
                                onClick={() => setForm((current) => ({ ...current, autoplay_next: !current.autoplay_next }))}
                                className={`inline-flex h-10 min-w-[132px] shrink-0 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:border-white disabled:cursor-not-allowed disabled:opacity-40 ${form.autoplay_next
                                    ? "border-[#E8D2A6] bg-[#E8D2A6] text-black hover:bg-[#D4BB8B]"
                                    : "border-[#343434] bg-[#111] text-neutral-300 hover:border-[#E8D2A6]/50 hover:text-white"
                                    }`}
                            >
                                {form.autoplay_next ? <Check size={14} /> : <X size={14} />}
                                {form.autoplay_next ? "Activée" : "Désactivée"}
                            </button>
                        </div>

                        <div className="pt-1 text-[10px] uppercase tracking-widest text-neutral-500">
                            Apparence
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#262626]">
                            <div className="min-w-0">
                                <div className="text-white flex items-center gap-2">
                                    <Clapperboard size={14} className="text-[#E8D2A6]" />
                                    Bande-annonce cinéma sur l&apos;accueil
                                    {!user.premium && <Crown size={12} className="text-[#E8D2A6]" />}
                                </div>
                                <div className="text-xs text-neutral-500 mt-1">
                                    {user.premium
                                        ? "Activez ou désactivez la lecture automatique de la vidéo en fond de l’accueil."
                                        : "Cette préférence est réservée aux abonnés Premium."}
                                </div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={!!form.autoplay_hero}
                                data-testid="settings-autoplay"
                                disabled={!user.premium}
                                onClick={() => setForm((current) => ({ ...current, autoplay_hero: !current.autoplay_hero }))}
                                className={`inline-flex h-10 min-w-[132px] shrink-0 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:border-white disabled:cursor-not-allowed disabled:opacity-40 ${form.autoplay_hero
                                    ? "border-[#E8D2A6] bg-[#E8D2A6] text-black hover:bg-[#D4BB8B]"
                                    : "border-[#343434] bg-[#111] text-neutral-300 hover:border-[#E8D2A6]/50 hover:text-white"
                                    }`}
                            >
                                {form.autoplay_hero ? <Check size={14} /> : <X size={14} />}
                                {form.autoplay_hero ? "Activée" : "Désactivée"}
                            </button>
                        </div>

                        <div className="p-5 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            <div className="flex items-center gap-2 mb-3">
                                <Palette size={14} className="text-[#E8D2A6]" />
                                <div className="text-white">Couleur d&apos;accent</div>
                                {!user.premium && <Crown size={12} className="text-[#E8D2A6]" />}
                            </div>
                            <div className="text-xs text-neutral-500 mb-4">
                                {user.premium
                                    ? "Personnalisez la couleur principale de votre YourMovie's."
                                    : "Personnalisez la couleur principale de votre YourMovie's. Réservé aux abonnés Premium."}
                            </div>
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                                {ACCENT_PRESETS.map((c) => (
                                    <button
                                        key={c.value}
                                        disabled={!user.premium}
                                        onClick={() => pickAccent(c.value)}
                                        data-testid={`accent-${c.value.replace('#', '')}`}
                                        className={`aspect-square rounded-lg border-2 transition-transform hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed ${form.accent_color === c.value ? "border-white" : "border-transparent"}`}
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
                        {!user.premium && <SupportWithAds />}
                        <ReferralCard />
                        {!user.premium ? (
                            <div className="p-8 rounded-2xl border border-[#262626] bg-[#0a0a0a] text-center">
                                <Crown size={36} className="mx-auto text-[#E8D2A6] mb-4" />
                                <div className="font-display text-2xl mb-2">Aucun abonnement actif</div>
                                <p className="text-neutral-400 mb-6">Passez Premium pour regarder sans une seule publicité, avec jusqu’à 4 profils.</p>
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

                {tab === "activation" && (
                    <div className="space-y-6">
                        <div className="ym-shimmer relative overflow-hidden rounded-2xl border border-[#E8D2A6]/35 bg-[#0c0c0c] p-6 sm:p-8">
                            <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#E8D2A6]/10 blur-3xl" />
                            <div className="relative max-w-2xl">
                                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[#E8D2A6]/30 bg-[#E8D2A6]/10 text-[#E8D2A6]">
                                    <KeyRound size={20} />
                                </div>
                                <div className="text-xs uppercase tracking-[0.2em] text-[#E8D2A6]">Clé SellAuth</div>
                                <h2 className="mt-2 font-display text-2xl sm:text-3xl">Activer votre abonnement</h2>
                                <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                                    Saisissez la clé reçue après votre achat. Chaque clé est personnelle et ne peut être activée qu’une seule fois.
                                </p>

                                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                    <div className="relative flex-1">
                                        <Input
                                            type={licenseVisible ? "text" : "password"}
                                            value={licenseKey}
                                            onChange={(e) => setLicenseKey(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && !licenseBusy && activateLicenseKey()}
                                            data-testid="license-key-input"
                                            placeholder="YM-XXX-…"
                                            autoComplete="off"
                                            spellCheck={false}
                                            className="h-12 border-[#343434] bg-[#080808] pr-12 font-mono tracking-wide text-white placeholder:text-neutral-700 focus-visible:border-[#E8D2A6] focus-visible:ring-[#E8D2A6]/20"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setLicenseVisible((visible) => !visible)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors hover:text-[#E8D2A6]"
                                            aria-label={licenseVisible ? "Masquer la clé" : "Afficher la clé"}
                                        >
                                            {licenseVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                                        </button>
                                    </div>
                                    <Button
                                        onClick={activateLicenseKey}
                                        disabled={licenseBusy || !licenseKey.trim()}
                                        data-testid="activate-license-key"
                                        className="h-12 rounded-full bg-[#E8D2A6] px-7 font-semibold text-black hover:bg-[#D4BB8B] disabled:opacity-40"
                                    >
                                        {licenseBusy ? <RefreshCw size={15} className="mr-2 animate-spin" /> : <KeyRound size={15} className="mr-2" />}
                                        Activer la clé
                                    </Button>
                                </div>

                                <div className="mt-4 flex items-start gap-2 text-xs text-neutral-500">
                                    <Lock size={13} className="mt-0.5 shrink-0 text-[#E8D2A6]" />
                                    La clé est vérifiée uniquement par le serveur et n’est jamais enregistrée en clair.
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {tab === "devices" && <MesAppareils />}


                {tab === "activity" && <MonActivite />}


                {tab === "stats" && <MesStatistiques />}


                {tab === "security" && (
                    <div className="space-y-6">
                        <div className="p-5 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            <div className="flex items-center gap-2 mb-1">
                                <UserIcon size={14} className="text-[#E8D2A6]" />
                                <div className="text-white font-medium">Identifiant unique du compte</div>
                            </div>
                            <div className="text-xs text-neutral-500 mb-4">Cet identifiant permanent permet de distinguer votre compte. Il ne peut pas être modifié.</div>
                            <div className="flex max-w-md gap-2">
                                <Input readOnly value={user.account_identifier || "Attribution en cours"} className="bg-[#111] border-[#262626] text-white font-mono" />
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!user.account_identifier}
                                    onClick={async () => {
                                        await navigator.clipboard.writeText(user.account_identifier);
                                        toast.success("Identifiant copié");
                                    }}
                                    className="border-[#262626] bg-transparent text-white hover:bg-white/5"
                                >
                                    <Copy size={15} />
                                </Button>
                            </div>
                        </div>
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

                {tab === "discord" && (
                    <div className="space-y-6">
                        <div className="p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                            <div className="flex items-center gap-2 mb-2">
                                <Link2 size={16} className="text-[#E8D2A6]" />
                                <div className="text-white font-medium">Liaison avec Discord</div>
                            </div>
                            <p className="text-sm text-neutral-400 mb-5">
                                Liez votre compte pour recevoir des Freemium grâce à votre activité et activer les avantages liés aux boosts.
                            </p>

                            {user.discord_linked ? (
                                <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                                    <div>
                                        <div className="text-emerald-400 font-medium">Compte Discord lié</div>
                                        <div className="text-xs text-neutral-500 mt-1">Les récompenses sont maintenant créditées automatiquement.</div>
                                    </div>
                                    <Button
                                        onClick={unlinkDiscord}
                                        disabled={discordBusy}
                                        variant="outline"
                                        className="border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-full bg-transparent"
                                    >
                                        <Unlink size={14} className="mr-2" /> Délier
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <ol className="text-sm text-neutral-300 space-y-2 mb-5 list-decimal list-inside">
                                        <li>Copiez le code temporaire affiché ci-dessous.</li>
                                        <li>Sur le serveur Discord, utilisez la commande <code className="text-[#E8D2A6]">/lier CODE</code>.</li>
                                        <li>La liaison sera détectée et affichée automatiquement sur cette page.</li>
                                    </ol>
                                    {discordCode ? (
                                        <div className="p-5 rounded-lg border border-[#E8D2A6]/30 bg-[#E8D2A6]/5">
                                            <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Code temporaire</div>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <code className="text-2xl tracking-[0.25em] text-[#E8D2A6] select-all">{discordCode}</code>
                                                <Button onClick={copyDiscordCode} variant="outline" className="border-[#262626] bg-transparent">
                                                    <Copy size={14} className="mr-2" /> Copier
                                                </Button>
                                            </div>
                                            <div className="text-xs text-neutral-500 mt-3">
                                                Renouvellement automatique dans {String(Math.floor(discordSecondsLeft / 60)).padStart(2, "0")}:{String(discordSecondsLeft % 60).padStart(2, "0")}. Ne partagez ce code avec personne.
                                            </div>
                                            <button
                                                type="button"
                                                onClick={createDiscordCode}
                                                disabled={discordBusy}
                                                className="mt-3 inline-flex items-center gap-1.5 text-xs text-neutral-400 transition-colors hover:text-[#E8D2A6] disabled:opacity-50"
                                            >
                                                <RefreshCw size={12} className={discordBusy ? "animate-spin" : ""} />
                                                Renouveler maintenant
                                            </button>
                                        </div>
                                    ) : (
                                        <Button
                                            onClick={createDiscordCode}
                                            disabled={discordBusy}
                                            className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-6 font-semibold"
                                        >
                                            <RefreshCw size={14} className="mr-2 animate-spin" /> Génération du code…
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
