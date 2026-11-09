import { ClipboardCheck } from 'lucide-react';

export function Brand() {
  return <span className="brand"><span className="brand-mark"><ClipboardCheck size={21} strokeWidth={2.2} /></span>ExamForge</span>;
}

export function AnswerSheet() {
  return <svg aria-hidden="true" viewBox="0 0 250 204" className="sheet" fill="none">
    <path d="M31 41h23m-12-11v23m157 109h23m-12-11v23M193 31h9m-4-4v8M49 159h9m-4-4v8" stroke="#83A8FF" strokeWidth="1.5" />
    <rect x="67" y="20" width="126" height="168" rx="12" transform="rotate(8 67 20)" fill="#3867DA" stroke="#8CABFF"/>
    <g transform="rotate(-8 116 100)">
      <rect x="66" y="26" width="124" height="153" rx="10" fill="#EAF1FF"/>
      <rect x="82" y="45" width="70" height="5" rx="2.5" fill="#204CBA"/>
      <rect x="82" y="56" width="44" height="4" rx="2" fill="#9CB5EE"/>
      {[82, 111, 140].map((y, i) => <g key={y}>
        <text x="82" y={y + 4} fill="#2F54AD" fontSize="9" fontFamily="monospace">0{i + 1}</text>
        {[111, 129, 147, 165].map((x, j) => <circle key={x} cx={x} cy={y} r="5" stroke="#688ADA" strokeWidth="1.2" fill={j === (i + 1) % 4 ? '#2455D2' : 'none'} />)}
      </g>)}
      <path d="M82 156h84" stroke="#A8BBEA"/>
    </g>
  </svg>;
}
