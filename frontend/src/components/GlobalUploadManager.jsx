import React from "react";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useUploads } from "@/context/UploadContext";

export default function GlobalUploadManager() {
    const { user } = useAuth();
    const {
        uploads,
        uploadsMinimized,
        setUploadsMinimized,
        removeUpload,
    } = useUploads();

    if (!user?.is_admin || uploads.length === 0) return null;

    const activeCount = uploads.filter((item) => item.status === "uploading").length;

    return (
        <aside
            className="fixed bottom-5 right-5 z-[200] w-[min(380px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-[#E8D2A6]/25 bg-[#090909]/95 text-white shadow-2xl shadow-black/60 backdrop-blur-xl"
            aria-label="Suivi des téléversements administrateur"
        >
            <button
                type="button"
                onClick={() => setUploadsMinimized((value) => !value)}
                className="flex w-full items-center justify-between gap-4 border-b border-[#262626] px-4 py-3 text-left hover:bg-white/[0.03]"
                aria-expanded={!uploadsMinimized}
            >
                <span>
                    <span className="block text-[10px] uppercase tracking-[0.2em] text-[#E8D2A6]">Téléversements admin</span>
                    <span className="mt-0.5 block text-xs text-neutral-500">{activeCount} en cours · {uploads.length} au total</span>
                </span>
                <span className="text-lg text-neutral-400">{uploadsMinimized ? "＋" : "−"}</span>
            </button>

            {!uploadsMinimized && (
                <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
                    {uploads.map((item) => (
                        <div key={item.id} className="rounded-xl border border-[#242424] bg-[#101010] p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="truncate text-sm text-neutral-100" title={item.name}>{item.name}</div>
                                    <div className={`mt-0.5 text-xs ${item.status === "error" ? "text-red-400" : item.status === "success" ? "text-emerald-400" : "text-neutral-500"}`}>{item.stage}</div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <span className="text-xs font-semibold tabular-nums text-[#E8D2A6]">{Math.round(item.progress)}%</span>
                                    {item.status !== "uploading" && (
                                        <button type="button" onClick={() => removeUpload(item.id)} className="text-neutral-600 hover:text-white" aria-label="Retirer ce téléversement">
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#252525]">
                                <div
                                    className={`h-full rounded-full transition-[width] duration-300 ${item.status === "error" ? "bg-red-500" : item.status === "success" ? "bg-emerald-500" : "bg-[#E8D2A6]"}`}
                                    style={{ width: `${Math.max(2, Math.min(100, item.progress))}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </aside>
    );
}
