import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Compass, ChevronLeft, Search, ChevronUp } from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";

const PISTES = [
    { to: "/", icone: Compass, titre: "Accueil", detail: "Le catalogue et les nouveautés" },
    { to: "/browse", icone: Search, titre: "Parcourir", detail: "Films, séries et animes" },
    { to: "/wishboard", icone: ChevronUp, titre: "Wishboard", detail: "Propose un titre qui manque" },
];

export default function NotFoundPage() {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <div className="noise-overlay" />
            <Header />

            <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center" data-testid="not-found">
                <div className="font-display text-[clamp(5rem,18vw,9rem)] leading-none tracking-tighter text-[#E8D2A6]/25">
                    404
                </div>

                <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">Cette page n&apos;existe pas</h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-400">
                    Le lien est peut-être erroné, ou le contenu a été retiré du catalogue depuis.
                </p>

                <code className="mt-5 max-w-full truncate rounded-full border border-[#262626] bg-[#0a0a0a] px-4 py-1.5 text-xs text-neutral-500">
                    {location.pathname}
                </code>

                <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                    <Button
                        onClick={() => navigate(-1)}
                        variant="outline"
                        className="h-11 rounded-full border-[#262626] bg-transparent px-5 text-white hover:bg-white/5"
                    >
                        <ChevronLeft size={16} className="mr-1.5" /> Page précédente
                    </Button>
                    <Button
                        onClick={() => navigate("/")}
                        data-testid="not-found-home"
                        className="h-11 rounded-full bg-[#E8D2A6] px-6 font-semibold text-black hover:bg-[#D4BB8B]"
                    >
                        Retour à l&apos;accueil
                    </Button>
                </div>

                <div className="mt-14 w-full">
                    <div className="mb-4 text-[10px] uppercase tracking-[0.18em] text-neutral-600">Ou reprends par ici</div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {PISTES.map(({ to, icone: Icone, titre, detail }) => (
                            <Link
                                key={to}
                                to={to}
                                className="group rounded-xl border border-[#262626] bg-[#0a0a0a] p-4 text-left transition-colors hover:border-[#E8D2A6]/50"
                            >
                                <Icone size={16} className="text-[#E8D2A6]" />
                                <div className="mt-2.5 text-sm text-white">{titre}</div>
                                <div className="mt-0.5 text-xs leading-relaxed text-neutral-500">{detail}</div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
