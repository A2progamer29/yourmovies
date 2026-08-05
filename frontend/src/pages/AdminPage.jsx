import React, { useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { Plus, Trash2, Edit, Film, Tv, Sparkles, Users, Crown, Shield, ShieldOff, Search, Megaphone, MessageSquare, Star, CornerDownRight, ChevronUp, Check, Clock, X, Coins, Minus, RotateCcw, PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Header from "@/components/Header";
import { showError } from "@/lib/errors";

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
    const [q, setQ] = useState("");
    const [userQ, setUserQ] = useState("");
    const tabParam = new URLSearchParams(location.search).get("tab") || "media";

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

    useEffect(() => {
        if (user?.is_admin) {
            loadMedia();
            loadUsers();
            loadAnnouncements();
            loadReviews();
            loadWishes();
            loadCagnotte();
        }
    }, [user]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;
    if (!user.is_admin) return <Navigate to="/" replace />;

    const remove = async (id) => {
        if (!window.confirm("Supprimer ce contenu ?")) return;
        await api.delete(`/media/${id}`);
        toast.success("Supprimé");
        loadMedia();
    };
    const toggleAdmin = async (u) => {
        try {
            await api.post(`/admin/users/${u.user_id}/toggle-admin`);
            toast.success("Rôle mis à jour");
            loadUsers();
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
    };
    const togglePremium = async (u) => {
        try {
            await api.post(`/admin/users/${u.user_id}/toggle-premium`);
            toast.success("Premium mis à jour");
            loadUsers();
        } catch (e) { showError(toast, e, "Mise à jour impossible"); }
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

    const stats = {
        total: items.length,
        movies: items.filter((i) => i.type === "movie").length,
        series: items.filter((i) => i.type === "series").length,
        animes: items.filter((i) => i.type === "anime").length,
        featured: items.filter((i) => i.featured).length,
        users: users.length,
        premium: users.filter((u) => u.premium).length,
        comments: reviews.length,
    };

    const filteredItems = items.filter((m) => !q || m.title.toLowerCase().includes(q.toLowerCase()));
    const filteredUsers = users.filter((u) => !userQ ||
        (u.email || "").toLowerCase().includes(userQ.toLowerCase()) ||
        (u.name || "").toLowerCase().includes(userQ.toLowerCase())
    );
    const filteredReviews = reviews.filter((r) => {
        if (!reviewQ) return true;
        const s = reviewQ.toLowerCase();
        return (r.comment || "").toLowerCase().includes(s) ||
            (r.user_name || "").toLowerCase().includes(s) ||
            (r.media_title || "").toLowerCase().includes(s);
    });

    const setTab = (t) => navigate(`/admin?tab=${t}`, { replace: true });

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

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-10">
                    {[
                        { label: "Contenus", val: stats.total, icon: <Sparkles size={14} /> },
                        { label: "Films", val: stats.movies, icon: <Film size={14} /> },
                        { label: "Séries", val: stats.series, icon: <Tv size={14} /> },
                        { label: "Animes", val: stats.animes, icon: <Sparkles size={14} /> },
                        { label: "À l'affiche", val: stats.featured, icon: <Sparkles size={14} /> },
                        { label: "Utilisateurs", val: stats.users, icon: <Users size={14} /> },
                        { label: "Abonnés", val: stats.premium, icon: <Crown size={14} /> },
                        { label: "Commentaires", val: stats.comments, icon: <MessageSquare size={14} /> },
                    ].map((s) => (
                        <div key={s.label} className="p-4 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                            <div className="text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">{s.icon} {s.label}</div>
                            <div className="font-display text-2xl mt-1.5">{s.val}</div>
                        </div>
                    ))}
                </div>

                <Tabs value={tabParam} onValueChange={setTab}>
                    <TabsList className="bg-[#111] border border-[#262626]">
                        <TabsTrigger value="media" data-testid="admin-tab-media" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">
                            <Film size={14} className="mr-2" /> Contenus
                        </TabsTrigger>
                        <TabsTrigger value="users" data-testid="admin-tab-users" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">
                            <Users size={14} className="mr-2" /> Utilisateurs
                        </TabsTrigger>
                        <TabsTrigger value="comments" data-testid="admin-tab-comments" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">
                            <MessageSquare size={14} className="mr-2" /> Commentaires
                        </TabsTrigger>
                        <TabsTrigger value="wishboard" data-testid="admin-tab-wishboard" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">
                            <ChevronUp size={14} className="mr-2" /> Wishboard
                        </TabsTrigger>
                        <TabsTrigger value="coins" data-testid="admin-tab-coins" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">
                            <Coins size={14} className="mr-2" /> Freemium
                        </TabsTrigger>
                        <TabsTrigger value="cagnotte" data-testid="admin-tab-cagnotte" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">
                            <PiggyBank size={14} className="mr-2" /> Cagnotte
                        </TabsTrigger>
                        <TabsTrigger value="announcements" data-testid="admin-tab-announcements" className="data-[state=active]:bg-[#E8D2A6] data-[state=active]:text-black">
                            <Megaphone size={14} className="mr-2" /> Annonces
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="media" className="mt-8">
                        <div className="flex flex-col sm:flex-row gap-3 mb-6">
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="pl-9 bg-[#111] border-[#262626] text-white" />
                            </div>
                            <Button onClick={() => navigate("/admin/media/new")} data-testid="add-media-btn" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 px-5 font-semibold">
                                <Plus size={16} className="mr-2" /> Ajouter un contenu
                            </Button>
                        </div>

                        <div className="border border-[#262626] rounded-lg overflow-hidden">
                            <div className="grid grid-cols-12 text-xs uppercase tracking-widest text-neutral-500 px-5 py-3 border-b border-[#262626] bg-[#0a0a0a]">
                                <div className="col-span-5">Titre</div>
                                <div className="col-span-2">Type</div>
                                <div className="col-span-1">Année</div>
                                <div className="col-span-1">Affiche</div>
                                <div className="col-span-1">Note</div>
                                <div className="col-span-2 text-right">Actions</div>
                            </div>
                            {filteredItems.length === 0 && <div className="px-5 py-8 text-center text-neutral-500 text-sm">Aucun contenu.</div>}
                            {filteredItems.map((m) => (
                                <div key={m.id} className="grid grid-cols-12 px-5 py-4 border-b border-[#1a1a1a] items-center text-sm hover:bg-white/[0.02]">
                                    <div className="col-span-5 flex items-center gap-3">
                                        {m.poster_url && <img src={m.poster_url} alt="" className="w-8 h-12 object-cover rounded" />}
                                        <div>
                                            <div className="text-white">{m.title}</div>
                                            <div className="text-xs text-neutral-500">{(m.genres || []).slice(0, 3).join(" · ")}</div>
                                        </div>
                                    </div>
                                    <div className="col-span-2 text-neutral-300 capitalize">{m.type}</div>
                                    <div className="col-span-1 text-neutral-400">{m.year || "—"}</div>
                                    <div className="col-span-1">
                                        {m.featured ? <span className="text-[#E8D2A6] text-xs">★ #{m.featured_order ?? "—"}</span> : <span className="text-neutral-600 text-xs">—</span>}
                                    </div>
                                    <div className="col-span-1 text-[#E8D2A6]">{m.rating ? m.rating.toFixed(1) : "—"}</div>
                                    <div className="col-span-2 flex items-center gap-1 justify-end">
                                        <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/media/${m.id}/edit`)} data-testid={`edit-${m.id}`} className="text-neutral-400 hover:text-[#E8D2A6] hover:bg-white/5"><Edit size={14} /></Button>
                                        <Button variant="ghost" size="icon" onClick={() => remove(m.id)} data-testid={`delete-${m.id}`} className="text-neutral-400 hover:text-red-400 hover:bg-white/5"><Trash2 size={14} /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="users" className="mt-8">
                        <div className="mb-6 relative max-w-md">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <Input value={userQ} onChange={(e) => setUserQ(e.target.value)} placeholder="Rechercher utilisateur..." className="pl-9 bg-[#111] border-[#262626] text-white" />
                        </div>

                        <div className="border border-[#262626] rounded-lg overflow-hidden">
                            <div className="grid grid-cols-12 text-xs uppercase tracking-widest text-neutral-500 px-5 py-3 border-b border-[#262626] bg-[#0a0a0a]">
                                <div className="col-span-4">Utilisateur</div>
                                <div className="col-span-2">Auth</div>
                                <div className="col-span-2">Abonnement</div>
                                <div className="col-span-2">Fin d&apos;abo</div>
                                <div className="col-span-2 text-right">Actions</div>
                            </div>
                            {filteredUsers.length === 0 && <div className="px-5 py-8 text-center text-neutral-500 text-sm">Aucun utilisateur.</div>}
                            {filteredUsers.map((u) => (
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
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => toggleAdmin(u)}
                                            data-testid={`toggle-admin-${u.user_id}`}
                                            className="text-neutral-400 hover:text-[#E8D2A6] hover:bg-white/5"
                                        >
                                            {u.is_admin ? <ShieldOff size={12} className="mr-1" /> : <Shield size={12} className="mr-1" />}
                                            {u.is_admin ? "Retirer" : "Admin"}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => togglePremium(u)}
                                            data-testid={`toggle-premium-${u.user_id}`}
                                            className={u.premium ? "text-[#E8D2A6] hover:bg-white/5" : "text-neutral-400 hover:text-[#E8D2A6] hover:bg-white/5"}
                                        >
                                            <Crown size={12} className="mr-1" />
                                            {u.premium ? "Retirer Premium" : "Premium"}
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteUser(u)} data-testid={`delete-user-${u.user_id}`} className="text-neutral-400 hover:text-red-400 hover:bg-white/5"><Trash2 size={14} /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="comments" className="mt-8">
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

                    <TabsContent value="wishboard" className="mt-8">
                        <p className="text-sm text-neutral-500 mb-6">Propositions des utilisateurs, triées par nombre de votes. Approuvez, laissez en attente ou refusez.</p>
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
                                        <Button variant="ghost" size="sm" onClick={() => setWishStatus(w, "pending")} className={w.status === "pending" ? "text-white bg-white/10" : "text-neutral-400 hover:text-white hover:bg-white/5"}>
                                            <Clock size={13} className="mr-1" /> En attente
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => setWishStatus(w, "refused")} className={w.status === "refused" ? "text-red-400 bg-red-500/10" : "text-neutral-400 hover:text-red-400 hover:bg-white/5"}>
                                            <X size={13} className="mr-1" /> Refuser
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => deleteWish(w)} data-testid={`delete-wish-${w.id}`} className="text-neutral-400 hover:text-red-400 hover:bg-white/5"><Trash2 size={14} /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </TabsContent>

                    <TabsContent value="coins" className="mt-8">
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

                    <TabsContent value="cagnotte" className="mt-8">
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

                    <TabsContent value="announcements" className="mt-8">
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
                </Tabs>
            </div>
        </div>
    );
}
