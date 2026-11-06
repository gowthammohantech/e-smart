import { Eyebrow } from './Eyebrow';
import { Reveal } from './Reveal';

type Props = {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  align?: 'center' | 'left';
};

export function SectionHeading({ eyebrow, title, sub, align = 'center' }: Props) {
  const centered = align === 'center';
  return (
    <Reveal className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-xl text-center lg:text-left'}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="h-section mt-5 text-fg">{title}</h2>
      {sub ? <p className="mt-4 text-muted">{sub}</p> : null}
    </Reveal>
  );
}
