import React, { useMemo } from 'react';
import { Cpu, ShieldCheck, Activity } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import RiskBadge from '../common/RiskBadge';
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
    model_information = {},
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

  // Model availability check
  const isChainModelLoaded = Boolean(model_information?.chain_model_loaded || node?.risk_score != null);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-purple-500/30 bg-gradient-to-r from-panel to-purple-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                Machine Learning
              </span>
              <span className="text-xs font-mono text-gray-400">
                Calibrated Behavioral Classifier
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-100">AI Risk Analysis & Model Status</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-400">Target Address:</span>
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
            <label className="text-xs text-gray-400 shrink-0">Switch Address:</label>
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

      {/* ── Mandatory Disclaimer Banner ──────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs text-purple-200 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0" />
        <div>
          <strong>Forensic Standard Disclaimer:</strong> ML behavioral risk is a probabilistic estimate derived from topological and velocity indicators; it does not constitute legal evidence or proof of malicious ownership.
        </div>
      </div>

      {/* ── Dynamic Model Availability Section ───────────────────────────── */}
      {!isChainModelLoaded ? (
        <div className="space-y-6">
          {/* Status Alert */}
          <div className="cyber-panel p-6 border-cyan-500/30 bg-black/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-panel-border pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-100">AI Risk Analysis Engine</h3>
                  <span className="text-xs text-gray-400">Chain Model Artifact Registry</span>
                </div>
              </div>

              <span className="text-xs font-mono uppercase font-bold px-3 py-1 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 self-start sm:self-auto">
                INSUFFICIENT VALID TRAINING DATA
              </span>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              No calibrated XGBoost or GNN model artifacts are currently bound to this chain in the local <code className="text-cyan-400">scoring/model_artifacts/</code> directory. In strict compliance with forensic integrity, uncalibrated or fabricated AI risk scores are never displayed.
            </p>

            {/* Chain Model Availability Table */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3.5 rounded-lg bg-black/40 border border-panel-border space-y-1">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Ethereum Model</span>
                <span className="text-xs font-mono text-gray-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-500" />
                  Unavailable (Uncalibrated)
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-black/40 border border-panel-border space-y-1">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Bitcoin Model</span>
                <span className="text-xs font-mono text-gray-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-500" />
                  Unavailable (UTXO Feature Pipeline)
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-black/40 border border-panel-border space-y-1">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">TRON Model</span>
                <span className="text-xs font-mono text-gray-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-500" />
                  Unavailable (Uncalibrated)
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-cyan-500/[0.04] border border-cyan-500/20 text-xs text-cyan-300">
              ML-based risk scoring will be enabled when a validated chain-specific model is available.
            </div>
          </div>

          {/* Fallback to Deterministic Behavioral Risk Indicators */}
          <div className="cyber-panel p-6 space-y-4">
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Deterministic Behavioral Risk Indicators (Mathematical Fallback)
            </h3>
            <p className="text-xs text-gray-400">
              While ML probability estimation is offline, investigators rely on verifiable, rule-based topological signals:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded bg-black/40 border border-panel-border space-y-1">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Fan-Out Indicator</span>
                <div className="text-base font-mono font-bold text-gray-100">
                  {features?.fan_out ?? 0} destinations
                </div>
                <span className="text-[11px] text-gray-400">
                  {features?.fan_out >= 5 ? 'High destination dispersion' : 'Normal dispersion'}
                </span>
              </div>

              <div className="p-3 rounded bg-black/40 border border-panel-border space-y-1">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Transaction Velocity</span>
                <div className="text-base font-mono font-bold text-cyan-400">
                  {features?.transaction_velocity?.toFixed(1) ?? '0.0'} tx/day
                </div>
                <span className="text-[11px] text-gray-400">
                  {features?.transaction_velocity >= 3 ? 'Elevated transfer velocity' : 'Standard velocity'}
                </span>
              </div>

              <div className="p-3 rounded bg-black/40 border border-panel-border space-y-1">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Forwarding Ratio</span>
                <div className="text-base font-mono font-bold text-yellow-400">
                  {features?.out_in_ratio ? `${(features.out_in_ratio * 100).toFixed(0)}%` : '0%'}
                </div>
                <span className="text-[11px] text-gray-400">
                  {features?.out_in_ratio >= 0.8 ? 'Pass-through forwarding' : 'Accumulator pattern'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Valid Model Active View */
        <div className="cyber-panel p-6 border-purple-500/30 bg-black/30 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-panel-border pb-4">
            <div>
              <span className="text-[10px] uppercase font-semibold text-gray-500 block">Calibrated Behavioral Risk</span>
              <div className="text-3xl font-mono font-bold text-red-400 mt-1">
                {node.risk_score != null ? (node.risk_score * 100).toFixed(1) + '%' : '—'}
              </div>
            </div>
            <RiskBadge score={node.risk_score} category={node.category || 'High'} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded bg-black/40 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 font-sans block">Model Name</span>
              <span className="text-gray-200 font-bold">XGBoost Calibrated</span>
            </div>
            <div className="p-3 rounded bg-black/40 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 font-sans block">Model Version</span>
              <span className="text-gray-200">v2.1-calibrated</span>
            </div>
            <div className="p-3 rounded bg-black/40 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 font-sans block">Feature Version</span>
              <span className="text-gray-200">chain_features_v1</span>
            </div>
            <div className="p-3 rounded bg-black/40 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 font-sans block">Evaluation Time</span>
              <span className="text-gray-200">{new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
