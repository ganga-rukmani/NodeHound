import React, { useMemo } from 'react';
import { Activity, Network, ArrowUpRight, Database, AlertCircle, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import MetricCard from '../common/MetricCard';
import { calculateAddressFeatures } from '../../utils/featureEngine';

export default function BehavioralAnalysis() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
  } = useInvestigation();

  const { nodes = [], edges = [], chain = 'ethereum', seed_address } = traceData || {};

  const currentAddress = selectedAddress || seed_address || (nodes[0]?.address ?? '');

  const node = useMemo(() => {
    return (
      nodes.find((n) => n.address.toLowerCase() === currentAddress.toLowerCase()) || {
        address: currentAddress,
        chain,
      }
    );
  }, [nodes, currentAddress, chain]);

  const features = useMemo(() => {
    return calculateAddressFeatures(currentAddress, nodes, edges, chain);
  }, [currentAddress, nodes, edges, chain]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header & Target Switcher ─────────────────────────────────── */}
      <div className="cyber-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
              Behavioral Forensics
            </span>
            <span className="text-xs font-mono text-gray-400">
              Deterministic Graph Features
            </span>
          </div>
          <h2 className="text-lg font-bold text-gray-100">Behavioral Analysis & Pattern Profiling</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400">Target:</span>
            <AddressBadge
              address={currentAddress}
              chain={node.chain || chain}
              label={node.label}
              category={node.category}
              showFull
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 shrink-0">Switch Target:</label>
          <select
            value={currentAddress}
            onChange={(e) => selectAddress(e.target.value)}
            className="cyber-input text-xs font-mono bg-background"
          >
            {nodes.map((n) => (
              <option key={n.address} value={n.address}>
                {n.label ? `${n.label} (${n.address.slice(0, 8)}...)` : n.address}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Investigator Interpretations (Translating numbers into findings) ─ */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-cyan-950/[0.05] space-y-3">
        <div className="flex items-center gap-2 text-cyan-400">
          <Zap className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
            Investigator Interpretations & Pattern Findings
          </h3>
        </div>

        {features?.interpretations?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {features.interpretations.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-lg bg-black/40 border border-panel-border space-y-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    {item.title}
                  </span>
                  <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                    {item.severity}
                  </span>
                </div>
                <p className="text-gray-400 text-[11px] leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-black/30 border border-panel-border text-center text-xs text-gray-400">
            No anomalous transaction spikes, layering fragmentation, or extreme out/in volume ratios detected for this address.
          </div>
        )}

        <div className="text-[10px] text-gray-500 pt-2 border-t border-panel-border/50 italic">
          Interpretations are generated deterministically from observed transaction timestamps, counterparty sets, and volume distributions.
        </div>
      </div>

      {/* ── Grid 1: Transaction & Flow Behaviors ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Transaction Behavior */}
        <div className="cyber-panel p-5 space-y-4">
          <div className="flex items-center gap-2 text-cyan-400 border-b border-panel-border pb-3">
            <Activity className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
              1. Transaction Activity
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Total Transfers</span>
              <span className="text-xl font-mono font-bold text-gray-100">{features?.total_transactions ?? 0}</span>
            </div>
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Velocity</span>
              <span className="text-xl font-mono font-bold text-cyan-400">{features?.transaction_velocity?.toFixed(1) ?? '0.0'} tx/day</span>
            </div>
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Inbound Txns</span>
              <span className="text-lg font-mono font-bold text-green-400">{features?.in_count ?? 0}</span>
            </div>
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Outbound Txns</span>
              <span className="text-lg font-mono font-bold text-red-400">{features?.out_count ?? 0}</span>
            </div>
          </div>

          <div className="space-y-1 text-xs border-t border-panel-border/60 pt-3">
            <div className="flex justify-between text-gray-400">
              <span>Active Duration:</span>
              <span className="font-mono text-gray-200">{features?.active_duration_hours?.toFixed(1) ?? 0} hours</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Distinct Active Days:</span>
              <span className="font-mono text-gray-200">{features?.active_days ?? 1} days</span>
            </div>
          </div>
        </div>

        {/* Flow Behavior */}
        <div className="cyber-panel p-5 space-y-4">
          <div className="flex items-center gap-2 text-purple-400 border-b border-panel-border pb-3">
            <ArrowUpRight className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
              2. Flow & Value Dynamics
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Total Inflow</span>
              <span className="text-base font-mono font-bold text-green-400 truncate block">
                {features?.in_volume ? features.in_volume.toFixed(4) : '0.00'}
              </span>
            </div>
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Total Outflow</span>
              <span className="text-base font-mono font-bold text-red-400 truncate block">
                {features?.out_volume ? features.out_volume.toFixed(4) : '0.00'}
              </span>
            </div>
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Forwarding Ratio</span>
              <span className="text-lg font-mono font-bold text-yellow-400">
                {features?.out_in_ratio ? `${(features.out_in_ratio * 100).toFixed(1)}%` : '0.0%'}
              </span>
            </div>
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Amount Retained</span>
              <span className="text-lg font-mono font-bold text-gray-200 truncate block">
                {features?.amount_retained ? features.amount_retained.toFixed(4) : '0.00'}
              </span>
            </div>
          </div>

          <div className="space-y-1 text-xs border-t border-panel-border/60 pt-3">
            <div className="flex justify-between text-gray-400">
              <span>Amount Forwarded Downstream:</span>
              <span className="font-mono text-gray-200">{features?.amount_forwarded ? features.amount_forwarded.toFixed(4) : '0.00'}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Estimated USD Value Moved:</span>
              <span className="font-mono text-gray-200">
                {features?.out_usd ? `$${features.out_usd.toLocaleString()}` : '$0'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid 2: Network & Asset Behaviors ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Network Behavior */}
        <div className="cyber-panel p-5 space-y-4">
          <div className="flex items-center gap-2 text-yellow-400 border-b border-panel-border pb-3">
            <Network className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
              3. Network Topology & Counterparties
            </h3>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Counterparties</span>
              <span className="text-xl font-mono font-bold text-gray-100">{features?.unique_counterparties ?? 0}</span>
            </div>
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Fan-In</span>
              <span className="text-xl font-mono font-bold text-green-400">{features?.fan_in ?? 0}</span>
            </div>
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Fan-Out</span>
              <span className="text-xl font-mono font-bold text-red-400">{features?.fan_out ?? 0}</span>
            </div>
          </div>

          <div className="space-y-2 text-xs border-t border-panel-border/60 pt-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Largest Counterparty:</span>
              {features?.largest_counterparty ? (
                <AddressBadge
                  address={features.largest_counterparty}
                  chain={node.chain || chain}
                  onClick={(addr) => selectAddress(addr)}
                />
              ) : (
                <span className="font-mono text-gray-500">—</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Counterparty Concentration Index:</span>
              <span className="font-mono text-gray-200">
                {features?.counterparty_concentration ? features.counterparty_concentration.toFixed(3) : '1.000'}
              </span>
            </div>
          </div>
        </div>

        {/* Asset Behavior */}
        <div className="cyber-panel p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-400 border-b border-panel-border pb-3">
            <Database className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
              4. Asset Diversity & Token Types
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Asset Count</span>
              <span className="text-xl font-mono font-bold text-gray-100">{features?.asset_count ?? 1}</span>
            </div>
            <div className="p-3 rounded bg-black/30 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 block">Token Transfers</span>
              <span className="text-xl font-mono font-bold text-cyan-400">{features?.token_transfer_count ?? 0}</span>
            </div>
          </div>

          <div className="space-y-1 text-xs border-t border-panel-border/60 pt-3">
            <div className="flex justify-between text-gray-400">
              <span>Contract Interactions:</span>
              <span className="font-mono text-gray-200">{features?.contract_interaction_count ?? 0}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Observed Tokens/Currencies:</span>
              <span className="font-mono text-cyan-300 font-medium">
                {features?.assets?.join(', ') || 'NATIVE'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

