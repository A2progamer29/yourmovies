import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

const DISCORD_URL = "https://discord.gg/6mGTfvcNeD";
const STORAGE_KEY = "ym-discord-invite-dismissed";

function DiscordIcon({ size = 22 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.08.08 0 0 0-.079.037c-.21.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.618-1.25.08.08 0 0 0-.078-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.319 13.58.1 18.058a.08.08 0 0 0 .031.056c2.053 1.508 4.041 2.423 5.993 3.03a.08.08 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.08.08 0 0 0-.042-.106 12.3 12.3 0 0 1-1.872-.892.08.08 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.07.07 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.061 0a.07.07 0 0 1 .079.009c.12.1.246.198.373.292a.08.08 0 0 1-.007.128c-.598.343-1.22.645-1.873.891a.08.08 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.08.08 0 0 0 .084.029c1.961-.607 3.95-1.522 6.002-3.03a.08.08 0 0 0 .031-.055c.5-5.177-.838-9.674-3.548-13.66a.06.06 0 0 0-.031-.029ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419s.956-2.419 2.157-2.419c1.21 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419Z" />
        </svg>
    );
}

export default function DiscordInvitePopup() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!window.sessionStorage.getItem(STORAGE_KEY)) {
            const timer = window.setTimeout(() => setVisible(true), 1200);
            return () => window.clearTimeout(timer);
        }
    }, []);

    const dismiss = () => {
        window.sessionStorage.setItem(STORAGE_KEY, "1");
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <aside className="fixed bottom-5 right-5 z-[80] w-[calc(100%-2.5rem)] max-w-sm overflow-hidden rounded-2xl border border-[#E8D2A6]/35 bg-[#0a0a0a]/95 shadow-2xl shadow-black/70 backdrop-blur-xl" aria-label="Rejoindre le Discord">
            <div className="h-px bg-gradient-to-r from-transparent via-[#E8D2A6] to-transparent" />
            <button type="button" onClick={dismiss} aria-label="Fermer" className="absolute right-3 top-3 rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-white/5 hover:text-white">
                <X size={16} />
            </button>
            <div className="flex gap-4 p-5 pr-11">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8D2A6] text-black">
                    <DiscordIcon />
                </div>
                <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-[#E8D2A6]">La communauté</div>
                    <h2 className="mt-1 font-display text-xl text-white">Rejoignez YourMovie&apos;s</h2>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-400">Partagez vos avis, proposez des contenus et suivez les prochaines nouveautés.</p>
                    <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-full bg-[#E8D2A6] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#D4BB8B]" onClick={dismiss}>
                        Rejoindre le Discord
                    </a>
                </div>
            </div>
        </aside>
    );
}
