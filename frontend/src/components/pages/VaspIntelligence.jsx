import React, { useMemo } from 'react';
import { Building2, ArrowRight, ShieldCheck, ExternalLink, CheckCircle, Database } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import EmptyState from '../common/EmptyState';
import { calculateAddressFeatures } from '../../utils/featureEngine';

export default function VaspIntelligence() {
  const {
    traceData,
    selectAddress,
    selectTransaction,
    setActiveSection,
  } = useInvestigation();

  const { nodes = [], edges = [], candidates = [], nearest_vasp, chain = 'ethereum' } = traceData || {};

  // Extract all verified VASP/exchange nodes
  const vaspNodes = useMemo(() => {
    const list = [];
    nodes.forEach((node) => {
      const source = (node.label_source || '').toLowerCase();
      const category = (node.category || '').toLowerCase();
      const sourceType = (node.source_type || '').toLowerCase();
      const isVasp =
        category === 'exchange' ||
        category === 'verified_exchange_or_entity' ||
        sourceType === 'verified_exchange' ||
        source.includes('exchange');

      if (node.is_labeled && isVasp) {
        // Find matching candidate if present for hop distance and evidence
        const cand = candidates.find((c) => c.address.toLowerCase() === node.address.toLowerCase());
        const feat = calculateAddressFeatures(node.address, nodes, edges, chain);

        list.push({
          entity_name: node.label || 'Identified VASP',
          address: node.address,
          chain: node.chain || chain,
          category: node.category || 'Exchange',
          label_source: node.label_source || 'Verified Dataset',
          label_confidence: node.label_confidence ?? 0.95,
          hop_distance: cand?.hop_distance ?? (cand?.evidence?.hop_distance ?? 1),
          total_received: cand?.total_received ?? feat?.in_volume ?? 0,
          total_sent: cand?.total_forwarded ?? feat?.out_volume ?? 0,
          transaction_count: feat?.total_transactions ?? 0,
          first_interaction: feat?.first_seen,
          last_interaction: feat?.last_seen,
          evidence_chain: cand?.evidence_chain || [],
        });
      }
    });

    // If nearest_vasp from backend exists and isn't in list, add it
    if (nearest_vasp && !list.some((v) => v.address.toLowerCase() === nearest_vasp.address.toLowerCase())) {
      list.unshift({
        entity_name: nearest_vasp.entity_name || nearest_vasp.label || 'Identified VASP',
        address: nearest_vasp.address,
        chain: nearest_vasp.chain || chain,
        category: 'Exchange',
        label_source: nearest_vasp.label_source || 'Verified Dataset',
        label_confidence: nearest_vasp.label_confidence ?? 1.0,
        hop_distance: nearest_vasp.hop_distance ?? 1,
        total_received: nearest_vasp.amount ?? 0,
        total_sent: 0,
        transaction_count: 1,
        first_interaction: nearest_vasp.timestamp,
        last_interaction: nearest_vasp.timestamp,
        evidence_chain: nearest_vasp.evidence?.evidence_chain || [],
      });
    }

    return list;
  }, [nodes, edges, candidates, nearest_vasp, chain]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-green-500/20 bg-gradient-to-r from-panel to-green-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30">
                Institutional Intel
              </span>
              <span className="text-xs font-mono text-gray-400">
                Regulated Counterparty Discovery
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-100">VASP & Exchange Intelligence</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              Identification of Virtual Asset Service Providers (VASPs), centralized exchanges, and custodial services intersected by the investigated transaction flow.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-green-400 bg-black/40 px-3 py-2 rounded-lg border border-panel-border">
              {vaspNodes.length} Verified VASP{vaspNodes.length !== 1 ? 's' : ''} Identified
            </span>
          </div>
        </div>
      </div>

      {/* ── VASP Findings List ───────────────────────────────────────────── */}
      {vaspNodes.length === 0 ? (
        <EmptyState
          title="No Verified VASP Intersections Identified"
          subtitle="The traced fund flow has not reached any verified exchange, VASP, or custodial institution in the current graph traversal window."
          icon={Building2}
          type="neutral"
        />
      ) : (
        <div className="space-y-4">
          {vaspNodes.map((vasp, idx) => (
            <div
              key={vasp.address}
              className="cyber-panel p-6 border-green-500/30 bg-black/20 space-y-4 hover:border-green-500/50 transition-colors"
            >
              {/* VASP Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-panel-border/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10 text-green-400 shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-gray-100">{vasp.entity_name}</h3>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-green-500/10 text-green-300 border border-green-500/30">
                        {vasp.category}
                      </span>
                    </div>
                    <div className="mt-1">
                      <AddressBadge address={vasp.address} chain={vasp.chain} showFull />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={() => selectAddress(vasp.address, 'transactions')}
                    className="cyber-button-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    View Related Txns
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => selectAddress(vasp.address, 'fund_flow')}
                    className="cyber-button-primary text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    View Path
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Relationship Summary Banner */}
              <div className="p-3 rounded-lg bg-green-950/20 border border-green-500/20 text-xs text-green-200">
                <strong>Flow Relationship:</strong> Investigated flow reached labelled VASP{' '}
                <span className="font-bold text-white">{vasp.entity_name}</span> after{' '}
                <span className="font-bold text-white">{vasp.hop_distance}</span> hop
                {vasp.hop_distance !== 1 ? 's' : ''} from the seed address.
              </div>

              {/* VASP Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 rounded bg-black/40 border border-panel-border">
                  <span className="text-[10px] uppercase text-gray-500 block font-sans font-semibold">Hop Distance</span>
                  <span className="text-gray-100 font-bold">{vasp.hop_distance} Hops</span>
                </div>
                <div className="p-3 rounded bg-black/40 border border-panel-border">
                  <span className="text-[10px] uppercase text-gray-500 block font-sans font-semibold">Received Volume</span>
                  <span className="text-green-400 font-bold">
                    {Number(vasp.total_received).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="p-3 rounded bg-black/40 border border-panel-border">
                  <span className="text-[10px] uppercase text-gray-500 block font-sans font-semibold">Source Dataset</span>
                  <span className="text-gray-300 truncate block">{vasp.label_source}</span>
                </div>
                <div className="p-3 rounded bg-black/40 border border-panel-border">
                  <span className="text-[10px] uppercase text-gray-500 block font-sans font-semibold">Label Confidence</span>
                  <span className="text-cyan-400 font-bold">{(vasp.label_confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

