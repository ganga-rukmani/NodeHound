import React from 'react';
import { ShieldAlert, AlertTriangle, Info } from 'lucide-react';
import clsx from 'clsx';

// ── Alert tier logic ─────────────────────────────────────────────────────────
// Mirrors the same confidence thresholds used elsewhere in Results.jsx
// (riskColor/riskLabel: >0.7 high, >0.4 medium, else low) so the banner's
// urgency language always agrees with the graph's own color coding.
function getAlertTier(confidence) {
  if (confidence == null) return null;
  if (confidence > 0.7) return 'high';
  if (confidence > 0.4) return 'medium';
  return 'low';
}

const TIER_CONFIG = {
  high: {
    icon: ShieldAlert,
    border: 'border-red-500/40',
    bg: 'bg-red-500/10',
    text: 'text-red-300',
    iconColor: 'text-red-400',
    label: 'High-Confidence Match',
  },
  medium: {
    icon: AlertTriangle,
    border: 'border-yellow-500/40',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-300',
    iconColor: 'text-yellow-400',
    label: 'Moderate-Confidence Match',
  },
  low: {
    icon: Info,
    border: 'border-gray-600/40',
    bg: 'bg-white/[0.03]',
    text: 'text-gray-400',
    iconColor: 'text-gray-500',
    label: 'Low-Confidence Match',
  },
};

function buildRecommendation(summary) {
  const dest = summary?.top_destination;
  if (!dest) {
    return {
      tier: 'low',
      message:
        'No confident VASP destination identified in this trace. Recommend expanding hop depth or widening the time window before escalating.',
    };
  }

  const pct = Math.round(dest.confidence * 100);
  const tier = getAlertTier(dest.confidence);
  const matches = summary?.known_vasp_matches ?? 0;

  if (tier === 'high') {
    return {
      tier,
      message: `Funds traced to ${dest.label} with ${pct}% confidence. Recommend an immediate preservation/freeze request to ${dest.label} and evidence export for case filing.`,
    };
  }
  if (tier === 'medium') {
    return {
      tier,
      message: `Funds likely routed toward ${dest.label} (${pct}% confidence, ${matches} known VASP${matches === 1 ? '' : 's'} matched in this trace). Recommend manual verification of the traced path before initiating a formal request.`,
    };
  }
  return {
    tier,
    message: `Weak signal toward ${dest.label} (${pct}% confidence). Treat as a lead only — recommend further tracing before any investigative action.`,
  };
}

export default function AlertBanner({ summary }) {
  const { tier, message } = buildRecommendation(summary);
  const cfg = TIER_CONFIG[tier];
  const Icon = cfg.icon;

  return (
    <div
      className={clsx(
        'flex items-start gap-3 px-4 py-2.5 border-b',
        cfg.border,
        cfg.bg
      )}
    >
      <Icon className={clsx('w-4 h-4 mt-0.5 shrink-0', cfg.iconColor)} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={clsx('text-[10px] font-semibold uppercase tracking-wide', cfg.text)}>
          {cfg.label}
        </span>
        <span className="text-xs text-gray-300 leading-snug">{message}</span>
      </div>
    </div>
  );
}