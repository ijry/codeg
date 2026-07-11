import { Plugin, UserConfig } from 'vite';
export { createOtoolsAliasMap } from './aliases';
export interface OtoolsPluginSdkViteConfigOptions {
    host?: string;
    port?: number;
    extraPlugins?: Plugin[];
}
export declare function otoolsTauriShimPlugin(): Plugin;
export declare function createOtoolsPluginSdkViteConfig(options?: OtoolsPluginSdkViteConfigOptions): UserConfig;
