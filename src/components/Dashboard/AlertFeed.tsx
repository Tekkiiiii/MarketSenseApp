import { useState, useMemo, useEffect, useCallback } from 'react';
import { AlertCircle, TrendingUp, TrendingDown, Minus, Clock, ExternalLink, Bot, ChevronUp, ChevronDown, ChevronsUpDown, Search, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { openUrl } from '@tauri-apps/plugin-opener';
import { listen } from '@tauri-apps/api/event';
import { useAppContext } from '../../App';
import { db, Article } from '../../lib/db';

type NewsItem = {
    id: string;
    title: string;
    url: string;
    source: string;
    time: string;
    impact: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    what: string;
    who: string[];
    how: {
        reasoning: string;
    };
    recommendation: string;
    unread: boolean;
};

const INITIAL_NEWS: NewsItem[] = [
    {
        id: "news-1",
        title: "Ông Nguyễn Duy Hưng lên tiếng giữa bão bán tháo vì giá dầu, SSI Research gọi tên danh mục cổ phiếu vượt sóng",
        url: "https://cafef.vn/thi-truong-chung-khoan/ong-nguyen-duy-hung-len-tieng-giua-bao-ban-thao-vi-gia-dau-ssi-research-goi-ten-danh-muc-co-phieu-vuot-song-20250310094512.chn",
        source: "CafeF",
        time: "10 phút trước",
        impact: "BULLISH",
        what: "Chủ tịch SSI nhận định về tình hình thị trường và ảnh hưởng của giá dầu, đồng thời SSI Research đưa ra danh sách các cổ phiếu tiềm năng.",
        who: ["SSI", "HPG", "FPT", "Chứng Khoán", "Thép"],
        how: {
            reasoning: "Củng cố niềm tin nhà đầu tư trong lúc hoảng loạn, chỉ ra nhóm cổ phiếu ít chịu rủi ro vĩ mô."
        },
        recommendation: "Tập trung tích lũy HPG và FPT khi thị trường bán tháo rộng. Tránh cổ phiếu năng lượng đầu cơ cho đến khi giá dầu ổn định.",
        unread: false
    },
    {
        id: "news-2",
        title: "Ngân hàng Nhà nước hút ròng gần 40.000 tỷ đồng, tỷ giá trung tâm tiếp tục hạ nhiệt",
        url: "https://vietstock.vn/2025/03/ngan-hang-nha-nuoc-hut-rong-gan-40000-ty-dong-ty-gia-trung-tam-tiep-tuc-ha-nhiet-737-1234567.htm",
        source: "Vietstock",
        time: "1 giờ trước",
        impact: "NEUTRAL",
        what: "NHNN có động thái can thiệp thị trường mở để ổn định tỷ giá.",
        who: ["VCB", "Ngân hàng"],
        how: {
            reasoning: "Hành động điều hành chính sách tiền tệ thường kỳ, giúp ổn định vĩ mô, tác động trung tính lên nhóm tài chính."
        },
        recommendation: "Duy trì tỷ trọng hiện tại trong nhóm ngân hàng. Theo dõi VCB để tìm dấu hiệu dẫn dắt phục hồi.",
        unread: true
    },
    {
        id: "news-3",
        title: "Chủ tịch Vinhomes: Đang nghiên cứu phát hành thêm trái phiếu doanh nghiệp nửa cuối năm",
        url: "https://vneconomy.vn/chu-tich-vinhomes-dang-nghien-cuu-phat-hanh-them-trai-phieu-doanh-nghiep-nua-cuoi-nam.htm",
        source: "VnEconomy",
        time: "2 giờ trước",
        impact: "BULLISH",
        what: "VHM lên kế hoạch huy động dòng vốn mới để phát triển các đại dự án.",
        who: ["VHM", "Bất Động Sản"],
        how: {
            reasoning: "Giải quyết vấn đề khát vốn, mở đường cho việc triển khai các siêu dự án đang đắp chiếu."
        },
        recommendation: "Cân nhắc giao dịch ngắn hạn VHM. Tâm lý tích cực có thể lan tỏa sang DXG và NLG.",
        unread: true
    },
    {
        id: "news-4",
        title: "Doanh nghiệp thủy sản báo lỗ kỷ lục trong quý 3 do chi phí logistics đội vọt",
        url: "https://cafef.vn/doanh-nghiep/doanh-nghiep-thuy-san-bao-lo-ky-luc-quy-3-vi-chi-phi-logistics-doi-vot-20250310085500.chn",
        source: "CafeF",
        time: "3 giờ trước",
        impact: "BEARISH",
        what: "Nhiều công ty thủy sản gặp khó khăn nghiêm trọng về biên lợi nhuận do chi phí vận tải biển tăng mạnh.",
        who: ["VHC", "FMC", "Thủy Sản"],
        how: {
            reasoning: "Chi phí logistics ăn mòn phần lớn lợi nhuận gộp. Ngành thủy sản đối mặt thách thức lớn trong ngắn hạn."
        },
        recommendation: "Giảm tỷ trọng nhóm xuất khẩu thủy sản. Chờ cước vận tải biển hạ nhiệt trước khi mua lại VHC.",
        unread: false
    },
    {
        id: "news-5",
        title: "Khối ngoại đẩy mạnh mua ròng phiên thứ 5 liên tiếp, tập trung gom cổ phiếu công nghệ",
        url: "https://vietstock.vn/2025/03/khoi-ngoai-mua-rong-phien-thu-5-lien-tiep-tap-trung-gom-co-phieu-cong-nghe-737-7654321.htm",
        source: "Vietstock",
        time: "4 giờ trước",
        impact: "BULLISH",
        what: "Dòng vốn nước ngoài tích cực giải ngân vào thị trường chứng khoán Việt Nam, đặc biệt săn đón cổ phiếu công nghệ thông tin.",
        who: ["FPT", "CMG", "Công Nghệ"],
        how: {
            reasoning: "Dòng tiền thông minh nước ngoài đánh giá cao tiềm năng dài hạn của ngành công nghệ Việt Nam so với định giá."
        },
        recommendation: "Tăng tỷ trọng FPT. Tích lũy dài hạn CMG cho danh mục tăng trưởng.",
        unread: true
    }
];

type SortKey = 'time' | 'impact' | 'source' | 'title';
type SortDir = 'asc' | 'desc';
type ImpactFilter = 'ALL' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';

// ─── i18n for AlertFeed ───────────────────────────────────────────────────────
type Lang = 'en' | 'vi';
const T: Record<string, Record<Lang, string>> = {
    bulletin:    { en: 'Market Bulletin', vi: 'Bản Tin Thị Trường' },
    hotReport:   { en: 'HOT / LATEST REPORT', vi: 'TIN NÓNG / MỚI NHẤT' },
    theWhat:     { en: 'The "What"', vi: 'Sự Kiện' },
    entities:    { en: 'Involved Entities', vi: 'Đối Tượng Liên Quan' },
    verdict:     { en: 'AI Impact Verdict', vi: 'Nhận Định AI' },
    reasoning:   { en: 'Analyst Reasoning', vi: 'Lý Luận Phân Tích' },
    reco:        { en: 'AI Recommendation', vi: 'Khuyến Nghị AI' },
    readOriginal:{ en: 'Read original on', vi: 'Đọc bài gốc trên' },
    earlierToday:{ en: 'Earlier Today', vi: 'Trước Đó Hôm Nay' },
    allNews:     { en: 'All News Today', vi: 'Tất Cả Tin Hôm Nay' },
    time:        { en: 'Time', vi: 'Thời Gian' },
    impact:      { en: 'Impact', vi: 'Tác Động' },
    source:      { en: 'Source', vi: 'Nguồn' },
    headline:    { en: 'Headline', vi: 'Tiêu Đề' },
    search:      { en: 'Search headline, ticker, source...', vi: 'Tìm tiêu đề, mã CK, nguồn...' },
    noResults:   { en: 'No results match your filter.', vi: 'Không có kết quả phù hợp.' },
    all:         { en: 'All', vi: 'Tất cả' },
    bull:        { en: '↑ Bull', vi: '↑ Tăng' },
    bear:        { en: '↓ Bear', vi: '↓ Giảm' },
    neutral:     { en: '– Neutral', vi: '– Trung lập' },
    brokerTitle: { en: '🏦 Broker Recommendations', vi: '🏦 Khuyến Nghị Công Ty Chứng Khoán' },
    brokerSub:   { en: 'Latest analyst picks from securities firms', vi: 'Khuyến nghị mới nhất từ các công ty chứng khoán' },
    readMore:    { en: 'Read', vi: 'Xem' },
};
const tx = (key: string, lang: Lang) => T[key]?.[lang] ?? key;

// ─── Time-ago helper ─────────────────────────────────────────────────────────
function timeAgo(isoStr: string): string {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '< 1 phút trước';
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ trước`;
    return `${Math.floor(hrs / 24)} ngày trước`;
}

export default function AlertFeed() {
    const { lang } = useAppContext() as { lang: Lang };
    const [news, setNews] = useState<NewsItem[]>(INITIAL_NEWS);
    const [activeId, setActiveId] = useState<string>(INITIAL_NEWS[0]?.id ?? '');
    const [sortKey, setSortKey] = useState<SortKey>('time');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [impactFilter, setImpactFilter] = useState<ImpactFilter>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // ── Convert a DB Article → NewsItem ──────────────────────────────────────
    const articleToNewsItem = (a: Article): NewsItem => ({
        id: String(a.id ?? a.url),
        title: a.title,
        url: a.url,
        source: a.source,
        time: a.scraped_at ? timeAgo(a.scraped_at) : '—',
        impact: a.impact as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
        what: a.summary || a.title,
        who: (() => { try { return JSON.parse(a.entities); } catch { return []; } })(),
        how: { reasoning: a.recommendation || a.summary },
        recommendation: a.recommendation,
        unread: true,
    });

    // ── Load articles from SQLite ─────────────────────────────────────────────
    const loadArticles = useCallback(async () => {
        try {
            const articles = await db.getArticles(100);
            if (articles.length > 0) {
                const items = articles.map(articleToNewsItem);
                setNews(items);
                setActiveId(prev => items.some(i => i.id === prev) ? prev : items[0].id);
            }
        } catch {
            // Not in Tauri context (browser preview) — keep mock data
        }
        setIsRefreshing(false);
    }, []);

    // ── Initial load + listen for scout updates ───────────────────────────────
    useEffect(() => {
        loadArticles();
        let unlisten: (() => void) | undefined;
        listen<number>('articles-updated', () => {
            setIsRefreshing(true);
            loadArticles();
        }).then(fn => { unlisten = fn; }).catch(() => { });
        return () => { unlisten?.(); };
    }, [loadArticles]);

    const handleSelect = (id: string) => {
        if (id !== activeId) {
            setActiveId(id);
            setNews(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n));
        }
    };

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const filteredNews = useMemo(() => {
        let items = [...news];
        if (impactFilter !== 'ALL') items = items.filter(n => n.impact === impactFilter);
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            items = items.filter(n =>
                n.title.toLowerCase().includes(q) ||
                n.what.toLowerCase().includes(q) ||
                n.source.toLowerCase().includes(q) ||
                n.who.some(w => w.toLowerCase().includes(q))
            );
        }
        const impactOrder = { BULLISH: 0, NEUTRAL: 1, BEARISH: 2 };
        items.sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'impact') cmp = impactOrder[a.impact] - impactOrder[b.impact];
            else if (sortKey === 'source') cmp = a.source.localeCompare(b.source);
            else if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
            else cmp = a.time.localeCompare(b.time);
            return sortDir === 'desc' ? -cmp : cmp;
        });
        return items;
    }, [news, impactFilter, searchQuery, sortKey, sortDir]);

    // ── Broker recommendation articles ──────────────────────────────────────────
    const BROKER_KW = ['khuyến nghị', 'khuyến nghị mua', 'khuyến nghị bán', 'research', 'analyst', 'securities firm', 'công ty chứng khoán', 'ctck'];
    const brokerRecs = useMemo(() =>
        news.filter(n => {
            const hay = (n.title + ' ' + n.what).toLowerCase();
            return BROKER_KW.some(kw => hay.includes(kw));
        }).slice(0, 8)
    , [news]);

    const getImpactColor = (impact: string) => {
        if (impact === 'BULLISH') return 'text-emerald-400';
        if (impact === 'BEARISH') return 'text-blood';
        return 'text-zinc-400';
    };

    const getImpactGradient = (impact: string) => {
        if (impact === 'BULLISH') return 'from-emerald-500 to-emerald-300';
        if (impact === 'BEARISH') return 'from-blood to-blaze';
        return 'from-zinc-500 to-zinc-400';
    };

    return (
        <div className="h-full flex flex-col pt-1 pb-4">
            <div className="flex items-center justify-between mb-4 shrink-0">
                <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    {tx('bulletin', lang)}
                    {isRefreshing && <RefreshCw size={16} className="text-zinc-500 animate-spin" />}
                </h2>
            </div>

            {/* Top Section - Hot News and Earlier Today */}
            <div className="h-[55%] shrink-0 min-h-[400px] grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
                {/* Hot News Panel - Left Side (2/3 width) */}
                <div className="col-span-1 lg:col-span-2 relative">
                    <AnimatePresence>
                        {news.map((item) => {
                            if (item.id !== activeId) return null;
                            return (
                                <motion.div
                                    layoutId={`card-${item.id}`}
                                    key={item.id}
                                    className="h-full bg-charcoal rounded-xl border border-[#222] shadow-[0_0_30px_rgba(225,29,72,0.05)] flex flex-col overflow-hidden w-full absolute inset-0 z-20 origin-top-left"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                >
                                    <div className={`h-2 w-full bg-gradient-to-r ${getImpactGradient(item.impact)} shrink-0`}></div>

                                    <div className="p-8 flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                                        <motion.div layoutId={`header-${item.id}`} className="flex items-center justify-between mb-4 shrink-0">
                                            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white">
                                                <AlertCircle size={16} className={getImpactColor(item.impact)} />
                                                {tx('hotReport', lang)}
                                            </span>
                                            <span className="text-sm text-zinc-400 flex items-center gap-1">
                                                <Clock size={14} /> {item.time}
                                            </span>
                                        </motion.div>

                                        <motion.h3 layoutId={`title-${item.id}`} className="text-3xl font-bold text-white leading-tight mb-6 shrink-0">
                                            {item.title}
                                        </motion.h3>

                                        <div className="space-y-6 flex-1 text-sm bg-obsidian p-6 rounded-lg border border-[#222] shrink-0">
                                            <div>
                                                <h4 className="text-zinc-500 font-semibold mb-1 uppercase text-xs tracking-wider">{tx('theWhat', lang)}</h4>
                                                <motion.p layoutId={`content-${item.id}`} className="text-zinc-200 text-base">{item.what}</motion.p>
                                            </div>

                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <h4 className="text-zinc-500 font-semibold mb-2 uppercase text-xs tracking-wider">{tx('entities', lang)}</h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {item.who.map(t => (
                                                            <span key={t} className="px-2.5 py-1 bg-[#1a1a1a] text-zinc-300 rounded font-medium border border-[#333]">
                                                                {t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="flex-1">
                                                    <h4 className="text-zinc-500 font-semibold mb-2 uppercase text-xs tracking-wider">{tx('verdict', lang)}</h4>
                                                    <div className={`flex items-center gap-3 font-bold px-4 py-3 rounded-lg border bg-[#1a1a1a] ${item.impact === 'BULLISH' ? 'border-emerald-500/20 text-emerald-400' : item.impact === 'BEARISH' ? 'border-blood/20 text-blood' : 'border-[#333] text-zinc-400'}`}>
                                                        {item.impact === 'BULLISH' && <TrendingUp size={24} />}
                                                        {item.impact === 'BEARISH' && <TrendingDown size={24} />}
                                                        {item.impact === 'NEUTRAL' && <Minus size={24} />}
                                                        <span className="text-lg">{item.impact}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <h4 className="text-zinc-500 font-semibold mb-1 uppercase text-xs tracking-wider">{tx('reasoning', lang)}</h4>
                                                <p className="text-zinc-300 italic">"{item.how.reasoning}"</p>
                                            </div>

                                            <div className="pt-4 border-t border-[#333]">
                                                <h4 className="text-blaze font-bold mb-2 flex items-center gap-2 uppercase text-xs tracking-wider">
                                                    <Bot size={16} /> {tx('reco', lang)}
                                                </h4>
                                                <p className="text-zinc-200">{item.recommendation}</p>
                                            </div>
                                        </div>

                                        <div className="mt-6 flex justify-end shrink-0">
                                            <button onClick={() => openUrl(item.url)} className="flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition w-fit focus:outline-none">
                                                {tx('readOriginal', lang)} {item.source} <ExternalLink size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>

                {/* Older / Smaller News List - Right Side (1/3 width) */}
                <div className="flex flex-col h-full overflow-hidden">
                    <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest bg-obsidian pb-3 z-10 shrink-0">{tx('earlierToday', lang)}</h3>

                    <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
                        <AnimatePresence>
                            {news.map((item) => {
                                if (item.id === activeId) return null;
                                return (
                                    <motion.div
                                        layoutId={`card-${item.id}`}
                                        key={item.id}
                                        onClick={() => handleSelect(item.id)}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                        className="bg-charcoal p-4 rounded-lg border border-[#222] hover:border-blood/50 transition-colors cursor-pointer group relative shrink-0 z-10 flex flex-col"
                                    >
                                        {item.unread && (
                                            <div className="absolute top-[-4px] right-[-4px] w-3.5 h-3.5 bg-blood rounded-full border-[2.5px] border-obsidian z-10"></div>
                                        )}

                                        <motion.div layoutId={`header-${item.id}`} className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold bg-obsidian border border-[#333]">
                                                {item.impact === 'BULLISH' && <><TrendingUp size={12} className="text-emerald-400" /><span className="text-emerald-400">BULL</span></>}
                                                {item.impact === 'BEARISH' && <><TrendingDown size={12} className="text-blood" /><span className="text-blood">BEAR</span></>}
                                                {item.impact === 'NEUTRAL' && <><Minus size={12} className="text-zinc-400" /><span className="text-zinc-400">NEUT</span></>}
                                            </div>
                                            <span className="text-xs text-zinc-500">{item.time}</span>
                                        </motion.div>

                                        <motion.h4 layoutId={`title-${item.id}`} className="font-semibold text-sm text-zinc-200 mb-2 group-hover:text-blaze transition-colors line-clamp-2">
                                            {item.title}
                                        </motion.h4>

                                        <motion.p layoutId={`content-${item.id}`} className="text-xs text-zinc-400 line-clamp-2 mb-2 min-h-0 relative">
                                            {item.what}
                                        </motion.p>

                                        <div className="flex flex-wrap gap-1 mt-auto">
                                            {item.who.map(w => (
                                                <span key={w} className="text-[10px] bg-[#333] text-zinc-300 px-1.5 py-0.5 rounded">
                                                    {w}
                                                </span>
                                            ))}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* ── Broker Recommendations Strip ─────────────────────────────── */}
            {brokerRecs.length > 0 && (
                <div className="mt-6 shrink-0">
                    <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-sm font-bold text-white">{tx('brokerTitle', lang)}</h3>
                        <span className="text-[10px] text-amber-400/70 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">{brokerRecs.length}</span>
                        <span className="text-xs text-zinc-500 ml-1">{tx('brokerSub', lang)}</span>
                    </div>

                    <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                        {brokerRecs.map(item => (
                            <div
                                key={`br-${item.id}`}
                                className="flex-shrink-0 w-64 bg-charcoal border border-amber-400/20 rounded-xl p-4 hover:border-amber-400/40 transition-colors cursor-pointer group"
                                onClick={() => handleSelect(item.id)}
                            >
                                {/* Source + time */}
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">{item.source}</span>
                                    <span className="text-[10px] text-zinc-500">{item.time}</span>
                                </div>

                                {/* Title */}
                                <p className="text-xs font-semibold text-zinc-200 line-clamp-3 mb-3 group-hover:text-amber-300 transition-colors leading-relaxed">
                                    {item.title}
                                </p>

                                {/* Summary snippet */}
                                {item.what && (
                                    <p className="text-[10px] text-zinc-500 line-clamp-2 mb-3 leading-relaxed">
                                        {item.what}
                                    </p>
                                )}

                                {/* Read link */}
                                <button
                                    onClick={e => { e.stopPropagation(); openUrl(item.url); }}
                                    className="flex items-center gap-1 text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors font-medium"
                                >
                                    {tx('readMore', lang)} <ExternalLink size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Bottom Section - All News Today Table */}
            <div className="mt-6 flex-1 bg-charcoal rounded-xl border border-[#222] flex flex-col min-h-0 overflow-hidden">
                {/* Table Toolbar */}
                <div className="p-4 border-b border-[#222] flex items-center gap-3 shrink-0 flex-wrap">
                    <h3 className="text-sm font-semibold text-white shrink-0">{tx('allNews', lang)}</h3>
                    <span className="bg-obsidian px-2 py-0.5 rounded text-xs border border-[#333] text-zinc-400 shrink-0">{filteredNews.length} / {news.length}</span>

                    <div className="flex items-center gap-1.5 ml-2 flex-wrap">
                        {(['ALL', 'BULLISH', 'BEARISH', 'NEUTRAL'] as ImpactFilter[]).map(f => (
                            <button key={f} onClick={() => setImpactFilter(f)}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded border transition-colors ${impactFilter === f
                                    ? f === 'BULLISH' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                        : f === 'BEARISH' ? 'bg-blood/20 border-blood/40 text-blood'
                                            : f === 'NEUTRAL' ? 'bg-zinc-500/20 border-zinc-500/40 text-zinc-300'
                                                : 'bg-zinc-700 border-zinc-600 text-white'
                                    : 'bg-obsidian border-[#333] text-zinc-500 hover:border-zinc-500'
                                    }`}>
                                {f === 'ALL' ? tx('all', lang) : f === 'BULLISH' ? tx('bull', lang) : f === 'BEARISH' ? tx('bear', lang) : tx('neutral', lang)}
                            </button>
                        ))}
                    </div>

                    <div className="ml-auto flex items-center gap-2 bg-obsidian border border-[#333] rounded-lg px-3 py-1.5 min-w-[200px]">
                        <Search size={13} className="text-zinc-500 shrink-0" />
                        <input
                            type="text"
                            placeholder={tx('search', lang)}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent text-xs text-white focus:outline-none placeholder:text-zinc-600"
                        />
                        {searchQuery && <button onClick={() => setSearchQuery('')} className="text-zinc-500 hover:text-zinc-300"><X size={12} /></button>}
                    </div>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-[90px_80px_90px_1fr_130px_36px] gap-2 px-4 py-2 border-b border-[#1a1a1a] shrink-0">
                    {([
                        { key: 'time', label: tx('time', lang) },
                        { key: 'impact', label: tx('impact', lang) },
                        { key: 'source', label: tx('source', lang) },
                        { key: 'title', label: tx('headline', lang) },
                    ] as { key: SortKey; label: string }[]).map(col => (
                        <button key={col.key} onClick={() => handleSort(col.key)}
                            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors text-left">
                            {col.label}
                            {sortKey === col.key
                                ? sortDir === 'asc' ? <ChevronUp size={11} className="text-blaze" /> : <ChevronDown size={11} className="text-blaze" />
                                : <ChevronsUpDown size={11} className="opacity-30" />}
                        </button>
                    ))}
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Entities</div>
                    <div />
                </div>

                {/* Table Rows */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {filteredNews.length === 0 ? (
                        <div className="flex items-center justify-center h-24 text-zinc-600 text-sm">No results match your filter.</div>
                    ) : filteredNews.map(item => (
                        <div key={`all-${item.id}`}
                            onClick={() => handleSelect(item.id)}
                            className={`grid grid-cols-[90px_80px_90px_1fr_130px_36px] gap-2 px-4 py-2.5 border-b border-[#1a1a1a] cursor-pointer group transition-colors hover:bg-obsidian ${item.id === activeId ? 'bg-blood/5 border-l-2 border-l-blood pl-3' : ''
                                }`}>

                            {/* Time */}
                            <span className="text-xs text-zinc-500 tabular-nums self-center">{item.time}</span>

                            {/* Impact */}
                            <div className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 self-center w-fit ${item.impact === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : item.impact === 'BEARISH' ? 'bg-blood/10 border-blood/20 text-blood'
                                    : 'bg-zinc-500/10 border-[#333] text-zinc-400'}`}>
                                {item.impact === 'BULLISH' && <TrendingUp size={10} />}
                                {item.impact === 'BEARISH' && <TrendingDown size={10} />}
                                {item.impact === 'NEUTRAL' && <Minus size={10} />}
                                {item.impact === 'BULLISH' ? 'BULL' : item.impact === 'BEARISH' ? 'BEAR' : 'NEUT'}
                            </div>

                            {/* Source */}
                            <span className="text-[10px] font-medium text-zinc-400 self-center truncate">{item.source}</span>

                            {/* Headline */}
                            <span className="text-xs font-medium text-zinc-200 group-hover:text-blaze transition-colors self-center line-clamp-1">{item.title}</span>

                            {/* Entities */}
                            <div className="flex flex-wrap gap-1 self-center">
                                {item.who.slice(0, 2).map(w => <span key={w} className="text-[9px] bg-[#2a2a2a] text-zinc-400 px-1.5 py-0.5 rounded border border-[#333]">{w}</span>)}
                                {item.who.length > 2 && <span className="text-[9px] text-zinc-600">+{item.who.length - 2}</span>}
                            </div>

                            {/* Open link icon */}
                            <button onClick={e => { e.stopPropagation(); openUrl(item.url); }}
                                className="self-center text-zinc-600 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100 p-1 rounded">
                                <ExternalLink size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}

