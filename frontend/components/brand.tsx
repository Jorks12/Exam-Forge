import { ClipboardCheck } from 'lucide-react';

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <span className="brand">
      <span className="brand-mark">
        <ClipboardCheck size={20} strokeWidth={2.4} />
      </span>
      <span className="brand-text">
        ExamForge
        {subtitle && <span className="brand-badge">{subtitle}</span>}
      </span>
    </span>
  );
}

export function AnswerSheet() {
  return (
    <svg aria-hidden="true" viewBox="0 0 250 204" className="sheet" fill="none">
      <defs>
        <filter id="sheet-shadow" x="-8%" y="-8%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#09142b" floodOpacity="0.45" />
        </filter>
        <linearGradient id="sheet-grad-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path d="M31 41h23m-12-11v23m157 109h23m-12-11v23M193 31h9m-4-4v8M49 159h9m-4-4v8" stroke="#83A8FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      <rect x="67" y="20" width="126" height="168" rx="14" transform="rotate(8 67 20)" fill="url(#sheet-grad-back)" stroke="#8CABFF" strokeWidth="1.2" filter="url(#sheet-shadow)" />
      <g transform="rotate(-8 116 100)">
        <rect x="66" y="26" width="124" height="153" rx="12" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1" />
        <rect x="82" y="44" width="72" height="6" rx="3" fill="#2563EB" />
        <rect x="82" y="55" width="46" height="4" rx="2" fill="#93C5FD" />
        {[82, 111, 140].map((y, i) => (
          <g key={y}>
            <text x="82" y={y + 4} fill="#1E40AF" fontSize="9" fontWeight="bold" fontFamily="monospace">0{i + 1}</text>
            {[111, 129, 147, 165].map((x, j) => (
              <circle
                key={x}
                cx={x}
                cy={y}
                r="5.5"
                stroke={j === (i + 1) % 4 ? '#2563EB' : '#94A3B8'}
                strokeWidth={j === (i + 1) % 4 ? '1.8' : '1.2'}
                fill={j === (i + 1) % 4 ? '#2563EB' : 'none'}
              />
            ))}
          </g>
        ))}
        <path d="M82 156h84" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="3 3" />
      </g>
    </svg>
  );
}
