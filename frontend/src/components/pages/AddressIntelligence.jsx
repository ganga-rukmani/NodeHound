import React, { useMemo } from 'react';
import { Activity, ArrowRight, ArrowUpRight, HelpCircle, ExternalLink, Network, Database } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge, { getExplorerUrl } from '../common/AddressBadge';
import RiskBadge from '../common/RiskBadge';
import ConfidenceBadge from '../common/ConfidenceBadge';
import { calculateAddressFeatures } from '../../utils/featureEngine';

export default function AddressIntelligence() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
    setActiveSection,
  } = useInvestigation();

  const { nodes = [], edges = [], chain = 'ethereum', seed_address } = traceData || {};

  const currentAddress = selectedAddress || seed_address || (nodes[0]?.address ?? '');

  // Find node details and compute behavioral features
  const node = useMemo(() => {
    return (
      nodes.find((n) => n.address.toLowerCase() === currentAddress.toLowerCase()) || {
        address: currentAddress,
        chain,
        is_labeled: false,
      }
    );
  }, [nodes, currentAddress, chain]);

  const features = useMemo(() => {
    return calculateAddressFeatures(currentAddress, nodes, edges, chain);
  }, [currentAddress, nodes, edges, chain]);

  const candidate = useMemo(() => {
    return (
      traceData?.candidates?.find(
        (c) => c.address.toLowerCase() === currentAddress.toLowerCase()
      ) || null
    );
  }, [traceData, currentAddress]);

  const isSeed = (seed_address || '').toLowerCase() === currentAddress.toLowerCase();
  const explorer = getExplorerUrl(node.chain || chain, currentAddress);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Address Selector & Header Card ───────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-gradient-to-r from-panel via-panel to-cyan-950/[0.08]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                {node.chain || chain}
              </span>
              {isSeed && (
                <span className="text-xs uppercase font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/50">
                  Seed Target
                </span>
              )}
              {node.attribution_tier && (
                <ConfidenceBadge tier={node.attribution_tier} score={candidate?.evidence?.evidence_score} />
              )}
              {node.risk_score != null && (
                <RiskBadge score={node.risk_score} category={node.category} showBar />
              )}
            </div>

            <div>
              <span className="text-[10px] text-gray-500 uppercase font-semibold block tracking-wider">
                Investigated Address
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <AddressBadge
                  address={currentAddress}
                  chain={node.chain || chain}
                  label={node.label}
                  category={node.category}
                  showFull
                  className="text-base font-bold text-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Quick address switcher within trace */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-gray-400 font-semibold block">
                Switch Inspected Address:
              </label>
              <select
                value={currentAddress}
                onChange={(e) => selectAddress(e.target.value)}
                className="cyber-input text-xs font-mono max-w-xs bg-background"
              >
                {nodes.map((n) => (
                  <option key={n.address} value={n.address}>
                    {n.label ? `${n.label} (${n.address.slice(0, 8)}...)` : n.address}
                  </option>
                ))}
              </select>
            </div>

            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="cyber-button-secondary text-xs flex items-center justify-center gap-1.5 py-2 px-3 self-end"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Explorer
              </a>
            )}
          </div>
        </div>

        {/* First seen / Last seen / Hop banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-panel-border/60 text-xs font-mono">
          <div>
            <span className="text-[10px] uppercase text-gray-500 block font-sans font-semibold">Hop Distance</span>
            <span className="text-gray-200">{candidate?.hop_distance ?? (isSeed ? 0 : 'Direct')}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-gray-500 block font-sans font-semibold">First Seen</span>
            <span className="text-gray-300">
              {features?.first_seen ? new Date(features.first_seen).toLocaleDateString() : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-gray-500 block font-sans font-semibold">Last Seen</span>
            <span className="text-gray-300">
              {features?.last_seen ? new Date(features.last_seen).toLocaleDateString() : '—'}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-gray-500 block font-sans font-semibold">Active Window</span>
            <span className="text-gray-300">
              {features?.active_duration_hours ? `${features.active_duration_hours.toFixed(1)} hrs` : 'Single Event'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Verified Identity & Attribution Section ──────────────────────── */}
      <div className="cyber-panel p-6 space-y-4">
        <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
          Identity & Intelligence Dataset Enrichment
        </h3>

        {node.is_labeled ? (
          <div className="p-4 rounded-xl bg-green-500/[0.04] border border-green-500/30 grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">Entity / Label</span>
              <span className="text-base font-bold text-green-300 font-sans">{node.label}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">Entity Category</span>
              <span className="text-gray-200 font-medium capitalize font-sans">{node.category || 'VASP / Entity'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">Dataset Source</span>
              <span className="text-gray-300 font-mono">{node.label_source || 'Verified Dataset'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-gray-500 font-semibold block">Source Confidence</span>
              <span className="text-cyan-400 font-bold font-mono">
                {node.label_confidence != null ? `${(node.label_confidence * 100).toFixed(0)}%` : '100%'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-black/30 border border-panel-border flex items-center gap-3.5">
            <div className="p-2.5 rounded-full bg-gray-800 text-gray-400 shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-gray-200 text-sm">Unknown Address</div>
              <p className="text-xs text-gray-400 mt-0.5">
                No verified identity label available in the integrated intelligence tagpacks. Identity must be evaluated from behavioral continuity and counterparty analysis.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Behavioral Summary (Feature Engineering) ─────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            Behavioral Profile & Graph Feature Engineering
          </h3>
          <button
            onClick={() => setActiveSection('behavioral_analysis')}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 font-mono"
          >
            Open Behavioral Deep Dive <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Transaction Activity */}
          <div className="cyber-panel p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400 border-b border-panel-border pb-2">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-200">Transaction Activity</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Transactions:</span>
                <span className="font-mono font-bold text-gray-100">{features?.total_transactions ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Incoming Tx Count:</span>
                <span className="font-mono text-green-400">{features?.in_count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Outgoing Tx Count:</span>
                <span className="font-mono text-red-400">{features?.out_count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Velocity (tx/day):</span>
                <span className="font-mono text-cyan-400">{features?.transaction_velocity?.toFixed(2) ?? '0.00'}</span>
              </div>
            </div>
          </div>

          {/* Fund Movement */}
          <div className="cyber-panel p-4 space-y-3">
            <div className="flex items-center gap-2 text-purple-400 border-b border-panel-border pb-2">
              <ArrowUpRight className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-200">Fund Movement</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Inflow:</span>
                <span className="font-mono text-green-400">
                  {features?.in_volume ? features.in_volume.toFixed(4) : '0.00'} {features?.assets?.[0] || ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Outflow:</span>
                <span className="font-mono text-red-400">
                  {features?.out_volume ? features.out_volume.toFixed(4) : '0.00'} {features?.assets?.[0] || ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Out / In Ratio:</span>
                <span className="font-mono text-yellow-400">
                  {features?.out_in_ratio ? `${(features.out_in_ratio * 100).toFixed(1)}%` : '0.0%'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Amount Retained:</span>
                <span className="font-mono text-gray-200">
                  {features?.amount_retained ? features.amount_retained.toFixed(4) : '0.00'}
                </span>
              </div>
            </div>
          </div>

          {/* Network Behavior */}
          <div className="cyber-panel p-4 space-y-3">
            <div className="flex items-center gap-2 text-yellow-400 border-b border-panel-border pb-2">
              <Network className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-200">Network Behavior</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Unique Counterparties:</span>
                <span className="font-mono font-bold text-gray-100">{features?.unique_counterparties ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Fan-In (Sources):</span>
                <span className="font-mono text-gray-200">{features?.fan_in ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Fan-Out (Destinations):</span>
                <span className="font-mono text-gray-200">{features?.fan_out ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Concentration Index:</span>
                <span className="font-mono text-cyan-400">
                  {features?.counterparty_concentration ? features.counterparty_concentration.toFixed(3) : '1.000'}
                </span>
              </div>
            </div>
          </div>

          {/* Asset Behavior */}
          <div className="cyber-panel p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-400 border-b border-panel-border pb-2">
              <Database className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-200">Asset Behavior</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Asset Diversity:</span>
                <span className="font-mono font-bold text-gray-100">{features?.asset_count ?? 1}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Token Transfers:</span>
                <span className="font-mono text-gray-200">{features?.token_transfer_count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Contract Interactions:</span>
                <span className="font-mono text-gray-200">{features?.contract_interaction_count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Assets Observed:</span>
                <span className="font-mono text-gray-300 truncate max-w-[120px]">
                  {features?.assets?.join(', ') || 'NATIVE'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation Shortcuts ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setActiveSection('fund_flow')}
          className="cyber-button-secondary text-xs p-3 flex items-center justify-between"
        >
          <span>Inspect Fund Flow Path</span>
          <ArrowRight className="w-4 h-4 text-cyan-400" />
        </button>
        <button
          onClick={() => setActiveSection('transactions')}
          className="cyber-button-secondary text-xs p-3 flex items-center justify-between"
        >
          <span>View All Related Transactions</span>
          <ArrowRight className="w-4 h-4 text-cyan-400" />
        </button>
        <button
          onClick={() => setActiveSection('evidence_explorer')}
          className="cyber-button-secondary text-xs p-3 flex items-center justify-between"
        >
          <span>Inspect Evidence Chain</span>
          <ArrowRight className="w-4 h-4 text-cyan-400" />
        </button>
      </div>
    </div>
  );
}
