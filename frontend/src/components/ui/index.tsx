import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false | Record<string, boolean>)[]) {
  return twMerge(clsx(inputs));
}

/* ---- Button ---- */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary', size = 'md', loading = false,
  icon, iconPosition = 'left', children, className, disabled, ...rest
}, ref) => {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer';

  const variants = {
    primary:   'btn-sheen bg-[var(--accent)] hover:bg-[var(--accent-bright)] text-[#05070A] shadow-sm hover:shadow-[var(--glow-accent)]',
    secondary: 'bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] text-[var(--text-1)] border border-[var(--border)] hover:border-[var(--border-strong)]',
    outline:   'bg-transparent border border-[var(--border-accent)] text-[var(--accent)] hover:bg-[var(--accent-muted)]',
    ghost:     'bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-1)]',
    danger:    'bg-[var(--threat)] hover:brightness-110 text-white',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  };

  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      )}
      {!loading && icon && iconPosition === 'left' && icon}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  );
});
Button.displayName = 'Button';

/* ---- Input ---- */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={cn(
            'w-full bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-1)] placeholder-[var(--text-3)] font-mono transition-all duration-150',
            'focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-[var(--threat)] focus:border-[var(--threat)] focus:ring-[var(--threat)]',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-[11px] text-[var(--threat)] font-mono">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

/* ---- Badge ---- */

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'safe' | 'warning' | 'threat' | 'info' | 'ai' | 'neutral' | 'accent';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', size = 'sm', dot, className }) => {
  const variants = {
    safe:    'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/25',
    warning: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/25',
    threat:  'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/25',
    info:    'bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/25',
    ai:      'bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/25',
    accent:  'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--border-accent)]',
    neutral: 'bg-[var(--surface-raised)] text-[var(--text-2)] border-[var(--border)]',
  };
  const sizes = {
    sm: 'px-2 py-0.5 text-xs font-medium',
    md: 'px-2.5 py-1 text-xs font-semibold',
  };
  const dotColors = {
    safe: 'bg-[#22C55E]', warning: 'bg-[#F59E0B]', threat: 'bg-[#EF4444]',
    info: 'bg-[#3B82F6]', ai: 'bg-[#8B5CF6]', accent: 'bg-[var(--accent)]',
    neutral: 'bg-[var(--text-3)]',
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border', variants[variant], sizes[size], className)}>
      {dot && (
        <span className="relative flex w-1.5 h-1.5">
          <span className={cn('absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping', dotColors[variant])} />
          <span className={cn('relative inline-flex w-1.5 h-1.5 rounded-full', dotColors[variant])} />
        </span>
      )}
      {children}
    </span>
  );
};

/* ---- Card ---- */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  accent?: boolean;
  as?: React.ElementType;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ children, className, interactive, accent, as: Tag = 'div', onClick, style, ...rest }) => {
  const Component = Tag as any;
  return (
    <Component
      className={cn(
        'rounded-[18px] border bg-[var(--surface)]/50 backdrop-blur-xl border-[var(--border)]',
        'transition-all duration-200 shadow-[var(--shadow-sm)]',
        interactive && 'cursor-pointer card-magnetic hover:border-[var(--accent)] hover:bg-[var(--surface)]/70',
        accent && 'border-[var(--border-accent)] hover:shadow-[var(--glow-sm)]',
        className
      )}
      style={style}
      onClick={onClick}
      {...rest}
    >
      {children}
    </Component>
  );
};

/* ---- Metric Card ---- */
interface MetricProps {
  label: string;
  value: string | number;
  description?: string;
  trend?: 'up' | 'down' | 'flat';
  status?: 'safe' | 'warning' | 'threat' | 'info';
  icon?: React.ReactNode;
  className?: string;
}

export const Metric: React.FC<MetricProps> = ({ label, value, description, trend, status, icon, className }) => {
  const statusColor = status === 'safe' ? 'var(--safe)' : status === 'warning' ? 'var(--warning)' : status === 'threat' ? 'var(--threat)' : 'var(--accent)';
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-[var(--text-2)] uppercase tracking-wider">{label}</span>
        {icon && <span className="text-[var(--text-3)]">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold text-[var(--text-1)]" style={{ color: status ? statusColor : undefined }}>
        {value}
      </div>
      {description && <div className="mt-1 text-xs text-[var(--text-2)]">{description}</div>}
      {trend && (
        <div className={cn('mt-1 text-xs font-medium flex items-center gap-1',
          trend === 'up' ? 'text-[var(--safe)]' : trend === 'down' ? 'text-[var(--threat)]' : 'text-[var(--text-3)]')}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
        </div>
      )}
    </Card>
  );
};

/* ---- Theme Switcher ---- */
interface ThemeSwitcherProps {
  theme: 'dark' | 'light';
  onToggle: () => void;
  className?: string;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ theme, onToggle, className }) => (
  <button
    onClick={onToggle}
    aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    className={cn(
      'p-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-raised)]',
      'transition-colors duration-200',
      className
    )}
  >
    {theme === 'dark' ? (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    ) : (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    )}
  </button>
);

/* ---- Divider ---- */
export const Divider: React.FC<{ className?: string }> = ({ className }) => (
  <hr className={cn('border-[var(--border)]', className)} />
);

/* ---- Section Header ---- */
interface SectionHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ eyebrow, title, description, className }) => (
  <div className={cn('mb-8', className)}>
    {eyebrow && (
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)] mb-2 font-mono">{eyebrow}</p>
    )}
    <h2 className="text-2xl sm:text-3xl font-semibold text-[var(--text-1)] tracking-tight">{title}</h2>
    {description && (
      <p className="mt-2 text-sm text-[var(--text-2)] max-w-xl leading-relaxed">{description}</p>
    )}
  </div>
);

export {
  CountUp,
  MagneticButton,
  GlowTag,
  AnimatedCard,
  Reveal,
  RevealTilt,
  PageHeader,
  CheckDraw,
} from './animated';
