import React, { act } from "react";
import { createRoot } from "react-dom/client";
import PreRollAd from "./PreRollAd";
import { loadAdsConfig, fetchVast, fireTrackers } from "@/lib/ads";

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("@/lib/ads", () => ({ loadAdsConfig: jest.fn(), fetchVast: jest.fn(), markShown: jest.fn(), frequencyAllows: () => true, fireTrackers: jest.fn() }));
let root, container, done;
beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); done = jest.fn();
    loadAdsConfig.mockResolvedValue({ enabled: true, preroll: { enabled: true, vast_tag_url: "https://ad.example/vast", duration: 15, skip_after: 5 }, campaigns: [] });
    fetchVast.mockResolvedValue({ mediaUrl: "https://ad.example/video.mp4", impressions: ["https://ad.example/impression"] });
    jest.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotAllowedError"));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); jest.useRealTimers(); });
const mount = () => act(async () => root.render(<PreRollAd enforce required onDone={done} />));

test("an autoplay refusal cannot count an unseen video as completed", async () => {
    await mount(); const video = container.querySelector("video");
    await act(async () => video.dispatchEvent(new Event("canplay")));
    await act(async () => jest.advanceTimersByTime(20000));
    expect(done).not.toHaveBeenCalled(); expect(fireTrackers).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Lancer la publicité");
    expect(container.querySelector('[data-testid="preroll-skip"]')).toBeNull();
    await act(async () => {
        video.dispatchEvent(new Event("playing"));
        Object.defineProperty(video, "currentTime", { value: 5, configurable: true });
        video.dispatchEvent(new Event("timeupdate"));
    });
    expect(fireTrackers).toHaveBeenCalledTimes(1);
    await act(async () => container.querySelector('[data-testid="preroll-skip"]').click());
    expect(done).toHaveBeenCalledTimes(1);
});

test("a media error shows retry and never unlocks the film", async () => {
    await mount(); await act(async () => container.querySelector("video").dispatchEvent(new Event("error")));
    expect(done).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => container.querySelector("button").click());
    expect(fetchVast).toHaveBeenCalledTimes(2); expect(container.querySelector("video")).not.toBeNull();
});

test("missing ad inventory cannot silently complete a required preroll", async () => {
    fetchVast.mockResolvedValue(null); await mount();
    expect(done).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
