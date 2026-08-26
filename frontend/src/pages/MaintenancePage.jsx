import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Hammer } from "lucide-react";

const DEFAULT_MESSAGE = "Le site est en cours de rénovation. Il sera prochainement disponible.";

export default function MaintenancePage({ config = {} }) {
    const discordUrl = config.discord_url || "https://discord.gg/yourmovies";
    const reduceMotion = useReducedMotion();

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
            {/* Faisceau de projecteur ambiant : tourne très lentement derrière le
                contenu, en écho au thème cinéma du site. Un seul geste décoratif,
                tenu discret. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <motion.div
                    className="h-[140vmax] w-[140vmax] opacity-[0.14]"
                    style={{
                        background: "conic-gradient(from 0deg, transparent 0deg, #E8D2A6 8deg, transparent 40deg, transparent 320deg, #E8D2A6 352deg, transparent 360deg)",
                    }}
                    animate={reduceMotion ? undefined : { rotate: 360 }}
                    transition={reduceMotion ? undefined : { duration: 40, repeat: Infinity, ease: "linear" }}
                />
            </div>
            <div className="pointer-events-none absolute -left-24 top-1/3 h-64 w-64 rounded-full bg-[#E8D2A6]/10 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -right-24 bottom-1/4 h-72 w-72 rounded-full bg-[#E8D2A6]/[0.08] blur-3xl" aria-hidden="true" />

            <motion.div
                className="relative w-full max-w-xl text-center"
                variants={conteneur}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={monte} className="relative mx-auto flex h-16 w-16 items-center justify-center">
                    <motion.span
                        className="absolute inset-0 rounded-full border border-[#E8D2A6]/30"
                        animate={reduceMotion ? undefined : { scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                        transition={reduceMotion ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[#E8D2A6]/40 bg-[#E8D2A6]/10 text-[#E8D2A6]">
                        <motion.div
                            animate={reduceMotion ? undefined : { rotate: [0, -12, 10, -6, 0] }}
                            transition={reduceMotion ? undefined : { duration: 2.2, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}
                        >
                            <Hammer size={28} />
                        </motion.div>
                    </div>
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

                <motion.div variants={monte} className="mx-auto mt-7 h-1 w-40 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                        className="h-full w-1/3 rounded-full bg-[#E8D2A6]"
                        animate={reduceMotion ? undefined : { x: ["-100%", "220%"] }}
                        transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                    />
                </motion.div>

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