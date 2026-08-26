import React from "react";
import { ExternalLink, Hammer } from "lucide-react";

const DEFAULT_MESSAGE = "Le site est en cours de rénovation. Il sera prochainement disponible.";

export default function MaintenancePage({ config = {} }) {
    const discordUrl = config.discord_url || "https://discord.gg/yourmovies";
    return (
        <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-6 py-16 text-white">
            <div className="w-full max-w-xl text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#E8D2A6]/40 bg-[#E8D2A6]/10 text-[#E8D2A6]"><Hammer size={28} /></div>
                <p className="mt-8 text-xs uppercase tracking-[0.28em] text-[#E8D2A6]">YourMovie&apos;s</p>
                <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">En rénovation</h1>
                <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-neutral-400">{config.message || DEFAULT_MESSAGE}</p>
                <a href={discordUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#E8D2A6] px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#D4BB8B]" data-testid="maintenance-discord-link">
                    Rejoindre le Discord <ExternalLink size={15} />
                </a>
                <p className="mt-5 text-xs text-neutral-600">Restez informé de la réouverture sur notre serveur Discord.</p>
            </div>
        </main>
    );
}