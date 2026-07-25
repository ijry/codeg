import { describe, expect, it } from "vitest";
import { Buffer } from "../src/node-buffer-shim";
import Events, { EventEmitter, once } from "../src/node-events-shim";
import os from "../src/node-os-shim";
import path, { basename, dirname, join, parse } from "../src/node-path-shim";
import pathWin32 from "../src/node-path-win32-shim";
import process, { nextTick } from "../src/node-process-shim";
import querystring from "../src/node-querystring-shim";
import util from "../src/node-util-shim";
import utilTypes from "../src/node-util-types-shim";

describe("node static import shims", () => {
  it("provides browser-safe fallbacks for common Node builtins", async () => {
    expect(join("/tmp", "a", "..", "b.txt")).toBe("/tmp/b.txt");
    expect(path.resolve("tmp", "file.txt")).toBe("/tmp/file.txt");
    expect(dirname("/tmp/b.txt")).toBe("/tmp");
    expect(basename("/tmp/b.txt")).toBe("b.txt");
    expect(parse("/tmp/b.txt")).toMatchObject({
      base: "b.txt",
      ext: ".txt",
      name: "b",
    });
    expect(pathWin32.sep).toBe("\\");

    const encoded = Buffer.from("hello");
    expect(encoded.toString()).toBe("hello");
    expect(Buffer.from("6869", "hex").toString()).toBe("hi");
    expect(Buffer.alloc(2, 1)).toHaveLength(2);

    const emitter = new EventEmitter();
    const ready = once(emitter, "ready");
    emitter.emit("ready", "ok");
    await expect(ready).resolves.toEqual(["ok"]);
    expect(Events.EventEmitter).toBe(EventEmitter);

    expect(util.format("hello %s", "plugin")).toBe("hello plugin");
    expect(util.types.isUint8Array(Buffer.from("x"))).toBe(true);
    expect(utilTypes.isUint8Array(Buffer.from("x"))).toBe(true);

    expect(querystring.parse("a=1&a=2").a).toEqual(["1", "2"]);
    expect(querystring.stringify({ a: ["1", "2"] })).toBe("a=1&a=2");

    const ticked: string[] = [];
    nextTick(() => ticked.push("tick"));
    await Promise.resolve();
    expect(ticked).toEqual(["tick"]);
    expect(process.cwd()).toBeTruthy();
    expect(os.platform()).toBeTruthy();
  });
});
