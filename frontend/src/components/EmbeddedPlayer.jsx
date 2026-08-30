import React, { useEffect, useState } from "react";
import PlayerLoading from "./PlayerLoading";

// A cross-origin iframe only exposes document load, not video buffering events.
export default function EmbeddedPlayer({ src, title, ...props }) {
    const [loadedSource, setLoadedSource] = useState(null);
    const [slow, setSlow] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const loaded = loadedSource === `${src}:${attempt}`;
    useEffect(() => {
        setSlow(false);
        if (loaded) return undefined;
        const timer = window.setTimeout(() => setSlow(true), 20000);
        return () => window.clearTimeout(timer);
    }, [src, loaded, attempt]);
    return (
        <div className="relative aspect-video w-full bg-black">
            <iframe {...props} key={`${src}:${attempt}`} src={src} title={title}
                className="absolute inset-0 h-full w-full" allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => setLoadedSource(`${src}:${attempt}`)} onError={() => setSlow(true)} />
            {!loaded && <PlayerLoading overlay label="Ouverture du lecteur…" />}
            {!loaded && slow && <button type="button" className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm text-black" onClick={() => setAttempt(n => n + 1)}>Réessayer</button>}
        </div>
    );
}
