'use client';

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { percent } from '@/lib/contracts';
import type { Overview, ScorePoint } from '@/lib/contracts';

export type ChartPoint = ScorePoint & { number: number; displayDate: string };

export function ScoreChart({ series }: { series: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series} margin={{ top: 12, right: 16, left: 0, bottom: 4 }} accessibilityLayer={false}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="number"
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          stroke="var(--line)"
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          stroke="var(--line)"
          tickLine={false}
          tickFormatter={value => value + '%'}
          width={48}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--line)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-md)',
            color: 'var(--ink)',
            fontSize: '0.88rem',
            padding: '0.65rem 0.9rem',
          }}
          itemStyle={{ color: 'var(--ink)' }}
          formatter={value => percent(Number(value))}
          labelFormatter={index => series[Number(index) - 1]?.displayDate ?? ''}
        />
        <Legend
          verticalAlign="top"
          height={36}
          formatter={label => <span style={{ color: 'var(--ink)', fontSize: '0.85rem', fontWeight: 550 }}>{label}</span>}
        />
        <Line
          type="linear"
          dataKey="percentage"
          name="Резултат"
          stroke="var(--chart)"
          strokeWidth={2.5}
          dot={{ r: 4, fill: 'var(--chart)', strokeWidth: 2, stroke: 'var(--card)' }}
          activeDot={{ r: 6, fill: 'var(--chart)', stroke: 'var(--card)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {series.length > 1 && (
          <Line
            type="linear"
            dataKey="rolling_average"
            name="Подвижна средна"
            stroke="var(--muted)"
            strokeDasharray="5 4"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AnswersChart({ stats }: { stats: Overview }) {
  const answers = [
    { name: 'Верни', count: stats.correct, fill: 'var(--success)' },
    { name: 'Грешни', count: stats.incorrect, fill: 'var(--danger)' },
    { name: 'Пропуснати', count: stats.unanswered, fill: 'var(--muted)' },
  ];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        accessibilityLayer={false}
        data={answers}
        margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
      >
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: 'var(--muted)' }}
          stroke="var(--line)"
          tickLine={false}
          interval={0}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          stroke="var(--line)"
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--line)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-md)',
            color: 'var(--ink)',
            fontSize: '0.88rem',
            padding: '0.65rem 0.9rem',
          }}
          itemStyle={{ color: 'var(--ink)' }}
        />
        <Bar dataKey="count" name="Отговори" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
          {answers.map(answer => <Cell key={answer.name} fill={answer.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
