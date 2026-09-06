import React, { useMemo } from 'react';
import { ArrowRight, ArrowDown, ShieldAlert, CheckCircle, Clock, Database, Layers, ExternalLink } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import TxBadge from '../common/TxBadge';
import ConfidenceBadge from '../common/ConfidenceBadge';
import RiskBadge from '../common/RiskBadge';
import EmptyState from '../common/EmptyState';

export default function FundFlowAnalysis() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
    selectedCandidate,
    selectCandidate,
    selectTransaction,
  } = useInvestigation();

  const { candidates = [], nodes = [], edges = [], chain = 'ethereum', seed_address } = traceData || {};

  // Select target candidate (or first candidate, or seed)
  const candidate = useMemo(() => {
    if (selectedCandidate) return selectedCandidate;
    if (candidates.length > 0) return candidates[0];
    return null;
  }, [selectedCandidate, candidates]);

  const evidenceChain = candidate?.evidence_chain || [];
  const continuity = candidate?.evidence?.fund_continuity ?? 0.85;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Flow Candidate Selector & Summary ────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-gradient-to-r from-panel to-cyan-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Fund Movement Tracer
              </span>
              {candidate && (
                <ConfidenceBadge tier={candidate.tier} score={candidate.evidence?.evidence_score} />
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-100">Downstream Fund Flow & Hop Reconstruction</h2>
            {candidate && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-gray-400">Target Candidate:</span>
                <AddressBadge
                  address={candidate.address}
                  chain={chain}
                  label={candidate.label}
                  category={candidate.category}
                  showFull
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 shrink-0">Select Flow Destination:</label>
            <select
              value={candidate?.address || ''}
              onChange={(e) => {
                const found = candidates.find((c) => c.address === e.target.value);
                if (found) selectCandidate(found, 'fund_flow');
              }}
              className="cyber-input text-xs font-mono max-w-xs bg-background"
            >
              {candidates.map((c, i) => (
                <option key={c.address} value={c.address}>
                  #{i + 1} {c.label ? `${c.label} (${c.address.slice(0, 8)}...)` : c.address}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Candidate Flow Metrics */}
        {candidate && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-panel-border/60 text-xs">
            <div>
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">Total Received</span>
              <span className="text-base font-mono font-bold text-green-400">
                {candidate.total_received != null ? Number(candidate.total_received).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'} {candidate.assets?.[0] || ''}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">Total Forwarded</span>
              <span className="text-base font-mono font-bold text-red-400">
                {candidate.total_forwarded != null ? Number(candidate.total_forwarded).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'} {candidate.assets?.[0] || ''}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">Fund Continuity</span>
              <span className="text-base font-mono font-bold text-yellow-400">
                {(continuity * 100).toFixed(1)}% (
                {continuity >= 0.7 ? 'High' : continuity >= 0.4 ? 'Medium' : 'Low'})
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">Traversal Distance</span>
              <span className="text-base font-mono font-bold text-cyan-400">
                {candidate.hop_distance ?? evidenceChain.length} Hops
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Step-by-Step Flow Path ───────────────────────────────────────── */}
      <div className="cyber-panel p-6 space-y-4">
        <div className="border-b border-panel-border pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              Observed Chronological Transfer Sequence
            </h3>
            <span className="text-[11px] text-gray-400">
              Direct transfer chain from the seed wallet to this destination
            </span>
          </div>
          <span className="text-xs font-mono text-cyan-400">
            {evidenceChain.length} Step{evidenceChain.length !== 1 ? 's' : ''}
          </span>
        </div>

        {evidenceChain.length === 0 ? (
          <EmptyState
            title="No Direct Path Chain Available"
            subtitle="This candidate has graph reachability through multi-hop connectivity, but no linear single-path chain is recorded in the trace evidence."
            type="neutral"
          />
        ) : (
          <div className="space-y-4 relative before:absolute before:left-5 before:top-3 before:bottom-3 before:w-0.5 before:bg-cyan-500/30">
            {evidenceChain.map((step, idx) => {
              const fromNode = nodes.find((n) => n.address.toLowerCase() === (step.from_address || '').toLowerCase());
              const toNode = nodes.find((n) => n.address.toLowerCase() === (step.to_address || '').toLowerCase());

              return (
                <div
                  key={idx}
                  className="relative pl-12 flex flex-col space-y-2 group"
                >
                  {/* Step Dot */}
                  <div className="absolute left-3.5 top-2 w-3.5 h-3.5 rounded-full bg-panel border-2 border-cyan-400 group-hover:bg-cyan-400 transition-colors shrink-0" />

                  {/* Step Card */}
                  <div className="cyber-panel p-4 bg-black/30 border border-panel-border hover:border-cyan-500/40 transition-colors text-xs space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-panel-border/50 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                          Hop {idx + 1}
                        </span>
                        <TxBadge txHash={step.tx_hash} chain={chain} onClick={() => selectTransaction(step)} />
                      </div>
                      <span className="text-[11px] font-mono text-gray-400">
                        {step.timestamp ? new Date(step.timestamp).toLocaleString() : '—'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                      {/* From */}
                      <div>
                        <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">Origin</span>
                        <AddressBadge
                          address={step.from_address}
                          chain={chain}
                          label={fromNode?.label}
                          category={fromNode?.category}
                          isSeed={(step.from_address || '').toLowerCase() === (seed_address || '').toLowerCase()}
                          onClick={(addr) => selectAddress(addr, 'address_intelligence')}
                        />
                      </div>

                      {/* Transfer Arrow & Amount */}
                      <div className="flex flex-col items-center justify-center p-2 rounded bg-black/40 border border-panel-border/50 text-center">
                        <span className="font-mono font-bold text-gray-100 text-sm">
                          {step.amount != null ? Number(step.amount).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}{' '}
                          <span className="text-xs text-cyan-400">{step.asset || 'NATIVE'}</span>
                        </span>
                        {step.amount_usd != null && (
                          <span className="text-[10px] text-gray-400 font-mono">
                            ${Number(step.amount_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        )}
                        <ArrowRight className="w-3.5 h-3.5 text-cyan-400 mt-0.5" />
                      </div>

                      {/* To */}
                      <div>
                        <span className="text-[10px] uppercase text-gray-500 font-semibold block mb-0.5">Destination</span>
                        <AddressBadge
                          address={step.to_address}
                          chain={chain}
                          label={toNode?.label}
                          category={toNode?.category}
                          onClick={(addr) => selectAddress(addr, 'address_intelligence')}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Fund Continuity Card ─────────────────────────────────────────── */}
      <div className="cyber-panel p-5 border-yellow-500/30 bg-yellow-500/[0.02] flex items-start gap-4">
        <div className="p-2.5 rounded-lg bg-yellow-500/10 text-yellow-400 shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="space-y-1 text-xs">
          <h4 className="font-bold text-gray-200">Forensic Fund Continuity Assessment</h4>
          <p className="text-gray-400 leading-relaxed">
            Fund continuity measures the ratio of transferred volume conserved across intermediate hops. A high continuity ratio ({'>'} 70%) along with tight temporal intervals indicates structured pass-through or layering activity rather than organic commercial dispersion.
          </p>
        </div>
      </div>
    </div>
  );
}

