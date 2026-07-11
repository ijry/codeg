import { invoke } from '@tauri-apps/api/core';

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

const MARKDOWN_PLUGIN_NAME = 'markdown';

const normalizeWorkspace = (raw: unknown): MarkdownWorkspace => {
  if (!raw || typeof raw !== 'object') {
    return { nodes: [] };
  }

  const candidate = raw as Record<string, unknown>;

  if (Array.isArray(candidate.nodes)) {
    return {
      nodes: candidate.nodes as MarkdownTreeNode[]
    };
  }

  if (Array.isArray(raw)) {
    return {
      nodes: raw as MarkdownTreeNode[]
    };
  }

  return { nodes: [] };
};

export class MarkdownApi {
  static async getWorkspace(): Promise<MarkdownWorkspace> {
    const localState = await invoke<unknown>('get_otools_plugin_localstate', {
      plugin: MARKDOWN_PLUGIN_NAME
    });
    return normalizeWorkspace(localState);
  }

  static async saveWorkspace(workspace: MarkdownWorkspace): Promise<void> {
    await invoke<void>('save_otools_plugin_localstate', {
      plugin: MARKDOWN_PLUGIN_NAME,
      state: workspace
    });
  }
}
