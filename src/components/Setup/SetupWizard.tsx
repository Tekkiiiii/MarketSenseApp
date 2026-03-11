import { useState } from 'react';
import { ShieldAlert, ChevronRight, CheckCircle2, Zap, BookOpen, Download } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import { clsx } from 'clsx';
import { Lang } from '../../App';

// ─── i18n ─────────────────────────────────────────────────────────────────────
const T = {
    // Step titles
    s1Title: { en: 'Welcome to MarketSense VN', vi: 'Chào Mừng đến Với MarketSense VN' },
    s1Sub: { en: 'Your AI-powered Vietnamese stock market intelligence assistant.', vi: 'Trợ lý thông minh thị trường chứng khoán Việt Nam của bạn.' },
    s1Body: { en: 'This quick setup takes about 2 minutes. Click Next to begin.', vi: 'Thiết lập nhanh chỉ mất khoảng 2 phút. Nhấn Tiếp để bắt đầu.' },

    s2Title: { en: 'Choose Your Language', vi: 'Chọn Ngôn Ngữ' },
    s2Sub: { en: 'You can change this anytime in Settings.', vi: 'Bạn có thể thay đổi bất cứ lúc nào trong Cài Đặt.' },

    s3Title: { en: 'How It Works', vi: 'Cách Hoạt Động' },
    s3Sub: { en: 'Three intelligent agents work together for you.', vi: 'Ba agent thông minh phối hợp làm việc cho bạn.' },
    s3a: { en: '🔭 Scout Agent', vi: '🔭 Scout Agent' },
    s3aDesc: { en: 'Automatically checks your chosen news sources every few minutes.', vi: 'Tự động kiểm tra các nguồn tin bạn chọn sau mỗi vài phút.' },
    s3b: { en: '🔍 Filter Agent', vi: '🔍 Filter Agent' },
    s3bDesc: { en: 'Drops irrelevant noise — only keeps articles matching your keywords & tickers.', vi: 'Loại bỏ tin nhiễu — chỉ giữ bài viết khớp từ khóa & mã CK của bạn.' },
    s3c: { en: '🤖 Analyst Agent', vi: '🤖 Analyst Agent' },
    s3cDesc: { en: 'Uses AI to summarize: What happened, Who is affected, Bullish / Bearish verdict.', vi: 'Dùng AI tóm tắt: Chuyện gì xảy ra, Ai bị ảnh hưởng, Tăng / Giảm.' },

    s4Title: { en: 'Set Up AI Model (Ollama)', vi: 'Cài Đặt Mô Hình AI (Ollama)' },
    s4Sub: { en: 'MarketSense uses a local AI model — your data never leaves your computer.', vi: 'MarketSense dùng mô hình AI cục bộ — dữ liệu của bạn không bao giờ rời máy tính.' },
    s4Note: { en: "After clicking Finish, a setup guide will open in your browser — it explains which model to choose based on your computer's RAM, and how to install it in one command.", vi: 'Sau khi nhấn Hoàn Tất, hướng dẫn thiết lập sẽ mở trong trình duyệt — giải thích nên chọn mô hình nào dựa trên RAM máy và cách cài đặt bằng một lệnh duy nhất.' },
    s4Skip: { en: 'You can also use a cloud API key (OpenAI / Gemini) in Settings later.', vi: 'Bạn cũng có thể dùng API key đám mây (OpenAI / Gemini) trong Cài Đặt sau.' },

    s5Title:    { en: 'One More Step', vi: 'Còn Một Bước Nữa' },
    s5Sub:      { en: 'Ollama is required to run the AI Analyst Agent — 100% free, runs locally, no subscription needed.', vi: 'Ollama cần thiết để chạy AI Analyst — hoàn toàn miễn phí, chạy cục bộ, không tốn phí dịch vụ.' },
    s5Download: { en: 'Download & Install Ollama', vi: 'Tải và Cài Ollama' },
    s5Skip:     { en: 'Skip for now →', vi: 'Bỏ qua →' },
    s5Note:     { en: 'After installing Ollama, go to Settings → AI Model to pull a model.', vi: 'Sau khi cài Ollama, vào Cài Đặt → AI Model để tải mô hình.' },

    next: { en: 'Next', vi: 'Tiếp' },
    finish: { en: 'Finish & Open Guide', vi: 'Hoàn Tất & Mở Hướng Dẫn' },
    step: { en: 'Step', vi: 'Bước' },
    of: { en: 'of', vi: 'trong' },
};
const tx = (k: keyof typeof T, l: Lang) => T[k][l] ?? T[k].en;

const GUIDE_URL_EN = '/guide-en.html';
const GUIDE_URL_VI = '/guide-vi.html';

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
    onComplete: (lang: Lang) => void;
}

export default function SetupWizard({ onComplete }: Props) {
    const [step, setStep] = useState(1);
    const TOTAL = 4;   // visible steps; Step 5 (Ollama missing) only shows conditionally
    const [lang, setLang] = useState<Lang>('vi');
    const [ollamaMissing, setOllamaMissing] = useState(false);
    const [ollamaCheckDone, setOllamaCheckDone] = useState(false);

    const handleFinish = async () => {
        // Persist setup complete + language choice
        try {
            await invoke('cmd_set_setting', { key: 'setup_complete', value: '1' });
            await invoke('cmd_set_setting', { key: 'ui_lang', value: lang });
        } catch { /* offline/preview mode */ }

        // Check if Ollama is installed
        const ollamaOk = await invoke<boolean>('cmd_check_ollama').catch(() => false);
        if (!ollamaOk) {
            setOllamaMissing(true);
            setOllamaCheckDone(true);
            return; // Stay on wizard — show Ollama step
        }

        // Open the appropriate guide
        const guideUrl = lang === 'vi' ? GUIDE_URL_VI : GUIDE_URL_EN;
        try { await openUrl(guideUrl); } catch { window.open(guideUrl, '_blank'); }

        onComplete(lang);
    };

    const handleSkipOllama = async () => {
        const guideUrl = lang === 'vi' ? GUIDE_URL_VI : GUIDE_URL_EN;
        try { await openUrl(guideUrl); } catch { window.open(guideUrl, '_blank'); }
        onComplete(lang);
    };

    const handleDownloadOllama = async () => {
        await openUrl('https://ollama.com/download').catch(() =>
            window.open('https://ollama.com/download', '_blank')
        );
    };

    const card = 'bg-[#111] border border-[#222] rounded-xl p-6';
    const agentRow = (icon: string, title: string, desc: string) => (
        <div className="flex gap-3 items-start p-3 rounded-lg bg-[#0d0d0d] border border-[#222]">
            <span className="text-xl leading-none mt-0.5">{icon}</span>
            <div>
                <div className="font-bold text-white text-sm">{title}</div>
                <div className="text-zinc-400 text-xs mt-0.5">{desc}</div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-obsidian flex items-center justify-center z-50 font-sans">
            <div className="w-full max-w-lg px-6">

                {/* Header */}
                <div className="flex items-center gap-2.5 mb-8">
                    <ShieldAlert size={26} className="text-blaze" />
                    <span className="text-white font-bold text-lg">MarketSense VN</span>
                    <span className="ml-auto text-zinc-600 text-xs">
                        {tx('step', lang)} {step} {tx('of', lang)} {TOTAL}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-[#222] rounded-full h-1 mb-8">
                    <div
                        className="bg-blaze h-1 rounded-full transition-all duration-500"
                        style={{ width: `${(step / TOTAL) * 100}%` }}
                    />
                </div>

                {/* ── Step 1: Welcome ── */}
                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-2">{tx('s1Title', lang)}</h1>
                            <p className="text-zinc-400">{tx('s1Sub', lang)}</p>
                        </div>
                        <div className={card}>
                            <p className="text-zinc-300 text-sm">{tx('s1Body', lang)}</p>
                        </div>
                    </div>
                )}

                {/* ── Step 2: Language ── */}
                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-2">{tx('s2Title', lang)}</h1>
                            <p className="text-zinc-400 text-sm">{tx('s2Sub', lang)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {([
                                { value: 'vi' as Lang, flag: '🇻🇳', label: 'Tiếng Việt', native: 'Vietnamese' },
                                { value: 'en' as Lang, flag: '🇺🇸', label: 'English', native: 'Tiếng Anh' },
                            ]).map(l => (
                                <button key={l.value} onClick={() => setLang(l.value)}
                                    className={clsx(
                                        'flex flex-col items-center gap-2 py-6 rounded-xl border-2 font-bold text-lg transition-all',
                                        lang === l.value
                                            ? 'border-blaze bg-blaze/10 text-white shadow-[0_0_20px_rgba(249,115,22,0.25)]'
                                            : 'border-[#333] bg-[#111] text-zinc-400 hover:border-zinc-500'
                                    )}>
                                    <span className="text-4xl">{l.flag}</span>
                                    <span>{l.label}</span>
                                    {lang === l.value && <CheckCircle2 size={16} className="text-blaze" />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Step 3: How it works ── */}
                {step === 3 && (
                    <div className="space-y-4 animate-in fade-in">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-2">{tx('s3Title', lang)}</h1>
                            <p className="text-zinc-400 text-sm">{tx('s3Sub', lang)}</p>
                        </div>
                        <div className="space-y-3">
                            {agentRow('🔭', tx('s3a', lang), tx('s3aDesc', lang))}
                            {agentRow('🔍', tx('s3b', lang), tx('s3bDesc', lang))}
                            {agentRow('🤖', tx('s3c', lang), tx('s3cDesc', lang))}
                        </div>
                    </div>
                )}

                {/* ── Step 4: Ollama ── */}
                {step === 4 && !ollamaMissing && (
                    <div className="space-y-4 animate-in fade-in">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-2">{tx('s4Title', lang)}</h1>
                            <p className="text-zinc-400 text-sm">{tx('s4Sub', lang)}</p>
                        </div>
                        <div className={`${card} border-blaze/30 bg-blaze/5 space-y-3`}>
                            <div className="flex items-start gap-2">
                                <BookOpen size={18} className="text-blaze shrink-0 mt-0.5" />
                                <p className="text-zinc-300 text-sm">{tx('s4Note', lang)}</p>
                            </div>
                            <p className="text-zinc-500 text-xs border-t border-[#222] pt-3">{tx('s4Skip', lang)}</p>
                        </div>
                    </div>
                )}

                {/* ── Step 5: Ollama missing ── */}
                {ollamaMissing && ollamaCheckDone && (
                    <div className="space-y-5 animate-in fade-in">
                        <div>
                            <h1 className="text-3xl font-bold text-white mb-2">{tx('s5Title', lang)}</h1>
                            <p className="text-zinc-400 text-sm">{tx('s5Sub', lang)}</p>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">🤖</span>
                                <p className="text-zinc-200 text-sm leading-relaxed">{tx('s5Sub', lang)}</p>
                            </div>
                            <button
                                onClick={handleDownloadOllama}
                                className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-95 transition-all">
                                <Download size={16} /> {tx('s5Download', lang)}
                            </button>
                            <p className="text-zinc-500 text-xs text-center">{tx('s5Note', lang)}</p>
                        </div>
                        <div className="flex justify-end">
                            <button onClick={handleSkipOllama}
                                className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
                                {tx('s5Skip', lang)}
                            </button>
                        </div>
                    </div>
                )}

                {/* Navigation — hide when showing Ollama missing step */}
                {!ollamaMissing && (
                <div className="mt-10 flex justify-end">
                    {step < TOTAL ? (
                        <button onClick={() => setStep(s => s + 1)}
                            className="flex items-center gap-2 bg-blaze hover:bg-blaze/80 text-white font-bold px-6 py-3 rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.3)] active:scale-95 transition-all">
                            {tx('next', lang)} <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button onClick={handleFinish}
                            className="flex items-center gap-2 bg-blood hover:bg-blood/80 text-white font-bold px-6 py-3 rounded-xl shadow-[0_0_20px_rgba(225,29,72,0.3)] active:scale-95 transition-all">
                            <Zap size={16} /> {tx('finish', lang)}
                        </button>
                    )}
                </div>
                )}

            </div>
        </div>
    );
}
