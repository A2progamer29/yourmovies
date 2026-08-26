import React, { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Hammer } from "lucide-react";

const DEFAULT_MESSAGE = "Le site est en cours de rénovation. Il sera prochainement disponible.";

// Petits éclats dorés qui montent lentement dans le décor, comme de la
// sciure qui capte la lumière — écho discret au marteau et au chantier,
// sans reprendre l'imagerie cinéma habituelle du site.
const ECLATS = [
    { left: "12%", size: 3, duree: 9, retard: 0 },
    { left: "22%", size: 2, duree: 11, retard: 1.4 },
    { left: "34%", size: 4, duree: 8.5, retard: 2.8 },
    { left: "48%", size: 2, duree: 12, retard: 0.6 },
    { left: "58%", size: 3, duree: 9.5, retard: 3.6 },
    { left: "68%", size: 2, duree: 10.5, retard: 1.9 },
    { left: "78%", size: 4, duree: 8, retard: 4.4 },
    { left: "88%", size: 2, duree: 11.5, retard: 2.2 },
];

export default function MaintenancePage({ config = {} }) {
    const discordUrl = config.discord_url || "https://discord.gg/yourmovies";
    const reduceMotion = useReducedMotion();
    const eclats = useMemo(() => ECLATS, []);

    const conteneur = {
        hidden: {},
        visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.09, delayChildren: reduceMotion ? 0 : 0.05 } },
    };
    const monte = {
        hidden: { opacity: 0, y: reduceMotion ? 0 : 14 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
    };

    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-6 py-16 text-white">
            {/* Texture de fond façon plan de chantier : quadrillage fin, en
                clin d'œil à la "rénovation" plutôt qu'au thème cinéma. */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                aria-hidden="true"
                style={{
                    backgroundImage:
                        "linear-gradient(#E8D2A6 1px, transparent 1px), linear-gradient(90deg, #E8D2A6 1px, transparent 1px)",
                    backgroundSize: "42px 42px",
                    maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 40%, transparent 90%)",
                    WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 40%, transparent 90%)",
                }}
            />

            {!reduceMotion && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                    {eclats.map((e, i) => (
                        <motion.span
                            key={i}
                            className="absolute bottom-0 rounded-full bg-[#E8D2A6]"
                            style={{ left: e.left, width: e.size, height: e.size }}
                            animate={{ y: ["0vh", "-95vh"], opacity: [0, 0.6, 0] }}
                            transition={{ duration: e.duree, delay: e.retard, repeat: Infinity, ease: "linear" }}
                        />
                    ))}
                </div>
            )}

            <motion.div
                className="relative w-full max-w-xl text-center"
                variants={conteneur}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={monte} className="flex justify-center text-[#E8D2A6]">
                    <motion.div
                        animate={reduceMotion ? undefined : { rotate: [0, -12, 10, -6, 0] }}
                        transition={reduceMotion ? undefined : { duration: 2.2, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}
                    >
                        <Hammer size={40} />
                    </motion.div>
                </motion.div>

                <motion.p variants={monte} className="mt-8 text-xs uppercase tracking-[0.28em] text-[#E8D2A6]">
                    YourMovie&apos;s
                </motion.p>
                <motion.h1 variants={monte} className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
                    En rénovation
                </motion.h1>
                <motion.p variants={monte} className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-neutral-400">
                    {config.message || DEFAULT_MESSAGE}
                </motion.p>

                <motion.a
                    variants={monte}
                    href={discordUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                    className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#E8D2A6] px-5 py-3 text-sm font-semibold text-black shadow-[0_0_30px_rgba(232,210,166,0.15)] transition-colors hover:bg-[#D4BB8B]"
                    data-testid="maintenance-discord-link"
                >
                    Rejoindre le Discord <ExternalLink size={15} />
                </motion.a>
                <motion.p variants={monte} className="mt-5 text-xs text-neutral-600">
                    Restez informé de la réouverture sur notre serveur Discord.
                </motion.p>
            </motion.div>
        </main>
    );
}