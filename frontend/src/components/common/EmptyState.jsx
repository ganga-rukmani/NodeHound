import React from 'react';
import { ShieldAlert, Info, Database } from 'lucide-react';
import clsx from 'clsx';

export default function EmptyState({
  title,
  subtitle,
  badge,
  icon: Icon = Info,
  type = 'info', // 'info' | 'warning' | 'unavailable' | 'neutral'
  action,
  className = '',
}) {
  const getTheme = () => {
    switch (type) {
      case 'warning':
        return {
          border: 'border-yellow-500/20 bg-yellow-500/[0.03]',
          iconColor: 'text-yellow-400',
          badgeClass: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
        };
      case 'unavailable':
        return {
          border: 'border-cyan-500/20 bg-cyan-950/[0.08]',
          iconColor: 'text-cyan-400',
          badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
        };
      case 'neutral':
      default:
        return {
          border: 'border-panel-border bg-black/20',
          iconColor: 'text-gray-500',
          badgeClass: 'bg-gray-800 text-gray-400 border-gray-700',
        };
    }
  };

  const theme = getTheme();

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center p-8 text-center rounded-xl border',
        theme.border,
        className
      )}
    >
      <div className={clsx('p-3 rounded-full bg-white/[0.03] mb-4', theme.iconColor)}>
        <Icon className="w-8 h-8" />
      </div>

      {badge && (
        <span
          className={clsx(
            'text-[10px] font-mono uppercase font-bold tracking-wider px-2.5 py-1 rounded border mb-3',
            theme.badgeClass
          )}
        >
          {badge}
        </span>
      )}

      <h3 className="text-base font-semibold text-gray-200 mb-1.5">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 max-w-md mb-4">{subtitle}</p>}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

