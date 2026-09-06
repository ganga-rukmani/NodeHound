import React from 'react';
import { Shield, Sparkles, Database, BarChart2, PlusCircle, ExternalLink, Activity } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import clsx from 'clsx';

export default function InvestigatorHeader({ onOpenDashboard, onNewInvestigation }) {
  const {
    traceData,
    caseMetadata,
    activeChain,
    isDemo,
    selectedAddress,
    selectAddress,
    activeSection,
    setActiveSection,
  } = useInvestigation();

  const isTraced = Boolean(traceData);

  return (
    <header className="h-14 px-5 border-b border-panel-border bg-panel/95 backdrop-blur flex items-center justify-between z-20 shrink-0 select-none">
      {/* Brand & Case Breadcrumbs */}
      <div className="flex items-center gap-4">
        <div
          onClick={onNewInvestigation}
          className="flex items-center gap-2 cursor-pointer group"
          title="NodeHound Investigator"
        >
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
            <Shield className="w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-white flex items-center">
            <span className="text-cyan-400">Node</span>Hound
          </span>
        </div>

        {isTraced && (
          <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-panel-border text-xs">
            <span className="font-mono text-cyan-400 font-semibold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              {caseMetadata.caseId}
            </span>

            <span className="text-gray-500">•</span>

            <span className="font-mono uppercase text-[11px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
              {activeChain}
            </span>

            {selectedAddress && (
              <>
                <span className="text-gray-500">•</span>
                <span className="text-gray-400 text-[11px]">Selected:</span>
                <AddressBadge address={selectedAddress} chain={activeChain} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Header Right Actions */}
      <div className="flex items-center gap-3">
        {isDemo && isTraced && (
          <span className="text-[10px] uppercase font-mono font-bold px-2 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
            <Database className="w-3 h-3" />
            Offline Demo Trace
          </span>
        )}

        {isTraced && (
          <button
            onClick={onNewInvestigation}
            className="cyber-button-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            title="Start a new investigation"
          >
            <PlusCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">New Trace</span>
          </button>
        )}

        <button
          onClick={onOpenDashboard}
          className="cyber-button-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 text-gray-300 hover:text-cyan-300"
          title="Case History Dashboard"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </button>
      </div>
    </header>
  );
}

