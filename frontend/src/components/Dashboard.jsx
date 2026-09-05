import React, { useEffect, useState } from 'react';
import { ArrowLeft, Trash2, Activity, Link2, Building2 } from 'lucide-react';
import { getCases, clearHistory } from '../caseHistory';

const CHAIN_COLORS = {
  ethereum: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  tron: 'text-red-400 border-red-500/30 bg-red-500/10',
  bitcoin: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
};

function StatCard({ icon: Icon, label, value, accent = 'text-cyan-400' }) {
  return (
    <div className="cyber-panel p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${accent}`} />
        <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">{label}</span>
      </div>
      <span className="text-2xl font-mono font-bold text-gray-100">{value}</span>
    </div>
  );
}

export default function Dashboard({ onBack }) {
  const [cases, setCases] = useState([]);

  useEffect(() => {
    setCases(getCases());
  }, []);

  const handleClear = () => {
    clearHistory();
    setCases([]);
  };

  const chainsCovered = new Set(cases.map((c) => c.chain));

  const destinationCounts = {};
  cases.forEach((c) => {
    if (c.top_destination?.label) {
      destinationCounts[c.top_destination.label] = (destinationCounts[c.top_destination.label] || 0) + 1;
    }
  });
  const topDestinations = Object.entries(destinationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {cases.length > 0 && (
          <button
            onClick={handleClear}
            className="text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1.5 text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear History
          </button>
        )}
      </div>

      <h2 className="text-lg font-semibold text-gray-100 mb-1">Investigation Analytics</h2>
      <p className="text-sm text-gray-500 mb-6">
        Aggregated across cases traced in this browser session. Demo traces are excluded.
      </p>

      {cases.length === 0 ? (
        <div className="cyber-panel p-8 text-center">
          <div className="text-3xl mb-3">📊</div>
          <p className="text-gray-400 text-sm">
            No traces recorded yet. Run a live trace to start building analytics.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard icon={Activity} label="Cases Traced" value={cases.length} accent="text-cyan-400" />
            <StatCard icon={Link2} label="Chains Covered" value={chainsCovered.size} accent="text-purple-400" />
            <StatCard
              icon={Building2}
              label="Total VASP Matches"
              value={cases.reduce((sum, c) => sum + (c.known_vasp_matches || 0), 0)}
              accent="text-green-400"
            />
          </div>

          {topDestinations.length > 0 && (
            <div className="cyber-panel p-4 mb-6">
              <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">
                Most Frequent Destinations
              </span>
              <div className="flex flex-col gap-2 mt-3">
                {topDestinations.map(([label, count]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-300 w-32 truncate">{label}</span>
                    <div className="flex-grow h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500/70 rounded-full"
                        style={{ width: `${(count / cases.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-gray-500 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="cyber-panel p-4">
            <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Recent Cases</span>
            <div className="flex flex-col gap-2 mt-3">
              {cases.slice(0, 10).map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${
                        CHAIN_COLORS[c.chain] || 'text-gray-400 border-gray-600/30 bg-gray-500/10'
                      }`}
                    >
                      {c.chain?.toUpperCase()}
                    </span>
                    <span className="font-mono text-gray-400 truncate">
                      {c.seed_address?.slice(0, 10)}...{c.seed_address?.slice(-6)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {c.top_destination ? (
                      <span className="text-gray-300">
                        {c.top_destination.label} ({Math.round((c.top_destination.confidence || 0) * 100)}%)
                      </span>
                    ) : (
                      <span className="text-gray-600 italic">No destination</span>
                    )}
                    <span className="text-gray-600">{new Date(c.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}