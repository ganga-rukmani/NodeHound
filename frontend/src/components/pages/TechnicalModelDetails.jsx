import React, { useMemo, useState } from 'react';
import { Terminal, Database, Code, ShieldCheck, ChevronDown, ChevronUp, Copy, CheckCircle } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import { calculateAddressFeatures } from '../../utils/featureEngine';

export default function TechnicalModelDetails() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
  } = useInvestigation();

  const { nodes = [], edges = [], chain = 'ethereum', seed_address } = traceData || {};

  const currentAddress = selectedAddress || seed_address || (nodes[0]?.address ?? '');
  const [copiedJson, setCopiedJson] = useState(false);

  const features = useMemo(() => {
    return calculateAddressFeatures(currentAddress, nodes, edges, chain);
  }, [currentAddress, nodes, edges, chain]);

  const featureVectorJson = useMemo(() => {
    if (!features) return '{}';
    return JSON.stringify(features, null, 2);
  }, [features]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(featureVectorJson).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1500);
    });
  };

  const isBitcoin = chain === 'bitcoin';
  const isEVMOrTron = chain === 'ethereum' || chain === 'tron';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/20 bg-gradient-to-r from-panel to-cyan-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Audit & Architecture
              </span>
              <span className="text-xs font-mono text-gray-400">
                Leakage-Free Feature Engineering
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-100">Technical Model & Feature Architecture</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-400">Selected Entity:</span>
              <AddressBadge address={currentAddress} chain={chain} showFull />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyJson}
              className="cyber-button-secondary text-xs py-2 px-3 flex items-center gap-1.5"
            >
              {copiedJson ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedJson ? 'Copied' : 'Copy Vector JSON'}
            </button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-panel-border/50 text-[11px] text-gray-400 italic">
          "These are not arbitrary scores. These are the deterministic behavioral features feeding the chain-specific pipeline."
        </div>
      </div>

      {/* ── Feature Table ────────────────────────────────────────────────── */}
      <div className="cyber-panel overflow-hidden">
        <div className="p-4 border-b border-panel-border bg-black/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              Exact Feature Values for {chain.toUpperCase()} Model
            </h3>
          </div>
          <span className="text-[11px] text-cyan-400 font-mono">
            {isBitcoin ? '13 Bitcoin UTXO Features' : '13 EVM/TRON Behavioral Features'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-panel-border bg-black/40 text-[10px] text-gray-400 uppercase font-sans tracking-wider select-none">
                <th className="p-3">Feature Key</th>
                <th className="p-3">Extracted Value</th>
                <th className="p-3">Type & Range</th>
                <th className="p-3">Forensic Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border/40">
              <tr>
                <td className="p-3 text-cyan-300 font-bold">in_count</td>
                <td className="p-3 font-bold text-gray-100">{features?.in_count ?? 0}</td>
                <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Total number of incoming transfers collected.</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">out_count</td>
                <td className="p-3 font-bold text-gray-100">{features?.out_count ?? 0}</td>
                <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Total number of outbound disbursements.</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">in_volume</td>
                <td className="p-3 font-bold text-green-400">
                  {features?.in_volume ? features.in_volume.toFixed(4) : '0.0000'}
                </td>
                <td className="p-3 text-gray-400">Float [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Cumulative native/token units received.</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">out_volume</td>
                <td className="p-3 font-bold text-red-400">
                  {features?.out_volume ? features.out_volume.toFixed(4) : '0.0000'}
                </td>
                <td className="p-3 text-gray-400">Float [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Cumulative native/token units forwarded.</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">unique_counterparties</td>
                <td className="p-3 font-bold text-gray-100">{features?.unique_counterparties ?? 0}</td>
                <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Unique set size of all sender and recipient addresses.</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">fan_in</td>
                <td className="p-3 font-bold text-gray-100">{features?.fan_in ?? 0}</td>
                <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Unique origin wallets feeding into this address.</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">fan_out</td>
                <td className="p-3 font-bold text-gray-100">{features?.fan_out ?? 0}</td>
                <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Unique destination wallets receiving disbursements.</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">transaction_velocity</td>
                <td className="p-3 font-bold text-cyan-400">
                  {features?.transaction_velocity ? features.transaction_velocity.toFixed(2) : '0.00'}
                </td>
                <td className="p-3 text-gray-400">Float [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Daily transaction intensity (txs divided by active days).</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">active_duration_hours</td>
                <td className="p-3 font-bold text-gray-100">
                  {features?.active_duration_hours ? features.active_duration_hours.toFixed(2) : '0.00'}
                </td>
                <td className="p-3 text-gray-400">Float [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Elapsed hours between first and last observed transfer.</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">out_in_ratio</td>
                <td className="p-3 font-bold text-yellow-400">
                  {features?.out_in_ratio ? features.out_in_ratio.toFixed(4) : '0.0000'}
                </td>
                <td className="p-3 text-gray-400">Float [0, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Forwarding ratio (out_volume / in_volume).</td>
              </tr>
              <tr>
                <td className="p-3 text-cyan-300 font-bold">asset_count</td>
                <td className="p-3 font-bold text-gray-100">{features?.asset_count ?? 1}</td>
                <td className="p-3 text-gray-400">Integer [1, ∞)</td>
                <td className="p-3 font-sans text-gray-300">Distinct asset symbols utilized.</td>
              </tr>

              {/* Chain-Specific Rows */}
              {isBitcoin ? (
                <>
                  <tr>
                    <td className="p-3 text-orange-400 font-bold">input_count</td>
                    <td className="p-3 font-bold text-gray-100">{features?.in_count ?? 0}</td>
                    <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                    <td className="p-3 font-sans text-gray-300">Total UTXO input addresses contributing value.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-orange-400 font-bold">output_count</td>
                    <td className="p-3 font-bold text-gray-100">{features?.out_count ?? 0}</td>
                    <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                    <td className="p-3 font-sans text-gray-300">Total UTXO output scripts receiving allocation.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-orange-400 font-bold">utxo_inferred_edges</td>
                    <td className="p-3 font-bold text-gray-100">{features?.utxo_inferred_edges ?? 0}</td>
                    <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                    <td className="p-3 font-sans text-gray-300">Pairwise edges expanded via multi-input clustering heuristics.</td>
                  </tr>
                </>
              ) : (
                <>
                  <tr>
                    <td className="p-3 text-purple-400 font-bold">token_transfer_count</td>
                    <td className="p-3 font-bold text-gray-100">{features?.token_transfer_count ?? 0}</td>
                    <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                    <td className="p-3 font-sans text-gray-300">Number of ERC-20 / TRC-20 smart contract token events.</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-purple-400 font-bold">contract_interaction_count</td>
                    <td className="p-3 font-bold text-gray-100">{features?.contract_interaction_count ?? 0}</td>
                    <td className="p-3 text-gray-400">Integer [0, ∞)</td>
                    <td className="p-3 font-sans text-gray-300">Observed smart contract execution transactions.</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── JSON Feature Vector Payload ──────────────────────────────────── */}
      <div className="cyber-panel p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">
            Serialized Feature Vector Payload
          </span>
          <span className="text-[10px] text-gray-500 font-mono">Input to Predictor</span>
        </div>
        <pre className="p-4 rounded-xl bg-black/80 border border-panel-border text-xs font-mono text-cyan-300 overflow-x-auto max-h-60">
          {featureVectorJson}
        </pre>
      </div>
    </div>
  );
}

