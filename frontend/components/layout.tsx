'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { BarChart3, BookOpen, ChevronDown, ClipboardPlus, History, LayoutDashboard, LoaderCircle, LogOut, Menu, RotateCcw, Settings, ShieldCheck, X } from 'lucide-react';
import { request, write } from '@/lib/api';
import type { Account } from '@/lib/auth-routes';
import { Brand } from './brand';
import { Notice } from './ui';
import { ThemeToggle } from './theme';

const links = [
  ['/dashboard', 'Начало', LayoutDashboard],
  ['/questions', 'Банка с въпроси', BookOpen],
  ['/exams/new', 'Нов изпит', ClipboardPlus],
  ['/history', 'История', History],
  ['/review', 'Преговор', RotateCcw],
  ['/analytics', 'Анализи', BarChart3],
  ['/settings', 'Настройки', Settings],
] as const;

function NavigationStatus({ pending }: { pending: boolean }) {
  return <span className="navigation-status" data-pending={pending}>
    <LoaderCircle className={pending ? 'spin' : undefined} size={15} aria-hidden="true" />
    {pending && <span className="sr-only" role="status">Зареждане на страницата…</span>}
  </span>;
}

function LinkStatus() {
  const { pending } = useLinkStatus();
  return <NavigationStatus pending={pending} />;
}

export function Workspace({ children, account }: { children: ReactNode; account: Account }) {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const [documentTarget, setDocumentTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menu = menuPath === pathname;
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const profileButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = drawer.current;
    if (menu && element && !element.open) element.showModal();
    if (!menu && element?.open) element.close();
  }, [menu]);
  useEffect(() => {
    const desktop = matchMedia('(min-width: 901px)');
    const close = () => { if (desktop.matches) setMenuPath(null); };
    desktop.addEventListener('change', close);
    return () => desktop.removeEventListener('change', close);
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const clear = () => { setDocumentTarget(null); setMenuPath(null); };
    window.addEventListener('pageshow', clear);
    return () => window.removeEventListener('pageshow', clear);
  }, []);

  function selectSection(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (pathname === href && !location.search) {
      event.preventDefault();
      setMenuPath(null);
      return;
    }
    if (process.env.NODE_ENV === 'development') setDocumentTarget(href);
  }

  const active = links.find(([href]) => pathname === href || pathname.startsWith(href + '/'));
  const title = pathname === '/questions/topics' ? 'Теми' : pathname === '/questions/quality' ? 'Качество на въпросите'
    : pathname === '/review' ? 'Преговор' : active?.[1] ?? (pathname.startsWith('/results') ? 'Резултат' : 'Изпит');
  const email = account.email ?? 'Профил';
  const avatar = <span className="avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</span>;

  const navigation = <>
      <Link href="/dashboard" className="side-brand" onClick={() => setMenuPath(null)}><Brand /></Link>
      <p className="eyebrow side-label">Работно пространство</p>
      <nav aria-label="Основна навигация">
        {links.map(([href, label, Icon]) => {
          const selected = active?.[0] === href;
          const props = {
            href, 'aria-label': label, className: selected ? 'active' : undefined,
            'aria-current': selected ? 'page' as const : undefined,
            onClick: (event: MouseEvent<HTMLAnchorElement>) => selectSection(event, href),
          };
          const content = <><Icon size={19} aria-hidden="true" />{label}</>;
          // Use document navigation for the workspace menu in next dev. Its RSC transitions
          // can suspend while webpack compiles routes and trigger React's use() diagnostic.
          return process.env.NODE_ENV === 'development'
            ? <a key={href} {...props}>{content}<NavigationStatus pending={documentTarget === href} /></a>
            : <Link key={href} {...props} prefetch={false}>{content}<LinkStatus /></Link>;
        })}
      </nav>
      <div className="side-foot">
        <div className="sidebar-user-card">{avatar}<div className="sidebar-user-info">
          <strong className="sidebar-user-name">Вашият профил</strong><span className="sidebar-user-email" title={email}>{email}</span>
        </div></div>
        {error && <Notice>Изходът не успя. Опитайте отново.</Notice>}
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError(false);
          try {
            await request('/auth/session', write('DELETE'));
            location.replace('/login');
          } catch { setError(true); } finally { setBusy(false); }
        }}><LogOut size={19} /> {busy ? 'Излизане…' : 'Изход'}</button>
      </div>
  </>;

  return <div className="shell">
    <a className="skip-link" href="#main">Към съдържанието</a>
    <aside className="sidebar desktop-sidebar">{navigation}</aside>
    <dialog ref={drawer} className="sidebar navigation-drawer" id="navigation" aria-label="Меню на ExamForge"
      onCancel={event => { event.preventDefault(); setMenuPath(null); }}
      onClose={() => menuButton.current?.focus()}
      onClick={event => { if (event.target === event.currentTarget) setMenuPath(null); }}>
      <div className="drawer-content">
        <button type="button" className="icon-button drawer-close" aria-label="Затвори менюто" autoFocus
          onClick={() => setMenuPath(null)}><X size={20} /></button>
        {menu && navigation}
      </div>
    </dialog>
    <div className="workspace">
      <header className="topbar"><div className="topbar-title">
        <button ref={menuButton} type="button" className="icon-button mobile-menu" title="Меню" aria-label="Отвори менюто"
          aria-controls="navigation" aria-expanded={menu} onClick={() => setMenuPath(pathname)}><Menu size={21} /></button>
        <span className="topbar-page-name">{title}</span></div>
        <div className="topbar-actions"><ThemeToggle />
          <div className="profile-menu"
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setProfileOpen(false); }}
            onKeyDown={event => {
              if (event.key === 'Escape' && profileOpen) {
                event.preventDefault();
                profileButton.current?.focus();
                setProfileOpen(false);
              }
            }}>
            <button ref={profileButton} type="button" className="profile" aria-label="Меню на профила" title={email}
              aria-expanded={profileOpen} aria-controls="profile-links" onClick={() => setProfileOpen(open => !open)}>
              {avatar}<span className="profile-email">{email}</span><ChevronDown size={15} aria-hidden="true" />
            </button>
            <div id="profile-links" className="profile-links" hidden={!profileOpen}>
              <Link href="/settings" prefetch={false} onClick={() => setProfileOpen(false)}><Settings size={16} aria-hidden="true" /> Настройки на профила</Link>
              <Link href="/privacy" prefetch={false} onClick={() => setProfileOpen(false)}><ShieldCheck size={16} aria-hidden="true" /> Поверителност</Link>
            </div>
          </div></div>
      </header>
      <main id="main" tabIndex={-1} className="page">{children}</main>
    </div>
  </div>;
}
