import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Send, X, Users, Copy, Crown, Hand, Play, UserMinus, Loader2, Check, Settings, Lock, Globe } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import usePartyRoom from "@/hooks/usePartyRoom";

export default function WatchParty(props) {
    const { room, participants, messages, isHost, started, connected, fatal, pauseRequest, setPauseRequest,
        needsGesture, resume, send } = usePartyRoom(props);
    const [text, setText] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const [pauseAsked, setPauseAsked] = useState(false);
    const list = useRef(null);
    useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages]);
    useEffect(() => {
        if (!pauseAsked) return undefined;
        const timer = setTimeout(() => setPauseAsked(false), 15000);
        return () => clearTimeout(timer);
    }, [pauseAsked]);
    const allReady = connected && participants.length > 0 && participants.every(member => member.ready);
    const leave = () => { if (isHost) send({ type: "close" }); props.onClose?.(); };
    const save = async event => {
        event.preventDefault();
        if (!isHost || saving) return;
        setSaving(true);
        try {
            await api.patch(`/party/${props.code}/settings`, draft);
            setSettingsOpen(false);
            toast.success("Paramètres du salon enregistrés");
        } catch (error) { showError(toast, error, "Impossible de modifier le salon"); }
        finally { setSaving(false); }
    };
    return (
        <aside className="w-full lg:w-96 shrink-0 flex flex-col rounded-2xl border border-[#262626] bg-[#0a0a0a] max-h-[85vh] overflow-hidden" aria-label="Watch Party">
            <div className="p-4 border-b border-[#262626]">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[.2em] text-[#E8D2A6] flex items-center gap-2"><Users size={13} /> Watch Party</span>
                    <div className="flex gap-3">
                        <button type="button" aria-label="Paramètres du salon" aria-expanded={settingsOpen} onClick={() => { setDraft({ name: room?.name || "", is_public: Boolean(room?.is_public), max_members: room?.max_members || 12 }); setSettingsOpen(value => !value); }} className="text-neutral-400 hover:text-[#E8D2A6]"><Settings size={16} /></button>
                        <button type="button" aria-label={isHost ? "Fermer le salon" : "Quitter le salon"} onClick={leave} className="text-neutral-400 hover:text-red-400"><X size={17} /></button>
                    </div>
                </div>
                <h2 className="mt-3 font-display text-xl text-white break-words">{room?.name || "Connexion au salon…"}</h2>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-neutral-400">
                    <span className="flex items-center gap-1.5">{room?.is_public ? <Globe size={12} /> : <Lock size={12} />}{room?.is_public ? "Public" : "Privé"} · {participants.length}/{room?.max_members || 12}</span>
                    <button type="button" aria-label="Copier le code du salon" onClick={() => navigator.clipboard.writeText(props.code).then(() => toast.success("Code copié")).catch(() => toast.error("Copie indisponible"))} className="flex items-center gap-2 text-[#E8D2A6]"><span data-testid="party-code" className="tracking-widest">{props.code}</span><Copy size={12} /></button>
                </div>
                <p className={`mt-2 text-[11px] ${fatal ? "text-red-400" : "text-neutral-500"}`} role={fatal ? "alert" : undefined}>{fatal || (connected ? (isHost ? "Connecté · Vous êtes l’hôte" : "Connecté · Participant") : "Connexion au salon…")}</p>
                <Link to="/room-party" className="mt-2 inline-block text-xs text-neutral-400 hover:text-[#E8D2A6]">Explorer Room Party →</Link>
            </div>
            <div className="overflow-y-auto min-h-0">
                {settingsOpen && draft && <form onSubmit={save} className="p-4 space-y-4 border-b border-[#262626] bg-[#111]" aria-label="Paramètres du salon">
                    <p className="text-xs text-neutral-400">{isHost ? "Le nom est indépendant du code, qui reste fixe." : "Seul l’hôte peut modifier ces paramètres."}</p>
                    <label className="block text-xs text-neutral-300">Nom du salon<input aria-label="Nom du salon" value={draft.name} disabled={!isHost || saving} maxLength={60} required onChange={event => setDraft({ ...draft, name: event.target.value })} className="mt-2 w-full rounded-lg border border-[#333] bg-black px-3 py-2 text-white disabled:opacity-60" /></label>
                    <label className="flex items-center justify-between text-xs text-neutral-300">Salon public<input aria-label="Salon public" type="checkbox" checked={draft.is_public} disabled={!isHost || saving} onChange={event => setDraft({ ...draft, is_public: event.target.checked })} className="accent-[#E8D2A6] h-4 w-4" /></label>
                    <p className="text-[11px] text-neutral-500">{draft.is_public ? "Visible dans Room Party. Les membres connectés peuvent rejoindre." : "Invisible dans Room Party. Partagez le code pour inviter vos proches."}</p>
                    <label className="flex items-center justify-between text-xs text-neutral-300">Places disponibles au total<select aria-label="Capacité du salon" value={draft.max_members} disabled={!isHost || saving} onChange={event => setDraft({ ...draft, max_members: Number(event.target.value) })} className="rounded-lg border border-[#333] bg-black px-3 py-2">{Array.from({ length: 19 }, (_, index) => index + 2).map(value => <option key={value}>{value}</option>)}</select></label>
                    {isHost && <button disabled={saving || !connected} className="w-full rounded-full bg-[#E8D2A6] py-2 text-xs font-semibold text-black disabled:opacity-40">{saving ? "Enregistrement…" : "Enregistrer"}</button>}
                </form>}
                <div className="p-4 border-b border-[#262626] space-y-3">
                    {isHost ? <p className="flex items-center gap-2 text-xs text-neutral-400"><Crown size={13} className="text-[#E8D2A6]" />Vous contrôlez la lecture et les paramètres.</p> : <div className="space-y-2"><p className="text-xs text-neutral-400">Lecture, vitesse et paramètres pilotés par l’hôte. Le volume et le plein écran restent libres.</p><button type="button" disabled={!connected || pauseAsked} onClick={() => { send({ type: "request_pause" }); setPauseAsked(true); }} className="flex items-center gap-2 rounded-full border border-[#333] px-3 py-2 text-xs text-neutral-300 disabled:opacity-40"><Hand size={12} />{pauseAsked ? "Demande envoyée" : "Demander une pause"}</button></div>}
                    {isHost && pauseRequest && <div className="rounded-lg bg-[#E8D2A6]/10 p-3 text-xs text-neutral-200"><p>{pauseRequest} demande une pause.</p><button type="button" className="mt-2 text-[#E8D2A6]" onClick={() => { props.videoRef.current?.pause(); setPauseRequest(null); }}>Mettre en pause</button></div>}
                    {!started && (isHost ? <div><button type="button" disabled={!allReady} onClick={() => send({ type: "start" })} data-testid="party-start" className="w-full flex items-center justify-center gap-2 rounded-full bg-[#E8D2A6] px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-40"><Play size={13} />Démarrer la séance</button><p className="mt-2 text-[11px] text-neutral-500">{allReady ? "Tout le monde est prêt." : "En attente des lecteurs et des vérifications de chacun."}</p></div> : <p className="flex items-center gap-2 text-xs text-neutral-400"><Loader2 size={12} className="animate-spin" />En attente du démarrage par l’hôte.</p>)}
                    {needsGesture && started && <button type="button" onClick={resume} className="w-full rounded-full bg-[#E8D2A6] px-4 py-2 text-xs font-semibold text-black">Activer la lecture synchronisée</button>}
                    <p className="text-[10px] uppercase tracking-widest text-neutral-500">Participants · {participants.length}</p>
                    {participants.map(member => <div key={member.user_id} className="flex items-center gap-2 rounded-lg border border-[#262626] px-3 py-2 text-xs text-neutral-300">{member.is_host && <Crown size={12} className="text-[#E8D2A6]" />}<span className="flex-1 min-w-0 truncate">{member.name}</span>{member.ready ? <Check size={13} aria-label="Prêt" className="text-emerald-400" /> : <Loader2 size={13} aria-label="Préparation" className="animate-spin text-[#E8D2A6]" />}{isHost && !member.is_host && <button type="button" aria-label={`Retirer ${member.name}`} onClick={() => send({ type: "kick", user_id: member.user_id })} className="text-neutral-500 hover:text-red-400"><UserMinus size={13} /></button>}</div>)}
                </div>
                <div ref={list} className="min-h-24 max-h-64 overflow-y-auto p-4 space-y-3" role="log" aria-label="Messages du salon" aria-live="polite">
                    {!messages.length && <p className="text-xs text-neutral-600">La séance se partage aussi ici. Dites bonsoir !</p>}
                    {messages.map((message, index) => <div key={index} className="text-xs"><span className="text-[#E8D2A6]">{message.name}</span><p className="mt-1 text-neutral-300 break-words">{message.text}</p></div>)}
                </div>
            </div>
            <form className="flex gap-2 border-t border-[#262626] p-3" onSubmit={event => { event.preventDefault(); if (text.trim()) { send({ type: "chat", text }); setText(""); } }}>
                <input aria-label="Message" maxLength={500} value={text} onChange={event => setText(event.target.value)} disabled={!connected} placeholder="Un message au salon…" className="min-w-0 flex-1 rounded-full bg-[#161616] px-4 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-[#E8D2A6]" />
                <button aria-label="Envoyer le message" disabled={!connected || !text.trim()} className="rounded-full bg-[#E8D2A6] p-2.5 text-black disabled:opacity-40"><Send size={15} /></button>
            </form>
        </aside>
    );
}
