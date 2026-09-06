import React, { useState, useEffect, useMemo } from 'react';
import {
  Dna,
  Zap,
  Activity,
  Layers,
  Cpu,
  ShieldCheck,
  TrendingUp,
  Share2,
  HelpCircle,
  Info,
} from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import { calculateAddressFeatures } from '../../utils/featureEngine';
import { api } from '../../api';

export default function FundFlowDna() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
    caseMetadata,
  } = useInvestigation();

  const { nodes = [], edges = [], chain = 'ethereum', seed_address } = traceData || {};
  const currentAddress = selectedAddress || seed_address || (nodes[0]?.address ?? '');
  const caseId = caseMetadata?.caseId || 'CASE-2026-ETH01';

  const [dnaData, setDnaData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Compute fallback features from actual graph
  const localFeatures = useMemo(() => {
    return calculateAddressFeatures(currentAddress, nodes, edges, chain);
  }, [currentAddress, nodes, edges, chain]);

  // Fetch backend DNA endpoint (inheriting case authorization)
  useEffect(() => {
    let isMounted = true;
    async function loadDna() {
      if (!currentAddress) return;
      setLoading(true);
      try {
        const data = await api.getFundFlowDna(caseId, currentAddress);
        if (isMounted && data) {
          setDnaData(data);
          setLoading(false);
          return;
        }
      } catch (err) {
        // Fallback to localFeatures
      }

      if (isMounted) {
        setLoading(false);
      }
    }

    loadDna();
    return () => {
      isMounted = false;
    };
  }, [caseId, currentAddress]);

  const activeChain = dnaData?.chain || chain;
  const isBitcoin = activeChain.toLowerCase() === 'bitcoin';

  // Feature groups representation
  const featureGroups = dnaData?.feature_groups || {
    FLOW_STRUCTURE: isBitcoin
      ? {
          transaction_count: localFeatures?.tx_count || 0,
          input_count: localFeatures?.in_count || 0,
          output_count: localFeatures?.out_count || 0,
          fan_in: localFeatures?.fan_in || 0,
          fan_out: localFeatures?.fan_out || 0,
        }
      : {
          in_count: localFeatures?.in_count || 0,
          out_count: localFeatures?.out_count || 0,
          fan_in: localFeatures?.fan_in || 0,
          fan_out: localFeatures?.fan_out || 0,
        },
    VELOCITY: {
      transaction_velocity: localFeatures?.transaction_velocity || 0,
      active_duration_hours: localFeatures?.active_duration_hours || 0,
    },
    COUNTERPARTY_BEHAVIOR: {
      unique_counterparties: localFeatures?.counterparty_count || 0,
    },
    VALUE_FLOW: {
      in_volume: localFeatures?.in_volume || 0,
      out_volume: localFeatures?.out_volume || 0,
      out_in_ratio: localFeatures?.out_in_ratio || 0,
    },
    ASSET_CONTRACT_ACTIVITY: isBitcoin
      ? {
          asset_count: 1,
          utxo_inferred_edges: localFeatures?.utxo_inferred_edges || 0,
        }
      : {
          asset_count: localFeatures?.distinct_tokens || 1,
          token_transfer_count: localFeatures?.token_transfer_count || 0,
          contract_interaction_count: localFeatures?.token_transfer_count || 0,
        },
  };

  const interpretations = dnaData?.interpretations || localFeatures?.interpretations || [
    { title: 'High Outgoing Activity', severity: 'medium', description: 'Observed significant outbound transfers relative to inbound deposits.' },
    { title: 'Elevated Forwarding Ratio', severity: 'low', description: 'Forwarding ratio indicates high flow continuity.' },
  ];

  const whatDoesThisMean = dnaData?.what_does_this_mean ||
    'Wallet exhibits high outbound activity relative to inbound activity with multiple downstream destinations. These observations describe transaction behavior and should be interpreted alongside graph topology and verified external intelligence.';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header & Target Switcher ─────────────────────────────────── */}
      <div className="cyber-panel p-6 border-purple-500/30 bg-gradient-to-r from-panel via-purple-950/[0.1] to-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold flex items-center gap-1.5">
                <Dna className="w-3.5 h-3.5" />
                Fund Flow DNA
              </span>
              <span className="text-xs font-mono text-gray-400">
                Behavioral Signature of the Wallet
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-100">Behavioral Signature Profile</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400 font-mono">Target:</span>
              <AddressBadge
                address={currentAddress}
                chain={activeChain}
                showFull
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs text-gray-400 font-mono">Switch Wallet:</label>
            <select
              value={currentAddress}
              onChange={(e) => selectAddress(e.target.value)}
              className="cyber-input text-xs font-mono bg-background border-purple-500/30"
            >
              {nodes.map((n) => (
                <option key={n.address} value={n.address}>
                  {n.label ? `${n.label} (${n.address.slice(0, 8)}...)` : n.address}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Forensic Disclaimer */}
        <div className="mt-4 pt-3 border-t border-panel-border/50 text-[11px] text-gray-400 flex items-start gap-2 italic">
          <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <span>
            "Fund Flow DNA summarizes observed transaction behavior. It does not establish ownership, malicious intent, or legal attribution."
          </span>
        </div>
      </div>

      {/* ── DNA Visual Signature Strip (Bar / Indicator Matrix) ───────────── */}
      <div className="cyber-panel p-6 border-panel-border bg-black/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold uppercase tracking-wider">
            <Zap className="w-4 h-4" />
            Behavioral Indicator Signature
          </div>
          <span className="text-[10px] uppercase font-mono text-gray-400">
            Chain: {activeChain}
          </span>
        </div>

        {/* 9 Behavioral Indicator Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-panel/70 border border-panel-border space-y-1">
            <span className="text-[10px] text-gray-500 uppercase font-mono block">Incoming Activity</span>
            <span className="text-base font-bold font-mono text-cyan-400">
              {featureGroups.FLOW_STRUCTURE.in_count ?? featureGroups.FLOW_STRUCTURE.input_count ?? 0} txs
            </span>
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-cyan-400 h-full"
                style={{ width: `${Math.min(100, (featureGroups.FLOW_STRUCTURE.in_count || 1) * 10)}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-panel/70 border border-panel-border space-y-1">
            <span className="text-[10px] text-gray-500 uppercase font-mono block">Outgoing Activity</span>
            <span className="text-base font-bold font-mono text-purple-400">
              {featureGroups.FLOW_STRUCTURE.out_count ?? featureGroups.FLOW_STRUCTURE.output_count ?? 0} txs
            </span>
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-purple-400 h-full"
                style={{ width: `${Math.min(100, (featureGroups.FLOW_STRUCTURE.out_count || 1) * 10)}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-panel/70 border border-panel-border space-y-1">
            <span className="text-[10px] text-gray-500 uppercase font-mono block">Fan-In (Origins)</span>
            <span className="text-base font-bold font-mono text-blue-400">
              {featureGroups.FLOW_STRUCTURE.fan_in} distinct
            </span>
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-400 h-full"
                style={{ width: `${Math.min(100, featureGroups.FLOW_STRUCTURE.fan_in * 12)}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-panel/70 border border-panel-border space-y-1">
            <span className="text-[10px] text-gray-500 uppercase font-mono block">Fan-Out (Destinations)</span>
            <span className="text-base font-bold font-mono text-amber-400">
              {featureGroups.FLOW_STRUCTURE.fan_out} distinct
            </span>
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-400 h-full"
                style={{ width: `${Math.min(100, featureGroups.FLOW_STRUCTURE.fan_out * 12)}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-panel/70 border border-panel-border space-y-1">
            <span className="text-[10px] text-gray-500 uppercase font-mono block">Transaction Velocity</span>
            <span className="text-base font-bold font-mono text-green-400">
              {Number(featureGroups.VELOCITY.transaction_velocity || 0).toFixed(1)} / day
            </span>
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-green-400 h-full"
                style={{ width: `${Math.min(100, (featureGroups.VELOCITY.transaction_velocity || 1) * 20)}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-panel/70 border border-panel-border space-y-1">
            <span className="text-[10px] text-gray-500 uppercase font-mono block">Counterparties</span>
            <span className="text-base font-bold font-mono text-indigo-400">
              {featureGroups.COUNTERPARTY_BEHAVIOR.unique_counterparties} unique
            </span>
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-indigo-400 h-full"
                style={{ width: `${Math.min(100, featureGroups.COUNTERPARTY_BEHAVIOR.unique_counterparties * 8)}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-panel/70 border border-panel-border space-y-1">
            <span className="text-[10px] text-gray-500 uppercase font-mono block">Forwarding Ratio</span>
            <span className="text-base font-bold font-mono text-rose-400">
              {(Number(featureGroups.VALUE_FLOW.out_in_ratio || 0) * 100).toFixed(1)}%
            </span>
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-rose-400 h-full"
                style={{ width: `${Math.min(100, (featureGroups.VALUE_FLOW.out_in_ratio || 0) * 100)}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-panel/70 border border-panel-border space-y-1">
            <span className="text-[10px] text-gray-500 uppercase font-mono block">Asset Diversity</span>
            <span className="text-base font-bold font-mono text-cyan-300">
              {featureGroups.ASSET_CONTRACT_ACTIVITY.asset_count} tokens
            </span>
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-cyan-300 h-full"
                style={{ width: `${Math.min(100, featureGroups.ASSET_CONTRACT_ACTIVITY.asset_count * 30)}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-panel/70 border border-panel-border space-y-1 col-span-2">
            <span className="text-[10px] text-gray-500 uppercase font-mono block">Active Window</span>
            <span className="text-base font-bold font-mono text-gray-200">
              {Number(featureGroups.VELOCITY.active_duration_hours || 0).toFixed(1)} hours
            </span>
            <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gray-400 h-full"
                style={{ width: `${Math.min(100, (featureGroups.VELOCITY.active_duration_hours || 1) * 2)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 5 Feature Groups Detailed Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Group 1: Flow Structure */}
        <div className="cyber-panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase">
            <Layers className="w-4 h-4" />
            1. Flow Structure
          </div>
          <div className="space-y-2 text-xs font-mono">
            {Object.entries(featureGroups.FLOW_STRUCTURE).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between p-2 rounded bg-black/30 border border-panel-border">
                <span className="text-gray-400 uppercase text-[10px]">{k.replace(/_/g, ' ')}</span>
                <span className="font-bold text-gray-200">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Group 2: Velocity & Duration */}
        <div className="cyber-panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-400 font-mono text-xs font-bold uppercase">
            <TrendingUp className="w-4 h-4" />
            2. Velocity
          </div>
          <div className="space-y-2 text-xs font-mono">
            {Object.entries(featureGroups.VELOCITY).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between p-2 rounded bg-black/30 border border-panel-border">
                <span className="text-gray-400 uppercase text-[10px]">{k.replace(/_/g, ' ')}</span>
                <span className="font-bold text-gray-200">
                  {typeof v === 'number' ? v.toFixed(2) : v}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Group 3: Counterparty Behavior */}
        <div className="cyber-panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-purple-400 font-mono text-xs font-bold uppercase">
            <Share2 className="w-4 h-4" />
            3. Counterparty Behavior
          </div>
          <div className="space-y-2 text-xs font-mono">
            {Object.entries(featureGroups.COUNTERPARTY_BEHAVIOR).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between p-2 rounded bg-black/30 border border-panel-border">
                <span className="text-gray-400 uppercase text-[10px]">{k.replace(/_/g, ' ')}</span>
                <span className="font-bold text-gray-200">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Group 4: Value Flow */}
        <div className="cyber-panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase">
            <Activity className="w-4 h-4" />
            4. Value Flow
          </div>
          <div className="space-y-2 text-xs font-mono">
            {Object.entries(featureGroups.VALUE_FLOW).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between p-2 rounded bg-black/30 border border-panel-border">
                <span className="text-gray-400 uppercase text-[10px]">{k.replace(/_/g, ' ')}</span>
                <span className="font-bold text-gray-200">
                  {typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : v}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Group 5: Asset / Contract Activity */}
        <div className="cyber-panel p-4 space-y-3 col-span-1 md:col-span-2">
          <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-bold uppercase">
            <Cpu className="w-4 h-4" />
            5. Asset / Contract Activity ({activeChain.toUpperCase()})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
            {Object.entries(featureGroups.ASSET_CONTRACT_ACTIVITY).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between p-2 rounded bg-black/30 border border-panel-border">
                <span className="text-gray-400 uppercase text-[10px]">{k.replace(/_/g, ' ')}</span>
                <span className="font-bold text-gray-200">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section: WHAT DOES THIS MEAN? ─────────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-cyan-950/[0.08] space-y-4">
        <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
          <HelpCircle className="w-4 h-4" />
          What Does This Mean? (Investigator Interpretation)
        </div>

        <p className="text-xs text-gray-200 leading-relaxed font-mono bg-black/40 p-4 rounded-lg border border-cyan-500/20">
          {whatDoesThisMean}
        </p>

        {/* Deterministic Findings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {interpretations.map((item, idx) => (
            <div key={idx} className="p-3 rounded-lg bg-black/40 border border-panel-border text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  {item.title}
                </span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  {item.severity}
                </span>
              </div>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section: ML Pipeline Compatibility ────────────────────────────── */}
      <div className="cyber-panel p-5 border-panel-border bg-black/30 space-y-2 text-xs font-mono">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 font-bold uppercase text-[11px]">
            Machine Learning Pipeline Architecture
          </span>
          <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-green-500/10 text-green-300 border border-green-500/30">
            Behavioral Feature Vector Active
          </span>
        </div>
        <p className="text-gray-400 text-[11px]">
          Features are bound to the NodeHound XGBoost and Graph Neural Network (GNN) behavioral schema. When no calibrated artifact is bound to this chain, the behavioral vector remains active without synthetic score fabrication.
        </p>
      </div>
    </div>
  );
}

