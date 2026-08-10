import React, { useEffect, useState } from "react";
import { Eye, Users2, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR");

export default function AdminTraffic() {
    const [data, setData] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        api.get("/admin/site-stats", { silent: true })
            .then((r) => setData(r.data))
            .catch(() => setFailed(true));
    }, []);

    if (failed) return null;

    const cards = [
        { label: "Vues aujourd'hui", value: data?.today?.views, icon: <Eye size={13} /> },
        { label: "Visiteurs aujourd'hui", value: data?.today?.visitors, icon: <Users2 size={13} /> },
        { label: "Vues 7 jours", value: data?.last7?.views, icon: <TrendingUp size={13} /> },
        { label: "Vues 30 jours", value: data?.last30?.views, icon: <TrendingUp size={13} /> },
        { label: "Vues totales", value: data?.total?.views, icon: <Eye size={13} /> },
        { label: "Visiteurs uniques", value: data?.total?.visitors, icon: <Users2 size={13} /> },
    ];

    const series = data?.series || [];
    const max = Math.max(1, ...series.map((d) => d.views));

    return (
        <section className="mb-10">
            <div className="text-xs uppercase tracking-widest text-neutral-500 mb-3 flex items-center gap-2">
                <TrendingUp size={13} className="text-[#E8D2A6]" /> Audience du site
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {cards.map((c) => (
                    <div key={c.label} className="p-4 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">{c.icon} {c.label}</div>
                        <div className="font-display text-2xl mt-1.5 tabular-nums">{data ? fmt(c.value) : "—"}</div>
                    </div>
                ))}
            </div>

            {series.length > 0 && (
                <div className="mt-4 p-5 rounded-lg border border-[#262626] bg-[#0a0a0a]">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-4">14 derniers jours</div>
                    <div className="flex items-end gap-1.5 h-28">
                        {series.map((d) => (
                            <div key={d.date} className="group relative flex-1 flex flex-col justify-end h-full">
                                <div
                                    className="w-full rounded-t bg-[#E8D2A6]/70 transition-colors group-hover:bg-[#E8D2A6] min-h-[2px]"
                                    style={{ height: `${(d.views / max) * 100}%` }}
                                />
                                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden whitespace-nowrap rounded border border-[#262626] bg-[#111] px-2 py-1 text-[10px] text-neutral-200 group-hover:block">
                                    {new Date(d.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — {fmt(d.views)} vue{d.views > 1 ? "s" : ""}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-neutral-600">
                        <span>{series[0] && new Date(series[0].date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                        <span>aujourd&apos;hui</span>
                    </div>
                </div>
            )}
        </section>
    );
}
