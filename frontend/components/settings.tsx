import { Check } from 'lucide-react';
import Link from 'next/link';
import type { Account } from '@/lib/auth-routes';
import { ThemeSelect } from './theme';
import { Heading } from './ui';

export function SettingsPage({ account }: { account: Account }) {
  return <>
    <Heading kicker="Профил" title="Настройки" description="Информация за текущия профил и езика на приложението." />
    <section className="panel pad stack"><h2>Профил</h2>
      <dl className="item-list"><div className="item-row"><dt>Имейл</dt><dd>{account.email}</dd></div>
        <div className="item-row"><dt>Интерфейс</dt><dd>Български</dd></div>
        <div className="item-row"><dt>Състояние на имейла</dt><dd className="pill good"><Check size={15} />
          {account.emailConfirmed ? 'Потвърден' : 'Входът е активен'}</dd></div></dl>
    </section>
    <section className="panel pad stack"><h2>Външен вид</h2><ThemeSelect /></section>
    <section className="panel pad stack"><h2>Предпочитания за бисквитки</h2>
      <p>Включени са необходимите бисквитки за вход и сесия. Темата се пази локално в браузъра.</p>
      <p>ExamForge не зарежда незадължителни бисквитки за анализ или реклама.</p>
      <Link href="/privacy">Поверителност и бисквитки</Link>
    </section>
  </>;
}
