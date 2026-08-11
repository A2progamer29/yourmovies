import React, { useEffect, useRef, useState } from "react";
import { Send, X, Users, Copy, Crown, MessageCircle, Hand } from "lucide-react";
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
export default function WatchParty({ code, currentUserId, profileId, profileName, videoRef, onClose, token }) {
    const [participants, setParticipants] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [connected, setConnected] = useState(false);
    const [pauseRequest, setPauseRequest] = useState(null);
    const [pauseAsked, setPauseAsked] = useState(false);
    const wsRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        const backend = process.env.REACT_APP_BACKEND_URL;
        const wsProto = backend.startsWith("https") ? "wss" : "ws";
        const wsBase = backend.replace(/^https?:\/\//, "");
        const url = `${wsProto}://${wsBase}/api/party/${code}/ws`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            if (!token) {
                ws.close(4401, "Authentification requise");
                return;
            }
            ws.send(JSON.stringify({ type: "auth", token, profile: profileId || null }));
            setConnected(true);
        };
        ws.onclose = () => setConnected(false);
        ws.onerror = () => setConnected(false);

        ws.onmessage = (ev) => {
            let data;
            try { data = JSON.parse(ev.data); } catch { return; }
            if (data.type === "hello") {
                setIsHost(!!data.you?.is_host);
                if (data.state && videoRef?.current && !data.you?.is_host) {
                    applyState(data.state);
                }
            } else if (data.type === "participants") {
                setParticipants(data.participants);
            } else if (data.type === "sync") {
                if (data.host_id !== currentUserId) applyState(data.state);
            } else if (data.type === "pause_request") {
                setPauseRequest({ name: data.name, at: Date.now() });
                window.setTimeout(() => setPauseRequest(null), 12000);
            } else if (data.type === "chat") {
                setMessages((m) => [...m, data].slice(-100));
            }
        };

        return () => { try { ws.close(); } catch { } };
        // eslint-disable-next-line
    }, [code]);

    const applyState = (state) => {
        const v = videoRef?.current;
        if (!v || !state) return;
        // Compensation de latence : depuis l'envoi de l'hôte, la vidéo a continué
        // d'avancer. On vise donc la position attendue « maintenant ».
        // Borné à 5 s : l'hôte publie toutes les 2 s, donc l'écart réel est petit.
        // Sans cette borne, une horloge client décalée enverrait la lecture n'importe où.
        const sentAt = Number(state.updated_at) || 0;
        const elapsed = state.playing && sentAt > 0
            ? Math.min(5, Math.max(0, Date.now() / 1000 - sentAt))
            : 0;
        const target = Number(state.position_seconds || 0) + elapsed;
        const drift = Math.abs((v.currentTime || 0) - target);
        if (drift > 0.6) {
            try { v.currentTime = target; } catch { }
        }
        if (state.playing && v.paused) {
            v.play().catch(() => { });
        } else if (!state.playing && !v.paused) {
            v.pause();
        }
    };

    // If host, publish state on play/pause/seek
    useEffect(() => {
        if (!isHost || !videoRef?.current || !wsRef.current) return;
        const v = videoRef.current;
        const push = () => {
            if (wsRef.current?.readyState !== 1) return;
            wsRef.current.send(JSON.stringify({
                type: "sync",
                position_seconds: v.currentTime || 0,
                playing: !v.paused,
            }));
        };
        v.addEventListener("play", push);
        v.addEventListener("pause", push);
        v.addEventListener("seeked", push);
        v.addEventListener("ratechange", push);
        const interval = setInterval(() => { if (!v.paused) push(); }, 2000);
        return () => {
            v.removeEventListener("play", push);
            v.removeEventListener("pause", push);
            v.removeEventListener("seeked", push);
            v.removeEventListener("ratechange", push);
            clearInterval(interval);
        };
    }, [isHost, videoRef]);

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages]);

    const send = () => {
        if (!text.trim() || wsRef.current?.readyState !== 1) return;
        wsRef.current.send(JSON.stringify({ type: "chat", text: text.trim() }));
        setText("");
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
                    <div className="text-[10px] text-neutral-500 mt-1">
                        {connected ? "Connecté" : "Reconnexion..."} · {isHost ? "Vous êtes l'hôte" : "Participant"}
                    </div>
                </div>
                <button onClick={onClose} data-testid="close-party" className="text-neutral-400 hover:text-red-400"><X size={16} /></button>
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
                                onClick={() => { try { videoRef?.current?.pause(); } catch { } setPauseRequest(null); }}
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
                <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">Participants ({participants.length})</div>
                <div className="flex flex-wrap gap-2">
                    {participants.map((p) => (
                        <div key={p.user_id} className={`text-xs px-2.5 py-1 rounded-full border ${p.is_host ? "border-[#E8D2A6]/50 text-[#E8D2A6] bg-[#E8D2A6]/5" : "border-[#262626] text-neutral-300"}`}>
                            {p.is_host && <Crown size={10} className="inline mr-1" />}
                            {p.name}
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
