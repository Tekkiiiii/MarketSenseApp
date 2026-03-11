import React, { useState, useEffect, useCallback } from 'react';
import { Globe, Plus, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppContext } from '../../App';
import { db } from '../../lib/db';

type Lang = 'en' | 'vi';
const T: Record<string, Record<Lang, string>> = {
    title:          { en: 'Scout Agent Sources', vi: 'Nguồn Tin Của Scout Agent' },
    subtitle:       { en: 'Select the financial news sites the Scout Agent should monitor autonomously.', vi: 'Chọn các trang tin tài chính mà Scout Agent sẽ tự động theo dõi.' },
    prebuilt:       { en: 'Pre-built Adapters', vi: 'Nguồn Tin Có Sẵn' },
    custom:         { en: 'Custom RSS Sources', vi: 'Nguồn RSS Tùy Chỉnh' },
    namePlaceholder:{ en: 'Name (e.g. Blog XYZ)', vi: 'Tên (vd. Blog XYZ)' },
    urlPlaceholder: { en: 'RSS URL (https://...)', vi: 'Link RSS (https://...)' },
    add:            { en: 'Add', vi: 'Thêm' },
    noCustom:       { en: 'No custom sources added yet.', vi: 'Chưa có nguồn tùy chỉnh nào.' },
    active:         { en: 'active', vi: 'đang bật' },
};
const tx = (key: string, lang: Lang) => T[key]?.[lang] ?? key;

interface Source {
    id: string;
    name: string;
    url: string;
    active: boolean;
    prebuilt: boolean;
}

// Default: all prebuilt sources ON
const DEFAULT_SOURCES: Source[] = [
    { id: '1',  name: 'CafeF',                  url: 'https://cafef.vn',            active: true, prebuilt: true },
    { id: '2',  name: 'Vietstock',               url: 'https://vietstock.vn',         active: true, prebuilt: true },
    { id: '3',  name: 'VnEconomy',               url: 'https://vneconomy.vn',         active: true, prebuilt: true },
    { id: '4',  name: 'VNExpress Kinh Doanh',    url: 'https://vnexpress.net/kinh-doanh', active: true, prebuilt: true },
    { id: '5',  name: 'Tuổi Trẻ Kinh Doanh',    url: 'https://tuoitre.vn/kinh-doanh.htm', active: true, prebuilt: true },
    { id: '6',  name: 'Thanh Niên Tài Chính',    url: 'https://thanhnien.vn/tai-chinh-kinh-doanh.htm', active: true, prebuilt: true },
    { id: '7',  name: 'Báo Đầu Tư',              url: 'https://baodautu.vn',          active: true, prebuilt: true },
    { id: '8',  name: 'Nhịp Cầu Đầu Tư',        url: 'https://nhipcaudautu.vn',      active: true, prebuilt: true },
    { id: '9',  name: 'VTC News Kinh Tế',        url: 'https://vtcnews.vn/kinh-te.htm', active: true, prebuilt: true },
    { id: '10', name: 'VietnamNet',              url: 'https://vietnamnet.vn/kinh-doanh', active: true, prebuilt: true },
    { id: '11', name: 'Tạp chí Tài chính',      url: 'https://tapchitaichinh.vn',    active: true, prebuilt: true },
    { id: '12', name: 'Kinh Tế Sài Gòn',        url: 'https://thesaigontimes.vn',    active: true, prebuilt: true },
    { id: '13', name: 'Tin Nhanh Chứng Khoán',  url: 'https://www.tinnhanhchungkhoan.vn', active: true, prebuilt: true },
];

const STORAGE_KEY = 'sources_v1';

export default function SourceManager() {
    const { lang } = useAppContext() as { lang: Lang };
    const [sources, setSources] = useState<Source[]>(DEFAULT_SOURCES);
    const [loaded, setLoaded] = useState(false);
    const [newName, setNewName] = useState('');
    const [newUrl,  setNewUrl]  = useState('');

    // ── Load from DB on mount ──────────────────────────────────────────────────
    useEffect(() => {
        db.getSetting(STORAGE_KEY)
            .then(raw => {
                if (raw) {
                    const saved: Source[] = JSON.parse(raw);
                    // Merge: keep defaults order, update active flags + append custom
                    const merged = DEFAULT_SOURCES.map(def => {
                        const s = saved.find(r => r.id === def.id);
                        return s ? { ...def, active: s.active } : def;
                    });
                    const custom = saved.filter(s => !s.prebuilt);
                    setSources([...merged, ...custom]);
                }
            })
            .catch(() => { /* browser dev mode — use defaults */ })
            .finally(() => setLoaded(true));
    }, []);

    // ── Persist on every change (after initial load) ───────────────────────────
    const persist = useCallback((next: Source[]) => {
        db.setSetting(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    }, []);

    const toggleSource = (id: string) => {
        const next = sources.map(s => s.id === id ? { ...s, active: !s.active } : s);
        setSources(next);
        persist(next);
    };

    const addCustomSource = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim() || !newUrl.trim()) return;
        const next = [
            ...sources,
            { id: Date.now().toString(), name: newName.trim(), url: newUrl.trim(), active: true, prebuilt: false }
        ];
        setSources(next);
        persist(next);
        setNewName('');
        setNewUrl('');
    };

    const removeSource = (id: string) => {
        const next = sources.filter(s => s.id !== id);
        setSources(next);
        persist(next);
    };

    const activeCount = sources.filter(s => s.active).length;

    if (!loaded) return (
        <div className="h-full flex items-center justify-center text-zinc-600 text-sm">Loading…</div>
    );

    return (
        <div className="h-full flex flex-col max-w-5xl mx-auto">
            <div className="mb-8 flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight mb-2">{tx('title', lang)}</h2>
                    <p className="text-zinc-400 text-sm">{tx('subtitle', lang)}</p>
                </div>
                <span className="text-xs text-blood bg-blood/10 border border-blood/20 px-2.5 py-1 rounded-full shrink-0 mt-1">
                    {activeCount} {tx('active', lang)}
                </span>
            </div>

            <div className="bg-charcoal border border-[#222] rounded-xl p-6 mb-8 flex-1 overflow-y-auto">
                <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
                    <Globe size={18} className="text-blood" /> {tx('prebuilt', lang)}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {sources.filter(s => s.prebuilt).map(source => (
                        <button
                            key={source.id}
                            onClick={() => toggleSource(source.id)}
                            className={clsx(
                                "flex items-center gap-2 p-3 rounded-xl border transition-all text-left",
                                source.active
                                    ? "bg-blood/10 border-blood/30 text-white shadow-[0_0_15px_rgba(225,29,72,0.1)]"
                                    : "bg-obsidian border-[#222] text-zinc-400 hover:border-blood/30"
                            )}
                        >
                            {source.active
                                ? <CheckCircle2 className="text-blood flex-shrink-0" size={16} />
                                : <Circle className="text-zinc-600 flex-shrink-0" size={16} />}
                            <div className="min-w-0">
                                <div className="font-semibold text-sm truncate">{source.name}</div>
                                <div className="text-[10px] opacity-60 mt-0.5 truncate">{source.url}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-charcoal border border-[#222] rounded-xl p-6">
                <h3 className="font-bold text-lg text-white mb-4">{tx('custom', lang)}</h3>

                <form onSubmit={addCustomSource} className="flex gap-3 mb-6">
                    <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder={tx('namePlaceholder', lang)}
                        className="w-1/3 bg-obsidian border border-[#222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blood transition-colors"
                    />
                    <input
                        type="url"
                        value={newUrl}
                        onChange={e => setNewUrl(e.target.value)}
                        placeholder={tx('urlPlaceholder', lang)}
                        className="flex-1 bg-obsidian border border-[#222] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blood transition-colors"
                    />
                    <button type="submit" className="bg-blood/10 text-blood hover:bg-blood/20 border border-blood/20 px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2">
                        <Plus size={18} /> {tx('add', lang)}
                    </button>
                </form>

                <div className="space-y-2">
                    {sources.filter(s => !s.prebuilt).length === 0 && (
                        <p className="text-zinc-500 text-sm italic">{tx('noCustom', lang)}</p>
                    )}
                    {sources.filter(s => !s.prebuilt).map(source => (
                        <div key={source.id} className="flex items-center justify-between p-3 rounded-lg bg-obsidian border border-[#222]">
                            <div className="flex items-center gap-3">
                                <button onClick={() => toggleSource(source.id)} className="text-zinc-400 hover:text-blood transition-colors">
                                    {source.active ? <CheckCircle2 className="text-blood" size={20} /> : <Circle size={20} />}
                                </button>
                                <div>
                                    <div className="font-semibold text-zinc-200 text-sm">{source.name}</div>
                                    <div className="text-xs text-zinc-500">{source.url}</div>
                                </div>
                            </div>
                            <button onClick={() => removeSource(source.id)} className="text-zinc-500 hover:text-blood transition-colors p-2">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
