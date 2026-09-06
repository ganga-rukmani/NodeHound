import React from 'react';
import { AlertTriangle, Layers, ArrowRight, ShieldAlert, Zap, Clock, Info } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import TxBadge from '../common/TxBadge';
import SeverityBadge from '../common/SeverityBadge';
import ConfidenceBadge from '../common/ConfidenceBadge';
import EmptyState from '../common/EmptyState';

export default function TypologyAnalysis() {
  const {
    traceData,
    selectAddress,
    selectTransaction,
  } = useInvestigation();

  const { detected_patterns = [], chain = 'ethereum' } = traceData || {};

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-yellow-500/20 bg-gradient-to-r from-panel to-yellow-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                Pattern Recognition
              </span>
              <span className="text-xs font-mono text-gray-400">
                Graph Typology Detector
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-100">Typology & Laundering Behavior Analysis</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              Conservative intermediary, layering, structuring, and mixing heuristics detected directly from the observed transaction graph.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-yellow-400 bg-black/40 px-3 py-2 rounded-lg border border-panel-border">
              {detected_patterns.length} Pattern Detection{detected_patterns.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ── Pattern Findings ─────────────────────────────────────────────── */}
      {detected_patterns.length === 0 ? (
        <EmptyState
          title="No Suspicious Typology Patterns Detected"
          subtitle="The investigated graph did not trigger rule-based thresholds for rapid forwarding, multi-hop layering, or intermediary structuring."
          icon={ShieldAlert}
          type="neutral"
        />
      ) : (
        <div className="space-y-4">
          {detected_patterns.map((pattern, idx) => {
            const patternTitle = (pattern.type || 'Suspicious Pattern')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (l) => l.toUpperCase());

            const evidence = pattern.evidence || {};
            const txHashes = Array.isArray(pattern.transaction_hashes)
              ? pattern.transaction_hashes
              : Array.isArray(evidence.transaction_hashes)
              ? evidence.transaction_hashes
              : [];

            return (
              <div
                key={idx}
                className="cyber-panel p-6 border-yellow-500/30 bg-black/20 space-y-4 hover:border-yellow-500/50 transition-colors"
              >
                {/* Finding Title & Badges */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-panel-border/60 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-gray-100">{patternTitle}</h3>
                        <SeverityBadge severity={pattern.severity || 'medium'} />
                        {pattern.confidence && (
                          <ConfidenceBadge tier={pattern.confidence} />
                        )}
                      </div>
                      {pattern.address && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-gray-400">Target Address:</span>
                          <AddressBadge
                            address={pattern.address}
                            chain={chain}
                            onClick={(addr) => selectAddress(addr, 'address_intelligence')}
                            showFull
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Evidence Metrics */}
                <div className="space-y-2">
                  <span className="text-[10px] uppercase text-gray-500 font-semibold block tracking-wider">
                    Observed Evidence & Metrics
                  </span>

                  {typeof evidence === 'object' && !Array.isArray(evidence) ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                      {evidence.forwarded_received_ratio != null && (
                        <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                          <span className="text-[10px] uppercase text-gray-500 font-sans block">Forward / Receive Ratio</span>
                          <span className="text-yellow-400 font-bold">
                            {(evidence.forwarded_received_ratio * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {evidence.incoming_edges != null && (
                        <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                          <span className="text-[10px] uppercase text-gray-500 font-sans block">Incoming Transfers</span>
                          <span className="text-gray-100 font-bold">{evidence.incoming_edges}</span>
                        </div>
                      )}
                      {evidence.outgoing_edges != null && (
                        <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                          <span className="text-[10px] uppercase text-gray-500 font-sans block">Outgoing Transfers</span>
                          <span className="text-gray-100 font-bold">{evidence.outgoing_edges}</span>
                        </div>
                      )}
                      {pattern.addresses && (
                        <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                          <span className="text-[10px] uppercase text-gray-500 font-sans block">Hops in Pattern</span>
                          <span className="text-cyan-400 font-bold">{pattern.addresses.length} Hops</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded bg-black/40 border border-panel-border text-xs text-gray-300">
                      {String(evidence)}
                    </div>
                  )}
                </div>

                {/* Related Transaction Sequence */}
                {txHashes.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase text-gray-500 font-semibold block tracking-wider">
                      Underlying Transactions ({txHashes.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {txHashes.slice(0, 8).map((tx, i) => (
                        <div key={i} className="flex items-center gap-1.5 p-1.5 rounded bg-black/30 border border-panel-border">
                          <span className="text-[10px] font-mono text-gray-500">TX #{i + 1}</span>
                          <TxBadge txHash={tx} chain={chain} onClick={() => selectTransaction(tx)} />
                        </div>
                      ))}
                      {txHashes.length > 8 && (
                        <span className="text-xs text-gray-500 self-center">
                          +{txHashes.length - 8} more transactions
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Disclaimer */}
                <div className="text-[11px] text-gray-400 bg-yellow-500/[0.03] p-2.5 rounded border border-yellow-500/10 italic">
                  {pattern.disclaimer || 'Observed transaction patterns are consistent with laundering typologies; they do not establish illicit intent or criminal liability.'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

