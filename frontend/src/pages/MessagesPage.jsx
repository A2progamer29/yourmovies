import React, { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header";

export default function MessagesPage() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [convos, setConvos] = useState([]);
    const [ready, setReady] = useState(false);

    const load = async () => {
        try {
            const r = await api.get("/conversations", { silent: true });
            setConvos(r.data || []);
        } catch { /* ignore */ }
        finally { setReady(true); }
    };

    useEffect(() => { if (user) load(); }, [user]);

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="max-w-2xl mx-auto px-6 py-12">
                <h1 className="font-display text-4xl tracking-tighter mb-8">Messages</h1>

                {ready && convos.length === 0 ? (
                    <div className="p-10 rounded-lg border border-[#262626] bg-[#0a0a0a] text-center text-neutral-500">
                        <MessageSquare size={22} className="mx-auto mb-3 opacity-50" />
                        Aucune conversation. Va sur le profil d'un utilisateur pour lui écrire.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {convos.map((c) => (
                            <button
                                key={c.partner_id}
                                onClick={() => navigate(`/messages/${c.partner_id}`)}
                                data-testid={`convo-${c.partner_id}`}
                                className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#E8D2A6]/40 transition-colors text-left"
                            >
                                <div className="relative shrink-0">
                                    {c.picture ? (
                                        <img src={c.picture} alt="" className="w-11 h-11 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-11 h-11 rounded-full bg-[#E8D2A6] text-black flex items-center justify-center font-semibold">{c.name?.[0]?.toUpperCase() || "U"}</div>
                                    )}
                                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a0a] ${c.online ? "bg-emerald-400" : "bg-neutral-600"}`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-white font-medium truncate">{c.name}</span>
                                        {c.unread > 0 && <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E8D2A6] text-black text-[11px] font-bold flex items-center justify-center">{c.unread}</span>}
                                    </div>
                                    <div className={`text-sm truncate ${c.unread > 0 ? "text-white" : "text-neutral-500"}`}>{c.last_text}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
