export type AiChatRole = 'user' | 'assistant';
export interface AiChatMessage {
    id: string;
    role: AiChatRole;
    content: string;
    createdAt: string;
}
export interface OtoolsAiGenerateTextRequest {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
}
export declare const createAiChatMessage: (role: AiChatRole, content: string, createdAt?: string) => AiChatMessage;
export declare const normalizeAiChatMessages: (value: unknown) => AiChatMessage[];
export declare class OtoolsAiApi {
    static generateText(request: OtoolsAiGenerateTextRequest): Promise<string>;
    static loadChatHistory(prefix: string): Promise<AiChatMessage[]>;
    static saveChatHistory(prefix: string, messages: AiChatMessage[]): Promise<void>;
}
