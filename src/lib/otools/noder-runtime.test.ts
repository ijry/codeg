import { readFileSync } from "node:fs"
import { Buffer as NodeBuffer } from "node:buffer"
import path from "node:path"
import { TextDecoder, TextEncoder } from "node:util"
import { describe, expect, it } from "vitest"

type NoderWindow = Window & {
  __OToolsEnv?: Record<string, unknown>
  __OTOOLS_NODER__?: {
    createRequire(filename?: string): (specifier: string) => any
    require(specifier: string): any
  }
  TextDecoder?: typeof TextDecoder
  TextEncoder?: typeof TextEncoder
}

const runtimeScript = readFileSync(
  path.resolve(process.cwd(), "public/otools/noder-runtime.js"),
  "utf8"
)
const sourceRuntimeScript = readFileSync(
  path.resolve(process.cwd(), "otools/platform/noder/src/runtime.js"),
  "utf8"
)

function installNoderRuntime(files: Record<string, string> = {}) {
  const iframe = document.createElement("iframe")
  document.body.appendChild(iframe)
  const win = iframe.contentWindow as NoderWindow
  const normalizedFiles = new Map(
    Object.entries(files).map(([filePath, content]) => [
      path.posix.normalize(filePath),
      content,
    ])
  )
  const normalizeFsPath = (value: unknown) =>
    path.posix.normalize(String(value || "/"))
  const isDirectory = (value: string) => {
    const normalized = normalizeFsPath(value).replace(/\/+$/, "")
    return Array.from(normalizedFiles.keys()).some((filePath) =>
      filePath.startsWith(`${normalized}/`)
    )
  }
  const isFile = (value: string) => normalizedFiles.has(normalizeFsPath(value))
  const statPayload = (value: string) => {
    const normalized = normalizeFsPath(value)
    const file = normalizedFiles.get(normalized)
    const directory = file === undefined && isDirectory(normalized)
    if (file === undefined && !directory) {
      return null
    }
    return {
      accessedAtMs: 0,
      createdAtMs: 0,
      isDirectory: directory,
      isFile: file !== undefined,
      isSymlink: false,
      modifiedAtMs: 0,
      name: path.posix.basename(normalized),
      path: normalized,
      size: file?.length ?? 0,
    }
  }
  win.TextDecoder = TextDecoder
  win.TextEncoder = TextEncoder
  Object.defineProperty(win, "XMLHttpRequest", {
    configurable: true,
    value: class {
      responseText = ""
      status = 200

      open() {}
      setRequestHeader() {}
      send(body?: string) {
        const request = body ? JSON.parse(body) : {}
        const op = request.op || ""
        const args = request.args || {}
        let value: unknown
        switch (op) {
          case "process.cwd":
            value = { cwd: "/app" }
            break
          case "fs.exists":
            value = {
              exists: isFile(args.path) || isDirectory(args.path),
            }
            break
          case "fs.stat":
          case "fs.lstat": {
            const stat = statPayload(args.path)
            if (!stat) {
              this.status = 404
              this.responseText = JSON.stringify({
                ok: false,
                error: { code: "ENOENT", message: "not found" },
              })
              return
            }
            value = stat
            break
          }
          case "fs.realpath":
            value = { path: normalizeFsPath(args.path) }
            break
          case "fs.readFile": {
            const content = normalizedFiles.get(normalizeFsPath(args.path))
            if (content === undefined) {
              this.status = 404
              this.responseText = JSON.stringify({
                ok: false,
                error: { code: "ENOENT", message: "not found" },
              })
              return
            }
            value = {
              dataBase64: NodeBuffer.from(content, "utf8").toString("base64"),
              path: normalizeFsPath(args.path),
            }
            break
          }
          default:
            value = {
                arch: "x64",
                cpus: [],
                cwd: "/app",
                eol: "\n",
                freemem: 0,
                homedir: "/home/test",
                hostname: "test",
                platform: "linux",
                release: "",
                tmpdir: "/tmp",
                totalmem: 0,
                type: "Linux",
              }
        }
        this.responseText = JSON.stringify({ ok: true, value })
      }
    },
  })
  win.__OToolsEnv = {
    pluginPermissions: ["dialog", "fs", "shell", "child_process"],
    pluginUuid: "sample-plugin",
  }
  win.eval(runtimeScript)
  return {
    createRequire: win.__OTOOLS_NODER__?.createRequire,
    iframe,
    require: win.__OTOOLS_NODER__?.require,
  }
}

describe("otools noder runtime", () => {
  it("keeps public and embedded source runtime copies in sync", () => {
    expect(sourceRuntimeScript.replace(/\r\n/g, "\n")).toBe(
      runtimeScript.replace(/\r\n/g, "\n")
    )
  })

  it("exposes common node built-ins used by external plugins", () => {
    const { iframe, require } = installNoderRuntime()

    try {
      expect(typeof require).toBe("function")

      const util = require?.("node:util")
      expect(util.format("hello %s", "plugin")).toBe("hello plugin")

      const querystring = require?.("querystring")
      const parsedQuery = querystring.parse("a=1&a=2+b")
      expect(parsedQuery.a).toEqual(["1", "2 b"])
      expect(querystring.stringify({ a: ["1", "2 b"] })).toBe(
        "a=1&a=2%20b"
      )

      const url = require?.("node:url")
      expect(url.pathToFileURL("/tmp/a b").href).toBe("file:///tmp/a%20b")
      expect(url.fileURLToPath("file:///tmp/a%20b")).toBe("/tmp/a b")

      const crypto = require?.("node:crypto")
      expect(crypto.createHash("sha256").update("abc").digest("hex")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      )
      expect(crypto.randomBytes(4)).toHaveLength(4)
      expect(crypto.randomUUID()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )

      const stream = require?.("stream")
      const readable = new stream.Readable()
      const chunks: string[] = []
      readable.on("data", (chunk: string) => chunks.push(chunk))
      readable.push("ok")
      expect(chunks).toEqual(["ok"])

      const timers = require?.("timers")
      expect(typeof timers.setImmediate).toBe("function")

      const moduleBuiltin = require?.("module")
      expect(moduleBuiltin.builtinModules).toContain("util")
      expect(typeof moduleBuiltin.createRequire("preload.js")).toBe("function")
    } finally {
      iframe.remove()
    }
  })

  it("provides package-oriented node compatibility aliases", async () => {
    const { iframe, require } = installNoderRuntime()

    try {
      const assert = require?.("assert")
      assert.deepStrictEqual({ nested: [1] }, { nested: [1] })
      const assertion = new assert.AssertionError({
        actual: 1,
        expected: 2,
        operator: "strictEqual",
      })
      expect(assertion).toBeInstanceOf(assert.AssertionError)
      expect(assertion.code).toBe("ERR_ASSERTION")

      const strictAssert = require?.("node:assert/strict")
      expect(() => strictAssert.equal(1, "1")).toThrow(assert.AssertionError)

      const { StringDecoder } = require?.("string_decoder")
      const decoder = new StringDecoder("utf8")
      expect(decoder.write(Buffer.from([0xe2]))).toBe("")
      expect(decoder.end(Buffer.from([0x82, 0xac]))).toBe("€")

      const constants = require?.("node:constants")
      expect(constants.F_OK).toBe(0)
      expect(constants.errno.ENOENT).toBe(2)

      const pathPosix = require?.("node:path/posix")
      const pathWin32 = require?.("path/win32")
      expect(pathPosix.join("/tmp", "a", "..", "b")).toBe("/tmp/b")
      expect(pathWin32.join("C:\\tmp", "a")).toBe("C:\\tmp\\a")

      const processBrowser = require?.("process/browser")
      expect(processBrowser).toBe(require?.("process"))

      const utilTypes = require?.("node:util/types")
      expect(utilTypes.isUint8Array(Buffer.from("ok"))).toBe(true)

      const tty = require?.("tty")
      expect(tty.isatty(1)).toBe(false)
      expect(new tty.WriteStream(1).write("")).toBe(true)

      const stream = require?.("stream")
      const consumers = require?.("stream/consumers")
      await expect(consumers.text(stream.Readable.from(["hello"]))).resolves.toBe(
        "hello"
      )

      const streamPromises = require?.("node:stream/promises")
      const readable = stream.Readable.from(["done"])
      await expect(streamPromises.finished(readable)).resolves.toBeUndefined()

      const domain = require?.("domain").create()
      const handled: string[] = []
      domain.on("error", (error: Error) => handled.push(error.message))
      domain.run(() => {
        throw new Error("captured")
      })
      expect(handled).toEqual(["captured"])
    } finally {
      iframe.remove()
    }
  })

  it("provides browser-safe Electron compatibility aliases", async () => {
    const { iframe, require } = installNoderRuntime()

    try {
      const electron = require?.("electron")
      const renderer = require?.("electron/renderer")
      const remote = require?.("@electron/remote")
      const legacyRemote = require?.("electron/remote")

      expect(renderer).toBe(electron)
      expect(remote).toBe(electron.remote)
      expect(legacyRemote).toBe(electron.remote)

      electron.clipboard.writeText("hello")
      expect(electron.clipboard.readText()).toBe("hello")
      expect(electron.clipboard.availableFormats()).toContain("text/plain")

      const image = electron.nativeImage.createFromDataURL(
        "data:image/png;base64,aGVsbG8="
      )
      expect(image.isEmpty()).toBe(false)
      expect(image.toDataURL()).toBe("data:image/png;base64,aGVsbG8=")
      electron.clipboard.writeImage(image)
      expect(electron.clipboard.availableFormats()).toContain("image/png")

      await expect(electron.shell.openPath("")).resolves.toBe("")
      await expect(electron.ipcRenderer.invoke("missing-channel")).resolves.toBeNull()

      expect(electron.app.isReady()).toBe(true)
      await expect(electron.app.whenReady()).resolves.toBeUndefined()
      expect(electron.app.getName()).toBe("codeg-plus")

      const focusedWindow = electron.BrowserWindow.getFocusedWindow()
      expect(focusedWindow).toBeTruthy()
      expect(electron.remote.getCurrentWindow()).toBe(focusedWindow)
      expect(focusedWindow.webContents.getURL()).toContain("about:blank")

      expect(electron.screen.getAllDisplays()).toHaveLength(1)
      expect(electron.Notification.isSupported()).toBe(true)
      expect(typeof electron.contextBridge.exposeInMainWorld).toBe("function")
    } finally {
      iframe.remove()
    }
  })

  it("supports node-style Buffer and EventEmitter helpers", async () => {
    const { iframe, require } = installNoderRuntime()

    try {
      const { Buffer } = require?.("buffer")
      expect(Buffer.from("6869", "hex").toString()).toBe("hi")
      expect(Buffer.from("aGk", "base64url").toString()).toBe("hi")
      expect(Buffer.alloc(4, "ff", "hex").toString("hex")).toBe("ffffffff")
      expect(Buffer.allocUnsafe(2)).toHaveLength(2)
      expect(Buffer.isEncoding("utf8")).toBe(true)
      expect(Buffer.byteLength("6869", "hex")).toBe(2)
      expect(Buffer.compare(Buffer.from("a"), Buffer.from("b"))).toBeLessThan(0)

      const target = Buffer.alloc(4)
      expect(Buffer.from("test").copy(target, 1, 1, 3)).toBe(2)
      expect(target.toString("utf8", 0, 4)).toBe("\u0000es\u0000")

      const mutable = Buffer.alloc(4)
      expect(mutable.write("6869", 1, "hex")).toBe(2)
      expect(mutable.includes(Buffer.from("hi"))).toBe(true)
      expect(mutable.indexOf("hi")).toBe(1)
      expect(mutable.toJSON()).toEqual({
        type: "Buffer",
        data: [0, 104, 105, 0],
      })

      const Events = require?.("events")
      expect(typeof Events).toBe("function")
      expect(Events.EventEmitter).toBe(Events)
      const emitter = new Events()
      const seen: string[] = []
      const listener = () => seen.push("on")
      emitter.on("ready", listener)
      emitter.prependOnceListener("ready", () => seen.push("first"))
      expect(emitter.listenerCount("ready")).toBe(2)
      expect(Events.listenerCount(emitter, "ready")).toBe(2)
      expect(emitter.listeners("ready")).toHaveLength(2)
      const ready = Events.once(emitter, "ready")
      emitter.emit("ready")
      await expect(ready).resolves.toEqual([])
      emitter.emit("ready")
      expect(seen).toEqual(["first", "on", "on"])
      emitter.removeListener("ready", listener)
      expect(emitter.eventNames()).toEqual([])
      expect(() => emitter.emit("error", new Error("boom"))).toThrow("boom")
    } finally {
      iframe.remove()
    }
  })

  it("resolves node_modules packages with package.json main entries", () => {
    const { createRequire, iframe } = installNoderRuntime({
      "/app/node_modules/demo/package.json": JSON.stringify({
        main: "dist/index.js",
      }),
      "/app/node_modules/demo/dist/index.js": `
        const nested = require("./nested")
        module.exports = {
          answer: nested.answer,
          dirname: __dirname,
          main: module.filename,
          pathCount: module.paths.length,
        }
      `,
      "/app/node_modules/demo/dist/nested.js": "exports.answer = 42",
      "/app/node_modules/exports-demo/package.json": JSON.stringify({
        exports: {
          ".": {
            default: "./esm/index.js",
            require: "./cjs/index.js",
          },
          "./feature": {
            browser: "./browser/feature.js",
            require: "./cjs/feature.js",
          },
          "./wild/*": "./lib/*.js",
        },
      }),
      "/app/node_modules/exports-demo/browser/feature.js":
        "module.exports = 'browser-feature'",
      "/app/node_modules/exports-demo/cjs/feature.js":
        "module.exports = 'cjs-feature'",
      "/app/node_modules/exports-demo/cjs/index.js":
        "module.exports = 'cjs-root'",
      "/app/node_modules/exports-demo/esm/index.js":
        "module.exports = 'esm-root'",
      "/app/node_modules/exports-demo/lib/tool.js":
        "module.exports = 'wild-tool'",
    })

    try {
      const requireFromPlugin = createRequire?.("/app/plugin/preload.js")
      const demo = requireFromPlugin?.("demo")
      expect(demo).toEqual({
        answer: 42,
        dirname: "/app/node_modules/demo/dist",
        main: "/app/node_modules/demo/dist/index.js",
        pathCount: 4,
      })
      expect(requireFromPlugin?.resolve("demo")).toBe(
        "/app/node_modules/demo/dist/index.js"
      )
      expect(requireFromPlugin?.("exports-demo")).toBe("cjs-root")
      expect(requireFromPlugin?.("exports-demo/feature")).toBe(
        "browser-feature"
      )
      expect(requireFromPlugin?.("exports-demo/wild/tool")).toBe("wild-tool")
      expect(requireFromPlugin?.resolve("exports-demo/feature")).toBe(
        "/app/node_modules/exports-demo/browser/feature.js"
      )
    } finally {
      iframe.remove()
    }
  })
})
