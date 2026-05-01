// Design-system primitives for the redesigned UI. Wraps the new token
// classes so screens don't keep restating the long Tailwind strings.

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

// ─── Card ────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Adds a subtle accent glow on the border. Use sparingly — primary CTAs. */
  glow?: 'primary' | 'pink' | 'cyan';
  /** Drops the inner padding for content that wants edge-to-edge layout. */
  flush?: boolean;
}

export function Card({ children, className, glow, flush }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border-subtle bg-bg-surface',
        flush ? '' : 'p-4',
        glow === 'primary' && 'shadow-glow border-accent-primary/40',
        glow === 'pink' && 'shadow-glow-pink border-accent-pink/40',
        glow === 'cyan' && 'shadow-glow-cyan border-accent-cyan/40',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── Pill ────────────────────────────────────────────────────────────

interface PillProps {
  children: ReactNode;
  /** Sets the background tint. */
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'primary' | 'pink' | 'cyan';
  /** Render a leading colored dot. */
  dot?: boolean;
  className?: string;
}

const PILL_TONES: Record<NonNullable<PillProps['tone']>, string> = {
  neutral: 'bg-bg-elevated text-text-secondary border-border-subtle',
  success: 'bg-success/15 text-success border-success/30',
  warn: 'bg-warn/15 text-warn border-warn/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  primary: 'bg-accent-primary/15 text-accent-primary border-accent-primary/30',
  pink: 'bg-accent-pink/15 text-accent-pink border-accent-pink/30',
  cyan: 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30',
};

const DOT_TONES: Record<NonNullable<PillProps['tone']>, string> = {
  neutral: 'bg-text-muted',
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
  primary: 'bg-accent-primary',
  pink: 'bg-accent-pink',
  cyan: 'bg-accent-cyan',
};

export function Pill({ children, tone = 'neutral', dot, className }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        PILL_TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT_TONES[tone])} />}
      {children}
    </span>
  );
}

// ─── StatusDot ───────────────────────────────────────────────────────

interface StatusDotProps {
  tone: NonNullable<PillProps['tone']>;
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ tone, pulse, className }: StatusDotProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        DOT_TONES[tone],
        pulse && 'animate-pulse',
        className,
      )}
    />
  );
}

// ─── Button ──────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-primary text-white hover:bg-accent-primary-hover shadow-glow disabled:bg-bg-elevated disabled:text-text-muted disabled:shadow-none',
  secondary:
    'bg-bg-elevated text-text-primary border border-border-strong hover:border-accent-primary disabled:opacity-50',
  ghost:
    'text-text-secondary hover:bg-bg-elevated hover:text-text-primary disabled:opacity-50',
  danger:
    'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 disabled:opacity-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2.5 text-sm font-medium',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md transition-colors duration-120 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

// ─── IconBadge ───────────────────────────────────────────────────────

interface IconBadgeProps {
  children: ReactNode;
  tone?: NonNullable<PillProps['tone']>;
  size?: 'sm' | 'md';
  className?: string;
}

const ICON_BADGE_TONES: Record<NonNullable<PillProps['tone']>, string> = {
  neutral: 'bg-bg-elevated text-text-secondary',
  success: 'bg-success/20 text-success',
  warn: 'bg-warn/20 text-warn',
  danger: 'bg-danger/20 text-danger',
  primary: 'bg-accent-primary/20 text-accent-primary',
  pink: 'bg-accent-pink/20 text-accent-pink',
  cyan: 'bg-accent-cyan/20 text-accent-cyan',
};

export function IconBadge({ children, tone = 'neutral', size = 'md', className }: IconBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md',
        size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
        ICON_BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
