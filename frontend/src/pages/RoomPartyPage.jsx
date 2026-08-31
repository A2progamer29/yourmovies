import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Globe, Lock, Users, Search, RefreshCw, Clapperboard } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { partyPath, validPartyCode } from "@/lib/partySync";

export default function RoomPartyPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [query, setQuery] = useState("");
    const [code, setCode] = useState("");
    const [joining, setJoining] = useState(null);
    const refresh = useCallback(async (signal) => {
        try {
            const response = await api.get("/party/public", { signal, silent: true });
            if (signal?.aborted) return;
            setRooms(response.data.rooms || []);
            setError(false);
        } catch { if (!signal?.aborted) setError(true); }
        finally { if (!signal?.aborted) setLoading(false); }
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        refresh(controller.signal);
        const timer = setInterval(() => { if (!document.hidden) refresh(controller.signal); }, 15000);
        return () => { controller.abort(); clearInterval(timer); };
    }, [refresh]);
    const join = async value => {
        if (!user) { navigate("/login"); return; }
        if (!validPartyCode(value)) { toast.error("Saisissez un code généré par Watch Party."); return; }
        if (joining) return;
        setJoining(value);
        try {
            const response = await api.get(`/party/${value}`);
            navigate(partyPath(response.data));
        } catch (failure) { showError(toast, failure, "Ce salon n’est plus disponible"); }
        finally { setJoining(null); }
    };
    const visible = rooms.filter(room => `${room.name} ${room.media?.title}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    return <div className="min-h-screen bg-[#050505] text-white">
        <Header />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 sm:py-16">
            <Link to="/browse" className="text-xs text-neutral-400 hover:text-[#E8D2A6]">← Retour au catalogue</Link>
            <section className="mt-8 rounded-3xl border border-[#E8D2A6]/20 bg-gradient-to-br from-[#E8D2A6]/10 via-[#101010] to-[#070707] p-6 sm:p-10">
                <div className="text-[10px] uppercase tracking-[.3em] text-[#E8D2A6] flex items-center gap-2"><Globe size={13} /> Le cinéma, ensemble</div>
                <div className="mt-5 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                    <div className="max-w-xl"><h1 className="font-display text-4xl sm:text-6xl tracking-tight">Room Party<span className="text-[#E8D2A6]">.</span></h1><p className="mt-4 text-sm sm:text-base leading-relaxed text-neutral-400">Choisissez une séance publique, installez-vous et regardez au même rythme. L’hôte s’occupe de la lecture.</p></div>
                    <Link to="/browse" className="self-start lg:self-auto flex items-center justify-center gap-3 rounded-full bg-[#E8D2A6] px-6 py-3 text-sm font-semibold text-black hover:bg-[#D4BB8B]">Créer une séance <ArrowRight size={16} /></Link>
                </div>
            </section>
            <div className="mt-8 flex flex-col md:flex-row gap-4">
                <label className="flex flex-1 items-center gap-3 rounded-full border border-[#262626] bg-[#0c0c0c] px-5 py-3"><Search size={16} className="text-neutral-500" /><input aria-label="Rechercher une séance" value={query} onChange={event => setQuery(event.target.value)} placeholder="Un film, une série, un salon…" className="w-full min-w-0 bg-transparent text-sm outline-none" /></label>
                <form onSubmit={event => { event.preventDefault(); join(code); }} className="flex items-center gap-3 rounded-full border border-[#262626] bg-[#0c0c0c] pl-5 pr-2 py-2"><Lock size={14} className="shrink-0 text-neutral-500" /><input aria-label="Code d’invitation" value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} maxLength={8} placeholder="Code d’invitation" className="min-w-0 w-36 bg-transparent text-xs tracking-wider outline-none" /><button disabled={Boolean(joining) || !code} className="rounded-full bg-[#202020] px-4 py-2 text-xs hover:text-[#E8D2A6] disabled:opacity-40">Rejoindre</button></form>
            </div>
            <div className="mt-10 mb-5 flex items-center justify-between"><h2 className="font-display text-xl">Séances publiques <span className="ml-2 text-sm text-neutral-500">{visible.length}</span></h2><button type="button" aria-label="Actualiser les salons" onClick={() => refresh()} className="p-2 text-neutral-500 hover:text-[#E8D2A6]"><RefreshCw size={16} /></button></div>
            {error ? <div role="alert" className="rounded-2xl border border-[#333] p-8 text-center text-sm text-neutral-400">Impossible de charger les salons. <button onClick={() => refresh()} className="text-[#E8D2A6] underline">Réessayer</button></div> : loading ? <p className="py-16 text-center text-sm text-neutral-500" role="status">Recherche des séances…</p> : !visible.length ? <div className="rounded-2xl border border-dashed border-[#333] py-16 px-6 text-center"><Clapperboard size={28} className="mx-auto text-[#E8D2A6]" /><h3 className="mt-4 font-display text-xl">{query ? "Aucune séance correspondante" : "La prochaine séance peut être la vôtre"}</h3><p className="mx-auto mt-3 max-w-md text-sm text-neutral-500">Lancez une Watch Party depuis un film, une série ou un anime, puis activez « Salon public » dans ses paramètres.</p></div> : <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {visible.map(room => {
                    const full = room.participants_count >= room.max_members;
                    return <article key={room.code} className="overflow-hidden rounded-2xl border border-[#262626] bg-[#0b0b0b] transition-colors hover:border-[#E8D2A6]/40">
                        <div className="relative h-44 overflow-hidden bg-[#151515]">{room.media?.poster_url && <img src={room.media.poster_url} alt="" className="h-full w-full object-cover object-[center_25%] opacity-60" loading="lazy" />}<div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] to-transparent" /><span className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[10px] uppercase tracking-widest text-[#E8D2A6]">{room.started ? "En cours" : "Bientôt à l’écran"}</span><span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs"><Users size={12} />{room.participants_count}/{room.max_members}</span><p className="absolute bottom-3 left-5 right-5 truncate text-xs text-neutral-400">{room.media?.title}{room.state?.episode_number ? ` · S${room.state.season_number} E${room.state.episode_number}` : ""}</p></div>
                        <div className="p-5 pt-1"><h3 className="truncate font-display text-xl" title={room.name}>{room.name}</h3><div className="mt-5 flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-[11px] text-neutral-500"><Globe size={12} />Salon public</span><button disabled={full || Boolean(joining)} onClick={() => join(room.code)} className="flex items-center gap-2 rounded-full bg-[#E8D2A6] px-4 py-2 text-xs font-semibold text-black hover:bg-[#D4BB8B] disabled:opacity-40">{full ? "Complet" : joining === room.code ? "Connexion…" : "Rejoindre"}<ArrowRight size={13} /></button></div></div>
                    </article>;
                })}
            </div>}
            <p className="mt-8 text-center text-xs leading-relaxed text-neutral-600">Les salons privés n’apparaissent jamais ici. Un compte est nécessaire pour rejoindre une séance.</p>
        </div>
    </div>;
}
