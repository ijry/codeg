import { describe, expect, it, vi } from "vitest";
import electron, {
  BrowserWindow,
  clipboard,
  ipcRenderer,
  nativeImage,
  shell,
} from "../src/electron-shim";
import remote from "../src/electron-remote-shim";
import remoteMain from "../src/electron-remote-main-shim";

describe("electron shim", () => {
  it("provides browser-safe Electron fallback APIs", async () => {
    const copyText = vi.fn();
    const copyImage = vi.fn();
    const shellOpenPath = vi.fn();
    (
      window as Window & {
        otools?: {
          copyImage?: (image: string) => boolean;
          copyText?: (text: string) => boolean;
          shellOpenPath?: (path: string) => void;
        };
      }
    ).otools = {
      copyImage,
      copyText,
      shellOpenPath,
    };

    clipboard.writeText("hello");
    expect(clipboard.readText()).toBe("hello");
    expect(copyText).toHaveBeenCalledWith("hello");

    const image = nativeImage.createFromDataURL("data:image/png;base64,aGk=");
    clipboard.writeImage(image);
    expect(clipboard.availableFormats()).toContain("image/png");
    expect(copyImage).toHaveBeenCalledWith("data:image/png;base64,aGk=");

    await expect(shell.openPath("/tmp/file.txt")).resolves.toBe("");
    expect(shellOpenPath).toHaveBeenCalledWith("/tmp/file.txt");

    await expect(ipcRenderer.invoke("missing")).resolves.toBeNull();
    expect(BrowserWindow.getFocusedWindow().isDestroyed()).toBe(false);
    expect(remote.getCurrentWindow()).toBeTruthy();
    expect(remoteMain.initialize()).toBeUndefined();
    expect(electron.clipboard).toBeTruthy();
  });
});
