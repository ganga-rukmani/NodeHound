import React, { useState, useMemo } from 'react';
import { Play, AlertCircle, CheckCircle2, XCircle, Sparkles, Database } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';

export default function NewInvestigation({ onStartTrace, onLoadDemo, isLoading }) {
  const { caseMetadata, setCaseMetadata } = useInvestigation();

  const [address, setAddress] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [maxHops, setMaxHops] = useState(1);
  const [startTime, setStartTime] = useState('2024-01-01');
  const [endTime, setEndTime] = useState('2024-01-02');

  // Investigation options
  const [includeTokens, setIncludeTokens] = useState(true);
  const [includeContracts, setIncludeContracts] = useState(true);
  const [includeLabels, setIncludeLabels] = useState(true);
  const [includeRisk, setIncludeRisk] = useState(true);
  const [includeTypology, setIncludeTypology] = useState(true);

  // Address validation
  const validation = useMemo(() => {
    const trimmed = address.trim();
    if (!trimmed) {
      return { status: 'empty', message: 'Enter a wallet address to begin validation' };
    }

    const isEth = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
    const isTron = /^T[a-zA-HJ-NP-Z0-9]{33}$/.test(trimmed);
    const isBtc = /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,62})$/.test(trimmed);

    let detectedChain = 'unknown';
    if (isEth) detectedChain = 'ethereum';
    else if (isTron) detectedChain = 'tron';
    else if (isBtc) detectedChain = 'bitcoin';

    const isValidForSelected =
      (chain === 'ethereum' && isEth) ||
      (chain === 'tron' && isTron) ||
      (chain === 'bitcoin' && isBtc);

    return {
      status: isValidForSelected ? 'valid' : detectedChain !== 'unknown' ? 'mismatch' : 'invalid',
      detectedChain,
      normalized: isEth ? trimmed.toLowerCase() : trimmed,
      message: isValidForSelected
        ? `Valid ${chain.toUpperCase()} address recognized`
        : detectedChain !== 'unknown'
        ? `Format matches ${detectedChain.toUpperCase()}, but current network is ${chain.toUpperCase()}`
        : `Invalid address format for ${chain.toUpperCase()}`,
    };
  }, [address, chain]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!address.trim()) return;

    onStartTrace({
      address: validation.normalized || address.trim(),
      chain,
      maxHops: parseInt(maxHops, 10) || 3,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      options: {
        includeTokens,
        includeContracts,
        includeLabels,
        includeRisk,
        includeTypology,
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8 animate-fade-in">
      {/* Top Banner / Explanation */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-cyan-950/[0.08] relative overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-gray-100">Automated Blockchain Forensic Trace</h2>
            <p className="text-xs text-gray-300 leading-relaxed max-w-2xl">
              NodeHound will trace the selected wallet, analyze fund movement, enrich addresses using verified intelligence, detect suspicious behavior, rank candidate addresses, and generate evidence.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Case Information */}
        <div className="cyber-panel p-6 space-y-4">
          <div className="border-b border-panel-border pb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
              1. Case & Investigator Metadata
            </h3>
            <span className="text-[11px] text-gray-500 font-mono">Forensic Audit Log</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">Case Reference / ID</label>
              <input
                type="text"
                value={caseMetadata.caseId}
                onChange={(e) => setCaseMetadata({ ...caseMetadata, caseId: e.target.value })}
                className="cyber-input w-full text-xs font-mono"
                placeholder="CASE-2026-001"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">Case Title</label>
              <input
                type="text"
                value={caseMetadata.caseTitle}
                onChange={(e) => setCaseMetadata({ ...caseMetadata, caseTitle: e.target.value })}
                className="cyber-input w-full text-xs"
                placeholder="Operation Flow Trace"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">Investigator ID / Badge</label>
              <input
                type="text"
                value={caseMetadata.investigatorId}
                onChange={(e) => setCaseMetadata({ ...caseMetadata, investigatorId: e.target.value })}
                className="cyber-input w-full text-xs font-mono"
                placeholder="INV-9104"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 font-medium">Investigation Notes / Scope</label>
            <textarea
              rows={2}
              value={caseMetadata.notes}
              onChange={(e) => setCaseMetadata({ ...caseMetadata, notes: e.target.value })}
              className="cyber-input w-full text-xs"
              placeholder="Record initial suspicion grounds, incident details, or judicial mandate..."
            />
          </div>
        </div>

        {/* Section 2: Target Wallet & Chain Selection */}
        <div className="cyber-panel p-6 space-y-5">
          <div className="border-b border-panel-border pb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
              2. Target Wallet & Blockchain
            </h3>
            <span className="text-[11px] text-cyan-400 font-mono">Live Ingestion</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs text-gray-400 font-medium flex items-center justify-between">
                <span>Seed Wallet Address</span>
                {validation.status === 'valid' && (
                  <span className="text-green-400 text-[11px] flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Valid Format
                  </span>
                )}
                {validation.status === 'invalid' && (
                  <span className="text-red-400 text-[11px] flex items-center gap-1 font-mono">
                    <XCircle className="w-3.5 h-3.5" /> Invalid Format
                  </span>
                )}
                {validation.status === 'mismatch' && (
                  <span className="text-yellow-400 text-[11px] flex items-center gap-1 font-mono">
                    <AlertCircle className="w-3.5 h-3.5" /> Network Mismatch
                  </span>
                )}
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter 0x... / T... / bc1..."
                className="cyber-input w-full font-mono text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">Blockchain Network</label>
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value)}
                className="cyber-input w-full text-xs capitalize bg-background"
              >
                <option value="ethereum">Ethereum (ETH / ERC-20)</option>
                <option value="tron">TRON (TRX / TRC-20)</option>
                <option value="bitcoin">Bitcoin (BTC / UTXO)</option>
              </select>
            </div>
          </div>

          {/* Real-time Address Recognition Box */}
          {address.trim() && (
            <div className="p-3.5 rounded-lg bg-black/40 border border-panel-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Chain Recognition</span>
                <span className="font-mono text-gray-200 capitalize">
                  {validation.detectedChain !== 'unknown' ? validation.detectedChain : 'Unrecognized'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Address Type</span>
                <span className="font-mono text-gray-200">Wallet / Contract</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Known Label</span>
                <span className="font-mono text-gray-400">Unknown (pre-trace)</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Status</span>
                <span
                  className={
                    validation.status === 'valid'
                      ? 'text-green-400 font-medium'
                      : validation.status === 'mismatch'
                      ? 'text-yellow-400 font-medium'
                      : 'text-red-400 font-medium'
                  }
                >
                  {validation.status === 'valid' ? 'Ready to Trace' : validation.status === 'mismatch' ? 'Switch Network' : 'Invalid'}
                </span>
              </div>
            </div>
          )}

          {chain === 'bitcoin' && (
            <div className="p-3 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Bitcoin tracing includes UTXO graph expansion, Common-Input-Ownership clustering, and GraphSense labels. Note: ML risk models are chain-specific.
              </span>
            </div>
          )}
        </div>

        {/* Section 3: Parameters & Options */}
        <div className="cyber-panel p-6 space-y-4">
          <div className="border-b border-panel-border pb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
              3. Trace Parameters & Options
            </h3>
            <span className="text-[11px] text-gray-500 font-mono">Traversal Depth</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">Maximum Hop Depth</label>
              <input
                type="number"
                min={1}
                max={6}
                value={maxHops}
                onChange={(e) => setMaxHops(e.target.value)}
                className="cyber-input w-full text-xs font-mono"
              />
              <span className="text-[10px] text-gray-500">Recommended: 3–4 hops for fast live response</span>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">Start Date</label>
              <input
                type="date"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="cyber-input w-full text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium">End Date</label>
              <input
                type="date"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="cyber-input w-full text-xs"
              />
            </div>
          </div>

          {/* Quick Date Presets & BigQuery Hint */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pb-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-mono">Date Presets:</span>
              <button
                type="button"
                onClick={() => { setStartTime('2024-01-01'); setEndTime('2024-01-02'); setMaxHops(1); }}
                className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-[10px] text-cyan-400 hover:bg-cyan-900/60"
              >
                1-Day (2024-01-01 / Fast)
              </button>
              <button
                type="button"
                onClick={() => { setStartTime('2024-01-01'); setEndTime('2024-01-07'); setMaxHops(1); }}
                className="px-2 py-0.5 rounded bg-panel-bg border border-panel-border text-[10px] text-gray-300 hover:text-white"
              >
                7-Days (2024-01-01 to 07)
              </button>
              <button
                type="button"
                onClick={() => { setStartTime(''); setEndTime(''); }}
                className="px-2 py-0.5 rounded bg-panel-bg border border-panel-border text-[10px] text-gray-400 hover:text-white"
              >
                Clear (Full History)
              </button>
            </div>
            <span className="text-[10px] text-emerald-400/90 font-mono">
              ✓ Bounded dates keep BigQuery scan &lt;0.5 GB (Free Tier Safe)
            </span>
          </div>

          <div className="pt-2 border-t border-panel-border/50">
            <span className="text-[11px] uppercase font-semibold text-gray-400 tracking-wider block mb-3">
              Included Forensic Pipelines
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none text-gray-300">
                <input
                  type="checkbox"
                  checked={includeTokens}
                  onChange={(e) => setIncludeTokens(e.target.checked)}
                  className="rounded bg-black border-panel-border text-cyan-500 focus:ring-0"
                />
                <span>Token Transfers</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-gray-300">
                <input
                  type="checkbox"
                  checked={includeContracts}
                  onChange={(e) => setIncludeContracts(e.target.checked)}
                  className="rounded bg-black border-panel-border text-cyan-500 focus:ring-0"
                />
                <span>Contract Interactions</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-gray-300">
                <input
                  type="checkbox"
                  checked={includeLabels}
                  onChange={(e) => setIncludeLabels(e.target.checked)}
                  className="rounded bg-black border-panel-border text-cyan-500 focus:ring-0"
                />
                <span>Labelled Intelligence</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-gray-300">
                <input
                  type="checkbox"
                  checked={includeRisk}
                  onChange={(e) => setIncludeRisk(e.target.checked)}
                  className="rounded bg-black border-panel-border text-cyan-500 focus:ring-0"
                />
                <span>Behavioral Risk Analysis</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-gray-300">
                <input
                  type="checkbox"
                  checked={includeTypology}
                  onChange={(e) => setIncludeTypology(e.target.checked)}
                  className="rounded bg-black border-panel-border text-cyan-500 focus:ring-0"
                />
                <span>Typology Detection</span>
              </label>
            </div>
          </div>
        </div>

        {/* Information tip */}
        <div className="p-3 rounded-lg bg-black/30 border border-panel-border/60 text-xs text-gray-400 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-gray-200">Note:</span> Live tracing queries external nodes (BigQuery / TronGrid). If cloud credentials are not configured on this machine, click <strong className="text-cyan-300">Load Offline Demo Trace</strong> to explore the full 18-module platform with complete sample data.
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
          <button
            type="submit"
            disabled={!address.trim() || isLoading}
            className="cyber-button-primary w-full sm:w-auto flex-1 py-3 px-6 text-sm flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            {isLoading ? 'Tracing Blockchain Graph...' : 'Start Investigation'}
          </button>

          <button
            type="button"
            onClick={() => onLoadDemo(chain)}
            className="cyber-button-secondary w-full sm:w-auto py-3 px-5 text-sm flex items-center justify-center gap-2 text-gray-300 hover:text-cyan-300"
          >
            <Database className="w-4 h-4" />
            Load Offline Demo Trace ({chain.toUpperCase()})
          </button>
        </div>
      </form>
    </div>
  );
}
