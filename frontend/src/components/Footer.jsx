import React from "react";
import { Link } from "react-router-dom";

// À remplacer par le vrai lien d'invitation Discord :
const DISCORD_URL = "https://discord.gg/";

function DiscordIcon({ size = 18 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.2.36-.43.842-.588 1.226a18.27 18.27 0 0 0-3.94 0A12.6 12.6 0 0 0 11.44 3 19.74 19.74 0 0 0 7.68 4.37C4.28 9.41 3.35 14.32 3.8 19.16a19.9 19.9 0 0 0 6.06 3.06c.49-.67.93-1.38 1.3-2.13-.71-.27-1.39-.6-2.03-.99.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.14 0c.16.14.33.27.5.4-.64.39-1.32.72-2.03.99.37.75.81 1.46 1.3 2.13a19.87 19.87 0 0 0 6.06-3.06c.53-5.6-.9-10.47-3.29-14.79ZM9.68 15.9c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.2 0 2.17 1.09 2.15 2.42 0 1.34-.95 2.42-2.15 2.42Zm4.64 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.2 0 2.17 1.09 2.15 2.42 0 1.34-.94 2.42-2.15 2.42Z" />
        </svg>
    );
}

export default function Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="border-t border-white/5 bg-[#050505] mt-20">
            <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-neutral-500 text-center sm:text-left">
                    © {year} YourMovie&apos;s — Créé par <span className="text-[#E8D2A6]">Lune27</span>
                </div>
                <div className="flex items-center gap-5 text-sm">
                    <Link to="/about" className="text-neutral-400 hover:text-[#E8D2A6] transition-colors">À propos</Link>
                    <Link to="/cgu" className="text-neutral-400 hover:text-[#E8D2A6] transition-colors">CGU</Link>
                    <Link to="/politique" className="text-neutral-400 hover:text-[#E8D2A6] transition-colors">Confidentialité</Link>
                    <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label="Discord" className="text-neutral-400 hover:text-[#5865F2] transition-colors">
                        <DiscordIcon />
                    </a>
                </div>
            </div>
        </footer>
    );
}
