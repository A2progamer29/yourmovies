import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Check, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { showError } from "@/lib/errors";
import { voterKey } from "@/lib/voter";
import Header from "@/components/Header";

function Choix({ option, index, sondage, onVoter, envoi }) {
    const aVote = sondage.my_vote !== null && sondage.my_vote !== undefined;
    const monChoix = sondage.my_vote === index;

    if (!aVote && !sondage.closed) {
        return (
            <button
                type="button"
                onClick={() => onVoter(index)}
                disabled={envoi}
                data-testid={`poll-option-${index}`}
                className="w-full rounded-xl border border-[#262626] bg-[#111] px-4 py-3 text-left text-sm text-neutral-200 transition-colors hover:border-[#E8D2A6] hover:bg-[#E8D2A6]/[0.06] disabled:opacity-50"
            >
                {option.label}
            </button>
        );
    }

    const pourcent = option.percent ?? 0;
    return (
        <div className={`relative overflow-hidden rounded-xl border px-4 py-3 ${monChoix ? "border-[#E8D2A6]/60" : "border-[#262626]"}`}>
            <div
                className={`absolute inset-y-0 left-0 ${monChoix ? "bg-[#E8D2A6]/20" : "bg-white/[0.05]"}`}
                style={{ width: `${pourcent}%` }}
                aria-hidden="true"
            />
            <div className="relative flex items-center gap-3 text-sm">
                <span className={`min-w-0 flex-1 ${monChoix ? "text-[#E8D2A6]" : "text-neutral-200"}`}>
                    {option.label}
                    {monChoix && <Check size={13} className="ml-2 inline" />}
                </span>
                <span className="shrink-0 tabular-nums text-neutral-400">
                    {option.votes} · {pourcent}%
                </span>
            </div>
        </div>
    );
}

export default function PollsPage() {
    const [sondages, setSondages] = useState([]);
    const [chargement, setChargement] = useState(true);
    const [envoi, setEnvoi] = useState(null);

    const charger = useCallback(async () => {
        try {
            const r = await api.get("/polls", { params: { voter: voterKey() }, silent: true });
            setSondages(Array.isArray(r.data) ? r.data : []);
        } catch {
            setSondages([]);
        } finally {
            setChargement(false);
        }
    }, []);

    useEffect(() => { charger(); }, [charger]);

    const voter = async (sondage, index) => {
        setEnvoi(sondage.id);
        try {
            const r = await api.post(`/polls/${sondage.id}/vote`, {
                option_index: index,
                voter_key: voterKey(),
            });
            setSondages((liste) => liste.map((s) => (s.id === sondage.id ? r.data : s)));
            toast.success("Vote enregistré");
        } catch (e) {
            showError(toast, e, "Vote impossible");
            if (e?.response?.status === 409) charger();
        } finally {
            setEnvoi(null);
        }
    };

    const ouverts = sondages.filter((s) => !s.closed);
    const clos = sondages.filter((s) => s.closed);

    return (
        <div className="min-h-screen bg-[#050505] text-white">
            <Header />
            <div className="mx-auto max-w-3xl px-6 py-12">
                <div className="mb-10">
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-[#E8D2A6]">
                        <BarChart3 size={13} /> Sondages
                    </div>
                    <h1 className="font-display text-4xl tracking-tighter sm:text-5xl">Donne ton avis</h1>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-400">
                        Pas besoin de compte pour voter. Une fois ton choix fait, il est définitif —
                        et les résultats s&apos;affichent immédiatement.
                    </p>
                </div>

                {chargement ? (
                    <div className="text-sm text-neutral-500">Chargement…</div>
                ) : sondages.length === 0 ? (
                    <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-10 text-center">
                        <BarChart3 size={22} className="mx-auto mb-3 text-neutral-600" />
                        <p className="text-sm text-neutral-400">Aucun sondage en cours pour le moment.</p>
                    </div>
                ) : (
                    <div className="space-y-10">
                        {[["En cours", ouverts], ["Terminés", clos]].map(([titre, liste]) => (
                            liste.length === 0 ? null : (
                                <section key={titre}>
                                    <div className="mb-4 text-[10px] uppercase tracking-widest text-neutral-500">{titre}</div>
                                    <div className="space-y-5">
                                        {liste.map((sondage) => (
                                            <article key={sondage.id} data-testid="poll-card" className="rounded-2xl border border-[#262626] bg-[#0a0a0a] p-5 sm:p-6">
                                                <h2 className="font-display text-xl text-white sm:text-2xl">{sondage.question}</h2>
                                                <div className="mt-4 space-y-2">
                                                    {sondage.options.map((option, index) => (
                                                        <Choix
                                                            key={index}
                                                            option={option}
                                                            index={index}
                                                            sondage={sondage}
                                                            envoi={envoi === sondage.id}
                                                            onVoter={(i) => voter(sondage, i)}
                                                        />
                                                    ))}
                                                </div>
                                                <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
                                                    {sondage.closed ? (
                                                        <><Lock size={12} /> Sondage clos · {sondage.total_votes ?? 0} vote(s)</>
                                                    ) : sondage.my_vote !== null && sondage.my_vote !== undefined ? (
                                                        <><Check size={12} className="text-[#E8D2A6]" /> Ton vote est enregistré · {sondage.total_votes} vote(s) au total</>
                                                    ) : (
                                                        <>Choisis une réponse pour voir les résultats.</>
                                                    )}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            )
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
