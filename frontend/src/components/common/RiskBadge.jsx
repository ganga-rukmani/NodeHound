import React from 'react';
import clsx from 'clsx';

export const getRiskTheme = (score, category) => {
  if (category) {
    const c = category.toLowerCase();
    if (c === 'critical') return { color: '#dc2626', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', label: 'Critical' };
    if (c === 'high') return { color: '#ef4444', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: 'High' };
    if (c === 'medium') return { color: '#eab308', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Medium' };
    if (c === 'low') return { color: '#22c55e', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', label: 'Low' };
  }
  if (score == null) {
    return { color: '#64748b', bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-600/30', label: 'Unscored' };
  }
  if (score >= 0.75) {
    return { color: '#ef4444', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: 'High' };
  }
  if (score >= 0.45) {
    return { color: '#eab308', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', label: 'Medium' };
  }
  if (score > 0) {
    return { color: '#22c55e', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', label: 'Low' };
  }
  return { color: '#64748b', bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-600/30', label: 'Unscored' };
};

export default function RiskBadge({ score, category, showBar = false, className = '' }) {
  const theme = getRiskTheme(score, category);

  return (
    <div className={clsx('inline-flex items-center gap-2', className)}>
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-semibold border',
          theme.bg,
          theme.text,
          theme.border
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.color }} />
        <span>{theme.label}</span>
        {score != null && (
          <span className="opacity-80">({Math.round(score * 100)}%)</span>
        )}
      </span>

      {showBar && score != null && (
        <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden shrink-0">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, Math.max(0, score * 100))}%`,
              backgroundColor: theme.color,
            }}
          />
        </div>
      )}
    </div>
  );
}

