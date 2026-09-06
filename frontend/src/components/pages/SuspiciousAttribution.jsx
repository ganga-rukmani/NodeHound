import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import ConfidenceBadge from '../common/ConfidenceBadge';
import EmptyState from '../common/EmptyState';

export default function SuspiciousAttribution() {
  const {
    traceData,
    selectAddress,
    selectCandidate,
    selectedCandidate,
  } = useInvestigation();

  const { candidates = [], chain = 'ethereum' } = traceData || {};

  const currentCandidate = selectedCandidate || candidates[0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header & Attribution Disclaimer ──────────────────────────── */}
      <div className="cyber-panel p-6 border-red-500/20 bg-gradient-to-r from-panel to-red-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">
                Attribution Engine
              </span>
              <span className="text-xs font-mono text-gray-400">
                Deterministic Multi-Signal Ranking
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-100">Suspicious Candidate Attribution</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              Candidates are evaluated and ranked based on observed fund continuity, timing closeness, repeated path counts, counterparty concentration, and verified dataset intelligence.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-cyan-400 bg-black/40 px-3 py-2 rounded-lg border border-panel-border">
              {candidates.length} Ranked Candidate{candidates.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-panel-border/50 text-[11px] text-gray-400 italic">
          Defensible attribution standard: NodeHound ranks suspicious destinations by mathematical and topological evidence; findings do not constitute legal proof of malicious ownership.
        </div>
      </div>

      {/* ── Evidence Breakdown for Selected Candidate ────────────────────── */}
      {currentCandidate && (
        <div className="cyber-panel p-6 border-cyan-500/30 bg-cyan-950/[0.04] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-panel-border pb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-bold text-cyan-400">
                  Detailed Evidence Breakdown
                </span>
                <ConfidenceBadge
                  tier={currentCandidate.tier}
                  score={currentCandidate.evidence?.evidence_score}
                />
              </div>
              <div className="flex items-center gap-2">
                <AddressBadge
                  address={currentCandidate.address}
                  chain={chain}
                  label={currentCandidate.label}
                  category={currentCandidate.category}
                  showFull
                  className="text-base font-bold text-gray-100"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => selectAddress(currentCandidate.address, 'fund_flow')}
                className="cyber-button-primary text-xs py-2 px-3 flex items-center gap-1.5"
              >
                Inspect Flow Path
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Individual Evidence Components */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-black/40 border border-panel-border space-y-1">
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">
                Fund Continuity
              </span>
              <span className="text-lg font-mono font-bold text-green-400">
                {currentCandidate.evidence?.fund_continuity != null
                  ? `${(currentCandidate.evidence.fund_continuity * 100).toFixed(1)}%`
                  : '—'}
              </span>
              <p className="text-[11px] text-gray-400">
                Ratio of received volume forwarded downstream through the investigated flow.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-black/40 border border-panel-border space-y-1">
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">
                Repeated Path Count
              </span>
              <span className="text-lg font-mono font-bold text-cyan-400">
                {currentCandidate.evidence?.repeated_path_count ?? 1} Path(s)
              </span>
              <p className="text-[11px] text-gray-400">
                Observed distinct transaction routes connecting the seed to this address.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-black/40 border border-panel-border space-y-1">
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">
                Counterparty Concentration
              </span>
              <span className="text-lg font-mono font-bold text-yellow-400">
                {currentCandidate.evidence?.counterparty_concentration != null
                  ? currentCandidate.evidence.counterparty_concentration.toFixed(2)
                  : '—'}
              </span>
              <p className="text-[11px] text-gray-400">
                Degree of counterparty clustering around intermediate transfer nodes.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-black/40 border border-panel-border space-y-1">
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">
                Proximity to Flagged Addrs
              </span>
              <span className="text-lg font-mono font-bold text-purple-400">
                {currentCandidate.evidence?.proximity_to_flagged != null
                  ? currentCandidate.evidence.proximity_to_flagged.toFixed(2)
                  : '0.00'}
              </span>
              <p className="text-[11px] text-gray-400">
                Proximity weighting derived from graph reachability to known illicit tags.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Candidates Table ─────────────────────────────────────────────── */}
      <div className="cyber-panel overflow-hidden">
        <div className="p-4 border-b border-panel-border bg-black/20 flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            Ranked Suspicious Candidates Registry
          </h3>
          <span className="text-[11px] text-gray-500 font-mono">
            Click any row to view individual evidence breakdown
          </span>
        </div>

        {candidates.length === 0 ? (
          <div className="p-8 text-center">
            <EmptyState
              title="No Suspicious Candidates Identified"
              subtitle="The traced graph did not yield candidate destinations matching minimum attribution thresholds."
              type="neutral"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-panel-border bg-black/40 text-[10px] text-gray-400 uppercase font-sans tracking-wider select-none">
                  <th className="p-3 w-12 text-center">Rank</th>
                  <th className="p-3">Candidate Address</th>
                  <th className="p-3">Attribution Tier</th>
                  <th className="p-3 text-right">Evidence Score</th>
                  <th className="p-3 text-center">Hop Distance</th>
                  <th className="p-3 text-right">Received</th>
                  <th className="p-3 text-right">Forwarded</th>
                  <th className="p-3 text-right">Continuity</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-panel-border/40">
                {candidates.map((cand, idx) => {
                  const isSelected = (currentCandidate?.address || '').toLowerCase() === cand.address.toLowerCase();

                  return (
                    <tr
                      key={cand.address}
                      onClick={() => selectCandidate(cand)}
                      className={
                        isSelected
                          ? 'bg-cyan-500/[0.08] cursor-pointer'
                          : 'hover:bg-white/[0.03] transition-colors cursor-pointer'
                      }
                    >
                      <td className="p-3 text-center font-bold text-cyan-400">
                        #{idx + 1}
                      </td>
                      <td className="p-3">
                        <AddressBadge
                          address={cand.address}
                          chain={chain}
                          label={cand.label}
                          category={cand.category}
                        />
                      </td>
                      <td className="p-3">
                        <ConfidenceBadge tier={cand.tier} />
                      </td>
                      <td className="p-3 text-right font-bold text-gray-100">
                        {cand.evidence?.evidence_score != null ? cand.evidence.evidence_score.toFixed(3) : '—'}
                      </td>
                      <td className="p-3 text-center text-gray-300">
                        {cand.hop_distance ?? '—'}
                      </td>
                      <td className="p-3 text-right text-green-400">
                        {cand.total_received != null ? Number(cand.total_received).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—'}
                      </td>
                      <td className="p-3 text-right text-red-400">
                        {cand.total_forwarded != null ? Number(cand.total_forwarded).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—'}
                      </td>
                      <td className="p-3 text-right text-yellow-400 font-bold">
                        {cand.evidence?.fund_continuity != null ? `${(cand.evidence.fund_continuity * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            selectCandidate(cand, 'attribution');
                          }}
                          className="text-[11px] text-cyan-400 hover:underline font-sans"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
