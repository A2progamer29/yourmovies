import React, { useEffect, useRef, useState } from "react";
import { Send, X, Users, Copy, Crown, MessageCircle, Hand, Play, UserMinus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Watch Party sidebar — connects to the party WebSocket, syncs playback,
 * lists participants and shows a chat panel.
 *
 * Props:
 *   code: string
 *   currentUserId: string
 *   videoRef: React ref to <video>
 *   onHostSync: (state) => void  called when host publishes a sync (unused if you attach directly to videoRef)
 *   onClose: () => void
 *   token?: string (JWT to authenticate)
 */
export default function WatchParty({ code, currentUserId, profileId, profileName, videoRef, bunnyPlayerRef, onEpisodeSync, onHostChange, currentEpisode, onClose, token, adsDone, onStartedChange }) {
    // Contrôleur unifié : la lecture se fait soit dans un <video>, soit dans
    // l'iframe Bunny piloté par playerjs. Sans cette abstraction, rien n'était
    // synchronisé en lecture Bunny (videoRef restait vide).
    const ctl = () => {
        const v = videoRef?.current;
        if (v) return {
            kind: "video",
            play: () => v.play().catch(() => {}),
            pause: () => v.pause(),
            seek: (t) => { try { v.currentTime = t; } catch {} },
            time: () => Promise.resolve(v.currentTime || 0),
            paused: () => v.paused,
            on: (ev, cb) => v.addEventListener(ev, cb),
            off: (ev, cb) => v.removeEventListener(ev, cb),
        };
        const p = bunnyPlayerRef?.current;
        if (p) return {
            kind: "bunny",
            play: () => { try { p.play(); } catch {} },
            pause: () => { try { p.pause(); } catch {} },
            seek: (t) => { try { p.setCurrentTime(t); } catch {} },
            time: () => new Promise((res) => { try { p.getCurrentTime((t) => res(Number(t) || 0)); } catch { res(0); } }),
            paused: () => pausedRef.current,
            on: (ev, cb) => { try { p.on(ev, cb); } catch {} },
            off: (ev, cb) => { try { p.off(ev, cb); } catch {} },
        };
        return null;
    };
    const [participants, setParticipants] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [connected, setConnected] = useState(false);
    const [pauseRequest, setPauseRequest] = useState(null);
    const [pauseAsked, setPauseAsked] = useState(false);
    const [fatal, setFatal] = useState(null);
    const [playerReady, setPlayerReady] = useState(false);
    const [started, setStarted] = useState(false);
    const wsRef = useRef(null);
    const pausedRef = useRef(true);
    const lastStateRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        const backend = process.env.REACT_APP_BACKEND_URL;
        const wsProto = backend.startsWith("https") ? "wss" : "ws";
        const wsBase = backend.replace(/^https?:\/\//, "");
        const url = `${wsProto}://${wsBase}/api/party/${code}/ws`;
        let stopped = false;
        let attempt = 0;
        let retryTimer = null;
        let ws;

        const connect = () => {
        ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            if (!token) {
                ws.close(4401, "Authentification requise");
                return;
            }
            attempt = 0;
            ws.send(JSON.stringify({ type: "auth", token, profile: profileId || null }));
            setConnected(true);
        };
        // Reconnexion automatique : sans elle, un simple redemarrage du serveur
        // coupait le salon definitivement jusqu'au rechargement de la page.
        ws.onclose = (event) => {
            setConnected(false);
            if (stopped) return;
            if ([4401, 4403, 4404].includes(event?.code)) {
                setFatal(event.code === 4404 ? "Ce salon n'existe plus." : "Accès au salon refusé.");
                return;
            }
            attempt += 1;
            if (attempt > 8) return;
            retryTimer = window.setTimeout(connect, Math.min(8000, 800 * attempt));
        };
        ws.onerror = () => setConnected(false);

        ws.onmessage = (ev) => {
            let data;
            try { data = JSON.parse(ev.data); } catch { return; }
            if (data.type === "hello") {
                setFatal(null);
                setIsHost(!!data.you?.is_host);
                onHostChange?.(!!data.you?.is_host);
                setStarted(!!data.started);
                onStartedChange?.(!!data.started);
                if (data.state && !data.you?.is_host) applyState(data.state);
            } else if (data.type === "participants") {
                setParticipants(data.participants);
            } else if (data.type === "sync") {
                if (data.host_id !== currentUserId) applyState(data.state);
            } else if (data.type === "episode") {
                onEpisodeSync?.(data.season_number, data.episode_number);
            } else if (data.type === "pause_request") {
                setPauseRequest({ name: data.name, at: Date.now() });
                window.setTimeout(() => setPauseRequest(null), 12000);
            } else if (data.type === "started") {
                setStarted(true);
                onStartedChange?.(true);
            } else if (data.type === "kicked") {
                stopped = true;
                toast.error("L'hôte vous a retiré du salon.");
                onClose?.();
            } else if (data.type === "party_closed") {
                stopped = true;
                toast.info(data.reason || "Le salon a été fermé.");
                onClose?.();
            } else if (data.type === "chat") {
                setMessages((m) => [...m, data].slice(-100));
            }
        };

        };

        connect();
        return () => {
            stopped = true;
            if (retryTimer) window.clearTimeout(retryTimer);
            try { ws?.close(); } catch { }
        };
        // eslint-disable-next-line
    }, [code]);

    const applyState = async (state) => {
        const c = ctl();
        if (!c || !state) return;
        lastStateRef.current = state;
        // Compensation de latence, bornée à 5 s (l'hôte publie toutes les 2 s) :
        // sans borne, une horloge client décalée enverrait la lecture n'importe où.
        const sentAt = Number(state.updated_at) || 0;
        const elapsed = state.playing && sentAt > 0
            ? Math.min(5, Math.max(0, Date.now() / 1000 - sentAt))
            : 0;
        const target = Number(state.position_seconds || 0) + elapsed;
        const current = await c.time();
        // Seuil volontairement large : corriger de petits ecarts en continu
        // rendrait la lecture saccadee.
        if (Math.abs(current - target) > 1.5) c.seek(target);
        if (state.playing) c.play(); else c.pause();
    };

    // Le lecteur (surtout l'iframe Bunny) n'est pas prêt au montage : sans cette
    // détection, l'hôte ne publiait jamais rien et il fallait recharger la page.
    useEffect(() => {
        const probe = setInterval(() => setPlayerReady(Boolean(ctl())), 500);
        return () => clearInterval(probe);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Seul l'hôte publie. Les participants ne s'écoutent pas eux-mêmes : ils sont
    // réalignés à la réception d'un « sync », ce qui évite toute boucle de
    // repositionnement (c'était la cause des saccades).
    useEffect(() => {
        const c = ctl();
        if (!c || !isHost) return undefined;

        const markPaused = () => { pausedRef.current = true; };
        const markPlaying = () => { pausedRef.current = false; };
        c.on("pause", markPaused);
        c.on("play", markPlaying);

        const push = async () => {
            if (wsRef.current?.readyState !== 1) return;
            const position = await c.time();
            wsRef.current.send(JSON.stringify({
                type: "sync",
                position_seconds: position,
                playing: !c.paused(),
            }));
        };
        c.on("play", push);
        c.on("pause", push);
        c.on("seeked", push);
        const interval = setInterval(push, 2000);
        push();
        return () => {
            c.off("pause", markPaused); c.off("play", markPlaying);
            c.off("play", push); c.off("pause", push); c.off("seeked", push);
            clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isHost, connected, playerReady]);

    // Un participant dont le lecteur vient d'être prêt réclame l'état courant :
    // l'état reçu à l'arrivée dans le salon était perdu si l'iframe n'existait
    // pas encore, et il fallait recharger la page pour se resynchroniser.
    useEffect(() => {
        if (isHost || !playerReady || !connected) return;
        if (wsRef.current?.readyState !== 1) return;
        wsRef.current.send(JSON.stringify({ type: "request_state" }));
    }, [isHost, playerReady, connected]);

    // Tant que l'hôte n'a pas lancé, personne ne lit : sans ce verrou la vidéo
    // tournerait derrière l'écran d'attente et les participants la
    // découvriraient déjà entamée.
    useEffect(() => {
        if (!playerReady) return undefined;
        const c = ctl();
        if (!c) return undefined;
        if (started) {
            if (isHost) { try { c.play(); } catch { } }
            return undefined;
        }
        const hold = () => { try { c.pause(); } catch { } };
        hold();
        const timer = setInterval(hold, 1000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [started, playerReady, isHost]);

    // Statut publicitaire : l'hôte doit savoir qui a fini avant de lancer.
    useEffect(() => {
        if (!connected || wsRef.current?.readyState !== 1) return;
        wsRef.current.send(JSON.stringify({ type: "ad_status", done: !!adsDone }));
    }, [adsDone, connected]);

    // L'hôte annonce le changement d'épisode : tout le salon suit.
    useEffect(() => {
        if (!isHost || !currentEpisode || wsRef.current?.readyState !== 1) return;
        wsRef.current.send(JSON.stringify({
            type: "episode",
            season_number: currentEpisode.season_number,
            episode_number: currentEpisode.episode_number,
        }));
    }, [isHost, currentEpisode?.season_number, currentEpisode?.episode_number]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages]);

    const send = () => {
        if (!text.trim() || wsRef.current?.readyState !== 1) return;
        wsRef.current.send(JSON.stringify({ type: "chat", text: text.trim() }));
        setText("");
    };

    // Le bouton de pause de l'hôte passait par videoRef, vide en lecture Bunny :
    // il ne mettait donc jamais rien en pause.
    const hostPause = () => {
        const c = ctl();
        try { c?.pause(); } catch { }
        setPauseRequest(null);
    };

    // L'hôte ferme explicitement : sans ce message, le salon ne se refermerait
    // qu'au bout du délai de grâce prévu pour les coupures réseau.
    const leave = () => {
        if (isHost && wsRef.current?.readyState === 1) {
            try { wsRef.current.send(JSON.stringify({ type: "close" })); } catch { }
        }
        onClose?.();
    };

    const kick = (userId) => {
        if (wsRef.current?.readyState !== 1) return;
        wsRef.current.send(JSON.stringify({ type: "kick", user_id: userId }));
    };

    const allReady = participants.length > 0 && participants.every((p) => !p.needs_ads || p.ads_done);

    const startSession = () => {
        if (wsRef.current?.readyState !== 1 || !allReady) return;
        wsRef.current.send(JSON.stringify({ type: "start" }));
    };

    const copyCode = () => {
        navigator.clipboard.writeText(code);
        toast.success("Code copié");
    };

    return (
        <div className="w-full lg:w-96 shrink-0 flex flex-col rounded-lg border border-[#262626] bg-[#0a0a0a] max-h-[80vh]">
            <div className="p-4 border-b border-[#262626] flex items-center justify-between">
                <div>
                    <div className="text-xs uppercase tracking-widest text-[#E8D2A6] flex items-center gap-1.5"><Users size={12} /> Watch Party</div>
                    <div className="flex items-center gap-2 mt-1">
                        <span data-testid="party-code" className="font-display text-2xl tracking-widest text-white">{code}</span>
                        <button onClick={copyCode} data-testid="copy-party-code" className="text-neutral-500 hover:text-[#E8D2A6]"><Copy size={12} /></button>
                    </div>
                    <div className="text-[10px] mt-1">
                        {fatal
                            ? <span className="text-red-400">{fatal}</span>
                            : <span className="text-neutral-500">
                                {connected ? "Connecté" : "Reconnexion…"} · {isHost ? "Vous êtes l'hôte" : "Participant"}
                            </span>}
                    </div>
                </div>
                <button onClick={leave} data-testid="close-party" className="text-neutral-400 hover:text-red-400"><X size={16} /></button>
            </div>

            <div className="border-b border-[#262626] p-4">
                {isHost ? (
                    pauseRequest ? (
                        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#E8D2A6]/40 bg-[#171208] px-3 py-2.5 text-xs text-neutral-200">
                            <Hand size={14} className="shrink-0 text-[#E8D2A6]" />
                            <span className="min-w-0 flex-1">
                                <span className="text-white">{pauseRequest.name}</span> demande une pause.
                            </span>
                            <button
                                type="button"
                                onClick={hostPause}
                                className="shrink-0 rounded-full bg-[#E8D2A6] px-3 py-1 text-[11px] font-semibold text-black"
                            >
                                Mettre en pause
                            </button>
                        </div>
                    ) : (
                        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-neutral-500">
                            <Crown size={12} className="text-[#E8D2A6]" /> Vous contrôlez la lecture pour tout le salon.
                        </div>
                    )
                ) : (
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-neutral-500">La lecture est pilotée par l&apos;hôte.</span>
                        <button
                            type="button"
                            disabled={pauseAsked}
                            onClick={() => {
                                if (wsRef.current?.readyState !== 1) return;
                                wsRef.current.send(JSON.stringify({ type: "request_pause" }));
                                setPauseAsked(true);
                                window.setTimeout(() => setPauseAsked(false), 15000);
                            }}
                            data-testid="party-request-pause"
                            className="shrink-0 rounded-full border border-[#262626] px-3 py-1.5 text-[11px] text-neutral-300 transition-colors hover:border-[#E8D2A6] hover:text-[#E8D2A6] disabled:opacity-40"
                        >
                            {pauseAsked ? "Demande envoyée" : "Demander une pause"}
                        </button>
                    </div>
                )}
                {!started && (
                    <div className="mb-3 rounded-lg border border-[#262626] bg-[#111] p-3">
                        {isHost ? (
                            <>
                                <button
                                    type="button"
                                    onClick={startSession}
                                    disabled={!allReady}
                                    data-testid="party-start"
                                    className="flex w-full items-center justify-center gap-2 rounded-full bg-[#E8D2A6] px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-[#D4BB8B] disabled:cursor-not-allowed disabled:bg-[#262626] disabled:text-neutral-500"
                                >
                                    <Play size={13} /> Démarrer la séance
                                </button>
                                <p className="mt-2 text-center text-[10px] leading-relaxed text-neutral-500">
                                    {allReady
                                        ? "Tout le monde est prêt."
                                        : "En attente : certains participants regardent encore leurs publicités."}
                                </p>
                            </>
                        ) : (
                            <p className="flex items-center justify-center gap-2 text-[11px] text-neutral-400">
                                <Loader2 size={12} className="animate-spin text-[#E8D2A6]" />
                                En attente du démarrage par l&apos;hôte.
                            </p>
                        )}
                    </div>
                )}
                <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">Participants ({participants.length})</div>
                <div className="space-y-1.5">
                    {participants.map((p) => (
                        <div key={p.user_id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${p.is_host ? "border-[#E8D2A6]/40 bg-[#E8D2A6]/5 text-[#E8D2A6]" : "border-[#262626] text-neutral-300"}`}>
                            {p.is_host && <Crown size={11} className="shrink-0" />}
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            {!p.needs_ads ? (
                                <span className="shrink-0 text-[10px] text-neutral-500">Premium</span>
                            ) : p.ads_done ? (
                                <span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-400"><Check size={10} /> Prêt</span>
                            ) : (
                                <span className="flex shrink-0 items-center gap-1 text-[10px] text-[#E8D2A6]"><Loader2 size={10} className="animate-spin" /> Publicité</span>
                            )}
                            {isHost && !p.is_host && (
                                <button
                                    type="button"
                                    onClick={() => kick(p.user_id)}
                                    title={`Retirer ${p.name} du salon`}
                                    data-testid="party-kick"
                                    className="shrink-0 text-neutral-600 transition-colors hover:text-red-400"
                                >
                                    <UserMinus size={13} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[240px]">
                {messages.length === 0 ? (
                    <div className="text-center py-10 text-neutral-500 text-sm">
                        <MessageCircle size={20} className="mx-auto mb-2 opacity-50" />
                        Aucun message. Dites bonjour !
                    </div>
                ) : (
                    messages.map((m, i) => (
                        <div key={i} className={`text-sm ${m.user_id === currentUserId ? "text-right" : ""}`}>
                            <div className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 ${m.user_id === currentUserId ? "bg-[#E8D2A6] text-black" : "bg-[#1a1a1a] text-white"}`}>
                                {m.user_id !== currentUserId && <div className="text-[10px] opacity-70 mb-0.5">{m.name}</div>}
                                <div>{m.text}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-3 border-t border-[#262626] flex gap-2">
                <input
                    data-testid="party-chat-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder="Écrire un message..."
                    className="flex-1 bg-[#111] border border-[#262626] rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-[#E8D2A6]"
                    maxLength={500}
                />
                <button
                    onClick={send}
                    data-testid="party-chat-send"
                    className="w-10 h-10 rounded-md bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] flex items-center justify-center"
                >
                    <Send size={14} />
                </button>
            </div>
        </div>
    );
}
