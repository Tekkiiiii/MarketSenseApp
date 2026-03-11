import { invoke } from '@tauri-apps/api/core';

export interface Article {
    id?: number;
    title: string;
    url: string;
    source: string;
    impact: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    summary: string;
    entities: string;      // JSON string of string[]
    recommendation: string;
    scraped_at?: string;
}

export interface DbSettings {
    prune_interval: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'never';
    scout_frequency_mins: number;
}

export const db = {
    insertArticle: (article: Article) =>
        invoke<number>('cmd_insert_article', { article }),

    getArticles: (limit = 200, search?: string) =>
        invoke<Article[]>('cmd_get_articles', { limit, search }),

    countArticles: () =>
        invoke<number>('cmd_count_articles'),

    pruneArticles: () =>
        invoke<number>('cmd_prune_articles'),

    getSettings: () =>
        invoke<DbSettings>('cmd_get_settings'),

    setSetting: (key: string, value: string) =>
        invoke<void>('cmd_set_setting', { key, value }),

    scoutNow: (activeSources: string[] = []) =>
        invoke<number>('cmd_scout_now', { activeSources }),

    analyzeNow: () =>
        invoke<number>('cmd_analyze_now'),

    scoutStatus: () =>
        invoke<boolean>('cmd_scout_status'),

    getSetting: (key: string) =>
        invoke<string | null>('cmd_get_setting', { key }),

    // ── Ollama ───────────────────────────────────────────────────────────────
    checkOllama: () =>
        invoke<boolean>('cmd_check_ollama'),

    getOllamaModels: () =>
        invoke<string[]>('cmd_get_ollama_models'),

    getFreeDiskGb: () =>
        invoke<number>('cmd_get_free_disk_gb'),

    pullOllamaModel: (name: string) =>
        invoke<void>('cmd_pull_ollama_model', { name }),
};
