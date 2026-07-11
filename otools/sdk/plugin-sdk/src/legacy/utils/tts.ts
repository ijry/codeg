import { invoke } from "@tauri-apps/api/core";

export type TtsEngine = "edge" | "native";

export interface TtsVoice {
  engine: TtsEngine | string;
  name: string;
  shortName: string;
  displayName: string;
  friendlyName: string;
  locale: string;
  gender: string;
  suggestedCodec: string;
  status: string;
}

export interface TtsOutputFormatOption {
  value: string;
  label: string;
  fileExtension: string;
}

export interface TtsEngineOption {
  id: TtsEngine | string;
  label: string;
  summary: string;
  available: boolean;
  supportsAudioFile: boolean;
}

export interface TtsRecord {
  id: string;
  createdAt: string;
  engine: TtsEngine | string;
  engineLabel: string;
  text: string;
  textPreview: string;
  textLength: number;
  voiceShortName: string;
  voiceDisplayName: string;
  locale: string;
  rate: number;
  pitch: number;
  outputFormat: string;
  outputPath: string;
  outputExists: boolean;
  fileSize: number;
}

export interface TtsWorkspace {
  outputDir: string;
  history: TtsRecord[];
  engines: TtsEngineOption[];
  voices: TtsVoice[];
  voicesCachedAt?: string | null;
  edgeVoices: TtsVoice[];
  edgeVoicesCachedAt?: string | null;
  nativeVoices: TtsVoice[];
  nativeVoicesCachedAt?: string | null;
  defaultEngine: TtsEngine | string;
  outputFormats: TtsOutputFormatOption[];
  defaultVoice: string;
}

export interface TtsVoiceRefreshResult {
  engine: TtsEngine | string;
  voices: TtsVoice[];
  cachedAt?: string | null;
}

export interface TtsSynthesizeRequest {
  text: string;
  engine: TtsEngine | string;
  voiceName: string;
  rate: number;
  pitch: number;
  outputFormat: string;
}

export class TtsApi {
  static async getWorkspace(): Promise<TtsWorkspace> {
    return await invoke<TtsWorkspace>("tts_get_workspace");
  }

  static async refreshVoices(
    engine?: TtsEngine | string,
  ): Promise<TtsVoiceRefreshResult> {
    return await invoke<TtsVoiceRefreshResult>("tts_refresh_voices", {
      engine,
    });
  }

  static async synthesize(request: TtsSynthesizeRequest): Promise<TtsRecord> {
    return await invoke<TtsRecord>("tts_synthesize", { request });
  }

  static async previewNative(request: TtsSynthesizeRequest): Promise<void> {
    await invoke("tts_preview_native", { request });
  }

  static async deleteHistoryItem(id: string): Promise<void> {
    await invoke("tts_delete_history_item", { id });
  }

  static async clearHistory(): Promise<void> {
    await invoke("tts_clear_history");
  }
}

export const formatTtsFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${
    units[index]
  }`;
};
