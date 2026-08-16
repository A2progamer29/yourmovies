import React from "react";

const Bloc = ({ className = "" }) => (
    <div className={`animate-pulse rounded-lg bg-[#111] ${className}`} />
);

const Rangee = ({ largeurTitre }) => (
    <section className="mx-auto mt-14 max-w-7xl px-6">
        <Bloc className={`h-5 ${largeurTitre}`} />
        <div className="mt-5 flex gap-4 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
                <Bloc key={i} className="aspect-[2/3] w-[150px] shrink-0 sm:w-[170px]" />
            ))}
        </div>
    </section>
);

/** Occupe exactement la place du contenu réel : sans cela, la page reste vide
 *  puis se remplit d'un coup, ce qui donne l'impression d'un site cassé. */
export default function HomeSkeleton() {
    return (
        <div data-testid="home-skeleton" aria-busy="true" aria-label="Chargement du catalogue">
            <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden bg-[#0a0a0a]">
                <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-[#050505] via-[#0d0d0d] to-[#111]" />
                <div className="absolute bottom-[12%] left-0 w-full px-6">
                    <div className="mx-auto max-w-7xl">
                        <Bloc className="h-10 w-2/3 max-w-lg sm:h-14" />
                        <Bloc className="mt-4 h-4 w-full max-w-xl" />
                        <Bloc className="mt-2 h-4 w-3/4 max-w-md" />
                        <div className="mt-7 flex gap-3">
                            <Bloc className="h-12 w-40 rounded-full" />
                            <Bloc className="h-12 w-32 rounded-full" />
                        </div>
                    </div>
                </div>
            </div>

            <Rangee largeurTitre="w-52" />
            <Rangee largeurTitre="w-40" />
            <Rangee largeurTitre="w-44" />
        </div>
    );
}
