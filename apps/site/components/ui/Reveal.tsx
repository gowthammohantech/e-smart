'use client';

import { motion } from 'motion/react';

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Position in a staggered group: each step waits another 80ms. */
  index?: number;
  as?: 'div' | 'li' | 'article';
};

/** Fades its content up 24px the first time it scrolls into view. */
export function Reveal({ children, className, index = 0, as = 'div' }: Props) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.6, ease: 'easeOut', delay: index * 0.08 }}
    >
      {children}
    </Tag>
  );
}
