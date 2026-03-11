import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Tag } from 'lucide-react';
import { useAppContext } from '../../App';
import { db } from '../../lib/db';

type Lang = 'en' | 'vi';
const T: Record<string, Record<Lang, string>> = {
    title:      { en: 'Filter Agent Configuration', vi: 'Cấu Hình Bộ Lọc Agent' },
    subtitle:   { en: 'Define triggers. The Filter Agent drops news that has none of these.', vi: 'Định nghĩa từ khoá lọc. Agent sẽ bỏ qua tin không chứa bất kỳ từ nào dưới đây.' },
    tickers:    { en: 'Target Tickers', vi: 'Mã Cổ Phiếu Theo Dõi' },
    addTicker:  { en: 'Add ticker (e.g. VNM)', vi: 'Thêm mã CK (vd. VNM)' },
    keywords:   { en: 'Event Keywords', vi: 'Từ Khoá Sự Kiện' },
    addKeyword: { en: 'Add event keyword…', vi: 'Thêm từ khoá…' },
};
const tx = (key: string, lang: Lang) => T[key]?.[lang] ?? key;

const DEFAULT_KEYWORDS = [
    'lãi suất', 'ngân hàng nhà nước', 'cổ tức', 'chia thưởng',
    'phát hành', 'lợi nhuận', 'kết quả kinh doanh', 'm&a',
    'khuyến nghị của các công ty chứng khoán',
];
const DEFAULT_TICKERS = ['HPG', 'FPT', 'VCB', 'VHM', 'VIC', 'VND'];

export default function KeywordManager() {
    const { lang } = useAppContext() as { lang: Lang };
    const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
    const [tickers,  setTickers]  = useState<string[]>(DEFAULT_TICKERS);
    const [loaded, setLoaded] = useState(false);
    const [newKeyword, setNewKeyword] = useState('');
    const [newTicker,  setNewTicker]  = useState('');

    // ── Load from DB on mount ─────────────────────────────────────────────────
    useEffect(() => {
        Promise.all([
            db.getSetting('keywords').catch(() => null),
            db.getSetting('tickers').catch(() => null),
        ]).then(([kw, tk]) => {
            if (kw) setKeywords(JSON.parse(kw));
            if (tk) setTickers(JSON.parse(tk));
        }).finally(() => setLoaded(true));
    }, []);

    // ── Persist helpers ───────────────────────────────────────────────────────
    const saveKeywords = useCallback((next: string[]) => {
        db.setSetting('keywords', JSON.stringify(next)).catch(() => {});
    }, []);
    const saveTickers = useCallback((next: string[]) => {
        db.setSetting('tickers', JSON.stringify(next)).catch(() => {});
    }, []);

    const addKeyword = (e: React.FormEvent) => {
        e.preventDefault();
        const val = newKeyword.trim().toLowerCase();
        if (!val || keywords.includes(val)) return;
        const next = [...keywords, val];
        setKeywords(next);
        saveKeywords(next);
        setNewKeyword('');
    };

    const removeKeyword = (kw: string) => {
        const next = keywords.filter(k => k !== kw);
        setKeywords(next);
        saveKeywords(next);
    };

    const addTicker = (e: React.FormEvent) => {
        e.preventDefault();
        const val = newTicker.trim().toUpperCase();
        if (!val || tickers.includes(val)) return;
        const next = [...tickers, val];
        setTickers(next);
        saveTickers(next);
        setNewTicker('');
    };

    const removeTicker = (t: string) => {
        const next = tickers.filter(ticker => ticker !== t);
        setTickers(next);
        saveTickers(next);
    };

    if (!loaded) return (
        <div className="h-full flex items-center justify-center text-zinc-600 text-sm">Loading…</div>
    );

    return (
        <div className="h-full flex flex-col max-w-4xl mx-auto">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-white tracking-tight mb-2">{tx('title', lang)}</h2>
                <p className="text-zinc-400 text-sm">{tx('subtitle', lang)}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* Tickers */}
                <div className="bg-charcoal border border-[#222] rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4 text-blood">
                        <Tag size={20} />
                        <h3 className="font-bold text-lg text-white">{tx('tickers', lang)}</h3>
                        <span className="ml-auto text-xs text-blood/70 bg-blood/10 px-2 py-0.5 rounded-full">{tickers.length}</span>
                    </div>

                    <form onSubmit={addTicker} className="flex gap-2 mb-6">
                        <input
                            type="text"
                            value={newTicker}
                            onChange={e => setNewTicker(e.target.value)}
                            placeholder={tx('addTicker', lang)}
                            className="flex-1 bg-obsidian border border-[#222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blood transition-colors uppercase"
                        />
                        <button type="submit" className="bg-blood/10 text-blood hover:bg-blood/20 border border-blood/20 px-3 py-2 rounded-lg transition-colors">
                            <Plus size={18} />
                        </button>
                    </form>

                    <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        {tickers.map(ticker => (
                            <div key={ticker} className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] px-3 py-1.5 rounded-lg text-sm text-zinc-200 group">
                                <span className="font-medium tracking-wider">{ticker}</span>
                                <button onClick={() => removeTicker(ticker)} className="text-zinc-500 hover:text-blood transition-colors opacity-0 group-hover:opacity-100">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Keywords */}
                <div className="bg-charcoal border border-[#222] rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4 text-blaze">
                        <Tag size={20} />
                        <h3 className="font-bold text-lg text-white">{tx('keywords', lang)}</h3>
                        <span className="ml-auto text-xs text-blaze/70 bg-blaze/10 px-2 py-0.5 rounded-full">{keywords.length}</span>
                    </div>

                    <form onSubmit={addKeyword} className="flex gap-2 mb-6">
                        <input
                            type="text"
                            value={newKeyword}
                            onChange={e => setNewKeyword(e.target.value)}
                            placeholder={tx('addKeyword', lang)}
                            className="flex-1 bg-obsidian border border-[#222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blaze transition-colors"
                        />
                        <button type="submit" className="bg-blaze/10 text-blaze hover:bg-blaze/20 border border-blaze/20 px-3 py-2 rounded-lg transition-colors">
                            <Plus size={18} />
                        </button>
                    </form>

                    <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        {keywords.map(kw => (
                            <div key={kw} className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] px-3 py-1.5 rounded-lg text-sm text-zinc-200 group">
                                <span>{kw}</span>
                                <button onClick={() => removeKeyword(kw)} className="text-zinc-500 hover:text-blood transition-colors opacity-0 group-hover:opacity-100">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}
