import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import TxBadge from '../common/TxBadge';
import EmptyState from '../common/EmptyState';

export default function EvidenceExplorer() {
  const {
    traceData,
    selectAddress,
    selectTransaction,
  } = useInvestigation();

  const {
    edges = [],
    nodes = [],
    candidates = [],
    chain = 'ethereum',
  } = traceData || {};

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Build unified evidentiary records
  const evidenceRecords = useMemo(() => {
    const list = [];
    let counter = 1;

    // 1. Labelled Nodes Provenance
    nodes.filter((n) => n.is_labeled).forEach((n) => {
      list.push({
        id: `EVD-LBL-${counter.toString().padStart(4, '0')}`,
        type: 'Verified Label Provenance',
        address: n.address,
        tx_hash: null,
        timestamp: n.label_timestamp || null,
        source: n.label_source || 'Verified Label Dataset',
        source_type: n.source_type || 'verified_exchange',
        confidence: n.label_confidence ?? 0.95,
        finding: `Entity identification: ${n.label} (${n.category || 'VASP'})`,
        provenance: `Integrated dataset: ${n.label_source || 'verified_exchange'}. Retrieved from intelligence package.`,
      });
      counter++;
    });

    // 2. Candidate Chain Events
    candidates.forEach((cand, cIdx) => {
      const chainEvents = cand.evidence_chain || [];
      chainEvents.forEach((ev, evIdx) => {
        list.push({
          id: `EVD-PTH-${counter.toString().padStart(4, '0')}`,
          type: 'Candidate Flow Evidence',
          address: ev.to_address,
          tx_hash: ev.tx_hash,
          timestamp: ev.timestamp,
          source: `${(ev.chain || chain).toUpperCase()} Blockchain Ledger`,
          source_type: ev.is_inferred_bridge_edge ? 'inferred_bridge' : 'onchain_transfer',
          confidence: ev.is_inferred_bridge_edge ? 0.75 : 1.0,
          finding: `Hop ${evIdx + 1} toward candidate #${cIdx + 1} (${cand.label || cand.address.slice(0, 8)})`,
          provenance: `Directly ingested block transaction. Block ${ev.block_number ?? 'Confirmed'}.`,
        });
        counter++;
      });
    });

    // 3. Observed Direct Transfers
    edges.slice(0, 100).forEach((edge) => {
      if (!list.some((r) => r.tx_hash === edge.tx_hash)) {
        list.push({
          id: `EVD-TX-${counter.toString().padStart(4, '0')}`,
          type: edge.is_inferred_bridge_edge ? 'Inferred Bridge' : 'Direct Observed Transfer',
          address: edge.to_address,
          tx_hash: edge.tx_hash,
          timestamp: edge.timestamp,
          source: `${(edge.chain || chain).toUpperCase()} Blockchain`,
          source_type: edge.is_inferred_bridge_edge ? 'cross_chain_correlation' : 'ledger_event',
          confidence: edge.edge_confidence ?? 1.0,
          finding: `Transfer of ${edge.amount} ${edge.asset} from ${edge.from_address.slice(0, 8)}... to ${edge.to_address.slice(0, 8)}...`,
          provenance: `On-chain transfer event recorded on block ${edge.block_number ?? 'N/A'}.`,
        });
        counter++;
      }
    });

    return list;
  }, [nodes, candidates, edges, chain]);

  const filteredRecords = useMemo(() => {
    return evidenceRecords.filter((rec) => {
      if (typeFilter !== 'all' && rec.type !== typeFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const idMatch = rec.id.toLowerCase().includes(q);
        const addrMatch = (rec.address || '').toLowerCase().includes(q);
        const txMatch = (rec.tx_hash || '').toLowerCase().includes(q);
        const findMatch = rec.finding.toLowerCase().includes(q);
        if (!idMatch && !addrMatch && !txMatch && !findMatch) return false;
      }
      return true;
    });
  }, [evidenceRecords, typeFilter, searchTerm]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/20 bg-gradient-to-r from-panel to-cyan-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Auditable Chain of Custody
              </span>
              <span className="text-xs font-mono text-gray-400">
                Forensic Provenance
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-100">Evidence Explorer</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              Complete catalog of underlying on-chain transfer events, intelligence source matches, and provenance metadata supporting investigation findings.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-cyan-400 bg-black/40 px-3 py-1.5 rounded-lg border border-panel-border">
              {evidenceRecords.length} Auditable Item{evidenceRecords.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ── Filters Bar ──────────────────────────────────────────────────── */}
      <div className="cyber-panel p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search Evidence ID, address, tx hash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="cyber-input w-full pl-9 text-xs font-mono"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <label className="text-gray-400 shrink-0">Evidence Type:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="cyber-input text-xs bg-background"
          >
            <option value="all">All Evidence Types</option>
            <option value="Verified Label Provenance">Verified Labels</option>
            <option value="Candidate Flow Evidence">Candidate Path Flow</option>
            <option value="Direct Observed Transfer">Direct Transfers</option>
          </select>
        </div>
      </div>

      {/* ── Evidence Table ───────────────────────────────────────────────── */}
      <div className="cyber-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-panel-border bg-black/40 text-[10px] text-gray-400 uppercase font-sans tracking-wider select-none">
                <th className="p-3">Evidence ID</th>
                <th className="p-3">Type</th>
                <th className="p-3">Related Finding</th>
                <th className="p-3">Address / Entity</th>
                <th className="p-3">Transaction</th>
                <th className="p-3">Source & Provenance</th>
                <th className="p-3 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border/40">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <EmptyState
                      title="No Evidence Records Found"
                      subtitle="No evidence items match the current search or type filter."
                      type="neutral"
                    />
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="p-3 text-cyan-400 font-bold whitespace-nowrap">
                      {rec.id}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 border border-panel-border text-gray-300 font-sans">
                        {rec.type}
                      </span>
                    </td>
                    <td className="p-3 font-sans text-gray-200 max-w-xs truncate">
                      {rec.finding}
                    </td>
                    <td className="p-3">
                      <AddressBadge
                        address={rec.address}
                        chain={chain}
                        onClick={(addr) => selectAddress(addr, 'address_intelligence')}
                      />
                    </td>
                    <td className="p-3">
                      {rec.tx_hash ? (
                        <TxBadge
                          txHash={rec.tx_hash}
                          chain={chain}
                          onClick={() => selectTransaction(rec.tx_hash)}
                        />
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="p-3 font-sans text-gray-400 text-[11px] max-w-xs truncate">
                      {rec.provenance}
                    </td>
                    <td className="p-3 text-right font-bold text-gray-100">
                      {(rec.confidence * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
