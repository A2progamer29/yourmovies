import React, { useState } from "react";

export default function PlayerPauseInfo({ fiche }) {
    const [failedLogo, setFailedLogo] = useState(null);
    const showLogo = Boolean(fiche.logo && fiche.logo !== failedLogo);
    return (
        <section className="ym-player-pause-info" aria-label="Informations sur le titre en pause" data-testid="player-pause-info">
            <div className="ym-player-pause-content">
                <span className="ym-player-pause-label">En pause</span>
                {showLogo ? <img className="ym-player-pause-logo" src={fiche.logo} alt={fiche.titre}
                    draggable={false} onError={() => setFailedLogo(fiche.logo)} />
                    : <h2 className="ym-player-pause-title">{fiche.titre}</h2>}
                {fiche.sousTitre && <p className="ym-player-pause-meta">{fiche.sousTitre}</p>}
                {fiche.description && <p className="ym-player-pause-description">{fiche.description}</p>}
            </div>
        </section>
    );
}
