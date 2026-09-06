import React, { useMemo } from 'react';
import {
  Cpu,
  Layers,
  ArrowDown,
  Activity,
  ArrowLeftRight,
  Network,
  Clock,
  Coins,
  ShieldCheck,
  CheckCircle2,
  GitBranch,
} from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import { calculateAddressFeatures } from '../../utils/featureEngine';

export default function AiRiskAnalysis() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
  } = useInvestigation();

  const {
    nodes = [],
    edges = [],
    chain = 'ethereum',
    seed_address,
  } = traceData || {};

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

  const inferenceSteps = [
    { title: 'Blockchain Transactions', desc: 'Raw on-chain transfer events & token logs' },
    { title: 'Transaction Normalization', desc: 'Standardized temporal, value & address indexing' },
    { title: '13 Behavioral Features', desc: 'Deterministic chain-specific behavioral vector' },
    { title: 'Calibrated XGBoost', desc: 'Gradient-boosted probability calibration layer' },
    { title: 'Behavioral Risk Assessment', desc: 'Forensic risk categorization & anomaly rating' },
    { title: 'TreeSHAP Explanation', desc: 'Game-theoretic feature-level attribution' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-purple-500/30 bg-gradient-to-r from-panel to-purple-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                Production Behavioral Intelligence
              </span>
              <span className="text-xs font-mono text-gray-400">
                Model-ready inference layer
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-100">AI Risk Analysis</h2>
            <p className="text-xs text-purple-300/80 font-mono mt-0.5">
              Production Behavioral Intelligence &amp; Machine Learning Architecture
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400 font-mono">Target Address:</span>
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
            <label className="text-xs text-gray-400 shrink-0 font-mono">Switch Target:</label>
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
        </div>
      </div>

      {/* ── Top Model Architecture / Status Card ─────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-black/40 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-panel-border pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
                Production ML Pipeline
              </h3>
              <p className="text-xs text-gray-400 font-mono">
                Chain-specific behavioral risk architecture &amp; feature normalization
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              Production ML Pipeline
            </span>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
              Model-ready inference layer
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Model Pipeline Stages */}
          <div className="space-y-3">
            <span className="text-[11px] uppercase tracking-wider font-mono font-bold text-gray-300 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              MODEL PIPELINE
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-3 rounded-lg bg-panel-bg border border-panel-border/80 space-y-1">
                <span className="text-[10px] text-gray-500 font-mono block">Stage 1</span>
                <span className="text-xs font-semibold text-gray-200 block">
                  Behavioral Feature Engineering
                </span>
                <span className="text-[11px] text-gray-400">
                  Deterministic graph &amp; temporal extraction
                </span>
              </div>
              <div className="p-3 rounded-lg bg-panel-bg border border-panel-border/80 space-y-1">
                <span className="text-[10px] text-gray-500 font-mono block">Stage 2</span>
                <span className="text-xs font-semibold text-gray-200 block">
                  Chain-Specific Feature Vector
                </span>
                <span className="text-[11px] text-gray-400">
                  13 normalized behavioral indicators
                </span>
              </div>
              <div className="p-3 rounded-lg bg-panel-bg border border-panel-border/80 space-y-1">
                <span className="text-[10px] text-gray-500 font-mono block">Stage 3</span>
                <span className="text-xs font-semibold text-gray-200 block">
                  Calibrated XGBoost Classifier
                </span>
                <span className="text-[11px] text-gray-400">
                  Gradient-boosted decision trees
                </span>
              </div>
              <div className="p-3 rounded-lg bg-panel-bg border border-panel-border/80 space-y-1">
                <span className="text-[10px] text-gray-500 font-mono block">Stage 4</span>
                <span className="text-xs font-semibold text-gray-200 block">
                  TreeSHAP Explainability
                </span>
                <span className="text-[11px] text-gray-400">
                  Game-theoretic marginal impact
                </span>
              </div>
            </div>
          </div>

          {/* Model Coverage */}
          <div className="space-y-3">
            <span className="text-[11px] uppercase tracking-wider font-mono font-bold text-gray-300 flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-purple-400" />
              MODEL COVERAGE
            </span>
            <div className="space-y-2.5">
              <div className="p-3 rounded-lg bg-panel-bg border border-panel-border/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-gray-200 block">Ethereum</span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    Account-based state model &amp; ERC-20 token tracking
                  </span>
                </div>
                <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  Production Pipeline
                </span>
              </div>

              <div className="p-3 rounded-lg bg-panel-bg border border-panel-border/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-gray-200 block">Bitcoin</span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    UTXO heuristic clustering &amp; peeling chain detection
                  </span>
                </div>
                <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  Production Pipeline
                </span>
              </div>

              <div className="p-3 rounded-lg bg-panel-bg border border-panel-border/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-gray-200 block">TRON</span>
                  <span className="text-[11px] text-gray-400 font-mono">
                    TRC-20 high-velocity stablecoin flow modeling
                  </span>
                </div>
                <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  Production Pipeline
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Behavioral Risk Analysis Section ─────────────────────────────── */}
      <div className="cyber-panel p-6 space-y-5">
        <div className="border-b border-panel-border pb-3">
          <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            BEHAVIORAL RISK ANALYSIS
          </h3>
          <p className="text-xs text-gray-300 leading-relaxed mt-1.5 max-w-3xl">
            NodeHound converts observed blockchain activity into chain-specific behavioral indicators. These features are designed to support automated risk assessment while preserving forensic interpretability.
          </p>
        </div>

        {/* 5 Main Behavioral Dimensions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Transaction Activity */}
          <div className="p-4 rounded-xl bg-black/40 border border-panel-border hover:border-cyan-500/40 transition-colors space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-100 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
                1. Transaction Activity
              </span>
              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                {(features.in_count ?? 0) + (features.out_count ?? 0)} Txs
              </span>
            </div>
            <ul className="text-xs text-gray-300 space-y-1.5">
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Transaction frequency:</span>
                <span className="font-mono text-gray-200">
                  {features.transaction_velocity > 0 ? `${features.transaction_velocity.toFixed(2)}/hr` : 'Baseline'}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Incoming activity:</span>
                <span className="font-mono text-emerald-400">{features.in_count ?? 0} txs</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Outgoing activity:</span>
                <span className="font-mono text-amber-400">{features.out_count ?? 0} txs</span>
              </li>
            </ul>
            <p className="text-[11px] text-gray-500 border-t border-panel-border/50 pt-2">
              Evaluates execution patterns and transaction initiation cadence across blocks.
            </p>
          </div>

          {/* 2. Fund Flow Behavior */}
          <div className="p-4 rounded-xl bg-black/40 border border-panel-border hover:border-cyan-500/40 transition-colors space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                2. Fund Flow Behavior
              </span>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                Ratio: {features.out_in_ratio != null ? `${(features.out_in_ratio * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
            <ul className="text-xs text-gray-300 space-y-1.5">
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Incoming volume:</span>
                <span className="font-mono text-emerald-400">
                  {(features.in_volume ?? 0).toFixed(3)}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Outgoing volume:</span>
                <span className="font-mono text-amber-400">
                  {(features.out_volume ?? 0).toFixed(3)}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Forwarding characteristic:</span>
                <span className="font-mono text-gray-200">
                  {features.out_in_ratio >= 0.8
                    ? 'Rapid Pass-Through'
                    : features.out_in_ratio > 0
                    ? 'Accumulator Pattern'
                    : 'Terminal Holding'}
                </span>
              </li>
            </ul>
            <p className="text-[11px] text-gray-500 border-t border-panel-border/50 pt-2">
              Identifies value retention, conduit forwarding, and structuring proportions.
            </p>
          </div>

          {/* 3. Network Behavior */}
          <div className="p-4 rounded-xl bg-black/40 border border-panel-border hover:border-cyan-500/40 transition-colors space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-100 flex items-center gap-2">
                <Network className="w-4 h-4 text-cyan-400" />
                3. Network Behavior
              </span>
              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                {features.unique_counterparties ?? 0} Peers
              </span>
            </div>
            <ul className="text-xs text-gray-300 space-y-1.5">
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Fan-In (Inbound Degree):</span>
                <span className="font-mono text-emerald-400">{features.fan_in ?? 0} sources</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Fan-Out (Outbound Degree):</span>
                <span className="font-mono text-amber-400">{features.fan_out ?? 0} targets</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Counterparty diversity:</span>
                <span className="font-mono text-gray-200">
                  {features.unique_counterparties > 8 ? 'High Dispersion' : 'Clustered / Direct'}
                </span>
              </li>
            </ul>
            <p className="text-[11px] text-gray-500 border-t border-panel-border/50 pt-2">
              Captures graph topology, peeling chain branches, and hub concentration.
            </p>
          </div>

          {/* 4. Temporal Behavior */}
          <div className="p-4 rounded-xl bg-black/40 border border-panel-border hover:border-cyan-500/40 transition-colors space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                4. Temporal Behavior
              </span>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                Velocity &amp; Span
              </span>
            </div>
            <ul className="text-xs text-gray-300 space-y-1.5">
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Transaction velocity:</span>
                <span className="font-mono text-emerald-400">
                  {(features.transaction_velocity ?? 0).toFixed(2)} tx/hr
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Active duration:</span>
                <span className="font-mono text-gray-200">
                  {(features.active_duration_hours ?? 0).toFixed(1)} hours
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-gray-400">Burst profile:</span>
                <span className="font-mono text-gray-200">
                  {features.transaction_velocity > 2 ? 'Accelerated Burst' : 'Normal Cadence'}
                </span>
              </li>
            </ul>
            <p className="text-[11px] text-gray-500 border-t border-panel-border/50 pt-2">
              Measures holding periods, rapid liquidation windows, and burst intervals.
            </p>
          </div>

          {/* 5. Asset / Contract Behavior */}
          <div className="p-4 rounded-xl bg-black/40 border border-panel-border hover:border-cyan-500/40 transition-colors space-y-3 md:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-100 flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                5. Asset / Contract Behavior
              </span>
              <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                Smart Contract &amp; Token
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-2.5 rounded bg-panel-bg border border-panel-border/60">
                <span className="text-[10px] text-gray-400 block">Asset Diversity</span>
                <span className="text-sm font-mono font-bold text-gray-100">
                  {features.asset_count ?? 1} Assets
                </span>
                <span className="text-[10px] text-gray-500 block">Native + tokens</span>
              </div>
              <div className="p-2.5 rounded bg-panel-bg border border-panel-border/60">
                <span className="text-[10px] text-gray-400 block">Token Transfers</span>
                <span className="text-sm font-mono font-bold text-cyan-400">
                  {features.token_transfer_count ?? 0} Transfers
                </span>
                <span className="text-[10px] text-gray-500 block">ERC-20 / TRC-20 logs</span>
              </div>
              <div className="p-2.5 rounded bg-panel-bg border border-panel-border/60">
                <span className="text-[10px] text-gray-400 block">Contract Interactions</span>
                <span className="text-sm font-mono font-bold text-purple-400">
                  {features.contract_interaction_count ?? 0} Calls
                </span>
                <span className="text-[10px] text-gray-500 block">DeFi / Router execution</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 border-t border-panel-border/50 pt-2">
              Assesses smart contract routing, automated swaps, multi-token hopping, and decentralized protocol interaction.
            </p>
          </div>
        </div>
      </div>

      {/* ── Model Inference Flow Section ─────────────────────────────────── */}
      <div className="cyber-panel p-6 space-y-5">
        <div className="border-b border-panel-border pb-3">
          <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            MODEL INFERENCE FLOW
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            End-to-end topological feature ingestion, tree ensemble inference, and explainability architecture.
          </p>
        </div>

        {/* Visual Stepped Pipeline */}
        <div className="relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {inferenceSteps.map((step, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-black/50 border border-panel-border relative flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                      0{idx + 1}
                    </span>
                    {idx < inferenceSteps.length - 1 && (
                      <span className="text-gray-600 text-xs hidden lg:inline font-mono">→</span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-gray-100 mb-1 leading-snug">
                    {step.title}
                  </h4>
                  <p className="text-[11px] text-gray-400 leading-tight">
                    {step.desc}
                  </p>
                </div>

                {idx < inferenceSteps.length - 1 && (
                  <div className="lg:hidden flex justify-center pt-2">
                    <ArrowDown className="w-3.5 h-3.5 text-gray-600" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Forensic Integrity Note ──────────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs text-purple-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-purple-300">Forensic Integrity Standard</div>
          <p className="text-xs text-purple-200/90 leading-relaxed">
            Forensic integrity note: NodeHound does not fabricate AI risk scores. Production risk predictions are generated only when validated chain-specific model artifacts are available.
          </p>
        </div>
      </div>
    </div>
  );
}
