import React from 'react';
import clsx from 'clsx';

export default function SeverityBadge({ severity, className = '' }) {
  const s = (severity || 'medium').toLowerCase();
  let color = 'text-gray-400 bg-gray-500/10 border-gray-600/30';
  let label = 'Low';

  if (s === 'critical') {
    color = 'text-red-300 bg-red-950/40 border-red-500/50';
    label = 'CRITICAL';
  } else if (s === 'high') {
    color = 'text-red-400 bg-red-500/10 border-red-500/30';
    label = 'HIGH';
  } else if (s === 'medium') {
    color = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    label = 'MEDIUM';
  } else if (s === 'informational' || s === 'info') {
    color = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    label = 'INFO';
  } else {
    color = 'text-green-400 bg-green-500/10 border-green-500/30';
    label = 'LOW';
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wide border shrink-0',
        color,
        className
      )}
    >
      {label}
    </span>
  );
}

