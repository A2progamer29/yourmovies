import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronUp, Plus, X, Check, Clock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/Header";

const POSTER_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='2' height='3'%3E%3Crect width='100%25' height='100%25' fill='%230a0a0a'/%3E%3C/svg%3E";

const STATUS = {
    pending: { label: "En attente", cls: "text-neutral-300 border-[#262626]", icon: <Clock size={11} /> },
    approved: { label: "Approuvé", cls: "text-[#E8D2A6] border-[#E8D2A6]/40", icon: <Check size={11} /> },
    refused: { label: "Refusé", cls: "text-red-400 border-red-500/30", icon: <X size={11} /> },
};

export default function WishboardPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [adding, setAdding] = useState(false);
    const timer = useRef(null);

    const load = async () => {
        try {
            const r = await api.get("/wishboard");
            setItems(r.data);
        } catch (e) { showError(toast, e, "Chargement impossible"); }
    };

    useEffect(() => { load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!modalOpen) return;
        if (timer.current) clearTimeout(timer.current);
        const query = q.trim();
        if (!query) { setResults([]); return; }
        timer.current = setTimeout(async () => {
            setSearching(true);
            try {
                const r = await api.get(`/imdb/search?q=${encodeURIComponent(query)}`, { silent: true });
                setResults(r.data || []);
            } catch (e) {
                setResults([]);
                showError(toast, e, "Recherche IMDb indisponible");
            } finally {
                setSearching(false);
            }
        }, 400);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [q, modalOpen]);

    const openModal = () => {
        if (!user) { navigate("/login"); return; }
        setQ(""); setResults([]); setModalOpen(true);
    };

    const addWish = async (r) => {
        setAdding(true);
        try {
            await api.post("/wishboard", {
                imdb_id: r.imdb_id,
                title: r.title,
                year: r.year,
                type: r.type,
                poster_url: r.poster_url,
            });
            toast.success("Ajouté au Wishboard");
            setModalOpen(false);
            load();
        } catch (e) {
            showError(toast, e, "Ajout impossible");
        } finally {
            setAdding(false);
        }
    };

    const vote = async (w) => {
        if (!user) { navigate("/login"); return; }
        try {
            const r = await api.post(`/wishboard/${w.id}/vote`);
            setItems((list) => list.map((it) => it.id === w.id ? { ...it, voted: r.data.voted, vote_count: r.data.vote_count } : it));
        } catch (e) { showError(toast, e, "Vote impossible"); }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <div className="noise-overlay" />
            <Header />

            <div className="max-w-5xl mx-auto px-6 py-12">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
                    <div>
                        <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2 flex items-center gap-2"><Sparkles size={14} /> Wishboard</div>
                        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter">Proposez le prochain titre</h1>
                        <p className="text-neutral-400 mt-3 max-w-xl">Cherchez un film, une série ou un anime absent du catalogue et votez. Les plus demandés sont ajoutés en priorité.</p>
                    </div>
                    <Button onClick={openModal} data-testid="wishboard-add-btn" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-12 px-6 font-semibold shrink-0">
                        <Plus size={18} className="mr-2" /> Proposer un titre
                    </Button>
                </div>

                {items.length === 0 ? (
                    <div className="p-10 rounded-lg border border-[#262626] bg-[#0a0a0a] text-center text-neutral-500">
                        Aucune proposition pour l'instant. Soyez le premier à en ajouter une.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {items.map((w, i) => {
                            const st = STATUS[w.status] || STATUS.pending;
                            return (
                                <div key={w.id} className="flex items-center gap-4 p-3 sm:p-4 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a]">
                                    <div className="text-neutral-600 font-display text-lg w-6 text-center shrink-0">{i + 1}</div>
                                    <img
                                        src={w.poster_url || POSTER_FALLBACK}
                                        alt={w.title}
                                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = POSTER_FALLBACK; }}
                                        className="w-12 h-[72px] object-cover rounded bg-[#111] shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-white font-medium truncate">{w.title}</div>
                                        <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                            {w.year && <span>{w.year}</span>}
                                            {w.type && <span className="capitalize">· {w.type}</span>}
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${st.cls}`}>{st.icon} {st.label}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => vote(w)}
                                        data-testid={`wishboard-vote-${w.id}`}
                                        className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg border transition-colors shrink-0 ${w.voted ? "bg-[#E8D2A6] text-black border-[#E8D2A6]" : "bg-[#111] text-white border-[#262626] hover:border-[#E8D2A6]/60"}`}
                                    >
                                        <ChevronUp size={18} />
                                        <span className="text-sm font-semibold leading-none">{w.vote_count}</span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {modalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4" onClick={() => setModalOpen(false)}>
                    <div className="w-full max-w-xl bg-[#0a0a0a] border border-[#262626] rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262626]">
                            <Search size={18} className="text-[#E8D2A6]" />
                            <Input
                                autoFocus
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                data-testid="wishboard-search-input"
                                placeholder="Titre du film, série ou anime (IMDb)…"
                                className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-neutral-500 focus-visible:ring-0"
                            />
                            <button onClick={() => setModalOpen(false)} className="text-neutral-500 hover:text-white"><X size={18} /></button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto">
                            {searching ? (
                                <div className="px-4 py-10 text-center text-sm text-neutral-500">Recherche…</div>
                            ) : results.length === 0 ? (
                                <div className="px-4 py-10 text-center text-sm text-neutral-500">
                                    {q.trim() ? "Aucun résultat IMDb" : "Tapez un titre pour rechercher sur IMDb"}
                                </div>
                            ) : (
                                results.map((r) => (
                                    <div key={r.imdb_id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                                        {r.poster_url
                                            ? <img src={r.poster_url} alt="" className="w-9 h-12 object-cover rounded bg-[#111] shrink-0" />
                                            : <div className="w-9 h-12 rounded bg-[#111] shrink-0" />}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm text-white truncate">{r.title}</div>
                                            <div className="text-xs text-neutral-500 capitalize">{r.type}{r.year ? ` · ${r.year}` : ""}</div>
                                        </div>
                                        <Button
                                            onClick={() => addWish(r)}
                                            disabled={adding}
                                            className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-8 px-3 text-xs font-semibold shrink-0"
                                        >
                                            <Plus size={14} className="mr-1" /> Ajouter
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
