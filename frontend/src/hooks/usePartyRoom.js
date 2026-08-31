import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { partyPosition } from "@/lib/partySync";

export default function usePartyRoom(props) {
    const latest = useRef(props);
    latest.current = props;
    const socket = useRef(null);
    const snapshot = useRef(null);
    const role = useRef(false);
    const running = useRef(false);
    const online = useRef(false);
    const applying = useRef(false);
    const latency = useRef(0);
    const [room, setRoom] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [messages, setMessages] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [started, setStarted] = useState(false);
    const [connected, setConnected] = useState(false);
    const [fatal, setFatal] = useState(null);
    const [pauseRequest, setPauseRequest] = useState(null);
    const [needsGesture, setNeedsGesture] = useState(false);
    const send = data => {
        if (socket.current?.readyState === 1 && online.current) socket.current.send(JSON.stringify(data));
    };
    const apply = (force = false) => {
        const video = latest.current.videoRef?.current;
        const saved = snapshot.current;
        if (!video || !saved || video.readyState < 1 || applying.current) return;
        if (role.current && !force && running.current && online.current) return;
        const episode = latest.current.currentEpisode;
        if (String(episode?.season_number || "") !== String(saved.state.season_number || "") ||
            String(episode?.episode_number || "") !== String(saved.state.episode_number || "")) return;
        applying.current = true;
        try {
            let position = partyPosition(saved.state, saved.at, performance.now(), latency.current);
            if (Number.isFinite(video.duration)) position = Math.min(position, video.duration);
            if (Math.abs(video.currentTime - position) > (force ? 0.2 : 0.9)) video.currentTime = position;
            const rate = saved.state.playback_rate || 1;
            if (video.playbackRate !== rate) video.playbackRate = rate;
            if (saved.state.playing && running.current && online.current) {
                if (video.paused) video.play().then(() => setNeedsGesture(false)).catch(error => {
                    if (error?.name === "NotAllowedError") setNeedsGesture(true);
                });
            } else if (!video.paused) video.pause();
        } finally { applying.current = false; }
    };
    const applyRef = useRef(apply);
    applyRef.current = apply;

    useEffect(() => {
        let stopped = false, attempts = 0, retry, ws;
        snapshot.current = null;
        const backend = (process.env.REACT_APP_BACKEND_URL || window.location.origin).replace(/\/$/, "");
        const url = `${backend.replace(/^http/, "ws")}/api/party/${props.code}/ws`;
        const acceptState = (data, force) => {
            if (!data.state) return;
            if (snapshot.current && data.state.revision < snapshot.current.state.revision) return;
            snapshot.current = { state: data.state, at: performance.now() };
            running.current = Boolean(data.started);
            setStarted(running.current);
            latest.current.onStartedChange?.(running.current);
            if (!role.current || data.type === "hello" || data.type === "episode") latest.current.onEpisodeSync?.(data.state.season_number, data.state.episode_number);
            applyRef.current(force);
        };
        const connect = () => {
            ws = new WebSocket(url);
            socket.current = ws;
            ws.onopen = () => ws.send(JSON.stringify({ type: "auth", profile: props.profileId || null }));
            ws.onmessage = event => {
                if (stopped) return;
                let data;
                try { data = JSON.parse(event.data); } catch { return; }
                if (data.type === "hello") {
                    attempts = 0;
                    snapshot.current = null;
                    online.current = true;
                    setConnected(true);
                    latest.current.onConnectionChange?.(true);
                    setFatal(null);
                    role.current = Boolean(data.you?.is_host);
                    setIsHost(role.current);
                    latest.current.onHostChange?.(role.current);
                    setRoom(data.room);
                    acceptState(data, true);
                } else if (["sync", "episode", "started"].includes(data.type)) {
                    acceptState(data, data.type !== "sync");
                } else if (data.type === "room") setRoom(data.room);
                else if (data.type === "participants") setParticipants(data.participants || []);
                else if (data.type === "chat") setMessages(values => [...values, data].slice(-100));
                else if (data.type === "pause_request") setPauseRequest(data.name);
                else if (data.type === "error") toast.error(data.message);
                else if (data.type === "pong" && typeof data.nonce === "number") latency.current = Math.min(1, Math.max(0, performance.now() - data.nonce) / 2000);
                else if (["kicked", "party_closed"].includes(data.type)) {
                    stopped = true;
                    toast.info(data.reason || "L'hôte vous a retiré du salon.");
                    latest.current.onClose?.();
                }
            };
            ws.onclose = event => {
                online.current = false;
                setConnected(false);
                latest.current.onConnectionChange?.(false);
                const currentVideo = latest.current.videoRef?.current;
                if (snapshot.current) snapshot.current = { state: { ...snapshot.current.state,
                    playing: false, position_seconds: currentVideo?.currentTime || snapshot.current.state.position_seconds }, at: performance.now() };
                currentVideo?.pause();
                if (stopped) return;
                if ([4400, 4401, 4403, 4404, 4409, 4410, 4429].includes(event.code)) {
                    setFatal(event.code === 4409 ? "Salon complet ou déjà ouvert dans un autre onglet." : "Salon indisponible ou accès refusé. Revenez à Room Party.");
                    return;
                }
                if (++attempts > 8) { setFatal("Connexion perdue. Rechargez la page pour réessayer."); return; }
                retry = setTimeout(connect, Math.min(8000, attempts * 1000));
            };
        };
        connect();
        const heartbeat = setInterval(() => {
            if (online.current && ws?.readyState === 1) ws.send(JSON.stringify({ type: "ping", nonce: performance.now() }));
        }, 10000);
        return () => {
            stopped = true;
            online.current = false;
            clearTimeout(retry);
            clearInterval(heartbeat);
            ws?.close();
        };
    }, [props.code, props.profileId]);

    // Rebind when an episode/quality replaces the actual video element.
    useEffect(() => {
        let attached = null, detach = () => {}, pending = null, lastPush = 0, waiting = false, initialized = false;
        const push = () => {
            pending = null;
            const video = attached;
            if (!video || !initialized || !role.current || !online.current || !running.current || !latest.current.sourceReady || applying.current) return;
            lastPush = performance.now();
            send({ type: "sync", position_seconds: video.currentTime || 0, playing: !video.paused && !video.ended && !waiting,
                playback_rate: video.playbackRate, ...latest.current.currentEpisode });
        };
        const change = event => {
            if (applying.current) return;
            if (!role.current) { applyRef.current(); return; }
            if (!running.current || !online.current) { if (attached && !attached.paused) attached.pause(); return; }
            if (event.type === "waiting") waiting = true;
            if (["playing", "canplay", "seeked"].includes(event.type)) waiting = false;
            if (pending) clearTimeout(pending);
            pending = setTimeout(push, Math.max(0, 180 - (performance.now() - lastPush)));
        };
        const events = ["play", "pause", "seeked", "ratechange", "waiting", "playing", "canplay", "ended"];
        const probe = () => {
            const video = latest.current.videoRef?.current || null;
            if (video !== attached) {
                detach();
                attached = video;
                waiting = false;
                initialized = false;
                if (video) {
                    applyRef.current(true);
                    events.forEach(name => video.addEventListener(name, change));
                    detach = () => events.forEach(name => video.removeEventListener(name, change));
                    send({ type: "request_state" });
                } else detach = () => {};
            }
            if (video?.readyState >= 1 && snapshot.current && !initialized) {
                initialized = true;
                applyRef.current(true);
            }
            if (!role.current || !running.current || !online.current) applyRef.current();
        };
        const tick = setInterval(probe, 400);
        const updates = setInterval(push, 2000);
        probe();
        return () => { detach(); clearInterval(tick); clearInterval(updates); clearTimeout(pending); };
    }, []); // All changing values are read through refs.

    useEffect(() => {
        if (!connected) return;
        send({ type: "ready", done: Boolean(props.sourceReady), grant: props.grant || null });
    }, [connected, props.sourceReady, props.grant, props.currentEpisode?.season_number, props.currentEpisode?.episode_number]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!connected || !isHost || !props.currentEpisode || !snapshot.current) return;
        const state = snapshot.current.state;
        if (String(state.season_number) === String(props.currentEpisode.season_number) && String(state.episode_number) === String(props.currentEpisode.episode_number)) return;
        send({ type: "episode", ...props.currentEpisode });
    }, [connected, isHost, props.currentEpisode?.season_number, props.currentEpisode?.episode_number]); // eslint-disable-line react-hooks/exhaustive-deps

    return { room, participants, messages, isHost, started, connected, fatal, pauseRequest, setPauseRequest,
        needsGesture, resume: () => applyRef.current(true), send };
}
