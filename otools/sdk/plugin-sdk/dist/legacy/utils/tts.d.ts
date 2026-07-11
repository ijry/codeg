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
export declare class TtsApi {
    static getWorkspace(): Promise<TtsWorkspace>;
    static refreshVoices(engine?: TtsEngine | string): Promise<TtsVoiceRefreshResult>;
    static synthesize(request: TtsSynthesizeRequest): Promise<TtsRecord>;
    static previewNative(request: TtsSynthesizeRequest): Promise<void>;
    static deleteHistoryItem(id: string): Promise<void>;
    static clearHistory(): Promise<void>;
}
export declare const formatTtsFileSize: (bytes: number) => string;
