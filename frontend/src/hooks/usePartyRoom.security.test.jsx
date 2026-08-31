import React, { act } from "react";
import { createRoot } from "react-dom/client";
import usePartyRoom from "./usePartyRoom";
import { partyPath, partyPosition, validPartyCode } from "@/lib/partySync";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), info: jest.fn() } }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, ws, result, video, props, originalSocket;
class Socket {
    constructor() { ws = this; this.readyState = 1; this.sent = []; }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; }
    message(data) { this.onmessage({ data: JSON.stringify(data) }); }
}
function Harness(values) { result = usePartyRoom(values); return null; }
beforeEach(() => {
    jest.useFakeTimers();
    originalSocket = global.WebSocket;
    global.WebSocket = Socket;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    video = document.createElement("video");
    let paused = true;
    Object.defineProperties(video, { duration: { value: 600 }, readyState: { configurable: true, value: 4 }, paused: { get: () => paused } });
    video.play = jest.fn(() => { paused = false; video.dispatchEvent(new Event("play")); return Promise.resolve(); });
    video.pause = jest.fn(() => { paused = true; video.dispatchEvent(new Event("pause")); });
    props = { code: "AB12CD34", videoRef: { current: video }, sourceReady: true, currentEpisode: null,
        onHostChange: jest.fn(), onStartedChange: jest.fn(), onEpisodeSync: jest.fn(), onClose: jest.fn() };
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    global.WebSocket = originalSocket;
    jest.useRealTimers();
});
async function mount() { await act(async () => root.render(<Harness {...props} />)); }
async function message(data) { await act(async () => ws.message(data)); }
async function tick(ms) { await act(async () => jest.advanceTimersByTime(ms)); }
const state = (extra = {}) => ({ position_seconds: 30, playback_rate: 1.25, playing: true, updated_at: 100, server_time: 100, revision: 1, ...extra });
async function hello(host = false, extra = {}) {
    await message({ type: "hello", room: { code: props.code }, you: { is_host: host }, started: true, state: state(extra) });
}

test("only generated code formats and the server's media/episode select a room", () => {
    expect(validPartyCode("NAKED")).toBe(false);
    expect(validPartyCode("ABCDEF")).toBe(true);
    expect(validPartyCode("AB12CD34")).toBe(true);
    expect(partyPath({ code: "AB12CD34", media_id: "other", state: { season_number: 2, episode_number: 3 } })).toBe("/watch/other?party=AB12CD34&season=2&episode=3");
    expect(partyPosition(state({ updated_at: 98 }), 1000, 3000, 0.2)).toBeCloseTo(35.25);
    expect(partyPosition(state({ playing: false }), 0, 99999)).toBe(30);
});

test("guest speed, seeking and pause are restored to the authoritative timeline", async () => {
    await mount(); await hello(); await tick(400);
    expect(video.playbackRate).toBe(1.25);
    await act(async () => { video.playbackRate = 0.5; video.dispatchEvent(new Event("ratechange")); });
    expect(video.playbackRate).toBe(1.25);
    await act(async () => { video.currentTime = 250; video.dispatchEvent(new Event("seeked")); });
    expect(video.currentTime).toBeLessThan(32);
    await act(async () => video.pause());
    expect(video.paused).toBe(false);
    expect(ws.sent.some(item => item.type === "sync")).toBe(false);
    await message({ type: "sync", started: true, state: state({ playing: false, position_seconds: 70, revision: 3 }) });
    expect(video.paused).toBe(true);
    await message({ type: "sync", started: true, state: state({ position_seconds: 4, revision: 2 }) });
    expect(video.currentTime).toBe(70);
});

test("late players and replacements receive cached snapshots including speed", async () => {
    props.videoRef.current = null;
    await mount(); await hello(); await tick(2400);
    props.videoRef.current = video;
    await tick(400);
    expect(video.currentTime).toBeGreaterThan(33);
    expect(video.playbackRate).toBe(1.25);
    expect(video.play).toHaveBeenCalled();
});

test("host publishes speed and episode without echoing guest commands", async () => {
    await mount(); await hello(true); await tick(400);
    video.currentTime = 120;
    await act(async () => { video.playbackRate = 1.5; video.dispatchEvent(new Event("ratechange")); });
    await tick(200);
    expect(ws.sent.filter(item => item.type === "sync").pop()).toMatchObject({ position_seconds: 120, playback_rate: 1.5, playing: true });
    await act(async () => ws.onclose({ code: 1006 }));
    expect(video.paused).toBe(true);
});

test("readiness sends the grant and waits for authentication, with refreshed callbacks", async () => {
    props.grant = "test-only";
    await mount();
    expect(ws.sent).toEqual([]);
    await hello();
    expect(ws.sent).toContainEqual({ type: "ready", done: true, grant: "test-only" });
    const updated = jest.fn();
    props = { ...props, onEpisodeSync: updated };
    await mount();
    await message({ type: "episode", started: false, state: state({ playing: false, season_number: "2", episode_number: "3", revision: 4 }) });
    expect(updated).toHaveBeenCalledWith("2", "3");
    expect(props.onStartedChange).toHaveBeenLastCalledWith(false);
});
