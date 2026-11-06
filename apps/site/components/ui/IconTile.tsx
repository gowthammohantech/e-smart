import { Icon, type IconName } from './Icon';

export function IconTile({ name, tone = 'deep' }: { name: IconName; tone?: 'deep' | 'primary' }) {
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-btn text-white ${tone === 'deep' ? 'bg-deep-2' : 'bg-primary'}`}
    >
      <Icon name={name} />
    </span>
  );
}
