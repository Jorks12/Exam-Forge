'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { BarChart3, BookOpen, ClipboardPlus, History, LayoutDashboard, LoaderCircle, LogOut, Menu, Settings, X } from 'lucide-react';
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
  const menu = menuPath === pathname;
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuPath(null);
      document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);
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
  const title = active?.[1] ?? (pathname.startsWith('/results') ? 'Резултат' : 'Изпит');
  const email = account.email ?? 'Профил';

  return <div className="shell">
    <a className="skip-link" href="#main">Към съдържанието</a>
    <aside className={'sidebar' + (menu ? ' open' : '')} id="navigation">
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
        {error && <Notice>Изходът не успя. Опитайте отново.</Notice>}
        <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError(false);
          try {
            await request('/auth/session', write('DELETE'));
            location.replace('/login');
          } catch { setError(true); } finally { setBusy(false); }
        }}><LogOut size={19} /> {busy ? 'Излизане…' : 'Изход'}</button>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-title">
        <button type="button" className="icon-button mobile-menu" title="Меню" aria-label={menu ? 'Затвори менюто' : 'Отвори менюто'}
          aria-controls="navigation" aria-expanded={menu} onClick={() => setMenuPath(menu ? null : pathname)}>{menu ? <X size={22} /> : <Menu size={22} />}</button>
        <span>{title}</span></div>
        <div className="topbar-actions"><ThemeToggle />
          <Link href="/settings" prefetch={false} className="profile" title={email}><span className="avatar">{email.slice(0, 1).toUpperCase()}</span>
            <span>{email}</span></Link></div>
      </header>
      <main id="main" className="page">{children}</main>
    </div>
  </div>;
}
