const TONES = {
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  primary: 'bg-primary/15 text-primary',
};

export type Tone = keyof typeof TONES;

export function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${TONES[tone]}`}>{children}</span>;
}
