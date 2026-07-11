import { beforeEach, describe, expect, it, vi } from "vitest";
import { transformCallback } from "../src/tauri-core-shim";
import { invoke, listen } from "../src/runtime";
import { confirm, open as openDialog } from "../src/tauri-plugin-dialog-shim";

describe("otools runtime bridge", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    delete (window as Window & { otools?: unknown }).otools;
    delete (window as Window & { utools?: unknown }).utools;
    delete (
      window as Window & { __TAURI_INTERNALS__?: unknown }
    ).__TAURI_INTERNALS__;
    delete (
      window as Window & { __TAURI_EVENT_PLUGIN_INTERNALS__?: unknown }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__;
  });

  it("opens iframe popup for secondary window commands", async () => {
    (window as Window & { otools?: unknown }).otools = {
      invokeNative: vi.fn().mockResolvedValue({ path: "/settings/system" }),
    };

    await invoke("open_settings_window", { section: "system" });
    const iframe = document.querySelector(
      "iframe[data-otools-popup-target]",
    ) as HTMLIFrameElement | null;
    expect(iframe?.src).toContain("/settings/system");
  });

  it("forwards listenNative events into tauri-style listeners", async () => {
    (window as Window & { otools?: unknown }).otools = {
      invokeNative: vi.fn(),
      listenNative: vi.fn(
        async (
          handler: (event: { payload: { topic: string; payload: unknown } }) => void,
        ) => {
          handler({ payload: { topic: "acp://event", payload: { seq: 1 } } });
          return async () => {};
        },
      ),
    };

    const seen: number[] = [];
    const unlisten = await listen("acp://event", (event) => {
      seen.push((event.payload as { seq: number }).seq);
    });

    await new Promise((resolve) => window.setTimeout(resolve, 50));
    await unlisten();
    expect(seen).toEqual([1]);
  });

  it("installs tauri-style unregister hooks for native event listeners", async () => {
    let nativeHandler:
      | ((event: { payload: { topic: string; payload: unknown } }) => void)
      | undefined;

    (window as Window & { otools?: unknown }).otools = {
      invokeNative: vi.fn(),
      listenNative: vi.fn(
        async (
          handler: (event: { payload: { topic: string; payload: unknown } }) => void,
        ) => {
          nativeHandler = handler;
          return async () => {};
        },
      ),
    };

    const seen: number[] = [];
    const handlerId = transformCallback((event: { payload: { seq: number } }) => {
      seen.push(event.payload.seq);
    });

    const eventId = await invoke<number>("plugin:event|listen", {
      event: "acp://event",
      target: { kind: "Any" },
      handler: handlerId,
    });

    nativeHandler?.({
      payload: { topic: "acp://event", payload: { seq: 1 } },
    });
    expect(seen).toEqual([1]);

    await (
      window as Window & {
        __TAURI_EVENT_PLUGIN_INTERNALS__?: {
          unregisterListener?: (event: string, eventId: number) => Promise<void> | void;
        };
      }
    ).__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener?.(
      "acp://event",
      eventId,
    );

    nativeHandler?.({
      payload: { topic: "acp://event", payload: { seq: 2 } },
    });
    expect(seen).toEqual([1]);
  });

  it("prefers host dialog APIs when available", async () => {
    const dialog = {
      open: vi.fn().mockResolvedValue("/tmp/example.txt"),
      save: vi.fn().mockResolvedValue("/tmp/output.txt"),
      message: vi.fn().mockResolvedValue(undefined),
      confirm: vi.fn().mockResolvedValue(true),
      ask: vi.fn().mockResolvedValue(true),
    };

    (window as Window & { otools?: unknown }).otools = {
      invokeNative: vi.fn(),
      dialog,
    };

    await expect(openDialog({ title: "Pick" })).resolves.toBe("/tmp/example.txt");
    await expect(confirm("Continue?")).resolves.toBe(true);

    expect(dialog.open).toHaveBeenCalledWith({ title: "Pick" });
    expect(dialog.confirm).toHaveBeenCalledWith("Continue?", undefined);
  });

  it("falls back to tauri internals when otools runtime is absent", async () => {
    const invokeInternal = vi
      .fn<(command: string, payload?: Record<string, unknown>) => Promise<{ ok: boolean }>>()
      .mockResolvedValue({ ok: true });

    (
      window as Window & {
        __TAURI_INTERNALS__?: {
          invoke?: typeof invokeInternal;
        };
      }
    ).__TAURI_INTERNALS__ = {
      invoke: invokeInternal,
    };

    await expect(invoke("healthcheck", { scope: "desktop" })).resolves.toEqual({
      ok: true,
    });
    expect(invokeInternal).toHaveBeenCalledWith(
      "healthcheck",
      { scope: "desktop" },
    );
  });

  it("routes tauri plugin commands through tauri internals in otools runtime", async () => {
    const invokeNative = vi.fn().mockResolvedValue({ ignored: true });
    const invokeInternal = vi
      .fn<(command: string, payload?: Record<string, unknown>) => Promise<string | null>>()
      .mockResolvedValue("D:/Downloads/demo.torrent");

    (window as Window & { otools?: unknown }).otools = {
      invokeNative,
    };
    (
      window as Window & {
        __TAURI_INTERNALS__?: {
          invoke?: typeof invokeInternal;
        };
      }
    ).__TAURI_INTERNALS__ = {
      invoke: invokeInternal,
    };

    await expect(openDialog({ title: "Pick BT" })).resolves.toBe(
      "D:/Downloads/demo.torrent",
    );
    expect(invokeInternal).toHaveBeenCalledWith("plugin:dialog|open", {
      options: { title: "Pick BT" },
    });
    expect(invokeNative).not.toHaveBeenCalledWith(
      "plugin:dialog|open",
      expect.anything(),
    );
  });

  it("falls back to native plugin invoke when host returns unknown method", async () => {
    const invokeInternal = vi
      .fn<(command: string, payload?: Record<string, unknown>) => Promise<never>>()
      .mockRejectedValue(new Error("unknown method: sample_load_data"));
    const invokeNative = vi.fn().mockResolvedValue([{ id: 1 }]);

    (window as Window & { otools?: unknown }).otools = {
      invokeNative,
    };
    (
      window as Window & {
        __TAURI_INTERNALS__?: {
          invoke?: typeof invokeInternal;
        };
      }
    ).__TAURI_INTERNALS__ = {
      invoke: invokeInternal,
    };
    window.__OToolsEnv = { pluginUuid: "dev-debug:sample-plugin" };

    await expect(invoke("sample_load_data")).resolves.toEqual([{ id: 1 }]);
    expect(invokeNative).toHaveBeenCalledWith("sample_load_data", null);
  });

  it("falls back when host error message is wrapped in object fields", async () => {
    const invokeInternal = vi
      .fn<(command: string, payload?: Record<string, unknown>) => Promise<never>>()
      .mockRejectedValue({ message: "unknown method: sample_get_status" });
    const invokeNative = vi.fn().mockResolvedValue({ installed: true });

    (window as Window & { otools?: unknown }).otools = {
      invokeNative,
    };
    (
      window as Window & {
        __TAURI_INTERNALS__?: {
          invoke?: typeof invokeInternal;
        };
      }
    ).__TAURI_INTERNALS__ = {
      invoke: invokeInternal,
    };
    window.__OToolsEnv = { pluginUuid: "dev-debug:sample-plugin" };

    await expect(invoke("sample_get_status")).resolves.toEqual({
      installed: true,
    });
    expect(invokeNative).toHaveBeenCalledWith(
      "sample_get_status",
      null,
    );
  });
});
