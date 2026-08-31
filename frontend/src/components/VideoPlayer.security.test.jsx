import React, { act } from "react";
import { createRoot } from "react-dom/client";
import VideoPlayer from "./VideoPlayer";
import EmbeddedPlayer from "./EmbeddedPlayer";
import { videoCrossOrigin } from "@/lib/videoProtection";

jest.mock("react-router-dom", () => ({ Link: ({ children }) => <span>{children}</span> }));
jest.mock("@/lib/api", () => ({ API: "https://api.example/api" }));
jest.mock("hls.js", () => {
    const Hls = jest.fn().mockImplementation(() => ({
        events: {}, levels: [{ height: 720 }],
        on(name, callback) { this.events[name] = callback; },
        loadSource: jest.fn(), attachMedia: jest.fn(), destroy: jest.fn(),
    }));
    Hls.isSupported = () => true;
    Hls.Events = { MANIFEST_PARSED: "manifest", ERROR: "error" };
    return { __esModule: true, default: Hls };
});
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, play, pause, load;
const sources = [{ quality: "720p", url: "https://cdn.example/first.mp4" }, { quality: "480p", url: "https://cdn.example/small.mp4" }];
beforeEach(() => {
    play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    pause = jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    load = jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    jest.restoreAllMocks();
    jest.useRealTimers();
});
async function mount(props = {}) {
    await act(async () => root.render(<VideoPlayer qualitySources={sources} runAds={false} fiche={{ titre: "Film de test", description: "Synopsis" }} {...props} />));
    return container.querySelector("video");
}
async function event(video, type) {
    await act(async () => video.dispatchEvent(new Event(type, { bubbles: true })));
}
async function click(selector) {
    await act(async () => container.querySelector(selector).click());
}

test("loading follows media events, not the poster or pause state", async () => {
    const video = await mount();
    expect(container.querySelector('[role="status"]').textContent).toContain("Chargement");
    expect(container.querySelector('[data-testid="player-center-play"]')).toBeNull();
    expect(container.textContent).not.toContain("Synopsis");
    await event(video, "canplay");
    expect(container.querySelector('[role="status"]')).toBeNull();
    await event(video, "playing");
    await event(video, "waiting");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await event(video, "playing");
    await event(video, "pause");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[data-testid="player-center-play"]')).not.toBeNull();
    expect(play).toHaveBeenCalledTimes(1);
});

test("native download and drag menus are suppressed without blocking page shortcuts", async () => {
    const video = await mount();
    expect(video.controls).toBe(false);
    expect(video.getAttribute("controlslist")).toContain("nodownload");
    expect(video.draggable).toBe(false);
    for (const type of ["contextmenu", "dragstart"]) {
        const e = new Event(type, { bubbles: true, cancelable: true });
        video.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(true);
    }
    const outside = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
    document.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
});

test("a failed stream displays an actionable error and can retry", async () => {
    const video = await mount();
    await event(video, "error");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]').textContent).toContain("Réessayer");
    await click('[role="alert"] button');
    expect(load).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
});

test("autoplay refusal exposes play instead of an endless spinner", async () => {
    play.mockRejectedValue(new DOMException("gesture required", "NotAllowedError"));
    await mount();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[data-testid="player-center-play"]')).not.toBeNull();
    await click('[data-testid="player-center-play"]');
    expect(container.querySelector('[role="alert"]')).toBeNull();
});

test("slow loading offers retry and cleans up timers", async () => {
    jest.useFakeTimers();
    await mount();
    await act(async () => jest.advanceTimersByTime(15000));
    expect(container.textContent).toContain("Le flux met du temps");
    expect(container.textContent).toContain("Réessayer");
});

test("quality switch restores position after metadata without resuming a paused video", async () => {
    const video = await mount({ startAt: 30 });
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    await event(video, "loadedmetadata");
    expect(video.currentTime).toBe(30);
    video.currentTime = 70;
    await click('[data-testid="player-settings"]');
    await click('[data-testid="quality-480p"]');
    await event(video, "loadedmetadata");
    expect(video.currentTime).toBe(70);
    expect(video.getAttribute("src")).toContain("small.mp4");
    expect(play).toHaveBeenCalledTimes(1);
    await mount({ qualitySources: [{ quality: "720p", url: "https://cdn.example/episode2.mp4" }], startAt: 10 });
    await event(video, "loadedmetadata");
    expect(video.currentTime).toBe(10);
    expect(video.src).toContain("episode2.mp4");
});

test("seek before metadata is harmless and Watch Party reference is cleared on unmount", async () => {
    const ref = { current: null };
    const video = await mount({ videoRefOut: ref });
    await click('[aria-label="Avancer de 10 secondes"]');
    expect(video.currentTime).toBe(0);
    expect(ref.current).toBe(video);
    await act(async () => root.render(null));
    expect(ref.current).toBeNull();
});

test("cookies go only to the authenticated API relay", () => {
    const api = "https://api.example/api";
    expect(videoCrossOrigin(`${api}/uqflex/stream?id=1`, api)).toBe("use-credentials");
    for (const url of ["https://cdn.example/video.mp4", "https://api.example.evil/api/uqflex/stream", "https://api.example/uploads/trailer.mp4"]) {
        expect(videoCrossOrigin(url, api)).toBeUndefined();
    }
});

test("settings tabs select speed and return keyboard focus to the trigger", async () => {
    const video = await mount();
    await click('[data-testid="player-settings"]');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await click('[role="tab"]:nth-child(2)');
    await click('[data-testid="vitesse-1.5"]');
    expect(video.playbackRate).toBe(1.5);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[data-testid="player-settings"]'));
    await click('[data-testid="player-settings"]');
    await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement.textContent).toBe("Son");
    expect(container.querySelector('[data-testid="player-boost"]')).not.toBeNull();
    await act(async () => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
});

test("selecting the current quality does not restart loading", async () => {
    const video = await mount();
    await event(video, "canplay");
    await click('[data-testid="player-settings"]');
    await click('[data-testid="quality-720p"]');
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(video.src).toContain("first.mp4");
});

test("fatal HLS failure has a fallback, retry and cleanup", async () => {
    const Hls = require("hls.js").default;
    Hls.mockClear();
    const fallback = jest.fn();
    await mount({ manifestUrl: "https://cdn.example/master.m3u8", onFluxImpossible: fallback });
    const first = Hls.mock.results[0].value;
    await act(async () => first.events.error(null, { fatal: false }));
    expect(fallback).not.toHaveBeenCalled();
    await act(async () => first.events.error(null, { fatal: true }));
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await click('[role="alert"] button');
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(Hls).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
});

test("embedded player shows document loading again when its source changes", async () => {
    await act(async () => root.render(<EmbeddedPlayer src="https://player.example/first" title="Lecteur" />));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await event(container.querySelector("iframe"), "load");
    expect(container.querySelector('[role="status"]')).toBeNull();
    await act(async () => root.render(<EmbeddedPlayer src="https://player.example/second" title="Lecteur" />));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
});
