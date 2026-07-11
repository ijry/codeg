import { beforeEach, describe, expect, it, vi } from "vitest";

const { tauriDialogOpenMock, tauriDialogSaveMock } = vi.hoisted(() => ({
  tauriDialogOpenMock: vi.fn(),
  tauriDialogSaveMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: tauriDialogOpenMock,
  save: tauriDialogSaveMock,
}));

import { pickFile, pickFiles, saveFile } from "../src/dialog";
import { open as openDialog, save as saveDialog } from "../src/tauri-plugin-dialog-shim";

describe("dialog normalization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    tauriDialogOpenMock.mockReset();
    tauriDialogSaveMock.mockReset();
    delete (window as Window & { otools?: unknown }).otools;
    delete (window as Window & { utools?: unknown }).utools;
  });

  it("normalizes object-shaped host dialog results", async () => {
    const dialog = {
      open: vi.fn().mockResolvedValue({ path: "D:/Downloads/demo.torrent" }),
      save: vi.fn().mockResolvedValue({ path: "D:/Downloads/output.txt" }),
    };

    (window as Window & { otools?: unknown }).otools = {
      invokeNative: vi.fn(),
      dialog,
    };

    await expect(openDialog({ title: "Pick BT" })).resolves.toBe(
      "D:/Downloads/demo.torrent",
    );
    await expect(saveDialog({ title: "Save As" })).resolves.toBe(
      "D:/Downloads/output.txt",
    );
  });

  it("lets pickFile and saveFile accept object-shaped tauri dialog payloads", async () => {
    tauriDialogOpenMock.mockResolvedValue({ path: "D:/Downloads/demo.torrent" });
    tauriDialogSaveMock.mockResolvedValue({ path: "D:/Downloads/output.txt" });

    await expect(pickFile({ title: "Pick BT" })).resolves.toBe(
      "D:/Downloads/demo.torrent",
    );
    await expect(saveFile({ title: "Save As" })).resolves.toBe(
      "D:/Downloads/output.txt",
    );
  });

  it("lets pickFiles accept object-shaped list payloads", async () => {
    tauriDialogOpenMock.mockResolvedValue([
      { path: "D:/Downloads/a.torrent" },
      { path: "D:/Downloads/b.torrent" },
    ]);

    await expect(pickFiles({ title: "Pick BT Files" })).resolves.toEqual([
      "D:/Downloads/a.torrent",
      "D:/Downloads/b.torrent",
    ]);
  });
});
