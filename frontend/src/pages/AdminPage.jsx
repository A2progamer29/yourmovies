import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { Plus, Trash2, Edit, Film, Tv, Sparkles, Users, Crown, Shield, Search, Megaphone, MessageSquare, Star, CornerDownRight, ChevronUp, Check, Clock, X, Coins, Minus, RotateCcw, PiggyBank, Tag, KeyRound, LayoutDashboard, AlertTriangle, ArrowRight, BookOpen, HardDrive, BarChart3, Inbox, Trophy, Eye, TriangleAlert, Flag } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Header from "@/components/Header";
import GivePremiumDialog from "@/components/GivePremiumDialog";
import AdminRoleDialog from "@/components/AdminRoleDialog";
import AdminPricing from "@/components/AdminPricing";
import AdminAds from "@/components/AdminAds";
import AdminTraffic from "@/components/AdminTraffic";
import AdminGuide from "@/components/AdminGuide";
import AdminStorage from "@/components/AdminStorage";
import AdminPolls from "@/components/AdminPolls";
import AdminPending from "@/components/AdminPending";
import AdminContributors from "@/components/AdminContributors";
import AdminReferral from "@/components/AdminReferral";
import AdminViews from "@/components/AdminViews";
import AdminReports from "@/components/AdminReports";
import AdminSupportBanner from "@/components/AdminSupportBanner";
import AdminCagnotteTiers from "@/components/AdminCagnotteTiers";
import { showError } from "@/lib/errors";
import { can } from "@/lib/perms";

function hasPlayableVideo(item = {}) {
    if (item.bunny_video_id || item.video_url || item.video_file_path) return true;
    return Array.isArray(item.qualities) && item.qualities.some((quality) =>
        quality?.url || quality?.video_url || quality?.file_path
    );
}

function isMediaIncomplete(media) {
    if (!media) return false;
    if (media.type === "movie") return !hasPlayableVideo(media);
    const episodes = (media.seasons || []).flatMap((season) => season?.episodes || []);
    return episodes.length === 0 || episodes.some((episode) => !hasPlayableVideo(episode));
}

function SectionHeader({ titre, description, children }) {
    return (
        <div className="mb-6 flex flex-col gap-3 border-b border-[#262626] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
                <h2 className="font-display text-2xl tracking-tight text-white">{titre}</h2>
                <p className="mt-1 text-sm leading-relaxed text-neutral-500">{description}</p>
            </div>
            {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
        </div>
    );
}

export default function AdminPage() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [items, setItems] = useState([]);
    const [users, setUsers] = useState([]);
    const [announcements, setAnnouncements] = useState([]);
    const [annTitle, setAnnTitle] = useState("");
    const [annBody, setAnnBody] = useState("");
    const [reviews, setReviews] = useState([]);
    const [reviewQ, setReviewQ] = useState("");
    const [wishes, setWishes] = useState([]);
    const [coinAmount, setCoinAmount] = useState({});
    const [cagnotte, setCagnotte] = useState({ total: 0, goal: 1000 });
    const [cagnotteInput, setCagnotteInput] = useState("");
    const [premiumUser, setPremiumUser] = useState(null);
    const [roleUser, setRoleUser] = useState(null);
    const [userSort, setUserSort] = useState({ key: null, dir: "asc" });
    const [q, setQ] = useState("");
    const [mediaFilter, setMediaFilter] = useState("all");
    const [pendingCount, setPendingCount] = useState(0);
    const [reportCount, setReportCount] = useState(0);
    const [mediaFlagSaving, setMediaFlagSaving] = useState({});
    const [userQ, setUserQ] = useState("");
    const [licenseKeys, setLicenseKeys] = useState([]);
    const [licenseStats, setLicenseStats] = useState({ total: 0, available: 0, redeemed: 0, revoked: 0 });
    const [licenseInput, setLicenseInput] = useState("");
    const [licenseRemoveInput, setLicenseRemoveInput] = useState("");
    const [licensePlan, setLicensePlan] = useState("basic");
    const [licenseCycle, setLicenseCycle] = useState("monthly");
    const [licenseBusy, setLicenseBusy] = useState(false);
    const [aiDiscovery, setAiDiscovery] = useState([]);
    const [aiDiscoveryLoading, setAiDiscoveryLoading] = useState(false);
    const [aiDiscoveryError, setAiDiscoveryError] = useState("");
    const [aiDiscoveryLoadedAt, setAiDiscoveryLoadedAt] = useState(null);
    const [aiDiscoveryRemoving, setAiDiscoveryRemoving] = useState({});
    const tabParam = new URLSearchParams(location.search).get("tab") || "overview";

    const loadMedia = async () => {
        const r = await api.get("/media?limit=500");
        setItems(r.data);
    };
    const loadUsers = async () => {
        try {
            const r = await api.get("/admin/users");
            setUsers(r.data);
        } catch (e) { showError(toast, e, "Chargement utilisateurs impossible"); }
    };
    const loadAnnouncements = async () => {
        try {
            const r = await api.get("/announcements");
            setAnnouncements(r.data);
        } catch (e) { showError(toast, e, "Chargement des annonces impossible"); }
    };
    const loadReviews = async () => {
        try {
            const r = await api.get("/admin/reviews");
            setReviews(r.data);
        } catch (e) { showError(toast, e, "Chargement des commentaires impossible"); }
    };
    const loadWishes = async () => {
        try {
            const r = await api.get("/admin/wishboard");
            setWishes(r.data);
        } catch (e) { showError(toast, e, "Chargement du wishboard impossible"); }
    };
    const loadCagnotte = async () => {
        try {
            const r = await api.get("/cagnotte");
            setCagnotte(r.data);
            setCagnotteInput(String(r.data.total));
        } catch (e) { showError(toast, e, "Chargement de la cagnotte impossible"); }
    };
    const loadLicenseKeys = async () => {
        try {
            const r = await api.get("/admin/license-keys?limit=200");
            setLicenseKeys(r.data.items || []);
            setLicenseStats(r.data.stats || { total: 0, available: 0, redeemed: 0, revoked: 0 });
        } catch (e) { showError(toast, e, "Chargement des clés impossible"); }
    };

    const loadPendingCount = async () => {
        try {
            const r = await api.get("/admin/pending", { silent: true });
            setPendingCount(Array.isArray(r.data) ? r.data.length : 0);
        } catch { setPendingCount(0); }
    };

    const loadAiDiscovery = async () => {
        setAiDiscoveryLoading(true);
        setAiDiscoveryError("");
        try {
            const r = await api.get("/discovery/imdb?limit=24", { silent: true });
            setAiDiscovery(Array.isArray(r.data) ? r.data : []);
            setAiDiscoveryLoadedAt(new Date());
        } catch (e) {
            setAiDiscovery([]);
            setAiDiscoveryError("La veille IMDb est temporairement indisponible.");
        } finally {
            setAiDiscoveryLoading(false);
        }
    };

    const dismissAiDiscovery = async (media) => {
        if (!window.confirm(`Retirer « ${media.title} » de Tendances ?`)) return;
        setAiDiscoveryRemoving((current) => ({ ...current, [media.id]: true }));
        try {
            await api.delete(`/admin/discovery/imdb/${encodeURIComponent(media.imdb_id || media.id)}`);
            setAiDiscovery((current) => current.filter((item) => item.id !== media.id));
            toast.success("Contenu retiré de Tendances");
        } catch (e) {
            showError(toast, e, "Retrait impossible");
        } finally {
            setAiDiscoveryRemoving((current) => ({ ...current, [media.id]: false }));
        }
    };

    // Chaque section ne charge que ses propres données, une seule fois. Le panel
    // lançait auparavant huit requêtes à chaque ouverture, même pour venir
    // changer un simple tarif.
    const loadedRef = useRef({});
    useEffect(() => {
        if (!user?.is_admin) return;
        const sources = {
            media: { run: loadMedia },
            users: { run: loadUsers, perm: "users.view" },
            announcements: { run: loadAnnouncements },
            reviews: { run: loadReviews, perm: "reviews.moderate" },
            wishes: { run: loadWishes, perm: "wishboard.view" },
            cagnotte: { run: loadCagnotte },
            licenseKeys: { run: loadLicenseKeys, perm: "keys.manage" },
            discovery: { run: loadAiDiscovery, perm: "content.add" },
            pending: { run: loadPendingCount, perm: "content.add" },
        };
        const parSection = {
            overview: ["media", "users", "wishes", "reviews", "pending"],
            media: ["media"],
            players: ["media"],
            discovery: ["discovery"],
            users: ["users"],
            comments: ["reviews"],
            wishboard: ["wishes"],
            coins: ["users"],
            cagnotte: ["cagnotte"],
            announcements: ["announcements"],
            "license-keys": ["licenseKeys"],
        };
        for (const nom of parSection[tabParam] || []) {
            const source = sources[nom];
            if (!source || loadedRef.current[nom]) continue;
            if (source.perm && !can(user, source.perm)) continue;
            loadedRef.current[nom] = true;
            source.run();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, tabParam]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!user.is_admin) return <Navigate to="/" replace />;

    const remove = async (id) => {
        if (!window.confirm("Supprimer ce contenu ?")) return;
        await api.delete(`/media/${id}`);
        toast.success("Supprimé");
        loadMedia();
    };
    const deleteUser = async (u) => {
        if (u.user_id === user.user_id) { toast.error("Impossible de supprimer votre propre compte"); return; }
        if (!window.confirm(`Supprimer ${u.email} et toutes ses données ?`)) return;
        try {
            await api.delete(`/admin/users/${u.user_id}`);
            toast.success("Utilisateur supprimé");
            loadUsers();
        } catch (e) { showError(toast, e, "Suppression impossible"); }
    };

    const createAnnouncement = async () => {
        const title = annTitle.trim();
        if (!title) { toast.error("Ajoute un titre"); return; }
        try {
            await api.post("/announcements", { title, body: annBody.trim() });
            toast.success("Annonce publiée");
            setAnnTitle("");
            setAnnBody("");
            loadAnnouncements();
        } catch (e) { showError(toast, e, "Publication impossible"); }
    };
    const deleteAnnouncement = async (id) => {
        if (!window.confirm("Supprimer cette annonce ?")) return;
        try {
            await api.delete(`/announcements/${id}`);
            toast.success("Annonce supprimée");
            loadAnnouncements();
        } catch (e) { showError(toast, e, "Suppression impossible"); }
    };
    const deleteReviewAdmin = async (r) => {
        const label = r.parent_id ? "cette réponse" : "cet avis et ses réponses";
        if (!window.confirm(`Supprimer ${label} ?`)) return;
        try {
            await api.delete(`/reviews/${r.id}`);
            toast.success("Commentaire supprimé");
            loadReviews();
        } catch (e) { showError(toast, e, "Suppression impossible"); }
    };
    const setWishStatus = async (w, status) => {
        try {
            await api.patch(`/wishboard/${w.id}/status`, { status });
            setWishes((list) => list.map((it) => it.id === w.id ? { ...it, status } : it));
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
    };
    const deleteWish = async (w) => {
        if (!window.confirm(`Supprimer « ${w.title} » du wishboard ?`)) return;
        try {
            await api.delete(`/wishboard/${w.id}`);
            toast.success("Proposition supprimée");
            loadWishes();
        } catch (e) { showError(toast, e, "Suppression impossible"); }
    };
    const saveCagnotte = async () => {
        try {
            const r = await api.post("/admin/cagnotte", { total: Number(cagnotteInput) });
            setCagnotte(r.data);
            setCagnotteInput(String(r.data.total));
            toast.success("Cagnotte mise à jour");
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
    };
    const resetCagnotte = async () => {
        if (!window.confirm("⚠️ Réinitialiser la cagnotte à 0 € ?\n\nLe total affiché publiquement sera remis à zéro.")) return;
        if (!window.confirm("Es-tu VRAIMENT sûr ? Cette action est irréversible.\n\nConfirme une seconde fois pour réinitialiser à 0 €.")) return;
        try {
            const r = await api.post("/admin/cagnotte", { total: 0 });
            setCagnotte(r.data);
            setCagnotteInput(String(r.data.total));
            toast.success("Cagnotte réinitialisée à 0 €");
        } catch (e) { showError(toast, e, "Réinitialisation impossible"); }
    };
    const adminCoins = async (u, mode) => {
        const amount = Number(coinAmount[u.user_id] || 0);
        if (mode !== "reset" && (!amount || amount <= 0)) { toast.error("Entre un montant"); return; }
        if (mode === "reset" && !window.confirm(`Remettre à 0 les Freemium de ${u.name} ?`)) return;
        try {
            const r = await api.post(`/admin/coins/${u.user_id}`, { amount, mode });
            setUsers((list) => list.map((x) => x.user_id === u.user_id ? { ...x, coins: r.data.coins } : x));
            toast.success(`Solde de ${u.name} : ${r.data.coins} Freemium`);
            setCoinAmount((m) => ({ ...m, [u.user_id]: "" }));
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
    };

    const addLicenseKeys = async () => {
        const keys = licenseInput.trim();
        if (!keys) { toast.error("Ajoute au moins une clé"); return; }
        setLicenseBusy(true);
        try {
            const r = await api.post("/admin/license-keys", { keys, plan: licensePlan, billing_cycle: licenseCycle });
            setLicenseInput("");
            toast.success(`${r.data.added} clé${r.data.added > 1 ? "s" : ""} ajoutée${r.data.added > 1 ? "s" : ""}${r.data.duplicates ? ` · ${r.data.duplicates} doublon(s) ignoré(s)` : ""}`);
            await loadLicenseKeys();
        } catch (e) { showError(toast, e, "Import impossible"); }
        finally { setLicenseBusy(false); }
    };

    const revokeLicenseKey = async (keyId = null) => {
        if (!keyId && !licenseRemoveInput.trim()) { toast.error("Saisis la clé à retirer"); return; }
        if (!window.confirm("Retirer cette clé de la whitelist ? Elle ne pourra plus être activée.")) return;
        setLicenseBusy(true);
        try {
            if (keyId) await api.delete(`/admin/license-keys/${keyId}`);
            else await api.post("/admin/license-keys/revoke", { key: licenseRemoveInput.trim() });
            setLicenseRemoveInput("");
            toast.success("Clé retirée de la whitelist");
            await loadLicenseKeys();
        } catch (e) { showError(toast, e, "Retrait impossible"); }
        finally { setLicenseBusy(false); }
    };

    const toggleMediaFlag = async (media, field, checked) => {
        const key = media.id + ":" + field;
        if (mediaFlagSaving[key]) return;
        const value = typeof checked === "boolean" ? checked : !Boolean(media[field]);
        setMediaFlagSaving((current) => ({ ...current, [key]: true }));
        setItems((current) => current.map((item) => item.id === media.id ? { ...item, [field]: value } : item));
        try {
            let response;
            try {
                response = await api.patch("/admin/media/" + media.id + "/flags", { [field]: value });
            } catch (requestError) {
                if (![404, 405].includes(requestError?.response?.status)) throw requestError;
                response = await api.put("/media/" + media.id, { [field]: value });
            }
            setItems((current) => current.map((item) => item.id === media.id ? { ...item, ...response.data } : item));
            toast.success(field === "featured"
                ? "À l’affiche " + (value ? "activé" : "désactivé")
                : "Statut cinéma " + (value ? "activé" : "désactivé"));
        } catch (e) {
            setItems((current) => current.map((item) => item.id === media.id ? { ...item, [field]: !value } : item));
            showError(toast, e, "Mise à jour impossible");
        } finally {
            setMediaFlagSaving((current) => ({ ...current, [key]: false }));
        }
    };

    const updateFeaturedOrder = async (media, rawOrder) => {
        const parsed = Number.parseInt(rawOrder, 10);
        const order = Number.isFinite(parsed) ? Math.min(999, Math.max(1, parsed)) : 1;
        const key = media.id + ":featured_order";
        if (mediaFlagSaving[key] || !media.featured) return;
        setMediaFlagSaving((current) => ({ ...current, [key]: true }));
        setItems((current) => current.map((item) => item.id === media.id ? { ...item, featured_order: order } : item));
        try {
            const response = await api.patch("/admin/media/" + media.id + "/flags", { featured_order: order });
            setItems((current) => current.map((item) => item.id === media.id ? { ...item, ...response.data } : item));
            toast.success("Priorité « À l’affiche » mise à jour");
        } catch (e) {
            await loadMedia();
            showError(toast, e, "Mise à jour de la priorité impossible");
        } finally {
            setMediaFlagSaving((current) => ({ ...current, [key]: false }));
        }
    };

    const stats = {
        total: items.length,
        movies: items.filter((i) => i.type === "movie").length,
        series: items.filter((i) => i.type === "series").length,
        animes: items.filter((i) => i.type === "anime").length,
        featured: items.filter((i) => i.featured).length,
        inTheaters: items.filter((i) => i.type === "movie" && i.in_theaters).length,
        users: users.length,
        premium: users.filter((u) => u.premium).length,
        comments: reviews.length,
    };

    const filteredItems = items.filter((m) => {
        if (q && !m.title.toLowerCase().includes(q.toLowerCase())) return false;
        if (mediaFilter === "incomplete") return isMediaIncomplete(m);
        if (mediaFilter !== "all") return m.type === mediaFilter;
        return true;
    });
    const filteredUsers = users.filter((u) => !userQ ||
        (u.email || "").toLowerCase().includes(userQ.toLowerCase()) ||
        (u.name || "").toLowerCase().includes(userQ.toLowerCase())
    );
    const sortedUsers = [...filteredUsers];
    if (userSort.key) {
        const dir = userSort.dir === "asc" ? 1 : -1;
        sortedUsers.sort((a, b) => {
            let va = "", vb = "";
            if (userSort.key === "auth") { va = a.auth_provider || ""; vb = b.auth_provider || ""; }
            else if (userSort.key === "premium") { va = a.premium ? (a.premium_plan || "zzz") : ""; vb = b.premium ? (b.premium_plan || "zzz") : ""; }
            else if (userSort.key === "until") { va = a.premium_until || ""; vb = b.premium_until || ""; }
            if (va < vb) return -dir;
            if (va > vb) return dir;
            return 0;
        });
    }
    const toggleUserSort = (key) => setUserSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    const sortArrow = (key) => (userSort.key === key ? (userSort.dir === "asc" ? "↑" : "↓") : "");
    const filteredReviews = reviews.filter((r) => {
        if (!reviewQ) return true;
        const s = reviewQ.toLowerCase();
        return (r.comment || "").toLowerCase().includes(s) ||
            (r.user_name || "").toLowerCase().includes(s) ||
            (r.media_title || "").toLowerCase().includes(s);
    });

    const setTab = (t) => navigate(`/admin?tab=${t}`, { replace: true });

    const incompleteItems = items.filter(isMediaIncomplete);
    const alertes = reportCount;
    const pendingWishes = wishes.filter((w) => (w.status || "pending") === "pending");

    const NAV_GROUPS = [
        { items: [{ value: "overview", label: "À traiter", icon: <LayoutDashboard size={14} /> }] },
        {
            label: "Catalogue", items: [
                { value: "media", label: "Contenus", icon: <Film size={14} />, badge: incompleteItems.length },
                { value: "discovery", label: "Tendances", icon: <Sparkles size={14} />, perm: "content.add" },
                { value: "views", label: "Vues", icon: <Eye size={14} />, perm: "content.add" },
                { value: "players", label: "Signalements", icon: <Flag size={14} />, perm: "content.edit", badge: alertes },
                { value: "pending", label: "Propositions", icon: <Inbox size={14} />, perm: "content.add", badge: pendingCount },
                { value: "storage", label: "Stockage", icon: <HardDrive size={14} />, perm: "content.delete" },
            ],
        },
        {
            label: "Communauté", items: [
                { value: "users", label: "Utilisateurs", icon: <Users size={14} /> },
                { value: "comments", label: "Commentaires", icon: <MessageSquare size={14} />, perm: "reviews.moderate" },
                { value: "wishboard", label: "Wishboard", icon: <ChevronUp size={14} />, badge: pendingWishes.length },
                { value: "contributors", label: "Contributeurs", icon: <Trophy size={14} />, perm: "content.add" },
                { value: "announcements", label: "Annonces", icon: <Megaphone size={14} />, perm: "announcements.manage" },
                { value: "polls", label: "Sondages", icon: <BarChart3 size={14} />, perm: "polls.manage" },
            ],
        },
        {
            label: "Monétisation", items: [
                { value: "pricing", label: "Tarifs", icon: <Tag size={14} />, perm: "pricing.manage" },
                { value: "ads", label: "Publicité", icon: <Megaphone size={14} />, perm: "ads.manage" },
                { value: "coins", label: "Freemium", icon: <Coins size={14} />, perm: "users.coins" },
                { value: "cagnotte", label: "Cagnotte", icon: <PiggyBank size={14} />, perm: "cagnotte.manage" },
                { value: "license-keys", label: "Clés SellAuth", icon: <KeyRound size={14} />, perm: "keys.manage" },
            ],
        },
        { label: "Aide", items: [{ value: "guide", label: "Guide du panel", icon: <BookOpen size={14} /> }] },
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-7xl mx-auto px-6 py-12">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Admin</div>
                        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter">Panneau de gestion</h1>
                    </div>
                </div>

                <Tabs value={tabParam} onValueChange={setTab} orientation="vertical" className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
                    <TabsList className="h-auto w-full shrink-0 flex-col items-stretch gap-1 rounded-xl border border-[#262626] bg-[#0a0a0a] p-2 lg:sticky lg:top-6 lg:w-60">
                        {NAV_GROUPS.map((group, gi) => {
                            const visibles = group.items.filter((item) => !item.perm || can(user, item.perm));
                            if (visibles.length === 0) return null;
                            return (
                                <div key={group.label || gi} className={gi > 0 ? "mt-3" : ""}>
                                    {group.label && (
                                        <div className="px-3 pb-1.5 pt-1 text-[10px] uppercase tracking-[0.18em] text-neutral-600">{group.label}</div>
                                    )}
                                    {visibles.map((item) => (
                                        <TabsTrigger
                                            key={item.value}
                                            value={item.value}
                                            data-testid={"admin-tab-" + item.value}
                                            className="w-full justify-start gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-400 data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black"
                                        >
                                            {item.icon}
                                            <span className="flex-1 text-left">{item.label}</span>
                                            {item.badge > 0 && (
                                                <span className="rounded-full bg-[#E8D2A6]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#E8D2A6]">
                                                    {item.badge}
                                                </span>
                                            )}
                                        </TabsTrigger>
                                    ))}
                                </div>
                            );
                        })}
                    </TabsList>

                    <div className="min-w-0 flex-1">
                    <TabsContent value="overview" className="mt-0 space-y-8">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <button
                                type="button"
                                onClick={() => setTab("wishboard")}
                                data-testid="todo-wishboard"
                                className="group rounded-xl border border-[#262626] bg-[#0a0a0a] p-5 text-left transition-colors hover:border-[#E8D2A6]/50"
                            >
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                                    <ChevronUp size={13} /> Wishboard
                                </div>
                                <div className={"mt-2 font-display text-3xl " + (pendingWishes.length > 0 ? "text-[#E8D2A6]" : "text-neutral-600")}>
                                    {pendingWishes.length}
                                </div>
                                <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500 group-hover:text-neutral-300">
                                    {pendingWishes.length > 0 ? "proposition(s) à trancher" : "rien en attente"}
                                    <ArrowRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setTab("pending")}
                                data-testid="todo-pending"
                                className="group rounded-xl border border-[#262626] bg-[#0a0a0a] p-5 text-left transition-colors hover:border-[#E8D2A6]/50"
                            >
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                                    <Inbox size={13} /> Propositions
                                </div>
                                <div className={"mt-2 font-display text-3xl " + (pendingCount > 0 ? "text-[#E8D2A6]" : "text-neutral-600")}>
                                    {pendingCount}
                                </div>
                                <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500 group-hover:text-neutral-300">
                                    {pendingCount > 0 ? "en attente de validation" : "rien à valider"}
                                    <ArrowRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setTab("media")}
                                data-testid="todo-incomplete"
                                className="group rounded-xl border border-[#262626] bg-[#0a0a0a] p-5 text-left transition-colors hover:border-[#E8D2A6]/50"
                            >
                                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                                    <AlertTriangle size={13} /> Contenus incomplets
                                </div>
                                <div className={"mt-2 font-display text-3xl " + (incompleteItems.length > 0 ? "text-amber-400" : "text-neutral-600")}>
                                    {incompleteItems.length}
                                </div>
                                <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500 group-hover:text-neutral-300">
                                    {incompleteItems.length > 0 ? "sans vidéo jouable" : "tout est complet"}
                                    <ArrowRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
                                </div>
                            </button>

                            {can(user, "reviews.moderate") && (
                                <button
                                    type="button"
                                    onClick={() => setTab("comments")}
                                    data-testid="todo-comments"
                                    className="group rounded-xl border border-[#262626] bg-[#0a0a0a] p-5 text-left transition-colors hover:border-[#E8D2A6]/50"
                                >
                                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                                        <MessageSquare size={13} /> Commentaires
                                    </div>
                                    <div className="mt-2 font-display text-3xl text-white">{reviews.length}</div>
                                    <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500 group-hover:text-neutral-300">
                                        à surveiller
                                        <ArrowRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
                                    </div>
                                </button>
                            )}
                        </div>

                        {incompleteItems.length > 0 && (
                            <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-5">
                                <div className="text-[10px] uppercase tracking-widest text-neutral-500">À compléter en priorité</div>
                                <div className="mt-3 space-y-1">
                                    {incompleteItems.slice(0, 6).map((m) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => navigate("/admin/media/" + m.id + "/edit")}
                                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.03]"
                                        >
                                            {m.poster_url
                                                ? <img src={m.poster_url} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                                                : <div className="h-10 w-7 shrink-0 rounded bg-[#111]" />}
                                            <span className="min-w-0 flex-1 truncate text-sm text-white">{m.title}</span>
                                            <span className="shrink-0 text-xs text-neutral-500">{m.type}</span>
                                            <Edit size={13} className="shrink-0 text-neutral-600" />
                                        </button>
                                    ))}
                                </div>
                                {incompleteItems.length > 6 && (
                                    <button type="button" onClick={() => setTab("media")} className="mt-3 text-xs text-[#E8D2A6] hover:underline">
                                        Voir les {incompleteItems.length} contenus incomplets
                                    </button>
                                )}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setTab("guide")}
                            data-testid="overview-guide-link"
                            className="group flex w-full items-center gap-3 rounded-xl border border-[#262626] bg-[#0a0a0a] p-4 text-left transition-colors hover:border-[#E8D2A6]/50"
                        >
                            <BookOpen size={16} className="shrink-0 text-[#E8D2A6]" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm text-white">Guide du panel</span>
                                <span className="block text-xs text-neutral-500">Publier un film, une série, nommer ses fichiers, régler les permissions.</span>
                            </span>
                            <ArrowRight size={14} className="shrink-0 text-neutral-600 transition-colors group-hover:text-[#E8D2A6]" />
                        </button>

                        <AdminTraffic />

                        <div>
                            <div className="mb-3 text-[10px] uppercase tracking-widest text-neutral-500">Catalogue en chiffres</div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                {[
                                    { label: "Contenus", val: stats.total, icon: <Sparkles size={14} /> },
                                    { label: "Films", val: stats.movies, icon: <Film size={14} /> },
                                    { label: "Séries", val: stats.series, icon: <Tv size={14} /> },
                                    { label: "Animes", val: stats.animes, icon: <Sparkles size={14} /> },
                                    { label: "À l'affiche", val: stats.featured, icon: <Sparkles size={14} /> },
                                    { label: "Au cinéma", val: stats.inTheaters, icon: <Film size={14} /> },
                                    { label: "Utilisateurs", val: stats.users, icon: <Users size={14} /> },
                                    { label: "Abonnés", val: stats.premium, icon: <Crown size={14} /> },
                                    { label: "Commentaires", val: stats.comments, icon: <MessageSquare size={14} /> },
                                ].map((c) => (
                                    <div key={c.label} className="rounded-lg border border-[#262626] bg-[#0a0a0a] p-4">
                                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-neutral-500">{c.icon} {c.label}</div>
                                        <div className="mt-1.5 font-display text-2xl">{c.val}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="media" className="mt-0">
                        <SectionHeader
                            titre="Contenus"
                            description="Le catalogue complet. Ajoute, modifie, et gère ce qui passe en avant."
                        >
                            {can(user, "content.add") && <Button onClick={() => navigate("/admin/media/new")} data-testid="add-media-btn" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-10 px-5 font-semibold">
                                <Plus size={16} className="mr-2" /> Ajouter un contenu
                            </Button>}
                        </SectionHeader>

                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="relative sm:max-w-xs sm:flex-1">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un titre…" className="pl-9 bg-[#111] border-[#262626] text-white" />
                            </div>
                            <div className="flex flex-wrap gap-1.5" data-testid="media-filters">
                                {[
                                    { id: "all", label: "Tous", n: items.length },
                                    { id: "movie", label: "Films", n: stats.movies },
                                    { id: "series", label: "Séries", n: stats.series },
                                    { id: "anime", label: "Animes", n: stats.animes },
                                    { id: "incomplete", label: "Incomplets", n: incompleteItems.length },
                                ].map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => setMediaFilter(f.id)}
                                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${mediaFilter === f.id
                                            ? "border-[#E8D2A6] bg-[#E8D2A6] font-semibold text-black"
                                            : f.id === "incomplete" && f.n > 0
                                                ? "border-amber-400/40 text-amber-300 hover:bg-amber-400/10"
                                                : "border-[#262626] text-neutral-400 hover:border-[#E8D2A6]/50 hover:text-white"}`}
                                    >
                                        {f.label} <span className="tabular-nums opacity-70">{f.n}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border border-[#262626] rounded-lg overflow-hidden">
                            <div className="grid grid-cols-12 text-xs uppercase tracking-widest text-neutral-500 px-5 py-3 border-b border-[#262626] bg-[#0a0a0a]">
                                <div className="col-span-4">Titre</div>
                                <div className="col-span-1">Type</div>
                                <div className="col-span-1">Année</div>
                                <div className="col-span-2 text-center">Au cinéma</div>
                                <div className="col-span-2 text-center">À l&apos;affiche · priorité</div>
                                <div className="col-span-2 text-right">Actions</div>
                            </div>
                            {filteredItems.length === 0 && <div className="px-5 py-8 text-center text-neutral-500 text-sm">Aucun contenu.</div>}
                            {filteredItems.map((m) => (
                                <div key={m.id} className="grid grid-cols-12 px-5 py-4 border-b border-[#1a1a1a] items-center text-sm hover:bg-white/[0.02]">
                                    <div className="col-span-4 flex items-center gap-3">
                                        {m.poster_url && <img src={m.poster_url} alt="" className="w-8 h-12 object-cover rounded" />}
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-white">{m.title}</span>
                                                {isMediaIncomplete(m) && (
                                                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                                                        En cours
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-neutral-500">{(m.genres || []).slice(0, 3).join(" · ")}</div>
                                        </div>
                                    </div>
                                    <div className="col-span-1 text-neutral-300 capitalize">{m.type}</div>
                                    <div className="col-span-1 text-neutral-400">{m.year || "—"}</div>
                                    <div className="col-span-2 flex justify-center">
                                        {m.type === "movie" ? (
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={!!m.in_theaters}
                                                    disabled={!!mediaFlagSaving[m.id + ":in_theaters"] || !can(user, "content.edit")}
                                                    onCheckedChange={(checked) => toggleMediaFlag(m, "in_theaters", checked)}
                                                    aria-label={"Statut cinéma de " + m.title}
                                                    data-testid={"toggle-in-theaters-" + m.id}
                                                />
                                                <span className={"text-[10px] uppercase tracking-wide " + (m.in_theaters ? "text-[#E8D2A6]" : "text-neutral-600")}>{m.in_theaters ? "Activé" : "Désactivé"}</span>
                                            </div>
                                        ) : <span className="text-neutral-700">—</span>}
                                    </div>
                                    <div className="col-span-2 flex justify-center">
                                        <div className="flex flex-wrap items-center justify-center gap-2">
                                            <Switch
                                                checked={!!m.featured}
                                                disabled={!!mediaFlagSaving[m.id + ":featured"] || !can(user, "content.edit")}
                                                onCheckedChange={(checked) => toggleMediaFlag(m, "featured", checked)}
                                                aria-label={"Mise à l’affiche de " + m.title}
                                                data-testid={"toggle-featured-" + m.id}
                                            />
                                            <span className={"text-[10px] uppercase tracking-wide " + (m.featured ? "text-[#E8D2A6]" : "text-neutral-600")}>{m.featured ? "Activé" : "Désactivé"}</span>
                                            {m.featured && (
                                                <label className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-neutral-500">
                                                    N°
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        max="999"
                                                        value={m.featured_order ?? 1}
                                                        disabled={!!mediaFlagSaving[m.id + ":featured_order"] || !can(user, "content.edit")}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            setItems((current) => current.map((item) => item.id === m.id ? { ...item, featured_order: value } : item));
                                                        }}
                                                        onBlur={(event) => updateFeaturedOrder(m, event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter") event.currentTarget.blur();
                                                        }}
                                                        aria-label={"Priorité à l’affiche de " + m.title}
                                                        data-testid={"featured-order-" + m.id}
                                                        className="h-8 w-14 border-[#353535] bg-[#111] px-2 text-center text-xs text-white"
                                                    />
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                    <div className="col-span-2 flex items-center gap-1 justify-end">
                                        {can(user, "content.edit") && <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/media/${m.id}/edit`)} data-testid={`edit-${m.id}`} className="text-neutral-400 hover:text-[#E8D2A6] hover:bg-white/5"><Edit size={14} /></Button>}
                                        {can(user, "content.delete") && <Button variant="ghost" size="icon" onClick={() => remove(m.id)} data-testid={`delete-${m.id}`} className="text-neutral-400 hover:text-red-400 hover:bg-white/5"><Trash2 size={14} /></Button>}
                                        {!can(user, "content.edit") && !can(user, "content.delete") && <span className="text-xs text-neutral-600">Lecture</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    {can(user, "content.add") && (
                        <TabsContent value="discovery" className="mt-0 space-y-6">
                            <div className="mb-6 flex flex-col gap-3 border-b border-[#262626] pb-5 sm:flex-row sm:items-end sm:justify-between">
                                <div className="max-w-2xl">
                                    <h2 className="font-display text-2xl tracking-tight text-white">Tendances</h2>
                                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                                        Les titres qui montent sur IMDb, même absents du catalogue.
                                    </p>
                                </div>
                                <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                                    <Button
                                        onClick={loadAiDiscovery}
                                        disabled={aiDiscoveryLoading}
                                        data-testid="refresh-ai-discovery"
                                        variant="outline"
                                        className="rounded-full border-[#E8D2A6]/35 bg-transparent text-[#E8D2A6] hover:bg-[#E8D2A6]/10 hover:text-[#E8D2A6]"
                                    >
                                        <RotateCcw size={14} className={"mr-2 " + (aiDiscoveryLoading ? "animate-spin" : "")} />
                                        {aiDiscoveryLoading ? "Mise à jour…" : "Actualiser"}
                                    </Button>
                                    {aiDiscoveryLoadedAt && (
                                        <span className="text-[11px] text-neutral-600">
                                            Dernière mise à jour : {aiDiscoveryLoadedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {aiDiscoveryError && (
                                <div className="border border-red-500/25 bg-red-500/5 px-5 py-4 text-sm text-red-300" role="alert">
                                    {aiDiscoveryError}
                                </div>
                            )}

                            {aiDiscoveryLoading && aiDiscovery.length === 0 ? (
                                <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-6" aria-label="Chargement des tendances IMDb">
                                    {Array.from({ length: 6 }).map((_, index) => (
                                        <div key={index} className="animate-pulse">
                                            <div className="aspect-[2/3] border border-[#262626] bg-[#111]" />
                                            <div className="mt-3 h-3 w-2/3 bg-[#171717]" />
                                            <div className="mt-2 h-2 w-full bg-[#111]" />
                                        </div>
                                    ))}
                                </div>
                            ) : aiDiscovery.length > 0 ? (
                                <div className="grid grid-cols-2 gap-6 md:grid-cols-4 lg:grid-cols-6" data-testid="admin-ai-discovery-grid">
                                    {aiDiscovery.map((media) => (
                                        <article key={media.id} className="group min-w-0">
                                            <a
                                                href={media.imdb_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="relative block aspect-[2/3] w-full overflow-hidden border border-[#262626] bg-[#111] text-left transition-colors hover:border-[#E8D2A6]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6]"
                                                data-testid={`admin-imdb-discovery-${media.id}`}
                                            >
                                                {media.poster_url ? (
                                                    <img src={media.poster_url} alt={media.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
                                                ) : (
                                                    <div className="flex h-full items-center justify-center text-neutral-700"><Film size={28} /></div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
                                                <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                                                    <span className="max-w-[80%] truncate rounded-full border border-[#E8D2A6]/30 bg-black/75 px-2 py-1 text-[9px] uppercase tracking-wider text-[#E8D2A6] backdrop-blur">
                                                        {media.ai_label || "Sélection IMDb"}
                                                    </span>
                                                    <span className="font-display text-xl text-white/70">{String(media.ai_rank || "").padStart(2, "0")}</span>
                                                </div>
                                            </a>
                                            <div className="pt-3">
                                                <div className="text-[10px] uppercase tracking-widest text-neutral-600">
                                                    {media.type === "movie" ? "Film" : media.type === "series" ? "Série" : "Anime"}
                                                    {media.year ? ` · ${media.year}` : ""}
                                                    {media.rating ? ` · IMDb ${media.rating}/10` : ""}
                                                </div>
                                                <h3 className="mt-1 truncate text-sm font-medium text-white">{media.title}</h3>
                                                {media.already_added ? (
                                                    <div className="mt-2 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                                                        Déjà ajouté
                                                    </div>
                                                ) : media.previously_added ? (
                                                    <div className="mt-2 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                                                        Ajouté puis supprimé
                                                    </div>
                                                ) : (
                                                    <div className="mt-2 inline-flex rounded-full border border-[#E8D2A6]/25 bg-[#E8D2A6]/5 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#E8D2A6]">
                                                        Pas encore ajouté
                                                    </div>
                                                )}
                                                <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-relaxed text-neutral-500">{media.ai_reason}</p>
                                                <div className="mt-3 flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => navigate(media.already_added
                                                            ? `/admin/media/${media.catalog_media_id}/edit`
                                                            : `/admin/media/new?q=${encodeURIComponent(media.title)}&type=${encodeURIComponent(media.type || "movie")}`
                                                        )}
                                                        className="h-8 flex-1 rounded-full border-[#262626] bg-transparent px-3 text-xs text-neutral-300 hover:border-[#E8D2A6]/45 hover:bg-white/5 hover:text-white"
                                                    >
                                                        {media.already_added ? "Modifier" : media.previously_added ? "Réajouter" : "Ajouter"}
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        disabled={!!aiDiscoveryRemoving[media.id]}
                                                        onClick={() => dismissAiDiscovery(media)}
                                                        aria-label={`Retirer ${media.title} de Tendances`}
                                                        title="Retirer de Tendances"
                                                        className="h-8 w-8 shrink-0 text-neutral-500 hover:bg-red-500/10 hover:text-red-300"
                                                    >
                                                        {aiDiscoveryRemoving[media.id]
                                                            ? <RotateCcw size={14} className="animate-spin" />
                                                            : <Trash2 size={14} />}
                                                    </Button>
                                                </div>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            ) : !aiDiscoveryError && (
                                <div className="border border-[#262626] bg-[#0a0a0a] px-6 py-10 text-center">
                                    <Sparkles size={22} className="mx-auto text-[#E8D2A6]" />
                                    <p className="mt-3 text-sm text-neutral-400">Aucune tendance IMDb n&apos;est disponible pour le moment.</p>
                                </div>
                            )}

                            <p className="text-xs leading-relaxed text-neutral-600">
                                Les fiches, identifiants, notes et volumes de votes sont vérifiés via IMDb. Cette sélection est réservée au panel admin et ne dépend ni du catalogue ni des visionnages YourMovie&apos;s.
                            </p>
                        </TabsContent>
                    )}

                    <TabsContent value="users" className="mt-0">
                        <SectionHeader
                            titre="Utilisateurs"
                            description="Comptes, abonnements, blocages et permissions."
                        />
                        <div className="mb-6 relative max-w-md">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <Input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="Rechercher utilisateur..." className="pl-9 bg-[#111] border-[#262626] text-white" />
                        </div>

                        <div className="border border-[#262626] rounded-lg overflow-hidden">
                            <div className="grid grid-cols-12 text-xs uppercase tracking-widest text-neutral-500 px-5 py-3 border-b border-[#262626] bg-[#0a0a0a]">
                                <div className="col-span-4">Utilisateur</div>
                                <button onClick={() => toggleUserSort("auth")} className="col-span-2 text-left uppercase tracking-widest hover:text-[#E8D2A6]">Auth {sortArrow("auth")}</button>
                                <button onClick={() => toggleUserSort("premium")} className="col-span-2 text-left uppercase tracking-widest hover:text-[#E8D2A6]">Abonnement {sortArrow("premium")}</button>
                                <button onClick={() => toggleUserSort("until")} className="col-span-2 text-left uppercase tracking-widest hover:text-[#E8D2A6]">Fin d&apos;abo {sortArrow("until")}</button>
                                <div className="col-span-2 text-right">Actions</div>
                            </div>
                            {sortedUsers.length === 0 && <div className="px-5 py-8 text-center text-neutral-500 text-sm">Aucun utilisateur.</div>}
                            {sortedUsers.map((u) => (
                                <div key={u.user_id} className="grid grid-cols-12 px-5 py-4 border-b border-[#1a1a1a] items-center text-sm hover:bg-white/[0.02]" data-testid={`user-row-${u.user_id}`}>
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/admin/users/${u.user_id}`)}
                                        data-testid={`open-user-${u.user_id}`}
                                        title="Ouvrir la fiche admin"
                                        className="col-span-4 flex items-center gap-3 text-left group/u"
                                    >
                                        {u.picture ? (
                                            <img src={u.picture} alt="" className="w-8 h-8 rounded-full" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center text-xs font-semibold">
                                                {u.name?.[0]?.toUpperCase()}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <div className="text-white flex items-center gap-1.5 group-hover/u:text-[#E8D2A6] transition-colors">
                                                <span className={`w-2 h-2 rounded-full shrink-0 ${u.online ? "bg-emerald-400" : "bg-neutral-700"}`} title={u.online ? "En ligne" : "Hors ligne"} />
                                                {u.name}
                                                {u.is_admin && <Shield size={11} className="text-[#E8D2A6]" />}
                                                {u.blocked && <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-red-500/40 text-red-400">Bloqué</span>}
                                            </div>
                                            <div className="text-xs text-neutral-500 truncate group-hover/u:text-neutral-300">{u.email}</div>
                                        </div>
                                    </button>
                                    <div className="col-span-2 text-neutral-400 capitalize">{u.auth_provider}</div>
                                    <div className="col-span-2">
                                        {u.premium ? (
                                            <span className="inline-flex items-center gap-1 text-[#E8D2A6] text-xs px-2 py-1 rounded-full border border-[#E8D2A6]/30 bg-[#E8D2A6]/10">
                                                <Crown size={10} /> {u.premium_plan}
                                            </span>
                                        ) : (
                                            <span className="text-neutral-500 text-xs">Gratuit</span>
                                        )}
                                    </div>
                                    <div className="col-span-2 text-neutral-400 text-xs">
                                        {u.premium_until ? new Date(u.premium_until).toLocaleDateString("fr-FR") : "—"}
                                    </div>
                                    <div className="col-span-2 flex items-center gap-1 justify-end">
                                        {can(user, "roles.manage") ? (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setRoleUser(u)}
                                                    data-testid={`role-btn-${u.user_id}`}
                                                    className="text-neutral-400 hover:text-[#E8D2A6] hover:bg-white/5"
                                                >
                                                    <Shield size={12} className="mr-1" />
                                                    {u.is_admin ? (u.admin_role === "super" ? "Super" : u.admin_role === "moderator" ? "Modo" : "Éditeur") : "Admin"}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setPremiumUser(u)}
                                                    data-testid={`toggle-premium-${u.user_id}`}
                                                    className={u.premium ? "text-[#E8D2A6] hover:bg-white/5" : "text-neutral-400 hover:text-[#E8D2A6] hover:bg-white/5"}
                                                >
                                                    <Crown size={12} className="mr-1" /> Premium
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => deleteUser(u)} data-testid={`delete-user-${u.user_id}`} className="text-neutral-400 hover:text-red-400 hover:bg-white/5"><Trash2 size={14} /></Button>
                                            </>
                                        ) : (
                                            u.is_admin && <span className="text-[10px] uppercase tracking-wide text-neutral-500">{u.admin_role === "super" ? "Super" : u.admin_role === "moderator" ? "Modo" : "Éditeur"}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="comments" className="mt-0">
                        <SectionHeader
                            titre="Commentaires"
                            description="Tous les avis publiés et leurs réponses."
                        />
                        <div className="mb-6 relative max-w-md">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <Input value={reviewQ} onChange={(e) => setReviewQ(e.target.value)} placeholder="Rechercher (texte, utilisateur, titre)..." className="pl-9 bg-[#111] border-[#262626] text-white" />
                        </div>

                        <div className="space-y-3">
                            {filteredReviews.length === 0 && (
                                <div className="p-6 rounded-lg border border-[#262626] bg-[#0a0a0a] text-center text-neutral-500 text-sm">Aucun commentaire.</div>
                            )}
                            {filteredReviews.map((r) => (
                                <div key={r.id} className="p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center flex-wrap gap-2 text-xs">
                                            {r.parent_id ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#262626] text-neutral-400">
                                                    <CornerDownRight size={11} /> Réponse
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E8D2A6]/30 text-[#E8D2A6]">
                                                    <Star size={11} fill="currentColor" /> {typeof r.rating === "number" ? r.rating.toFixed(1) : "Avis"}
                                                </span>
                                            )}
                                            <span className="text-white font-medium">{r.user_name}</span>
                                            <span className="text-neutral-600">·</span>
                                            <button onClick={() => navigate(`/media/${r.media_id}`)} className="text-neutral-400 hover:text-[#E8D2A6] truncate max-w-[220px]">
                                                {r.media_title || r.media_id}
                                            </button>
                                            <span className="text-neutral-600">·</span>
                                            <span className="text-neutral-600">{r.created_at ? new Date(r.created_at).toLocaleString("fr-FR") : ""}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-neutral-300 leading-relaxed break-words">
                                            {r.reply_to_name && <span className="text-[#E8D2A6]">@{r.reply_to_name} </span>}
                                            {r.comment || <span className="text-neutral-600 italic">(sans texte)</span>}
                                        </p>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => deleteReviewAdmin(r)} data-testid={`admin-delete-review-${r.id}`} className="text-neutral-400 hover:text-red-400 hover:bg-white/5 shrink-0"><Trash2 size={14} /></Button>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="wishboard" className="mt-0">
                        <SectionHeader
                            titre="Wishboard"
                            description="Propositions des visiteurs, triées par nombre de votes. Approuve, laisse en attente ou refuse."
                        />
                        <div className="space-y-3">
                            {wishes.length === 0 && (
                                <div className="p-6 rounded-lg border border-[#262626] bg-[#0a0a0a] text-center text-neutral-500 text-sm">Aucune proposition.</div>
                            )}
                            {wishes.map((w) => (
                                <div key={w.id} className="flex items-center gap-4 p-3 sm:p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]">
                                    <div className="flex flex-col items-center justify-center w-12 shrink-0 text-[#E8D2A6]">
                                        <ChevronUp size={16} />
                                        <span className="text-sm font-semibold leading-none">{w.vote_count}</span>
                                    </div>
                                    {w.poster_url
                                        ? <img src={w.poster_url} alt="" className="w-10 h-[60px] object-cover rounded bg-[#111] shrink-0" />
                                        : <div className="w-10 h-[60px] rounded bg-[#111] shrink-0" />}
                                    <div className="min-w-0 flex-1">
                                        <div className="text-white text-sm font-medium truncate">{w.title}</div>
                                        <div className="text-xs text-neutral-500 mt-0.5">
                                            {w.year || "—"}{w.type ? ` · ${w.type}` : ""}
                                            {w.imdb_id && <> · <a href={`https://www.imdb.com/title/${w.imdb_id}`} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-[#E8D2A6]">IMDb</a></>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Button variant="ghost" size="sm" onClick={() => setWishStatus(w, "approved")} className={w.status === "approved" ? "text-black bg-[#E8D2A6] hover:bg-[#D4BB8B]" : "text-neutral-400 hover:text-[#E8D2A6] hover:bg-white/5"}>
                                            <Check size={13} className="mr-1" /> Approuver
                                        </Button>
                                        {can(user, "wishboard.moderate") && (
                                            <>
                                                <Button variant="ghost" size="sm" onClick={() => setWishStatus(w, "pending")} className={w.status === "pending" ? "text-white bg-white/10" : "text-neutral-400 hover:text-white hover:bg-white/5"}>
                                                    <Clock size={13} className="mr-1" /> En attente
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => setWishStatus(w, "refused")} className={w.status === "refused" ? "text-red-400 bg-red-500/10" : "text-neutral-400 hover:text-red-400 hover:bg-white/5"}>
                                                    <X size={13} className="mr-1" /> Refuser
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => deleteWish(w)} data-testid={`delete-wish-${w.id}`} className="text-neutral-400 hover:text-red-400 hover:bg-white/5"><Trash2 size={14} /></Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="coins" className="mt-0">
                        <SectionHeader
                            titre="Freemium"
                            description="Ajuste le solde de points d'un compte, et règle les gains du parrainage."
                        />
                        {can(user, "pricing.manage") && <AdminReferral />}
                        <div className="mb-6 relative max-w-md">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <Input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="Rechercher utilisateur..." className="pl-9 bg-[#111] border-[#262626] text-white" />
                        </div>
                        <p className="text-sm text-neutral-500 mb-6">Ajoute, retire, fixe ou remet à zéro les Freemium de chaque utilisateur.</p>
                        <div className="space-y-3">
                            {filteredUsers.length === 0 && (
                                <div className="p-6 rounded-lg border border-[#262626] bg-[#0a0a0a] text-center text-neutral-500 text-sm">Aucun utilisateur.</div>
                            )}
                            {filteredUsers.map((u) => (
                                <div key={u.user_id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        {u.picture ? (
                                            <img src={u.picture} alt="" className="w-8 h-8 rounded-full" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center text-xs font-semibold">{u.name?.[0]?.toUpperCase()}</div>
                                        )}
                                        <div className="min-w-0">
                                            <div className="text-white text-sm truncate">{u.name}</div>
                                            <div className="text-xs text-neutral-500 truncate">{u.email}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[#E8D2A6] font-semibold shrink-0 sm:w-28">
                                        <Coins size={14} /> {u.coins ?? 0}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Input
                                            type="number"
                                            value={coinAmount[u.user_id] ?? ""}
                                            onChange={(e) => setCoinAmount((m) => ({ ...m, [u.user_id]: e.target.value }))}
                                            placeholder="Montant"
                                            className="w-24 bg-[#111] border-[#262626] text-white h-9"
                                        />
                                        <Button variant="ghost" size="sm" onClick={() => adminCoins(u, "add")} title="Ajouter" className="text-neutral-300 hover:text-[#E8D2A6] hover:bg-white/5"><Plus size={14} /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => adminCoins(u, "remove")} title="Retirer" className="text-neutral-300 hover:text-red-400 hover:bg-white/5"><Minus size={14} /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => adminCoins(u, "set")} title="Fixer" className="text-neutral-300 hover:text-[#E8D2A6] hover:bg-white/5"><Check size={14} /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => adminCoins(u, "reset")} title="Remettre à 0" className="text-neutral-300 hover:text-red-400 hover:bg-white/5"><RotateCcw size={14} /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="cagnotte" className="mt-0">
                        <SectionHeader
                            titre="Cagnotte"
                            description="Le total affiché publiquement, et le bandeau qui invite à contribuer."
                        />
                        {can(user, "cagnotte.manage") && <AdminCagnotteTiers />}
                        {can(user, "cagnotte.manage") && <AdminSupportBanner />}
                        <div className="max-w-md p-6 rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                            <div className="flex items-center gap-2 mb-4">
                                <PiggyBank size={18} className="text-[#E8D2A6]" />
                                <h3 className="text-white font-medium">Total de la cagnotte</h3>
                            </div>
                            <div className="text-sm text-neutral-500 mb-4">Objectif fixe : {cagnotte.goal?.toLocaleString("fr-FR")} €. Modifie le montant total affiché publiquement.</div>
                            <label className="text-xs text-neutral-400">Total (€)</label>
                            <div className="flex items-center gap-3 mt-1.5">
                                <div className="relative flex-1">
                                    <Input
                                        type="number"
                                        value={cagnotteInput}
                                        onChange={(e) => setCagnotteInput(e.target.value)}
                                        data-testid="cagnotte-total-input"
                                        className="bg-[#111] border-[#262626] text-white pr-8"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">€</span>
                                </div>
                                <Button onClick={saveCagnotte} data-testid="save-cagnotte" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold">Enregistrer</Button>
                            </div>
                            <div className="text-xs text-neutral-600 mt-4">Total actuel : <span className="text-[#E8D2A6]">{cagnotte.total?.toLocaleString("fr-FR")} €</span></div>
                            <div className="mt-5 pt-4 border-t border-[#1a1a1a]">
                                <Button onClick={resetCagnotte} data-testid="reset-cagnotte" variant="outline" className="border-red-500/40 text-red-400 bg-transparent hover:bg-red-500/10 rounded-full">
                                    <RotateCcw size={14} className="mr-2" /> Réinitialiser la cagnotte à 0 €
                                </Button>
                                <p className="text-[11px] text-neutral-600 mt-2">Demande une double confirmation.</p>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="announcements" className="mt-0">
                        <SectionHeader
                            titre="Annonces"
                            description="Messages visibles par tous les visiteurs."
                        />
                        <div className="grid lg:grid-cols-2 gap-8">
                            <div className="p-5 rounded-lg border border-[#262626] bg-[#0a0a0a] h-fit">
                                <div className="flex items-center gap-2 mb-4">
                                    <Megaphone size={16} className="text-[#E8D2A6]" />
                                    <h3 className="text-white font-medium">Nouvelle annonce</h3>
                                </div>
                                <p className="text-xs text-neutral-500 mb-4">Visible par tous les utilisateurs dans leur cloche de notifications.</p>
                                <label className="text-xs text-neutral-400">Titre</label>
                                <Input
                                    value={annTitle}
                                    onChange={(e) => setAnnTitle(e.target.value)}
                                    data-testid="announcement-title"
                                    placeholder="Ex. Maintenance prévue ce week-end"
                                    className="mt-1 mb-4 bg-[#111] border-[#262626] text-white"
                                />
                                <label className="text-xs text-neutral-400">Message (optionnel)</label>
                                <Textarea
                                    value={annBody}
                                    onChange={(e) => setAnnBody(e.target.value)}
                                    data-testid="announcement-body"
                                    placeholder="Détails de l'information importante..."
                                    className="mt-1 min-h-[120px] bg-[#111] border-[#262626] text-white placeholder:text-neutral-600 focus-visible:ring-1 focus-visible:ring-[#E8D2A6]/50 focus-visible:border-[#E8D2A6]"
                                />
                                <div className="mt-4 text-right">
                                    <Button onClick={createAnnouncement} data-testid="publish-announcement" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full font-semibold">
                                        <Plus size={16} className="mr-2" /> Publier
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <div className="text-xs uppercase tracking-widest text-neutral-500 mb-3">Annonces publiées</div>
                                <div className="space-y-3">
                                    {announcements.length === 0 && (
                                        <div className="p-5 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] text-sm text-neutral-500">Aucune annonce.</div>
                                    )}
                                    {announcements.map((a) => (
                                        <div key={a.id} className="p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-white text-sm font-medium">{a.title}</div>
                                                {a.body && <div className="text-sm text-neutral-400 mt-1 leading-relaxed">{a.body}</div>}
                                                <div className="text-[11px] text-neutral-600 mt-2">
                                                    {a.author_name || "Admin"} · {a.created_at ? new Date(a.created_at).toLocaleString("fr-FR") : ""}
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" onClick={() => deleteAnnouncement(a.id)} data-testid={`delete-announcement-${a.id}`} className="text-neutral-400 hover:text-red-400 hover:bg-white/5 shrink-0"><Trash2 size={14} /></Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    {can(user, "keys.manage") && (
                        <TabsContent value="license-keys" className="mt-0 space-y-6">
                            <SectionHeader
                                titre="Clés SellAuth"
                                description="Whitelist des clés d'activation. Elles sont transformées en empreintes non réversibles côté serveur : elles ne sont jamais réaffichées."
                            />

                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                {[
                                    { label: "Total", value: licenseStats.total, color: "text-white" },
                                    { label: "Disponibles", value: licenseStats.available, color: "text-emerald-400" },
                                    { label: "Utilisées", value: licenseStats.redeemed, color: "text-[#E8D2A6]" },
                                    { label: "Retirées", value: licenseStats.revoked, color: "text-red-400" },
                                ].map((stat) => (
                                    <div key={stat.label} className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-4">
                                        <div className="text-[10px] uppercase tracking-widest text-neutral-500">{stat.label}</div>
                                        <div className={`mt-1 font-display text-3xl ${stat.color}`}>{stat.value}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid gap-5 lg:grid-cols-2">
                                <div className="rounded-2xl border border-[#E8D2A6]/25 bg-[#0c0c0c] p-5">
                                    <div className="mb-1 flex items-center gap-2 text-white">
                                        <Plus size={16} className="text-[#E8D2A6]" />
                                        <h3 className="font-medium">Ajouter des clés</h3>
                                    </div>
                                    <p className="mb-4 text-xs text-neutral-500">Une clé par ligne. Les doublons sont ignorés automatiquement.</p>
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <select
                                            value={licensePlan}
                                            onChange={(e) => setLicensePlan(e.target.value)}
                                            className="h-10 rounded-md border border-[#262626] bg-[#111] px-3 text-sm text-white outline-none focus:border-[#E8D2A6]"
                                        >
                                            <option value="basic">Basic</option>
                                            <option value="standard">Standard</option>
                                            <option value="premium">Premium</option>
                                        </select>
                                        <select
                                            value={licenseCycle}
                                            onChange={(e) => setLicenseCycle(e.target.value)}
                                            className="h-10 rounded-md border border-[#262626] bg-[#111] px-3 text-sm text-white outline-none focus:border-[#E8D2A6]"
                                        >
                                            <option value="monthly">1 mois</option>
                                            <option value="yearly">1 an</option>
                                        </select>
                                    </div>
                                    <Textarea
                                        value={licenseInput}
                                        onChange={(e) => setLicenseInput(e.target.value)}
                                        data-testid="admin-license-keys-input"
                                        placeholder={"YM-XXX-…\nYM-XXX-…"}
                                        spellCheck={false}
                                        className="min-h-[150px] border-[#262626] bg-[#080808] font-mono text-sm text-white placeholder:text-neutral-700 focus-visible:border-[#E8D2A6] focus-visible:ring-[#E8D2A6]/20"
                                    />
                                    <Button
                                        onClick={addLicenseKeys}
                                        disabled={licenseBusy || !licenseInput.trim()}
                                        className="mt-4 rounded-full bg-[#E8D2A6] px-6 font-semibold text-black hover:bg-[#D4BB8B]"
                                    >
                                        <Plus size={14} className="mr-2" /> Importer les clés
                                    </Button>
                                </div>

                                <div className="rounded-2xl border border-[#262626] bg-[#0a0a0a] p-5">
                                    <div className="mb-1 flex items-center gap-2 text-white">
                                        <Trash2 size={16} className="text-red-400" />
                                        <h3 className="font-medium">Retirer une clé</h3>
                                    </div>
                                    <p className="mb-4 text-xs leading-relaxed text-neutral-500">
                                        Saisissez la clé exacte à révoquer. Le panel ne peut pas récupérer sa valeur depuis l’empreinte enregistrée.
                                    </p>
                                    <Input
                                        type="password"
                                        value={licenseRemoveInput}
                                        onChange={(e) => setLicenseRemoveInput(e.target.value)}
                                        data-testid="admin-license-key-remove-input"
                                        placeholder="Clé à retirer"
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="h-11 border-[#262626] bg-[#111] font-mono text-white placeholder:text-neutral-700 focus-visible:border-red-400/60"
                                    />
                                    <Button
                                        onClick={() => revokeLicenseKey()}
                                        disabled={licenseBusy || !licenseRemoveInput.trim()}
                                        variant="outline"
                                        className="mt-4 rounded-full border-red-500/40 bg-transparent px-6 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                    >
                                        <Trash2 size={14} className="mr-2" /> Retirer de la whitelist
                                    </Button>
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-[#262626] bg-[#0a0a0a]">
                                <div className="flex items-center justify-between border-b border-[#262626] px-5 py-4">
                                    <div>
                                        <div className="text-sm font-medium text-white">Clés enregistrées</div>
                                        <div className="mt-0.5 text-xs text-neutral-600">200 entrées récentes maximum, sans aucune valeur sensible.</div>
                                    </div>
                                    <Button onClick={loadLicenseKeys} disabled={licenseBusy} variant="ghost" size="sm" className="text-neutral-400 hover:bg-white/5 hover:text-[#E8D2A6]">
                                        <RotateCcw size={13} className="mr-2" /> Actualiser
                                    </Button>
                                </div>
                                <div className="divide-y divide-[#1a1a1a]">
                                    {licenseKeys.length === 0 && <div className="p-6 text-center text-sm text-neutral-500">Aucune clé enregistrée.</div>}
                                    {licenseKeys.map((item) => {
                                        const statusLabel = item.status === "available" ? "Disponible" : item.status === "redeemed" ? "Utilisée" : "Retirée";
                                        const statusClass = item.status === "available" ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/5" : item.status === "redeemed" ? "text-[#E8D2A6] border-[#E8D2A6]/25 bg-[#E8D2A6]/5" : "text-red-400 border-red-500/25 bg-red-500/5";
                                        return (
                                            <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#262626] bg-[#111] text-[#E8D2A6]"><KeyRound size={15} /></div>
                                                    <div>
                                                        <div className="text-sm capitalize text-white">{item.plan} · {item.billing_cycle === "yearly" ? "1 an" : "1 mois"}</div>
                                                        <div className="mt-0.5 text-xs text-neutral-600">Clé protégée · ajoutée {item.created_at ? new Date(item.created_at).toLocaleDateString("fr-FR") : "—"}</div>
                                                    </div>
                                                </div>
                                                <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest ${statusClass}`}>{statusLabel}</span>
                                                {item.status === "available" && (
                                                    <Button onClick={() => revokeLicenseKey(item.id)} disabled={licenseBusy} variant="ghost" size="sm" className="text-neutral-500 hover:bg-red-500/10 hover:text-red-400">
                                                        <Trash2 size={13} className="mr-1.5" /> Retirer
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </TabsContent>
                    )}

                    {can(user, "polls.manage") && (
                        <TabsContent value="polls" className="mt-0">
                            <SectionHeader
                                titre="Sondages"
                                description="Publie une question aux visiteurs, connectés ou non. Chacun ne vote qu'une fois et découvre les résultats juste après."
                            />
                            <AdminPolls />
                        </TabsContent>
                    )}

                    {can(user, "content.edit") && (
                        <TabsContent value="players" className="mt-0">
                            <SectionHeader
                                titre="Signalements"
                                description="Les problèmes remontés par les visiteurs, et les contenus dont tu signales toi-même l'indisponibilité."
                            />
                            <AdminReports onCount={setReportCount} />
                        </TabsContent>
                    )}

                    <TabsContent value="views" className="mt-0">
                        <SectionHeader
                            titre="Vues"
                            description="Ce que l'hébergeur vidéo a réellement compté, contenu par contenu, du plus regardé au moins regardé."
                        />
                        <AdminViews />
                    </TabsContent>

                    <TabsContent value="pending" className="mt-0">
                        <SectionHeader
                            titre="Propositions"
                            description="Les contenus ajoutés par un compte sans droit de publication. Vérifie la fiche, puis publie ou refuse."
                        />
                        <AdminPending onCount={setPendingCount} />
                    </TabsContent>

                    <TabsContent value="contributors" className="mt-0">
                        <SectionHeader
                            titre="Contributeurs"
                            description="Qui alimente le catalogue, et depuis combien de temps."
                        />
                        <AdminContributors />
                    </TabsContent>

                    {can(user, "content.delete") && (
                        <TabsContent value="storage" className="mt-0">
                            <SectionHeader
                                titre="Stockage"
                                description="L'espace occupé par les vidéos et les fichiers restés en ligne sans contenu associé."
                            />
                            <AdminStorage />
                        </TabsContent>
                    )}

                    <TabsContent value="guide" className="mt-0">
                        <AdminGuide />
                    </TabsContent>

                    {can(user, "pricing.manage") && (
                        <TabsContent value="pricing" className="mt-0">
                            <SectionHeader
                                titre="Tarifs"
                                description="Prix Premium et Freemium, et réductions en cours."
                            />
                            <AdminPricing />
                        </TabsContent>
                    )}

                    {can(user, "ads.manage") && (
                        <TabsContent value="ads" className="mt-0">
                            <SectionHeader
                                titre="Publicité"
                                description="Emplacements publicitaires et étapes avant lecture."
                            />
                            <AdminAds />
                        </TabsContent>
                    )}
                    </div>
                </Tabs>
            </div>

            <GivePremiumDialog user={premiumUser} open={!!premiumUser} onOpenChange={(v) => !v && setPremiumUser(null)} onDone={loadUsers} />
            <AdminRoleDialog user={roleUser} open={!!roleUser} onOpenChange={(v) => !v && setRoleUser(null)} onDone={loadUsers} />
        </div>
    );
}
