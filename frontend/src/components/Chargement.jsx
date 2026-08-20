import React from "react";
import { Loader2 } from "lucide-react";

/** Cercle de chargement. Un anneau qui tourne dit « ça avance » sans avoir à
 *  etre lu, la ou un texte fige laissait croire a un blocage. */
export default function Chargement({ taille = 22, pleinePage = false, libelle = "Chargement en cours" }) {
    const cercle = (
        <Loader2
            size={taille}
            className="animate-spin text-[#E8D2A6]"
            role="status"
            aria-label={libelle}
        />
    );
    if (!pleinePage) return cercle;
    return (
        <div className="flex items-center justify-center py-20" data-testid="chargement">
            {cercle}
        </div>
    );
}
