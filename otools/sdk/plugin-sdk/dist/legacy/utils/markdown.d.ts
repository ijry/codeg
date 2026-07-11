export type MarkdownNodeType = 'folder' | 'document';
export interface MarkdownDocument {
    id: string;
    name: string;
    content: string;
    created_at: string;
    updated_at: string;
}
export interface MarkdownTreeNode {
    id: string;
    name: string;
    node_type: MarkdownNodeType;
    children: MarkdownTreeNode[];
    document: MarkdownDocument | null;
    created_at: string;
    updated_at: string;
}
export interface MarkdownWorkspace {
    nodes: MarkdownTreeNode[];
}
export declare class MarkdownApi {
    static getWorkspace(): Promise<MarkdownWorkspace>;
    static saveWorkspace(workspace: MarkdownWorkspace): Promise<void>;
}
