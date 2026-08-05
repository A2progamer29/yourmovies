import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { api } from "@/lib/api";

export default function MessagesButton() {
    const navigate = useNavigate();
    const [unread, setUnread] = useState(0);

    const load = useCallback(async () => {
        try {
            const r = await api.get("/messages/unread/count", { silent: true });
            setUnread(r.data.count || 0);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 45000);
        return () => clearInterval(t);
    }, [load]);

    return (
        <button
            onClick={() => navigate("/messages")}
            aria-label="Messages"
            data-testid="messages-btn"
            className="relative w-9 h-9 flex items-center justify-center rounded-full text-neutral-300 hover:text-[#E8D2A6] hover:bg-white/5 transition-colors"
        >
            <MessageCircle size={18} />
            {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#E8D2A6] text-black text-[10px] font-bold flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                </span>
            )}
        </button>
    );
}
