# Minimal Vite Example

This is the smallest frontend example for `otools-plugin-sdk`.

## What it shows

- Keep official imports from `@tauri-apps/api/core` and `@tauri-apps/api/event`
- Use `otoolsTauriShimPlugin()` in Vite
- Use SDK helpers like `isOtoolsPluginRuntime`, `pickFile`, and `openExternal`

## Run locally

From the repository root:

```bash
pnpm --filter otools-plugin-sdk build
pnpm --dir otools-plugin-sdk/examples/minimal-vite install
pnpm --dir otools-plugin-sdk/examples/minimal-vite dev
```

## Notes

- The `example_command` invoke call is only a placeholder to show the pattern.
- In a real app, replace `workspace:*` with a published npm version of `otools-plugin-sdk`.
