import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, Play } from 'lucide-react';
import clsx from 'clsx';

export default function Landing({ onTrace, onLoadDemo }) {
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxHops, setMaxHops] = useState(4);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const handleTrace = () => {
    if (!address.trim()) return;

    onTrace({
      address: address.trim(),
      chain,
      maxHops,
      startTime,
      endTime
    });
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-12 flex flex-col gap-6">
      <div className="cyber-panel p-8">
        <h2 className="text-xl font-semibold text-white mb-6">Start a New Trace</h2>
        
        <div className="flex flex-col gap-5">
          {/* Address Input */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-400">Target Wallet Address</label>
            <input 
              type="text" 
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..." 
              className="cyber-input w-full"
            />
          </div>

          {/* Chain Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-400">Blockchain Network</label>
            <select 
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="cyber-input w-full bg-background"
            >
              <option value="ethereum">Ethereum</option>
              <option value="tron">Tron</option>
              <option value="bitcoin">Bitcoin</option>
            </select>
          </div>

          {/* Bitcoin note - informational only, not a blocker. Bitcoin
              tracing is live (ingestion + CIOH clustering + GraphSense
              labels), but ML risk scoring isn't available for this chain
              yet since the trained model uses Ethereum-specific features. */}
          {chain === 'bitcoin' && (
            <div className="flex items-start gap-3 p-4 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 mt-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm">
                Bitcoin tracing is live but experimental — risk scoring isn't available yet for this chain, and traces may take longer than Ethereum/Tron.
              </p>
            </div>
          )}

          {/* Advanced Options */}
          <div className="border border-panel-border rounded-md overflow-hidden mt-2">
            <button 
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-gray-300"
            >
              <span>Advanced Options</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showAdvanced && (
              <div className="p-4 bg-black/20 flex flex-col gap-4 border-t border-panel-border">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-gray-400">Max Hops</label>
                  <input 
                    type="number" 
                    value={maxHops}
                    onChange={(e) => setMaxHops(parseInt(e.target.value) || 1)}
                    min={1}
                    max={10}
                    className="cyber-input w-full text-sm"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-400">Start Time (Optional)</label>
                    <input 
                      type="date" 
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="cyber-input w-full text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-400">End Time (Optional)</label>
                    <input 
                      type="date" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="cyber-input w-full text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-4">
            <button 
              onClick={handleTrace}
              disabled={!address.trim()}
              className="w-full flex items-center justify-center gap-2 cyber-button-primary py-3 text-lg"
            >
              <Play className="w-5 h-5" />
              Trace
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center mt-4">
        <button 
          onClick={() => onLoadDemo(chain)}
          className="cyber-button-secondary text-sm flex items-center gap-2 text-gray-400 hover:text-cyan-400"
        >
          Load Demo Trace
        </button>
      </div>
    </div>
  );
}