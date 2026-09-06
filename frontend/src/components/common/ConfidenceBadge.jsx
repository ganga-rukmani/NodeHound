import React from 'react';
import clsx from 'clsx';

export default function ConfidenceBadge({ tier, score, className = '' }) {
  let label = tier || 'Unknown';
  let color = 'text-gray-400 bg-gray-500/10 border-gray-600/30';

  const t = (tier || '').toLowerCase();
  if (t.includes('sanctioned') || t === 'known_sanctioned') {
    label = 'Known Sanctioned';
    color = 'text-red-400 bg-red-500/20 border-red-500/40 font-bold';
  } else if (t.includes('high') || t === 'high_confidence') {
    label = 'High Confidence';
    color = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
  } else if (t.includes('medium') || t === 'medium_confidence') {
    label = 'Medium Confidence';
    color = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
  } else if (t.includes('low') || t === 'low_confidence') {
    label = 'Low Confidence';
    color = 'text-slate-400 bg-slate-500/10 border-slate-600/30';
  } else if (t === 'known') {
    label = 'Verified Entity';
    color = 'text-green-400 bg-green-500/10 border-green-500/30';
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-sans font-medium border shrink-0',
        color,
        className
      )}
    >
      <span>{label}</span>
      {score != null && (
        <span className="font-mono text-[10px] opacity-85">
          ({(score * 100).toFixed(0)}%)
        </span>
      )}
    </span>
  );
}

