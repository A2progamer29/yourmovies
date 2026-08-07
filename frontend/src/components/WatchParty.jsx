import React, { useEffect, useRef, useState } from "react";
import { Send, X, Users, Copy, Crown, MessageCircle } from "lucide-react";
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
        const drift = Math.abs((v.currentTime || 0) - state.position_seconds);
        if (drift > 1.5) {
            try { v.currentTime = state.position_seconds; } catch { }
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
        const interval = setInterval(() => { if (!v.paused) push(); }, 4000);
        return () => {
            v.removeEventListener("play", push);
            v.removeEventListener("pause", push);
            v.removeEventListener("seeked", push);
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

            <div className="p-4 border-b border-[#262626]">
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
