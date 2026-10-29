type Props = React.HTMLAttributes<HTMLDivElement> & { as?: 'div' | 'article' };

/** The glass surface every card sits on (see the card-glass utility). */
export function Card({ as: Tag = 'div', className = '', ...rest }: Props) {
  return (
    <Tag
      className={`card-glass relative rounded-card p-6 lg:p-7 ${className}`}
      {...rest}
    />
  );
}
