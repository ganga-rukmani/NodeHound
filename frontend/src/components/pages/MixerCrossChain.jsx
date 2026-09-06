import React, { useMemo } from 'react';
import { ArrowRight, ShieldAlert, GitMerge, ExternalLink, AlertCircle, Database, Layers } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import TxBadge from '../common/TxBadge';
import EmptyState from '../common/EmptyState';

export default function MixerCrossChain() {
  const {
    traceData,
    selectAddress,
    selectTransaction,
  } = useInvestigation();

  const {
    nodes = [],
    edges = [],
    cross_chain_activity = [],
    detected_patterns = [],
    chain = 'ethereum',
  } = traceData || {};

  // Extract verified mixer interactions
  const mixerInteractions = useMemo(() => {
    const list = [];

    // Check detected mixer patterns
    detected_patterns
      .filter((p) => p.type === 'known_mixer_label')
      .forEach((p) => {
        list.push({
          name: p.label || 'Tornado Cash / Mixer',
          address: p.address,
          chain,
          source: p.label_source || 'Verified Mixer Dataset',
          confidence: p.confidence ?? 1.0,
          txHashes: p.transaction_hashes || [],
          evidence: p.evidence || 'Observed label from verified repository intelligence source.',
        });
      });

    // Also check nodes with category === 'mixer'
    nodes.forEach((node) => {
      if (
        (node.category || '').toLowerCase() === 'mixer' &&
        !list.some((m) => m.address.toLowerCase() === node.address.toLowerCase())
      ) {
        const relatedEdges = edges.filter(
          (e) => e.from_address.toLowerCase() === node.address.toLowerCase() || e.to_address.toLowerCase() === node.address.toLowerCase()
        );
        list.push({
          name: node.label || 'Obfuscation Mixer Service',
          address: node.address,
          chain: node.chain || chain,
          source: node.label_source || 'Verified Sanctions / Intelligence Tagpack',
          confidence: node.label_confidence ?? 0.95,
          txHashes: relatedEdges.map((e) => e.tx_hash),
          evidence: `Direct transfer interaction observed across ${relatedEdges.length} transaction(s).`,
        });
      }
    });

    return list;
  }, [detected_patterns, nodes, edges, chain]);

  // Extract cross-chain bridge edges and correlated cross-chain activity
  const bridgeEdges = useMemo(() => {
    return edges.filter(
      (e) => e.is_inferred_bridge_edge || (e.tx_hash || '').startsWith('cross_chain_')
    );
  }, [edges]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Section 1: Mixer Intelligence ────────────────────────────────── */}
      <div className="space-y-4">
        <div className="cyber-panel p-6 border-red-500/20 bg-gradient-to-r from-panel to-red-950/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30">
                  Obfuscation Detection
                </span>
                <span className="text-xs font-mono text-gray-400">
                  Privacy Protocols & Tumblers
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-100">Mixer Intelligence</h2>
              <p className="text-xs text-gray-400 mt-1 max-w-2xl">
                Identifies interactions with verified mixer protocols, coinjoin services, and privacy pool smart contracts.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono text-gray-300 bg-black/40 px-3 py-1.5 rounded border border-panel-border">
                {mixerInteractions.length} Mixer Match{mixerInteractions.length !== 1 ? 'es' : ''}
              </span>
            </div>
          </div>
        </div>

        {mixerInteractions.length === 0 ? (
          <EmptyState
            title="No Verified Mixer Interaction Identified"
            subtitle="The trace contains zero transactions directed toward or received from recognized privacy mixer addresses or OFAC-designated mixer pools."
            icon={ShieldAlert}
            type="neutral"
          />
        ) : (
          <div className="space-y-3">
            {mixerInteractions.map((item, idx) => (
              <div
                key={idx}
                className="cyber-panel p-5 border-red-500/30 bg-black/20 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-panel-border/60 pb-2.5">
                  <div>
                    <span className="text-sm font-bold text-red-300">{item.name}</span>
                    <div className="mt-1">
                      <AddressBadge address={item.address} chain={item.chain} showFull />
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-gray-500 block">Dataset Source</span>
                    <span className="text-xs font-mono text-gray-300">{item.source}</span>
                  </div>
                </div>

                <p className="text-xs text-gray-300">{item.evidence}</p>

                {item.txHashes.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] uppercase text-gray-500 font-semibold block">
                      Intersecting Transactions ({item.txHashes.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {item.txHashes.slice(0, 5).map((hash, i) => (
                        <TxBadge
                          key={i}
                          txHash={hash}
                          chain={item.chain}
                          onClick={() => selectTransaction(hash)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Cross-Chain Intelligence ──────────────────────────── */}
      <div className="space-y-4 pt-2">
        <div className="cyber-panel p-6 border-purple-500/20 bg-gradient-to-r from-panel to-purple-950/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                  Inter-Ledger Correlation
                </span>
                <span className="text-xs font-mono text-gray-400">
                  Bridge & Atomic Swaps
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-100">Cross-Chain Intelligence</h2>
              <p className="text-xs text-gray-400 mt-1 max-w-2xl">
                Exact identifier and temporal/volume matching across distinct blockchain ledgers (Ethereum, Bitcoin, TRON).
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono text-purple-300 bg-black/40 px-3 py-1.5 rounded border border-panel-border">
                {cross_chain_activity.length + bridgeEdges.length} Cross-Chain Record{cross_chain_activity.length + bridgeEdges.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {cross_chain_activity.length === 0 && bridgeEdges.length === 0 ? (
          <EmptyState
            title="No Verified Cross-Chain Relationship Identified"
            subtitle="No exact address reuse or verified bridge correlation events were observed across independent chain ledgers in this trace."
            icon={GitMerge}
            type="neutral"
          />
        ) : (
          <div className="space-y-4">
            {/* Multi-chain address collisions */}
            {cross_chain_activity.map((item, idx) => (
              <div
                key={idx}
                className="cyber-panel p-5 border-purple-500/30 bg-black/20 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-300">
                    Exact Address Identifier Observed on Multiple Chains
                  </span>
                  <div className="flex items-center gap-1.5">
                    {item.chains?.map((c) => (
                      <span
                        key={c}
                        className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                  <AddressBadge address={item.address} showFull />
                </div>
                <p className="text-xs text-gray-400">
                  Deterministic observation: The exact address key was logged across {item.chains?.join(', ')}.
                </p>
              </div>
            ))}

            {/* Inferred or direct bridge edges */}
            {bridgeEdges.map((edge, idx) => (
              <div
                key={idx}
                className="cyber-panel p-5 border-purple-500/30 bg-black/20 space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-purple-300 flex items-center gap-2">
                    <GitMerge className="w-4 h-4" />
                    Cross-Chain Bridge Transfer Event
                  </span>
                  <span className="font-mono text-gray-400">
                    {edge.timestamp ? new Date(edge.timestamp).toLocaleString() : '—'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                  <div className="p-2.5 rounded bg-black/30 border border-panel-border">
                    <span className="text-[10px] uppercase text-gray-500 block mb-1">Source Chain Origin</span>
                    <AddressBadge address={edge.from_address} chain={edge.chain || chain} />
                  </div>
                  <div className="flex flex-col items-center justify-center text-center">
                    <span className="font-mono font-bold text-gray-100 text-sm">
                      {edge.amount} {edge.asset}
                    </span>
                    <ArrowRight className="w-4 h-4 text-purple-400 my-1" />
                    <span className="text-[10px] text-purple-300 font-mono">
                      Inferred Bridge Match
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-black/30 border border-panel-border">
                    <span className="text-[10px] uppercase text-gray-500 block mb-1">Destination Target</span>
                    <AddressBadge address={edge.to_address} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

