export type OTabsType = 'card' | 'toolbar' | 'terminal' | 'underline' | 'mqtt' | 'tools' | 'worktree' | 'git-term' | 'pill' | 'segmented' | 'ghost';
export interface OTabsItem {
    name: string;
    label: string;
    closable?: boolean;
    locked?: boolean;
    disabled?: boolean;
}
