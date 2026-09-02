import React, { act } from "react";
import { createRoot } from "react-dom/client";
import OfflineDownloadButton from "./OfflineDownloadButton";
import { useAuth } from "@/context/AuthContext";
import { useOfflineDownloads } from "@/context/OfflineDownloadsContext";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
jest.mock("@/context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/context/OfflineDownloadsContext", () => ({ useOfflineDownloads: jest.fn() }));
jest.mock("@/lib/offline", () => ({ makeDownloadId: () => "saved-id" }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, download, getDownload;
const media = { id: "series1", title: "Série", type: "series" };
const episode = { season_number: 2, ep_number: 3 };
beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    download = jest.fn().mockResolvedValue();
    getDownload = jest.fn().mockReturnValue(null);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function mount({ user = null, eligible = false, progress = {} } = {}) {
    useAuth.mockReturnValue({ user });
    useOfflineDownloads.mockReturnValue({ eligible, download, getDownload, progress });
    await act(async () => root.render(<OfflineDownloadButton media={media} episode={episode} player />));
    return container.querySelector("button");
}
test("the player download control keeps login and Premium gates", async () => {
    let button = await mount();
    expect(button.getAttribute("aria-label")).toContain("Premium");
    await act(async () => button.click());
    expect(mockNavigate).toHaveBeenLastCalledWith("/login");
    button = await mount({ user: { user_id: "free" } });
    await act(async () => button.click());
    expect(mockNavigate).toHaveBeenLastCalledWith("/pricing");
    expect(download).not.toHaveBeenCalled();
    expect(container.querySelector("a[href]")).toBeNull();
});
test("Premium download uses the selected episode and cannot duplicate an active transfer", async () => {
    let button = await mount({ user: { user_id: "premium" }, eligible: true });
    await act(async () => button.click());
    expect(download).toHaveBeenCalledWith(media, episode);
    button = await mount({ user: { user_id: "premium" }, eligible: true, progress: { "saved-id": { percent: 42 } } });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toContain("42 %");
    await act(async () => button.click());
    expect(download).toHaveBeenCalledTimes(1);
});
test("an existing download opens the downloads library without fetching the source again", async () => {
    getDownload.mockReturnValue({ id: "saved-id" });
    const button = await mount({ user: { user_id: "premium" }, eligible: true });
    await act(async () => button.click());
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=downloads");
    expect(download).not.toHaveBeenCalled();
});
