import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Rss, Settings2, ShieldAlert, Zap, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { clsx } from 'clsx';
import AlertFeed from './components/Dashboard/AlertFeed';
import KeywordManager from './components/Settings/KeywordManager';
import SourceManager from './components/Settings/SourceManager';
import ScoutSettings from './components/Settings/ScoutSettings';
import SetupWizard from './components/Setup/SetupWizard';
import { db } from './lib/db';

import { createContext, useContext } from 'react';

// ─── App-wide Context ──────────────────────────────────────────────────────────
export type Theme = 'dark' | 'light';
export type Lang = 'en' | 'vi';

export const AppContext = createContext<{
  theme: Theme; setTheme: (t: Theme) => void;
  lang: Lang; setLang: (l: Lang) => void;
}>({ theme: 'dark', setTheme: () => { }, lang: 'en', setLang: () => { } });

export const useAppContext = () => useContext(AppContext);

// ─── Label map ────────────────────────────────────────────────────────────────
const LABELS: Record<string, Record<Lang, string>> = {
  dashboard: { en: 'Dashboard', vi: 'Bảng Tin' },
  keywords: { en: 'Keywords & Filters', vi: 'Từ Khoá & Lọc' },
  sources: { en: 'News Sources', vi: 'Nguồn Tin' },
  settings: { en: 'Settings', vi: 'Cài Đặt' },
  scoutNow: { en: 'Scout Now', vi: 'Quét Ngay' },
  scouting: { en: 'Scouting...', vi: 'Đang quét...' },
  agents: { en: 'Agents Active', vi: 'Agent Hoạt Động' },
  every: { en: 'Every', vi: 'Mỗi' },
  appSub: { en: 'VN Agent Swarm', vi: 'Thầy Dàn Agent VN' },
};

function t(key: string, lang: Lang) { return LABELS[key]?.[lang] ?? key; }

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isScouting, setIsScouting] = useState(false);
  const [lastScouted, setLastScouted] = useState<string | null>(null);
  const [scoutFrequency] = useState(15);
  const [theme, setTheme] = useState<Theme>('dark');
  const [lang, setLang] = useState<Lang>('vi');
  const [setupDone, setSetupDone] = useState<boolean | null>(null); // null = checking

  // Check if first-run setup has been completed
  useEffect(() => {
    db.getSetting('setup_complete')
      .then(val => setSetupDone(val === '1'))
      .catch(() => setSetupDone(true)); // fallback: skip wizard in browser preview
  }, []);

  const handleSetupComplete = (chosenLang: Lang) => {
    setLang(chosenLang);
    setSetupDone(true);
  };

  const handleScoutNow = () => {
    setIsScouting(true);
    setTimeout(() => {
      setIsScouting(false);
      setLastScouted(new Date().toLocaleTimeString());
    }, 3000);
  };

  const bgMain = theme === 'dark' ? 'bg-obsidian' : 'bg-zinc-100';
  const bgSidebar = theme === 'dark' ? 'bg-charcoal border-[#222]' : 'bg-white border-zinc-200';
  const textBase = theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700';

  return (
    <AppContext.Provider value={{ theme, setTheme, lang, setLang }}>
      {/* First-run wizard overlay */}
      {setupDone === false && (
        <SetupWizard onComplete={handleSetupComplete} />
      )}

      {/* Loading state while checking setup */}
      {setupDone === null && (
        <div className="fixed inset-0 bg-obsidian flex items-center justify-center">
          <ShieldAlert size={28} className="text-blaze animate-pulse" />
        </div>
      )}

      {/* Main app — always rendered but pointer-events disabled during wizard */}
      <div className={clsx(
        'flex h-screen w-full font-sans overflow-hidden transition-colors duration-300',
        bgMain, textBase,
        setupDone !== true && 'invisible'
      )}>

        {/* Sidebar */}
        <div className={clsx(
          'flex flex-col border-r shrink-0 transition-all duration-300',
          bgSidebar,
          sidebarOpen ? 'w-52' : 'w-14'
        )}>
          {/* Logo row */}
          <div className={clsx('flex items-center gap-2 p-3 border-b', theme === 'dark' ? 'border-[#222]' : 'border-zinc-200')}>
            <ShieldAlert className="text-blaze shrink-0" size={18} />
            {sidebarOpen && (
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">MarketSense</div>
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{t('appSub', lang)}</div>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className={clsx('ml-auto shrink-0 p-1 rounded hover:bg-zinc-700/30 text-zinc-500 hover:text-zinc-300 transition-colors', !sidebarOpen && 'mx-auto ml-0')}
            >
              {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-3 space-y-0.5">
            {[
              { id: 'dashboard', icon: <LayoutDashboard size={16} />, key: 'dashboard' },
              { id: 'keywords', icon: <Tag size={16} />, key: 'keywords' },
              { id: 'sources', icon: <Rss size={16} />, key: 'sources' },
              { id: 'settings', icon: <Settings2 size={16} />, key: 'settings' },
            ].map(item => (
              <NavItem
                key={item.id}
                icon={item.icon}
                label={t(item.key, lang)}
                active={activeTab === item.id}
                collapsed={!sidebarOpen}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </nav>

          {/* Scout Now + Status */}
          <div className={clsx('p-2 border-t', theme === 'dark' ? 'border-[#222]' : 'border-zinc-200')}>
            <button
              onClick={handleScoutNow}
              disabled={isScouting}
              title={t('scoutNow', lang)}
              className={clsx(
                'flex items-center justify-center gap-1.5 w-full py-2 rounded-lg font-semibold text-xs transition-all duration-300',
                isScouting
                  ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  : 'bg-blaze hover:bg-blaze/80 text-white shadow-[0_0_12px_rgba(249,115,22,0.25)] active:scale-95'
              )}
            >
              <Zap size={13} className={isScouting ? '' : 'animate-pulse'} />
              {sidebarOpen && (isScouting ? t('scouting', lang) : t('scoutNow', lang))}
            </button>

            {sidebarOpen && (
              <div className="flex items-center justify-between text-[9px] text-zinc-500 px-1 mt-1.5">
                <div className="flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blood opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-600"></span>
                  </span>
                  {t('agents', lang)}
                </div>
                {lastScouted
                  ? <span className="text-emerald-500">⟳ {lastScouted}</span>
                  : <span>{t('every', lang)} {scoutFrequency}m</span>
                }
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div data-tauri-drag-region className="h-7 w-full select-none shrink-0" />
          <main className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
            {activeTab === 'dashboard' && <AlertFeed />}
            {activeTab === 'keywords' && <KeywordManager />}
            {activeTab === 'sources' && <SourceManager />}
            {activeTab === 'settings' && <ScoutSettings />}
          </main>
        </div>

      </div>
    </AppContext.Provider>
  );
}

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick, collapsed }: {
  icon: React.ReactNode; label: string; active: boolean;
  onClick: () => void; collapsed: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={clsx(
        'flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm font-medium transition-colors duration-200',
        collapsed && 'justify-center',
        active
          ? 'bg-blood text-white shadow-[0_0_12px_rgba(225,29,72,0.3)]'
          : 'text-zinc-400 hover:bg-[#1a1a1a] hover:text-zinc-200'
      )}
    >
      {icon}
      {!collapsed && <span className="truncate text-xs">{label}</span>}
    </button>
  );
}

export default App;
