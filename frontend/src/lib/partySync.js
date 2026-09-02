export const validPartyCode = code => /^(?:[A-F0-9]{6}|[A-F0-9]{8})$/.test(code);

export function partyPath(room) {
    const query = new URLSearchParams({ party: room.code });
    if (room.state?.season_number != null) query.set("season", room.state.season_number);
    if (room.state?.episode_number != null) query.set("episode", room.state.episode_number);
    return `/watch/${encodeURIComponent(room.media_id)}?${query}`;
}

// Server age + monotonic elapsed time: a wrong device clock cannot seek a film.
export function partyPosition(state, receivedAt, currentTime, latency = 0) {
    const base = Number(state.position_seconds) || 0;
    if (!state.playing) return base;
    const age = Math.max(0, Number(state.server_time) - Number(state.updated_at)) || 0;
    return base + (age + Math.max(0, currentTime - receivedAt) / 1000 + Math.min(1, Math.max(0, latency))) * (Number(state.playback_rate) || 1);
}
