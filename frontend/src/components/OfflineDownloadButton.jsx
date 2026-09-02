import React from "react";
import { useNavigate } from "react-router-dom";
import { Check, Crown, Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useOfflineDownloads } from "@/context/OfflineDownloadsContext";
import { makeDownloadId } from "@/lib/offline";

export default function OfflineDownloadButton({ media, episode = null, compact = false, player = false, className = "" }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { eligible, download, getDownload, progress } = useOfflineDownloads();
    const downloadId = makeDownloadId(media.id, episode, user?.user_id);
    const current = progress[downloadId];
    const completed = getDownload(media.id, episode);

    const onClick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!eligible) {
            navigate(user ? "/pricing" : "/login");
            return;
        }
        if (completed) {
            navigate("/settings?tab=downloads");
            return;
        }

        try {
            await download(media, episode);
            toast.success(episode ? "Épisode disponible hors connexion" : "Film disponible hors connexion");
        } catch (error) {
            if (error?.name === "AbortError") return;
            toast.error(error?.response?.data?.detail || error?.message || "Téléchargement impossible");
        }
    };

    const Icon = current ? LoaderCircle : completed ? Check : player || eligible ? Download : Crown;
    const label = current
        ? current.percent == null ? "Téléchargement…" : `${current.percent} %`
        : completed ? "Téléchargé" : "Télécharger";
    const accessibleLabel = `${label}${episode ? ` l’épisode ${episode.ep_number || episode.episode_number}` : " ce film"}${!eligible ? " — réservé à Premium" : ""}`;
    const Control = player ? "button" : Button;

    return (
        <Control
            type="button"
            variant={player ? undefined : "outline"}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            data-tooltip={player ? accessibleLabel : undefined}
            aria-busy={Boolean(current)}
            disabled={Boolean(current)}
            onClick={onClick}
            data-testid={episode ? `offline-download-${episode.season_number}-${episode.ep_number || episode.episode_number}` : "offline-download-movie"}
            className={player ? `ym-player-button ym-player-download ${className}` : `rounded-full border-[#262626] bg-[#111] text-white hover:border-[#E8D2A6]/60 hover:bg-white/5 hover:text-[#E8D2A6] ${completed ? "border-[#E8D2A6]/45 text-[#E8D2A6]" : ""} ${compact ? "h-10 w-10 shrink-0 p-0" : "h-12 px-5"} ${className}`}
        >
            <Icon size={16} aria-hidden="true" className={`${current ? "animate-spin" : ""} ${compact || player ? "" : "mr-2"}`} />
            {!compact && !player && label}
        </Control>
    );
}
