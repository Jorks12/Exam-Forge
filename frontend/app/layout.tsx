import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeSync } from '@/components/theme';
import { initialThemeScript } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = { title: 'ExamForge', description: 'Банка с въпроси, пробни изпити и анализ на резултатите.' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="bg" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: initialThemeScript }} /></head>
    <body><ThemeSync />{children}</body>
  </html>;
}
