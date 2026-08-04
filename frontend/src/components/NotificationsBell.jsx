import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Megaphone, MessageCircle, X } from "lucide-react";
import { api } from "@/lib/api";

export default function NotificationsBell() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const ref = useRef(null);

    const load = useCallback(async () => {
        try {
            const r = await api.get("/notifications", { silent: true });
            setItems(r.data.items || []);
            setUnread(r.data.unread || 0);
        } catch {
            // ignore (not logged in / offline)
        }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 60000);
        return () => clearInterval(t);
    }, [load]);

    useEffect(() => {
        if (!open) return;
        const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        window.addEventListener("mousedown", onClick);
        return () => window.removeEventListener("mousedown", onClick);
    }, [open]);

    const toggleOpen = async () => {
        const next = !open;
        setOpen(next);
        if (next && unread > 0) {
            try { await api.post("/notifications/read"); } catch { /* ignore */ }
            setUnread(0);
            setItems((list) => list.map((it) => ({ ...it, read: true })));
        }
    };

    const go = (it) => {
        setOpen(false);
        if (it.link) navigate(it.link);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={toggleOpen}
                aria-label="Notifications"
                data-testid="notifications-btn"
                className="relative w-9 h-9 flex items-center justify-center rounded-full text-neutral-300 hover:text-[#E8D2A6] hover:bg-white/5 transition-colors"
            >
                <Bell size={18} />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#E8D2A6] text-black text-[10px] font-bold flex items-center justify-center">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[#0a0a0a] border border-[#262626] rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-[#262626] flex items-center justify-between">
                        <span className="text-sm font-medium text-white">Notifications</span>
                        <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white"><X size={16} /></button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                        {items.length === 0 ? (
                            <div className="px-4 py-10 text-center text-sm text-neutral-500">Aucune notification</div>
                        ) : (
                            items.map((it) => (
                                <button
                                    key={it.id}
                                    onClick={() => go(it)}
                                    className={`w-full text-left px-4 py-3 flex gap-3 border-b border-[#141414] transition-colors ${it.link ? "hover:bg-white/5 cursor-pointer" : "cursor-default"} ${it.read ? "" : "bg-[#E8D2A6]/[0.05]"}`}
                                >
                                    <div className={`mt-0.5 shrink-0 ${it.type === "announcement" ? "text-[#E8D2A6]" : "text-neutral-400"}`}>
                                        {it.type === "announcement" ? <Megaphone size={16} /> : <MessageCircle size={16} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm text-white leading-snug">{it.title}</div>
                                        {it.body && <div className="text-xs text-neutral-400 mt-0.5 line-clamp-3">{it.body}</div>}
                                        {it.media_title && <div className="text-[11px] text-neutral-600 mt-1 truncate">{it.media_title}</div>}
                                    </div>
                                    {!it.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-[#E8D2A6] shrink-0" />}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
