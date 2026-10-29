type Props = React.HTMLAttributes<HTMLDivElement> & { as?: 'div' | 'article' };

/** The bordered surface every card sits on; the border brightens on hover. */
export function Card({ as: Tag = 'div', className = '', ...rest }: Props) {
  return (
    <Tag
      className={`rounded-card border border-line bg-surface p-6 transition-colors duration-300 hover:border-line-strong lg:p-7 ${className}`}
      {...rest}
    />
  );
}
