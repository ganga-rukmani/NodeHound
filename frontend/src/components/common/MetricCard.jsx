import React from 'react';
import clsx from 'clsx';

export default function MetricCard({
  label,
  value,
  subvalue,
  icon: Icon,
  accent = 'cyan',
  className = '',
}) {
  const accentClasses = {
    cyan: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/[0.04]',
    purple: 'text-purple-400 border-purple-500/20 bg-purple-500/[0.04]',
    red: 'text-red-400 border-red-500/20 bg-red-500/[0.04]',
    yellow: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/[0.04]',
    green: 'text-green-400 border-green-500/20 bg-green-500/[0.04]',
    gray: 'text-gray-400 border-panel-border bg-black/20',
  }[accent] || 'text-cyan-400 border-cyan-500/20 bg-cyan-500/[0.04]';

  return (
    <div className={clsx('cyber-panel p-4 flex flex-col justify-between border', accentClasses, className)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase font-semibold tracking-wider text-gray-400">
          {label}
        </span>
        {Icon && <Icon className="w-4 h-4 opacity-70" />}
      </div>
      <div>
        <div className="text-2xl font-mono font-bold text-gray-100 tracking-tight">
          {value != null ? value : '—'}
        </div>
        {subvalue && (
          <div className="text-[11px] text-gray-400 mt-0.5 truncate">{subvalue}</div>
        )}
      </div>
    </div>
  );
}

