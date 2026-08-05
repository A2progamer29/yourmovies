import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Navigate, Link } from "react-router-dom";
import { ChevronLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { showError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

export default function ConversationPage() {
    const { id } = useParams();
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [other, setOther] = useState(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const listRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const r = await api.get(`/messages/${id}`, { silent: true });
            setOther(r.data.other);
            setMessages(r.data.messages || []);
        } catch (e) {
            if (e?.response?.status === 404) setNotFound(true);
        }
    }, [id]);

    useEffect(() => {
        if (!user) return;
        load();
        const t = setInterval(load, 4000);
        return () => clearInterval(t);
    }, [user, load]);

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;

    const send = async () => {
        const t = text.trim();
        if (!t || sending) return;
        setSending(true);
        try {
            await api.post(`/messages/${id}`, { text: t });
            setText("");
            load();
        } catch (e) {
            showError(toast, e, "Envoi impossible");
        } finally {
            setSending(false);
        }
    };

    if (notFound) {
        return (
            <div className="min-h-screen bg-[#050505] text-white">
                <Header />
                <div className="max-w-2xl mx-auto px-6 py-20 text-center text-neutral-400">Conversation introuvable.</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col" style={{ minHeight: "calc(100vh - 73px)" }}>
                <button onClick={() => navigate("/messages")} className="flex items-center gap-1 text-neutral-400 hover:text-[#E8D2A6] transition-colors mb-4 self-start">
                    <ChevronLeft size={16} /> Messages
                </button>

                {other && (
                    <Link to={`/u/${other.user_id}`} className="flex items-center gap-3 pb-4 border-b border-[#262626] mb-4">
                        {other.picture ? (
                            <img src={other.picture} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center font-semibold">{other.name?.[0]?.toUpperCase() || "U"}</div>
                        )}
                        <div>
                            <div className="text-white font-medium">{other.name}</div>
                            <div className="text-xs flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${other.online ? "bg-emerald-400" : "bg-neutral-600"}`} />
                                <span className={other.online ? "text-emerald-400" : "text-neutral-500"}>{other.online ? "En ligne" : "Hors ligne"}</span>
                            </div>
                        </div>
                    </Link>
                )}

                <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {messages.length === 0 ? (
                        <div className="text-center py-16 text-neutral-500 text-sm">Aucun message. Dites bonjour !</div>
                    ) : (
                        messages.map((m) => {
                            const mine = m.from_id === user.user_id;
                            return (
                                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-[#E8D2A6] text-black" : "bg-[#1a1a1a] text-white"}`}>
                                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="mt-4 flex gap-2 pt-3">
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && send()}
                        data-testid="message-input"
                        placeholder="Écrire un message…"
                        maxLength={2000}
                        className="flex-1 bg-[#111] border border-[#262626] rounded-full px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#E8D2A6]"
                    />
                    <Button onClick={send} disabled={sending} data-testid="message-send" className="bg-[#E8D2A6] text-black hover:bg-[#D4BB8B] rounded-full h-11 w-11 p-0 flex items-center justify-center shrink-0">
                        <Send size={16} />
                    </Button>
                </div>
            </div>
        </div>
    );
}
