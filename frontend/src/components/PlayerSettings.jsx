import React, { useEffect, useId, useRef } from "react";
import { Check, Gauge, Monitor, Volume2, X, Zap } from "lucide-react";
import { Link } from "react-router-dom";

const SECTIONS = [
    { id: "quality", label: "Qualité", Icon: Monitor },
    { id: "speed", label: "Vitesse", Icon: Gauge },
    { id: "sound", label: "Son", Icon: Volume2 },
];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const qualityName = quality => ({ "4k": "Ultra HD", "1080p": "Full HD", "720p": "HD", "480p": "Standard" }[quality] || "");

export default function PlayerSettings({ section, onSection, onClose, panelRef, levels, level, onLevel,
    qualities, allQualities, quality, onQuality, speed, onSpeed, volume, muted, onVolume, boost, onBoost }) {
    const id = useId();
    const tabs = useRef([]);
    useEffect(() => {
        tabs.current[SECTIONS.findIndex(s => s.id === section)]?.focus();
        // Initial focus only; subsequent changes are controlled by tab navigation.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const choice = (key, label, detail, selected, onClick, testId) => (
        <button key={key} type="button" className="ym-player-choice" aria-pressed={selected}
            onClick={onClick} data-testid={testId}>
            <span className="ym-player-choice-check">{selected && <Check size={18} aria-hidden="true" />}</span>
            <span>{label}</span>
            {detail && <span className="ym-player-choice-detail">{detail}</span>}
        </button>
    );
    return (
        <div className="ym-player-settings" ref={panelRef} role="dialog" aria-label="Réglages du lecteur"
            onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
            <div className="ym-player-settings-heading">
                <span>Réglages de lecture</span>
                <button type="button" className="ym-player-settings-close" onClick={() => onClose()} aria-label="Fermer les réglages"><X size={20} /></button>
            </div>
            <div className="ym-player-settings-tabs" role="tablist" aria-label="Catégories de réglages">
                {SECTIONS.map(({ id: name, label, Icon }, index) => (
                    <button key={name} type="button" ref={el => { tabs.current[index] = el; }}
                        id={`${id}-${name}-tab`} role="tab" aria-selected={section === name}
                        aria-controls={`${id}-panel`} tabIndex={section === name ? 0 : -1}
                        onClick={() => onSection(name)} onKeyDown={event => {
                            let next;
                            if (event.key === "ArrowRight") next = (index + 1) % SECTIONS.length;
                            if (event.key === "ArrowLeft") next = (index + SECTIONS.length - 1) % SECTIONS.length;
                            if (event.key === "Home") next = 0;
                            if (event.key === "End") next = SECTIONS.length - 1;
                            if (next !== undefined) { event.preventDefault(); onSection(SECTIONS[next].id); tabs.current[next]?.focus(); }
                        }}>
                        <Icon size={16} aria-hidden="true" />{label}
                    </button>
                ))}
            </div>
            <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${section}-tab`} className="ym-player-settings-body">
                {section === "quality" && <div data-testid="quality-menu" className="ym-player-choices" role="group" aria-label="Qualité vidéo">
                    {levels.length ? <>
                        {choice("auto", "Automatique", "Adaptative", level === -1, () => onLevel(-1))}
                        {[...levels].reverse().map(n => choice(n.index, `${n.height}p`, qualityName(`${n.height}p`), level === n.index, () => onLevel(n.index), `niveau-${n.height}`))}
                    </> : <>
                        {!qualities.length && <p className="ym-player-setting-note">Qualité gérée automatiquement par votre navigateur.</p>}
                        {qualities.map(q => choice(q.quality, q.quality.toUpperCase(), qualityName(q.quality), quality === q.quality, () => onQuality(q.quality), `quality-${q.quality}`))}
                        {allQualities.filter(q => !qualities.some(a => a.quality === q.quality)).map(q => (
                            <Link key={q.quality} to="/pricing" className="ym-player-choice ym-player-choice-locked">
                                <Zap size={16} aria-hidden="true" /><span>{q.quality.toUpperCase()}</span><span className="ym-player-choice-detail">Premium</span>
                            </Link>
                        ))}
                    </>}
                </div>}
                {section === "speed" && <div className="ym-player-choices ym-player-speed-choices" role="group" aria-label="Vitesse de lecture">
                    {SPEEDS.map(value => choice(value, value === 1 ? "Normale" : `${value.toLocaleString("fr-FR")} ×`, value === 1 ? "1 ×" : "", speed === value, () => onSpeed(value), `vitesse-${value}`))}
                </div>}
                {section === "sound" && <div className="ym-player-sound">
                    <label className="ym-player-setting-label" htmlFor={`${id}-volume`}>Volume <span>{Math.round((muted ? 0 : volume) * 100)} %</span></label>
                    <input id={`${id}-volume`} type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                        onChange={event => onVolume(Number(event.target.value))} className="ym-player-range" />
                    <label className="ym-player-setting-label" htmlFor={`${id}-boost`}>Amplification <span>{Math.round(boost * 100)} %</span></label>
                    <input id={`${id}-boost`} type="range" min="1" max="2.5" step="0.1" value={boost} data-testid="player-boost"
                        aria-label="Amplification du son" onChange={event => onBoost(Number(event.target.value))} className="ym-player-range" />
                    <p className="ym-player-setting-note">Pour les dialogues trop faibles. Au-delà de 100 %, le son peut saturer.</p>
                </div>}
            </div>
        </div>
    );
}
