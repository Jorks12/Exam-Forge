import { Check, Globe, Monitor, ShieldCheck, User } from 'lucide-react';
import Link from 'next/link';
import type { Account } from '@/lib/auth-routes';
import { ThemeSelect } from './theme';
import { Heading } from './ui';

export function SettingsPage({ account }: { account: Account }) {
  return (
    <>
      <Heading
        kicker="Профил"
        title="Настройки"
        description="Информация за текущия профил и езика на приложението."
      />

      <section className="panel pad stack settings-section">
        <div className="settings-heading">
          <span className="metric-icon-wrap"><User size={17} aria-hidden="true" /></span>
          <div className="section-head"><h2>Профил</h2><p>Имейл и състояние на акаунта.</p></div>
        </div>
        <dl className="item-list">
          <div className="item-row">
            <dt>Имейл</dt>
            <dd>
              <strong>{account.email}</strong>
            </dd>
          </div>
          <div className="item-row">
            <dt>Състояние на имейла</dt>
            <dd className="pill good">
              <Check size={14} aria-hidden="true" />
              <span>{account.emailConfirmed ? 'Потвърден' : 'Входът е активен'}</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel pad stack settings-section">
        <div className="settings-heading">
          <span className="metric-icon-wrap"><Monitor size={17} aria-hidden="true" /></span>
          <div className="section-head"><h2>Външен вид</h2><p>Изберете тема за този браузър.</p></div>
        </div>
        <div className="theme-setting"><ThemeSelect /><p className="muted">Системната тема следва настройката на устройството.</p></div>
      </section>

      <section className="panel pad stack settings-section">
        <div className="settings-heading">
          <span className="metric-icon-wrap"><Globe size={17} aria-hidden="true" /></span>
          <div className="section-head"><h2>Предпочитания</h2><p>Език на приложението.</p></div>
        </div>
        <dl className="item-list"><div className="item-row"><dt>Интерфейс</dt><dd>Български</dd></div></dl>
      </section>

      <section className="panel pad stack settings-section">
        <div className="settings-heading">
          <span className="metric-icon-wrap"><ShieldCheck size={17} aria-hidden="true" /></span>
          <div className="section-head"><h2>Поверителност</h2><p>Сесии и предпочитания за бисквитки.</p></div>
        </div>
        <p style={{ lineHeight: 1.6 }}>
          Включени са необходимите бисквитки за вход и сесия. Темата се пази локално в браузъра.
        </p>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          ExamForge не зарежда незадължителни бисквитки за анализ или реклама.
        </p>
        <div>
          <Link href="/privacy" className="button">
            <ShieldCheck size={16} />
            <span>Поверителност и бисквитки</span>
          </Link>
        </div>
      </section>
    </>
  );
}
