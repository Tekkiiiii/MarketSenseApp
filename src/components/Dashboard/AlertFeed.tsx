import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    AlertCircle, TrendingUp, TrendingDown, Minus, Clock, ExternalLink,
    Bot, RefreshCw, AlertTriangle, Loader2, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { openUrl } from '@tauri-apps/plugin-opener';
import { listen } from '@tauri-apps/api/event';
import { useAppContext } from '../../App';
import { db, Article } from '../../lib/db';

// ─── Types ──────────────────────────────────────────────────────────────────────

type NewsItem = {
    id: string;
    title: string;
    url: string;
    source: string;
    time: string;
    impact: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    what: string;
    who: string[];
    how: { reasoning: string };
    recommendation: string;
    unread: boolean;
    analysisStatus?: string;   // 'pending' | 'analyzing' | 'done' | 'error'
    confidence?: number;
    keyPriceFactors?: string[];
    riskLevel?: string;
    tickers?: string[];
    scrapedAt?: string;
};

type SortKey = 'time' | 'impact' | 'source' | 'title';
type SortDir = 'asc' | 'desc';
type ImpactFilter = 'ALL' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';

// ─── i18n ──────────────────────────────────────────────────────────────────────
type Lang = 'en' | 'vi';
const T: Record<string, Record<Lang, string>> = {
    bulletin:      { en: 'Market Bulletin',             vi: 'Bản Tin Thị Trường' },
    hotReport:     { en: 'HOT / LATEST REPORT',         vi: 'TIN NÓNG / MỚI NHẤT' },
    theWhat:       { en: 'The "What"',                  vi: 'Sự Kiện' },
    entities:      { en: 'Involved Entities',           vi: 'Đối Tượng Liên Quan' },
    verdict:       { en: 'AI Impact Verdict',           vi: 'Nhận Định AI' },
    reasoning:     { en: 'Analyst Reasoning',           vi: 'Lý Luận Phân Tích' },
    reco:          { en: 'AI Recommendation',           vi: 'Khuyến Nghị AI' },
    readOriginal:  { en: 'Read original on',            vi: 'Đọc bài gốc trên' },
    allNews:       { en: 'All Articles',                 vi: 'Tất Cả Tin' },
    analyzing:     { en: 'Analyzing…',                  vi: 'Đang phân tích…' },
    analysisError: { en: 'Analysis failed',             vi: 'Phân tích thất bại' },
    retryAnalysis: { en: 'Retry',                       vi: 'Thử lại' },
    brokerTitle:  { en: 'Broker Reports',               vi: 'Khuyến Nghị CTCK' },
    brokerEmpty:  { en: 'No broker reports yet',       vi: 'Chưa có khuyến nghị CTCK' },
    readMore:     { en: 'Read →',                       vi: 'Xem →' },
    noArticles:   { en: 'No articles yet',              vi: 'Chưa có bài viết nào' },
    scoutFirst:   { en: 'Run Scout Now to fetch news',  vi: 'Nhấn Quét Ngay để lấy tin' },
    noSelection:  { en: 'Select an article',            vi: 'Chọn một bài viết' },
    confidence:   { en: 'Confidence',                  vi: 'Độ tin' },
    riskLevel:    { en: 'Risk Level',                   vi: 'Mức Rủi Ro' },
    sectors:      { en: 'Sectors',                      vi: 'Ngành' },
    priceFactors: { en: 'Key Price Factors',            vi: 'Yếu Tố Giá' },
    watchlist:    { en: 'Watchlist',                    vi: 'Theo Dõi' },
};
const tx = (key: string, lang: Lang) => T[key]?.[lang] ?? key;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoStr: string): string {
    if (!isoStr) return '—';
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '< 1 phút trước';
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ trước`;
    return `${Math.floor(hrs / 24)} ngày trước`;
}

function impactGradient(impact: string) {
    if (impact === 'BULLISH') return 'from-emerald-500 to-emerald-300';
    if (impact === 'BEARISH') return 'from-blood to-blaze';
    return 'from-zinc-500 to-zinc-400';
}

function impactColor(impact: string) {
    if (impact === 'BULLISH') return 'text-emerald-400';
    if (impact === 'BEARISH') return 'text-blood';
    return 'text-zinc-400';
}

function riskColor(level?: string) {
    if (level === 'HIGH')   return 'text-red-400';
    if (level === 'MEDIUM') return 'text-amber-400';
    if (level === 'LOW')    return 'text-emerald-400';
    return 'text-zinc-400';
}

// ─── Article → NewsItem converter ──────────────────────────────────────────────
function articleToNewsItem(a: Article): NewsItem {
    let who: string[] = [];
    try { who = JSON.parse(a.entities || '[]'); } catch { /* ok */ }

    return {
        id:              String(a.id ?? a.url),
        title:           a.title,
        url:             a.url,
        source:          a.source,
        time:            a.scraped_at ? timeAgo(a.scraped_at) : '—',
        impact:          (a.impact || 'NEUTRAL') as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
        what:            a.summary || a.title,
        who,
        how:             { reasoning: a.recommendation || a.summary || '' },
        recommendation:  a.recommendation,
        unread:          true,
        analysisStatus:  a.analysis_status,
        confidence:      a.confidence,
        keyPriceFactors: (() => {
            try { return JSON.parse(a.key_price_factors || '[]'); } catch { return []; }
        })(),
        riskLevel:       a.risk_level,
        scrapedAt:       a.scraped_at,
        tickers:         (() => {
            try { return JSON.parse(a.tickers || '[]'); } catch { return []; }
        })(),
    };
}

// ─── Broker keyword filter ─────────────────────────────────────────────────────
const BROKER_KW = [
    'khuyến nghị', 'khuyến nghị mua', 'khuyến nghị bán',
    'research', 'analyst', 'securities firm',
    'công ty chứng khoán', 'ctck', 'vnds', 'bsc', 'fps',
];

function isBrokerArticle(item: NewsItem): boolean {
    const hay = (item.title + ' ' + item.what).toLowerCase();
    return BROKER_KW.some(kw => hay.includes(kw));
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AlertFeed() {
    const { lang } = useAppContext() as { lang: Lang };

    // ── State ─────────────────────────────────────────────────────────────────
    const [allArticles, setAllArticles] = useState<NewsItem[]>([]);
    const [activeId, setActiveId]       = useState<string>('');
    const [isRefreshing, setRefreshing] = useState(false);
    const [impactFilter, setImpactFilter] = useState<ImpactFilter>('ALL');
    const [sortKey, setSortKey]         = useState<SortKey>('time');
    const [sortDir, setSortDir]         = useState<SortDir>('desc');

    // ── Load from SQLite ─────────────────────────────────────────────────────
    const loadArticles = useCallback(async () => {
        setRefreshing(true);
        try {
            // Use getArticles to include all statuses (done + analyzing + error)
            const articles = await db.getArticles(200);
            if (articles.length > 0) {
                const items = articles.map(articleToNewsItem);
                setAllArticles(items);
                // Auto-select first article if nothing selected
                setActiveId(prev => {
                    if (prev && items.some(i => i.id === prev)) return prev;
                    return items[0]?.id ?? '';
                });
            }
        } catch {
            // Browser preview — keep mock data from INITIAL_NEWS
        }
        setRefreshing(false);
    }, []);

    useEffect(() => {
        loadArticles();
        let unlisten: (() => void) | undefined;
        listen<number>('articles-updated', () => loadArticles())
            .then(fn => { unlisten = fn; }).catch(() => {});
        return () => { unlisten?.(); };
    }, [loadArticles]);


    // ── Derived ──────────────────────────────────────────────────────────────
    const handleSelect = useCallback((id: string) => {
        setActiveId(prev => {
            if (prev === id) return prev;
            // Mark selected article as read
            setAllArticles(items => items.map(it =>
                it.id === id ? { ...it, unread: false } : it
            ));
            return id;
        });
    }, []);

    const handleRetry = useCallback(async (id: number) => {
        try {
            await db.retryAnalysis(id);
            // Optimistically update status to 'pending'
            setAllArticles(items => items.map(it =>
                String(it.id) === String(id) ? { ...it, analysisStatus: 'pending' } : it
            ));
        } catch { /* silent — backend will handle */ }
    }, []);

    // Separate articles by analysis status
    const analyzingArticles = useMemo(() =>
        allArticles.filter(a => a.analysisStatus === 'analyzing'), [allArticles]);

    const errorArticles = useMemo(() =>
        allArticles.filter(a => a.analysisStatus === 'error'), [allArticles]);

    // All "done" articles for main list and broker panel
    const doneArticles = useMemo(() =>
        allArticles.filter(a => a.analysisStatus !== 'analyzing' && a.analysisStatus !== 'error' && a.analysisStatus !== 'pending'), [allArticles]);

    // Apply filter + sort
    const filteredArticles = useMemo(() => {
        let items = [...doneArticles];
        if (impactFilter !== 'ALL') {
            items = items.filter(a => a.impact === impactFilter);
        }
        const impactOrder = { BULLISH: 0, NEUTRAL: 1, BEARISH: 2 };
        items.sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'impact') cmp = impactOrder[a.impact] - impactOrder[b.impact];
            else if (sortKey === 'source') cmp = a.source.localeCompare(b.source);
            else if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
            else {
                // time: parse ISO for real sort
                const ta = a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0;
                const tb = b.scrapedAt ? new Date(b.scrapedAt).getTime() : 0;
                cmp = tb - ta;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });
        return items;
    }, [doneArticles, impactFilter, sortKey, sortDir]);

    // ── Keyboard navigation ─────────────────────────────────────────────────
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            const idx = filteredArticles.findIndex(a => a.id === activeId);
            if (e.key === 'j' || e.key === 'ArrowDown') {
                e.preventDefault();
                const next = filteredArticles[idx + 1];
                if (next) setActiveId(next.id);
            } else if (e.key === 'k' || e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = filteredArticles[idx - 1];
                if (prev) setActiveId(prev.id);
            } else if (e.key === 'Escape') {
                setActiveId('');
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [activeId, filteredArticles]);

    const brokerRecs = useMemo(() =>
        doneArticles.filter(isBrokerArticle).slice(0, 10), [doneArticles]);

    const activeArticle = useMemo(() =>
        allArticles.find(a => a.id === activeId), [allArticles, activeId]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="h-full flex flex-col pt-1 pb-4">

            {/* Header */}
            <div className="flex items-center justify-between mb-3 shrink-0">
                <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    {tx('bulletin', lang)}
                    {isRefreshing && <RefreshCw size={16} className="text-zinc-500 animate-spin" />}
                </h2>
                {/* Impact filter pills */}
                <div className="flex gap-1">
                    {(['ALL', 'BULLISH', 'BEARISH', 'NEUTRAL'] as ImpactFilter[]).map(f => (
                        <button key={f} onClick={() => setImpactFilter(f)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                impactFilter === f
                                    ? f === 'BULLISH' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                    : f === 'BEARISH'  ? 'bg-blood/20 border-blood/50 text-blood'
                                    : f === 'NEUTRAL'  ? 'bg-zinc-700 border-zinc-500 text-zinc-300'
                                    : 'bg-charcoal border-[#333] text-zinc-400'
                                : 'bg-charcoal border-[#222] text-zinc-500 hover:border-[#444] hover:text-zinc-300'
                            }`}>
                            {f === 'ALL' ? tx('all', lang)
                                : f === 'BULLISH' ? '↑ Tăng'
                                : f === 'BEARISH'  ? '↓ Giảm'
                                : '– Trung'}
                        </button>
                    ))}
                </div>
            </div>

            {/* 3-column grid */}
            <div className="flex-1 grid grid-cols-[280px_1fr_300px] gap-3 min-h-0">

                {/* ── Col 1: Article List ───────────────────────────────── */}
                <div className="flex flex-col min-h-0 overflow-hidden bg-charcoal rounded-xl border border-[#222]">
                    {/* Column header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#222] shrink-0">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            {tx('allNews', lang)}
                        </span>
                        <span className="text-[10px] text-zinc-600 tabular-nums">{filteredArticles.length}</span>
                    </div>

                    {/* Analyzing banner */}
                    {analyzingArticles.length > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
                            <Loader2 size={11} className="text-amber-400 animate-spin shrink-0" />
                            <span className="text-[10px] text-amber-400 font-medium">
                                {analyzingArticles.length} {tx('analyzing', lang)}
                            </span>
                        </div>
                    )}

                    {/* Error articles */}
                    {errorArticles.map(a => (
                        <div key={a.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 shrink-0">
                            <AlertTriangle size={11} className="text-red-400 shrink-0" />
                            <span className="flex-1 text-[10px] text-red-400 truncate">{a.title}</span>
                            <button onClick={() => handleRetry(Number(a.id))}
                                className="flex items-center gap-0.5 text-[9px] text-red-400 hover:text-red-300 font-bold shrink-0">
                                <RotateCcw size={9} /> {tx('retryAnalysis', lang)}
                            </button>
                        </div>
                    ))}

                    {/* Article list */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {filteredArticles.length === 0 && allArticles.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
                                <Rss size={28} className="text-zinc-600" />
                                <p className="text-xs text-zinc-500 text-center">{tx('noArticles', lang)}</p>
                                <p className="text-[10px] text-zinc-600 text-center">{tx('scoutFirst', lang)}</p>
                            </div>
                        )}
                        {filteredArticles.map((item) => (
                            <ArticleListCard
                                key={item.id}
                                item={item}
                                active={item.id === activeId}
                                onSelect={handleSelect}
                                lang={lang}
                            />
                        ))}
                    </div>
                </div>

                {/* ── Col 2: Article Detail ──────────────────────────────── */}
                <div className="flex flex-col min-h-0">
                    {activeArticle ? (
                        <ArticleDetail article={activeArticle} lang={lang} />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center bg-charcoal rounded-xl border border-[#222]">
                            <Clock size={36} className="text-zinc-600 mb-3" />
                            <p className="text-zinc-500 text-sm">{tx('noSelection', lang)}</p>
                        </div>
                    )}
                </div>

                {/* ── Col 3: Broker Panel ─────────────────────────────────── */}
                <div className="flex flex-col min-h-0 overflow-hidden bg-charcoal rounded-xl border border-[#222]">
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#222] shrink-0">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            {tx('brokerTitle', lang)}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {brokerRecs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
                                <BarChart2 size={24} className="text-zinc-600" />
                                <p className="text-xs text-zinc-500 text-center">{tx('brokerEmpty', lang)}</p>
                            </div>
                        ) : (
                            brokerRecs.map(item => (
                                <BrokerCard key={item.id} item={item} lang={lang} onSelect={handleSelect} />
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

// ─── Article list card ─────────────────────────────────────────────────────────
function ArticleListCard({ item, active, onSelect, lang }: {
    item: NewsItem; active: boolean; onSelect: (id: string) => void; lang: Lang;
}) {
    const statusIcon = () => {
        if (item.analysisStatus === 'analyzing') return <Loader2 size={10} className="text-amber-400 animate-spin" />;
        if (item.analysisStatus === 'error') return <AlertTriangle size={10} className="text-red-400" />;
        return null;
    };
    return (
        <button
            onClick={() => onSelect(item.id)}
            className={`w-full text-left px-3 py-2.5 border-b border-[#1a1a1a] transition-colors ${
                active
                    ? 'bg-blood/10 border-l-2 border-l-blood'
                    : 'hover:bg-[#1a1a1a] border-l-2 border-l-transparent'
            }`}
        >
            <div className="flex items-center gap-1.5 mb-1">
                {item.impact === 'BULLISH' && <TrendingUp size={10} className="text-emerald-400 shrink-0" />}
                {item.impact === 'BEARISH' && <TrendingDown size={10} className="text-blood shrink-0" />}
                {item.impact === 'NEUTRAL' && <Minus size={10} className="text-zinc-500 shrink-0" />}
                <span className="text-[9px] font-bold text-zinc-500 uppercase shrink-0">{item.source}</span>
                {statusIcon()}
                <span className="text-[9px] text-zinc-600 ml-auto shrink-0">{item.time}</span>
            </div>
            <p className={`text-[11px] leading-snug line-clamp-2 ${active ? 'text-blaze font-medium' : 'text-zinc-300'}`}>
                {item.title}
            </p>
            {item.who.length > 0 && (
                <div className="flex gap-1 mt-0.5 flex-wrap">
                    {item.who.slice(0, 3).map(w => (
                        <span key={w} className="text-[8px] bg-[#2a2a2a] text-zinc-500 px-1 py-0.5 rounded">{w}</span>
                    ))}
                </div>
            )}
        </button>
    );
}

// ─── Article detail ────────────────────────────────────────────────────────────
function ArticleDetail({ article, lang }: { article: NewsItem; lang: Lang }) {
    return (
        <motion.div
            layoutId={`card-${article.id}`}
            key={article.id}
            className="flex-1 bg-charcoal rounded-xl border border-[#222] flex flex-col overflow-hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        >
            {/* Impact bar */}
            <div className={`h-1.5 w-full bg-gradient-to-r ${impactGradient(article.impact)} shrink-0`} />

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 flex flex-col gap-4">
                {/* Meta row */}
                <div className="flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={14} className={impactColor(article.impact)} />
                        <span className="text-xs font-bold uppercase tracking-widest text-white">{tx('hotReport', lang)}</span>
                        {article.confidence && (
                            <span className="text-[9px] text-zinc-500 bg-[#1a1a1a] border border-[#333] px-1.5 py-0.5 rounded">
                                {tx('confidence', lang)} {article.confidence}%
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-zinc-400 flex items-center gap-1">
                        <Clock size={12} /> {article.time}
                    </span>
                </div>

                {/* Headline */}
                <h3 className="text-lg font-bold text-white leading-tight shrink-0">{article.title}</h3>

                {/* Summary card */}
                <div className="space-y-3 text-sm bg-obsidian p-4 rounded-lg border border-[#222]">
                    <div>
                        <p className="text-zinc-500 font-semibold mb-1 uppercase text-[10px] tracking-wider">{tx('theWhat', lang)}</p>
                        <p className="text-zinc-200">{article.what}</p>
                    </div>

                    <div className="flex gap-4">
                        {/* Entities + Verdict */}
                        <div className="flex-1">
                            <p className="text-zinc-500 font-semibold mb-2 uppercase text-[10px] tracking-wider">{tx('entities', lang)}</p>
                            <div className="flex flex-wrap gap-1">
                                {article.who.map(t => (
                                    <span key={t} className="px-2 py-0.5 bg-[#1a1a1a] text-zinc-300 rounded text-xs border border-[#333]">{t}</span>
                                ))}
                                {article.tickers?.map(t => (
                                    <span key={t} className="px-2 py-0.5 bg-blaze/20 text-blaze rounded text-xs border border-blaze/30 font-bold">{t}</span>
                                ))}
                            </div>
                        </div>

                        {/* Impact badge */}
                        <div className="flex-shrink-0">
                            <p className="text-zinc-500 font-semibold mb-2 uppercase text-[10px] tracking-wider">{tx('verdict', lang)}</p>
                            <div className={`flex items-center gap-1.5 font-bold px-3 py-2 rounded-lg border text-sm ${article.impact === 'BULLISH' ? 'border-emerald-500/20 text-emerald-400' : article.impact === 'BEARISH' ? 'border-blood/20 text-blood' : 'border-[#333] text-zinc-400'}`}>
                                {article.impact === 'BULLISH' && <TrendingUp size={16} />}
                                {article.impact === 'BEARISH' && <TrendingDown size={16} />}
                                {article.impact === 'NEUTRAL' && <Minus size={16} />}
                                {article.impact}
                            </div>
                        </div>
                    </div>

                    {/* Key price factors */}
                    {article.keyPriceFactors && article.keyPriceFactors.length > 0 && (
                        <div>
                            <p className="text-zinc-500 font-semibold mb-1.5 uppercase text-[10px] tracking-wider">{tx('priceFactors', lang)}</p>
                            <div className="flex flex-col gap-1">
                                {article.keyPriceFactors.map((f, i) => (
                                    <div key={i} className="flex items-start gap-1.5">
                                        <span className="text-blaze shrink-0 mt-0.5">›</span>
                                        <span className="text-zinc-300 text-xs">{f}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reasoning */}
                    <div>
                        <p className="text-zinc-500 font-semibold mb-1 uppercase text-[10px] tracking-wider">{tx('reasoning', lang)}</p>
                        <p className="text-zinc-300 italic text-sm">"{article.how.reasoning}"</p>
                    </div>

                    {/* Risk + Sectors */}
                    {(article.riskLevel || article.riskLevel) && (
                        <div className="flex gap-3">
                            {article.riskLevel && (
                                <div>
                                    <p className="text-zinc-500 font-semibold mb-1 uppercase text-[10px] tracking-wider">{tx('riskLevel', lang)}</p>
                                    <span className={`text-xs font-bold ${riskColor(article.riskLevel)}`}>{article.riskLevel}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Recommendation */}
                    <div className="pt-3 border-t border-[#333]">
                        <p className="text-blaze font-bold mb-1.5 flex items-center gap-2 uppercase text-[10px] tracking-wider">
                            <Bot size={14} /> {tx('reco', lang)}
                        </p>
                        <p className="text-zinc-200 text-sm">{article.recommendation}</p>
                    </div>
                </div>
            </div>

            {/* Footer: open in browser */}
            <div className="px-5 pb-4 shrink-0">
                <button
                    onClick={() => openUrl(article.url)}
                    className="flex items-center gap-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition">
                    {tx('readOriginal', lang)} {article.source} <ExternalLink size={12} />
                </button>
            </div>
        </motion.div>
    );
}

// ─── Broker card ───────────────────────────────────────────────────────────────
function BrokerCard({ item, lang, onSelect }: {
    item: NewsItem; lang: Lang; onSelect: (id: string) => void;
}) {
    return (
        <button
            onClick={() => onSelect(item.id)}
            className="w-full text-left px-3 py-2.5 border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors"
        >
            <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] font-bold text-blaze uppercase bg-blaze/10 px-1.5 py-0.5 rounded shrink-0">CTCK</span>
                {item.impact === 'BULLISH' && <TrendingUp size={9} className="text-emerald-400" />}
                {item.impact === 'BEARISH' && <TrendingDown size={9} className="text-blood" />}
                {item.impact === 'NEUTRAL' && <Minus size={9} className="text-zinc-500" />}
                <span className="text-[9px] text-zinc-600 ml-auto shrink-0">{item.time}</span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-snug line-clamp-2 mb-1">{item.title}</p>
            <p className="text-[9px] text-zinc-500 line-clamp-1">{item.what}</p>
        </button>
    );
}

// ─── Missing icons ─────────────────────────────────────────────────────────────
// Rss and BarChart2 are referenced but not in the lucide-react import above.
// Add them to the import or define stubs inline:
function Rss({ size, className }: { size: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" />
            <circle cx="5" cy="19" r="1" fill="currentColor" stroke="none" />
        </svg>
    );
}
function BarChart2({ size, className }: { size: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M18 20V10M12 20V4M6 20v-6" />
        </svg>
    );
}
