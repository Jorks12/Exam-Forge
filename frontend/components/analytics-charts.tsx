'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { percent } from '@/lib/contracts';
import type { Overview, ScorePoint } from '@/lib/contracts';

export type ChartPoint = ScorePoint & { number: number; displayDate: string };

export function ScoreChart({ series }: { series: ChartPoint[] }) {
  return <ResponsiveContainer>
    <LineChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} accessibilityLayer={false}>
      <CartesianGrid stroke="var(--line)" vertical={false} />
      <XAxis dataKey="number" tick={{ fill: 'var(--muted)' }} />
      <YAxis domain={[0, 100]} tick={{ fill: 'var(--muted)' }} tickFormatter={value => value + '%'} width={52} />
      <Tooltip itemStyle={{ color: 'var(--ink)' }} formatter={value => [percent(Number(value)), 'Резултат']}
        labelFormatter={index => series[Number(index) - 1]?.displayDate ?? ''} />
      <Line type="linear" dataKey="percentage" stroke="var(--chart)" strokeWidth={3} dot isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer>;
}

export function AnswersChart({ stats }: { stats: Overview }) {
  return <ResponsiveContainer>
    <BarChart accessibilityLayer={false} data={[
      { name: 'Верни', count: stats.correct }, { name: 'Грешни', count: stats.incorrect },
      { name: 'Пропуснати', count: stats.unanswered },
    ]} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval={0} />
      <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)' }} />
      <Bar dataKey="count" fill="var(--chart)" radius={[5, 5, 0, 0]} isAnimationActive={false} />
    </BarChart>
  </ResponsiveContainer>;
}
