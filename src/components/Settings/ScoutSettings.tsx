import { useState, useEffect, useRef } from 'react';
import { Zap, CheckCircle2, Clock, Sun, Moon, Globe, Settings2, Database,
         Trash2, RefreshCw, Download, AlertTriangle, Plus, X, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useAppContext } from '../../App';
import { db, DbSettings } from '../../lib/db';

type Lang = 'en' | 'vi';
const T: Record<string, Record<Lang, string>> = {
    title: { en: 'Settings', vi: 'Cài Đặt' },
    subtitle: { en: "Appearance, Scout Agent, AI model, and database.", vi: 'Giao diện, Scout Agent, mô hình AI và cơ sở dữ liệu.' },
    appearance: { en: 'Appearance', vi: 'Giao Diện' },
    appearanceSub: { en: 'Switch between dark and light mode.', vi: 'Chuyển chế độ tối / sáng.' },
    dark: { en: 'Dark', vi: 'Tối' },
    light: { en: 'Light', vi: 'Sáng' },
    language: { en: 'Language', vi: 'Ngôn Ngữ' },
    languageSub: { en: 'Set the interface language.', vi: 'Đặt ngôn ngữ giao diện.' },
    manualScout: { en: 'Manual Scout', vi: 'Quét Thủ Công' },
    manualSub: { en: 'Immediately poll all active sources.', vi: 'Quét ngay tất cả nguồn đang bật.' },
    lastScouted: { en: 'Last scouted at', vi: 'Lần cuối lúc' },
    scoutNow: { en: 'Scout Now', vi: 'Quét Ngay' },
    scouting: { en: 'Scouting...', vi: 'Đang quét...' },
    freqTitle: { en: 'Auto-Scout Frequency', vi: 'Tần Suất Tự Động Quét' },
    freqSub: { en: 'Select "Manual" to disable auto-polling.', vi: 'Chọn "Thủ Công" để tắt tự động.' },
    freqRunEvery: { en: 'Scout runs every', vi: 'Scout chạy mỗi' },
    freqDisabled: { en: 'Auto-scouting disabled. Use "Scout Now".', vi: 'Tự động đã tắt. Dùng "Quét Ngay".' },
    dbTitle: { en: 'Article Database', vi: 'Cơ Sở Dữ Liệu' },
    dbSub: { en: 'SQLite stored locally.', vi: 'SQLite lưu cục bộ.' },
    dbArticles: { en: 'articles stored', vi: 'bài viết đang lưu' },
    dbPruneLabel: { en: 'Auto-prune data older than:', vi: 'Tự động xóa dữ liệu cũ hơn:' },
    dbPruneNow: { en: 'Prune Now', vi: 'Xóa Ngay' },
    dbPruning: { en: 'Pruning...', vi: 'Đang xóa...' },
    dbPruned: { en: 'articles deleted', vi: 'bài đã xóa' },
    dbNoPrune: { en: 'Nothing to prune.', vi: 'Không có gì để xóa.' },
    aiTitle: { en: 'AI Analyst Model', vi: 'Mô Hình AI Analyst' },
    aiSub: { en: 'Select or add your local Ollama model.', vi: 'Chọn hoặc thêm mô hình Ollama cục bộ.' },
    aiManual: { en: 'Run Analyst Now', vi: 'Chạy Analyst Ngay' },
    aiAnalyzing: { en: 'Analyzing...', vi: 'Đang phân tích...' },
    aiAnalyzed: { en: 'articles processed', vi: 'bài đã phân tích' },
    noOllama: { en: 'Ollama is not installed. AI analysis requires it — it\'s free.', vi: 'Ollama chưa được cài. Phân tích AI yêu cầu Ollama — hoàn toàn miễn phí.' },
    downloadOllama: { en: 'Download Ollama', vi: 'Tải Ollama' },
    notInstalled: { en: 'Not installed', vi: 'Chưa cài' },
    addModel: { en: 'Add model by name', vi: 'Thêm mô hình theo tên' },
    addModelPlaceholder: { en: 'e.g. deepseek-r1:latest', vi: 'vd. deepseek-r1:latest' },
    add: { en: 'Add', vi: 'Thêm' },
    installModalTitle: { en: 'Install Model?', vi: 'Cài Mô Hình?' },
    installModalSub: { en: 'This model is not installed locally.', vi: 'Mô hình này chưa được cài cục bộ.' },
    estSize: { en: 'Estimated size', vi: 'Kích thước ước tính' },
    freeSpace: { en: 'Available disk', vi: 'Dung lượng trống' },
    installYes: { en: 'Yes, Install', vi: 'Có, Cài Ngay' },
    installNo: { en: 'Cancel', vi: 'Hủy' },
    pulling: { en: 'Downloading model...', vi: 'Đang tải mô hình...' },
    pullDone: { en: '✅ Model installed! Activating...', vi: '✅ Đã cài xong! Đang kích hoạt...' },
    pullFail: { en: '❌ Install failed. Check Ollama is running.', vi: '❌ Cài thất bại. Kiểm tra Ollama đang chạy.' },
    retry: { en: 'Retry', vi: 'Thử lại' },
};
const tx = (key: string, lang: Lang) => T[key]?.[lang] ?? key;

const FREQUENCIES = [
    { labelEn: '5 min', labelVi: '5 phút', value: 5 },
    { labelEn: '10 min', labelVi: '10 phút', value: 10 },
    { labelEn: '15 min', labelVi: '15 phút', value: 15 },
    { labelEn: '30 min', labelVi: '30 phút', value: 30 },
    { labelEn: '1 hour', labelVi: '1 giờ', value: 60 },
    { labelEn: '3 hours', labelVi: '3 giờ', value: 180 },
    { labelEn: '6 hours', labelVi: '6 giờ', value: 360 },
    { labelEn: '12 hrs', labelVi: '12 giờ', value: 720 },
    { labelEn: 'Manual', labelVi: 'Thủ Công', value: 0 },
];

const PRUNE_OPTIONS: { key: DbSettings['prune_interval']; labelEn: string; labelVi: string }[] = [
    { key: 'daily',     labelEn: 'Daily',     labelVi: 'Hằng ngày' },
    { key: 'weekly',    labelEn: 'Weekly',    labelVi: 'Hằng tuần' },
    { key: 'monthly',   labelEn: 'Monthly',   labelVi: 'Hằng tháng' },
    { key: 'quarterly', labelEn: 'Quarterly', labelVi: 'Hằng quý' },
    { key: 'yearly',    labelEn: 'Yearly',    labelVi: 'Hằng năm' },
    { key: 'never',     labelEn: 'Never',     labelVi: 'Không bao giờ' },
];

// Preset models with estimated disk sizes
const PRESET_MODELS = [
    { name: 'qwen3.5:3b',    sizeGb: 2.0, desc: 'Fast · Good Vietnamese' },
    { name: 'llama3.2:3b',   sizeGb: 2.0, desc: 'Fast · General' },
    { name: 'qwen3.5:7b',    sizeGb: 5.0, desc: 'Better quality' },
    { name: 'phi-4',         sizeGb: 9.0, desc: 'Strong reasoning' },
];

const MODEL_SIZE_MAP: Record<string, number> = {
    'qwen3.5:3b': 2.0, 'llama3.2:3b': 2.0, 'qwen3.5:7b': 5.0,
    'phi-4': 9.0, 'deepseek-r1:latest': 4.7, 'gemma3:4b': 2.5,
    'mistral:latest': 4.1, 'llama3:latest': 4.7,
};

// ─── Install Modal ────────────────────────────────────────────────────────────

interface InstallModalProps {
    modelName: string;
    freeDiskGb: number;
    lang: Lang;
    onCancel: () => void;
    onSuccess: (name: string) => void;
}

function InstallModal({ modelName, freeDiskGb, lang, onCancel, onSuccess }: InstallModalProps) {
    const [phase, setPhase] = useState<'confirm' | 'pulling' | 'done' | 'error'>('confirm');
    const [log, setLog] = useState<string[]>([]);
    const logRef = useRef<HTMLDivElement>(null);
    const estGb = MODEL_SIZE_MAP[modelName] ?? 4;

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [log]);

    const handleInstall = async () => {
        setPhase('pulling');
        const unlisten = await listen<string>('model-pull-progress', e => {
            setLog(prev => [...prev.slice(-80), e.payload]);
        });
        const doneUnlisten = await listen<{ name: string; success: boolean }>('model-pull-done', e => {
            unlisten();
            doneUnlisten();
            if (e.payload.success) {
                setPhase('done');
                setTimeout(() => onSuccess(modelName), 1800);
            } else {
                setPhase('error');
            }
        });
        db.pullOllamaModel(modelName).catch(() => {
            setPhase('error');
            unlisten();
            doneUnlisten();
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-charcoal border border-[#333] rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#222]">
                    <div className="flex items-center gap-2">
                        <Download size={18} className="text-amber-400" />
                        <h3 className="font-bold text-white">{tx('installModalTitle', lang)}</h3>
                    </div>
                    {phase !== 'pulling' && (
                        <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                            <X size={16} />
                        </button>
                    )}
                </div>

                <div className="px-6 py-5 space-y-4">
                    {/* Model info */}
                    <div className="bg-obsidian rounded-xl border border-[#222] px-4 py-3 flex flex-col gap-1">
                        <span className="text-sm font-bold text-white font-mono">{modelName}</span>
                        <span className="text-xs text-zinc-500">{tx('installModalSub', lang)}</span>
                    </div>

                    {/* Disk info row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-obsidian rounded-lg border border-[#222] p-3">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{tx('estSize', lang)}</p>
                            <p className="text-sm font-bold text-amber-400">~{estGb} GB</p>
                        </div>
                        <div className="bg-obsidian rounded-lg border border-[#222] p-3">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{tx('freeSpace', lang)}</p>
                            <p className={clsx('text-sm font-bold', freeDiskGb < estGb * 1.2 ? 'text-red-400' : 'text-emerald-400')}>
                                {freeDiskGb.toFixed(1)} GB
                            </p>
                        </div>
                    </div>

                    {/* Phase: confirm */}
                    {phase === 'confirm' && (
                        <div className="flex gap-3 pt-1">
                            <button onClick={onCancel}
                                className="flex-1 py-2.5 rounded-xl border border-[#333] text-zinc-400 hover:text-white text-sm font-semibold transition-all">
                                {tx('installNo', lang)}
                            </button>
                            <button onClick={handleInstall}
                                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-[0_0_16px_rgba(245,158,11,0.3)] active:scale-95 transition-all">
                                {tx('installYes', lang)}
                            </button>
                        </div>
                    )}

                    {/* Phase: pulling */}
                    {phase === 'pulling' && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                                <RefreshCw size={13} className="animate-spin" />
                                {tx('pulling', lang)}
                            </div>
                            <div ref={logRef}
                                className="h-32 overflow-y-auto bg-black rounded-lg border border-[#222] p-3 font-mono text-[10px] text-green-400 leading-relaxed">
                                {log.map((line, i) => <div key={i}>{line}</div>)}
                                {log.length === 0 && <span className="text-zinc-600">Waiting for output...</span>}
                            </div>
                        </div>
                    )}

                    {/* Phase: done */}
                    {phase === 'done' && (
                        <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold py-2">
                            <CheckCircle size={18} /> {tx('pullDone', lang)}
                        </div>
                    )}

                    {/* Phase: error */}
                    {phase === 'error' && (
                        <div className="space-y-3">
                            <p className="text-red-400 text-sm font-semibold">{tx('pullFail', lang)}</p>
                            <div className="flex gap-3">
                                <button onClick={onCancel}
                                    className="flex-1 py-2 rounded-xl border border-[#333] text-zinc-400 text-sm">
                                    {tx('installNo', lang)}
                                </button>
                                <button onClick={() => { setPhase('confirm'); setLog([]); }}
                                    className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-all">
                                    {tx('retry', lang)}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ScoutSettings() {
    const { theme, setTheme, lang, setLang } = useAppContext() as {
        theme: 'dark' | 'light'; setTheme: (t: 'dark' | 'light') => void;
        lang: Lang; setLang: (l: Lang) => void;
    };

    // Scout state
    const [frequency, setFrequency] = useState(15);
    const [isScouting, setIsScouting] = useState(false);
    const [lastScouted, setLastScouted] = useState<string | null>(null);

    // DB state
    const [pruneInterval, setPruneInterval] = useState<DbSettings['prune_interval']>('never');
    const [articleCount, setArticleCount] = useState<number | null>(null);
    const [isPruning, setIsPruning] = useState(false);
    const [lastPruneResult, setLastPruneResult] = useState<number | null>(null);

    // AI / Ollama state
    const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null); // null = loading
    const [installedModels, setInstalledModels] = useState<string[]>([]);
    const [ollamaModel, setOllamaModel] = useState('qwen3.5:3b');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [lastAnalystResult, setLastAnalystResult] = useState<number | null>(null);
    const [freeDiskGb, setFreeDiskGb] = useState(0);

    // Custom model input
    const [customInput, setCustomInput] = useState('');

    // Install modal
    const [installTarget, setInstallTarget] = useState<string | null>(null);

    // ── Load on mount ────────────────────────────────────────────────────────
    useEffect(() => {
        db.getSettings().then(s => {
            setPruneInterval(s.prune_interval);
            setFrequency(s.scout_frequency_mins);
        }).catch(() => { });
        db.countArticles().then(setArticleCount).catch(() => { });
        db.getSetting('ollama_model').then(m => { if (m) setOllamaModel(m); }).catch(() => { });
        db.getFreeDiskGb().then(setFreeDiskGb).catch(() => { });

        // Ollama detection
        db.checkOllama().then(ok => {
            setOllamaInstalled(ok);
            if (ok) db.getOllamaModels().then(setInstalledModels).catch(() => { });
        }).catch(() => setOllamaInstalled(false));
    }, []);

    const refreshInstalledModels = () => {
        db.getOllamaModels().then(setInstalledModels).catch(() => { });
    };

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleScoutNow = async () => {
        setIsScouting(true);
        try { await db.scoutNow([]); setLastScouted(new Date().toLocaleTimeString()); } catch { }
        setIsScouting(false);
    };

    const handlePruneIntervalChange = async (val: DbSettings['prune_interval']) => {
        setPruneInterval(val);
        await db.setSetting('prune_interval', val).catch(() => { });
    };

    const handleFrequencyChange = async (val: number) => {
        setFrequency(val);
        await db.setSetting('scout_frequency_mins', String(val)).catch(() => { });
    };

    const handlePruneNow = async () => {
        setIsPruning(true); setLastPruneResult(null);
        try {
            const deleted = await db.pruneArticles();
            setLastPruneResult(deleted);
            setArticleCount(await db.countArticles());
        } catch { setLastPruneResult(0); }
        setIsPruning(false);
    };

    const handleAnalyzeNow = async () => {
        setIsAnalyzing(true); setLastAnalystResult(null);
        try { setLastAnalystResult(await db.analyzeNow()); } catch { setLastAnalystResult(0); }
        setIsAnalyzing(false);
    };

    const selectModel = async (name: string) => {
        setOllamaModel(name);
        await db.setSetting('ollama_model', name).catch(() => { });
    };

    // When a model card or custom name is submitted
    const handleModelPick = (name: string) => {
        if (!ollamaInstalled) return; // banner already shown
        const modelKey = name.trim().toLowerCase();
        const isInstalled = installedModels.some(m => m.toLowerCase().startsWith(modelKey) || modelKey.startsWith(m.toLowerCase().split(':')[0]));
        if (isInstalled) {
            selectModel(name);
        } else {
            setInstallTarget(name);
        }
    };

    const handleCustomAdd = () => {
        if (!customInput.trim()) return;
        handleModelPick(customInput.trim());
        setCustomInput('');
    };

    const handleInstallSuccess = async (name: string) => {
        setInstallTarget(null);
        refreshInstalledModels();
        await selectModel(name);
    };

    const isModelInstalled = (name: string) =>
        installedModels.some(m => m.toLowerCase().startsWith(name.toLowerCase().split(':')[0]));

    const card = 'bg-charcoal border border-[#222] rounded-xl p-5 flex flex-col gap-4';
    const currentFreq = FREQUENCIES.find(f => f.value === frequency);

    return (
        <div className="h-full flex flex-col max-w-4xl mx-auto">
            {/* Install modal */}
            {installTarget && (
                <InstallModal
                    modelName={installTarget}
                    freeDiskGb={freeDiskGb}
                    lang={lang}
                    onCancel={() => setInstallTarget(null)}
                    onSuccess={handleInstallSuccess}
                />
            )}

            <div className="mb-6">
                <h2 className="text-2xl font-bold text-white tracking-tight mb-1 flex items-center gap-2">
                    <Settings2 size={22} className="text-blaze" /> {tx('title', lang)}
                </h2>
                <p className="text-zinc-400 text-sm">{tx('subtitle', lang)}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-10">

                {/* ─── Appearance ─────────────────────────────────────────── */}
                <div className={card}>
                    <div className="flex items-center gap-2">
                        {theme === 'dark' ? <Moon size={18} className="text-blaze" /> : <Sun size={18} className="text-yellow-400" />}
                        <h3 className="font-bold text-base text-white">{tx('appearance', lang)}</h3>
                    </div>
                    <p className="text-zinc-400 text-xs">{tx('appearanceSub', lang)}</p>
                    <div className="flex gap-2 mt-1">
                        {(['dark', 'light'] as const).map(t => (
                            <button key={t} onClick={() => setTheme(t)}
                                className={clsx(
                                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-all',
                                    theme === t ? 'bg-blood/15 border-blood/40 text-white shadow-[0_0_12px_rgba(225,29,72,0.2)]'
                                        : 'bg-obsidian border-[#333] text-zinc-400 hover:border-zinc-500'
                                )}>
                                {t === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                                {t === 'dark' ? tx('dark', lang) : tx('light', lang)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ─── Language ───────────────────────────────────────────── */}
                <div className={card}>
                    <div className="flex items-center gap-2">
                        <Globe size={18} className="text-blood" />
                        <h3 className="font-bold text-base text-white">{tx('language', lang)}</h3>
                    </div>
                    <p className="text-zinc-400 text-xs">{tx('languageSub', lang)}</p>
                    <div className="flex gap-2 mt-1">
                        {([
                            { value: 'en' as Lang, flag: '🇺🇸', label: 'English' },
                            { value: 'vi' as Lang, flag: '🇻🇳', label: 'Tiếng Việt' },
                        ]).map(l => (
                            <button key={l.value} onClick={() => setLang(l.value)}
                                className={clsx(
                                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold transition-all',
                                    lang === l.value ? 'bg-blood/15 border-blood/40 text-white shadow-[0_0_12px_rgba(225,29,72,0.2)]'
                                        : 'bg-obsidian border-[#333] text-zinc-400 hover:border-zinc-500'
                                )}>
                                <span>{l.flag}</span> {l.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ─── Manual Scout ───────────────────────────────────────── */}
                <div className={card}>
                    <div className="flex items-center gap-2">
                        <Zap size={18} className="text-blaze" />
                        <h3 className="font-bold text-base text-white">{tx('manualScout', lang)}</h3>
                    </div>
                    <p className="text-zinc-400 text-xs">{tx('manualSub', lang)}</p>
                    {lastScouted && (
                        <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg">
                            <CheckCircle2 size={13} /> {tx('lastScouted', lang)} {lastScouted}
                        </div>
                    )}
                    <button onClick={handleScoutNow} disabled={isScouting}
                        className={clsx(
                            'flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-semibold transition-all text-sm',
                            isScouting ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                                : 'bg-blaze hover:bg-blaze/80 text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] active:scale-95'
                        )}>
                        <RefreshCw size={16} className={isScouting ? 'animate-spin' : ''} />
                        {isScouting ? tx('scouting', lang) : tx('scoutNow', lang)}
                    </button>
                </div>

                {/* ─── Auto-Scout Frequency ───────────────────────────────── */}
                <div className={card}>
                    <div className="flex items-center gap-2">
                        <Clock size={18} className="text-blood" />
                        <h3 className="font-bold text-base text-white">{tx('freqTitle', lang)}</h3>
                    </div>
                    <p className="text-zinc-400 text-xs">{tx('freqSub', lang)}</p>
                    <div className="grid grid-cols-3 gap-2">
                        {FREQUENCIES.map(({ labelEn, labelVi, value }) => (
                            <button key={value} onClick={() => handleFrequencyChange(value)}
                                className={clsx(
                                    'py-1.5 px-2 rounded-lg border text-xs font-medium transition-all',
                                    frequency === value
                                        ? 'bg-blood/15 border-blood/40 text-white shadow-[0_0_10px_rgba(225,29,72,0.15)]'
                                        : 'bg-obsidian border-[#333] text-zinc-400 hover:border-blood/30 hover:text-zinc-200'
                                )}>
                                {lang === 'vi' ? labelVi : labelEn}
                            </button>
                        ))}
                    </div>
                    {frequency > 0 && currentFreq && (
                        <p className="text-xs text-zinc-500">
                            {tx('freqRunEvery', lang)}{' '}
                            <span className="text-white font-semibold">
                                {lang === 'vi' ? currentFreq.labelVi : currentFreq.labelEn}
                            </span>.
                        </p>
                    )}
                    {frequency === 0 && <p className="text-xs text-zinc-500">{tx('freqDisabled', lang)}</p>}
                </div>

                {/* ─── AI Model ───────────────────────────────────────────── */}
                <div className={`${card} md:col-span-2`}>
                    <div className="flex items-center gap-2">
                        <Zap size={18} className="text-amber-400" />
                        <h3 className="font-bold text-base text-white">{tx('aiTitle', lang)}</h3>
                    </div>
                    <p className="text-zinc-400 text-xs">{tx('aiSub', lang)}</p>

                    {/* Ollama missing banner */}
                    {ollamaInstalled === false && (
                        <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
                            <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-yellow-300">{tx('noOllama', lang)}</p>
                            </div>
                            <button
                                onClick={() => openUrl('https://ollama.com/download').catch(() => window.open('https://ollama.com/download', '_blank'))}
                                className="flex items-center gap-1 text-[10px] font-bold text-yellow-400 hover:text-yellow-300 border border-yellow-500/40 px-2 py-1 rounded-lg transition-colors shrink-0">
                                <Download size={10} /> {tx('downloadOllama', lang)}
                            </button>
                        </div>
                    )}

                    {/* Preset model grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {PRESET_MODELS.map(m => {
                            const installed = isModelInstalled(m.name);
                            const selected = ollamaModel.startsWith(m.name.split(':')[0]) || m.name.startsWith(ollamaModel.split(':')[0]);
                            return (
                                <button key={m.name}
                                    onClick={() => handleModelPick(m.name)}
                                    disabled={!ollamaInstalled}
                                    title={!installed ? tx('notInstalled', lang) : m.desc}
                                    className={clsx(
                                        'flex flex-col items-start p-3 rounded-xl border text-left transition-all',
                                        !ollamaInstalled && 'opacity-50 cursor-not-allowed',
                                        ollamaInstalled && selected && installed && 'bg-amber-400/15 border-amber-400/50 ring-1 ring-amber-400/30',
                                        ollamaInstalled && !selected && installed && 'bg-obsidian border-[#333] hover:border-amber-400/40',
                                        ollamaInstalled && !installed && 'bg-obsidian border-[#222] opacity-50',
                                    )}>
                                    <span className={clsx('text-[11px] font-bold font-mono', installed ? 'text-white' : 'text-zinc-500')}>{m.name}</span>
                                    <span className="text-[9px] text-zinc-500 mt-0.5">{m.desc}</span>
                                    {installed
                                        ? <span className="text-[9px] text-emerald-400 mt-1">✓ installed</span>
                                        : <span className="text-[9px] text-zinc-600 mt-1">⬇ {tx('notInstalled', lang)}</span>
                                    }
                                </button>
                            );
                        })}
                    </div>

                    {/* Custom model input */}
                    <div className="space-y-1">
                        <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{tx('addModel', lang)}</p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={customInput}
                                onChange={e => setCustomInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCustomAdd()}
                                placeholder={tx('addModelPlaceholder', lang)}
                                disabled={!ollamaInstalled}
                                className="flex-1 bg-obsidian border border-[#333] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-400 disabled:opacity-40"
                            />
                            <button onClick={handleCustomAdd} disabled={!ollamaInstalled || !customInput.trim()}
                                className="flex items-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-bold rounded-lg transition-all">
                                <Plus size={13} /> {tx('add', lang)}
                            </button>
                        </div>
                        {/* Show currently selected model */}
                        {ollamaModel && (
                            <p className="text-[10px] text-zinc-500">
                                Active: <span className="text-amber-400 font-mono">{ollamaModel}</span>
                            </p>
                        )}
                    </div>

                    {/* Run Analyst */}
                    <button onClick={handleAnalyzeNow} disabled={isAnalyzing || !ollamaInstalled}
                        className={clsx(
                            'flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-semibold transition-all text-sm',
                            isAnalyzing || !ollamaInstalled ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                                : 'bg-amber-500 hover:bg-amber-600 text-white shadow-[0_0_20px_rgba(245,158,11,0.2)] active:scale-95'
                        )}>
                        <RefreshCw size={16} className={isAnalyzing ? 'animate-spin' : ''} />
                        {isAnalyzing ? tx('aiAnalyzing', lang) : tx('aiManual', lang)}
                    </button>
                    {lastAnalystResult !== null && (
                        <p className="text-[10px] text-center text-zinc-500 italic">
                            {lastAnalystResult} {tx('aiAnalyzed', lang)}
                        </p>
                    )}
                </div>

                {/* ─── Article Database ───────────────────────────────────── */}
                <div className={`${card} md:col-span-2`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Database size={18} className="text-blaze" />
                            <h3 className="font-bold text-base text-white">{tx('dbTitle', lang)}</h3>
                        </div>
                        {articleCount !== null && (
                            <span className="text-xs bg-obsidian border border-[#333] px-2.5 py-1 rounded-lg text-zinc-300 tabular-nums">
                                <span className="text-white font-bold">{articleCount.toLocaleString()}</span>{' '}{tx('dbArticles', lang)}
                            </span>
                        )}
                    </div>
                    <p className="text-zinc-400 text-xs">{tx('dbSub', lang)}</p>

                    <div className="space-y-3">
                        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{tx('dbPruneLabel', lang)}</p>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                            {PRUNE_OPTIONS.map(opt => (
                                <button key={opt.key} onClick={() => handlePruneIntervalChange(opt.key)}
                                    className={clsx(
                                        'py-1.5 px-2 rounded-lg border text-xs font-medium transition-all text-center',
                                        pruneInterval === opt.key
                                            ? 'bg-blood/15 border-blood/40 text-white shadow-[0_0_10px_rgba(225,29,72,0.15)]'
                                            : 'bg-obsidian border-[#333] text-zinc-400 hover:border-blood/30 hover:text-zinc-200'
                                    )}>
                                    {lang === 'vi' ? opt.labelVi : opt.labelEn}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                        <button onClick={handlePruneNow} disabled={isPruning}
                            className={clsx(
                                'flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold transition-all',
                                isPruning ? 'bg-zinc-800 border-[#333] text-zinc-600 cursor-not-allowed'
                                    : 'bg-blood/10 border-blood/30 text-blood hover:bg-blood/20 active:scale-95'
                            )}>
                            {isPruning ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            {isPruning ? tx('dbPruning', lang) : tx('dbPruneNow', lang)}
                        </button>
                        {lastPruneResult !== null && (
                            <span className={clsx('text-xs', lastPruneResult > 0 ? 'text-emerald-400' : 'text-zinc-500')}>
                                {lastPruneResult > 0 ? `${lastPruneResult} ${tx('dbPruned', lang)}` : tx('dbNoPrune', lang)}
                            </span>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
