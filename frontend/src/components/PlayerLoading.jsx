import React from "react";
import { Loader2 } from "lucide-react";

export default function PlayerLoading({ label = "Chargement de la vidéo…", overlay = false }) {
    return (
        <div role="status" aria-live="polite" className={`${overlay ? "absolute inset-0 z-10" : "relative aspect-video w-full"} pointer-events-none flex flex-col items-center justify-center gap-3 bg-black/75 text-white`}>
            <Loader2 aria-hidden="true" size={30} className="animate-spin text-[#E8D2A6]" />
            <span className="px-5 text-center text-sm text-neutral-200">{label}</span>
        </div>
    );
}
