import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  isOtoolsPluginRuntime,
  openExternal,
  pickFile,
} from "otools-plugin-sdk";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element");
}

const state = {
  selectedFile: "None",
  lastEvent: "No events received yet",
  invokeResult: "Not called yet",
};

app.innerHTML = `
  <main style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.5;">
    <h1>OTools Plugin SDK Minimal Example</h1>
    <p>
      App code keeps official <code>@tauri-apps/api</code> imports.
      The SDK Vite plugin rewrites them at build time for OTools compatibility.
    </p>
    <p><strong>Runtime:</strong> <span id="runtime"></span></p>
    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin: 20px 0;">
      <button id="invoke-btn" type="button">Invoke Example Command</button>
      <button id="pick-file-btn" type="button">Pick File</button>
      <button id="docs-btn" type="button">Open Docs</button>
    </div>
    <section>
      <h2>State</h2>
      <p><strong>Invoke:</strong> <span id="invoke-result"></span></p>
      <p><strong>Selected file:</strong> <span id="selected-file"></span></p>
      <p><strong>Last event:</strong> <span id="last-event"></span></p>
    </section>
  </main>
`;

const runtimeEl = query("#runtime");
const invokeResultEl = query("#invoke-result");
const selectedFileEl = query("#selected-file");
const lastEventEl = query("#last-event");

render();
void bindEvents();

query<HTMLButtonElement>("#invoke-btn").addEventListener("click", async () => {
  try {
    const result = await invoke<string>("example_command", {
      message: "hello from frontend",
    });
    state.invokeResult = result;
  } catch (error) {
    state.invokeResult =
      error instanceof Error ? error.message : String(error);
  }
  render();
});

query<HTMLButtonElement>("#pick-file-btn").addEventListener("click", async () => {
  state.selectedFile = (await pickFile()) ?? "Cancelled";
  render();
});

query<HTMLButtonElement>("#docs-btn").addEventListener("click", () => {
  const url =
    "https://github.com/farion1231/cc-switch/tree/main/otools-plugin-sdk";

  if (isOtoolsPluginRuntime()) {
    openExternal(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
});

async function bindEvents() {
  await listen("provider-switched", (event) => {
    state.lastEvent = JSON.stringify(event.payload);
    render();
  });
}

function render() {
  runtimeEl.textContent = isOtoolsPluginRuntime()
    ? "OTools plugin runtime"
    : "Standard Tauri runtime";
  invokeResultEl.textContent = state.invokeResult;
  selectedFileEl.textContent = state.selectedFile;
  lastEventEl.textContent = state.lastEvent;
}

function query<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}
