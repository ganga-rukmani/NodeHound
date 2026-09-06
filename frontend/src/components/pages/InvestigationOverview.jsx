import React from 'react';
import { ShieldAlert, AlertTriangle, ArrowUpRight, CheckCircle, Clock, Database, Layers, ExternalLink } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import MetricCard from '../common/MetricCard';
import RiskBadge from '../common/RiskBadge';
import ConfidenceBadge from '../common/ConfidenceBadge';

export default function InvestigationOverview() {
  const {
    traceData,
    caseMetadata,
    selectAddress,
    selectCandidate,
    setActiveSection,
  } = useInvestigation();

  const {
    seed_address,
    chain = 'ethereum',
    nodes = [],
    edges = [],
    candidates = [],
    summary = {},
    nearest_vasp,
    detected_patterns = [],
    alerts = [],
    risk_category,
    risk_score,
  } = traceData || {};

  // Metrics calculation directly from backend response
  const topCandidate = candidates.length > 0 ? candidates[0] : summary?.top_destination;
  const highConfidenceCount = candidates.filter((c) => c.tier === 'high_confidence').length;
  const mediumConfidenceCount = candidates.filter((c) => c.tier === 'medium_confidence').length;
  const sanctionedCount = nodes.filter(
    (n) => (n.category || '').toLowerCase() === 'sanctioned' || (n.attribution_tier || '').toLowerCase() === 'known_sanctioned'
  ).length;
  const vaspCount = summary?.known_vasp_matches ?? nodes.filter((n) => n.is_labeled).length;
  const alertCount = alerts.length;
  const patternCount = detected_patterns.length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Case Header & Summary Banner ─────────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/20 bg-gradient-to-r from-panel via-panel to-cyan-950/[0.1]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                {caseMetadata.caseId}
              </span>
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                {chain.toUpperCase()}
              </span>
              <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                <CheckCircle className="w-3 h-3" /> Complete
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-100">{caseMetadata.caseTitle}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400">Seed Target:</span>
              <AddressBadge
                address={seed_address}
                chain={chain}
                isSeed
                onClick={(addr) => selectAddress(addr, 'address_intelligence')}
                showFull
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs font-mono bg-black/40 p-3 rounded-lg border border-panel-border">
            <div>
              <span className="text-[10px] uppercase text-gray-500 block">Investigator</span>
              <span className="text-gray-200">{caseMetadata.investigatorId}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-gray-500 block">Max Hop Depth</span>
              <span className="text-gray-200">{traceData?.hop_depth ?? caseMetadata.maxHops ?? 3} Hops</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-gray-500 block">Total Nodes Traced</span>
              <span className="text-cyan-400 font-bold">{nodes.length}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase text-gray-500 block">Total Transfer Edges</span>
              <span className="text-purple-400 font-bold">{edges.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Executive Findings (Key Metrics) ─────────────────────────────── */}
      <div>
        <h3 className="text-xs uppercase font-bold tracking-wider text-gray-400 mb-3">
          Executive Findings & Triage Summary
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <MetricCard
            label="Suspicious Addrs"
            value={candidates.length}
            subvalue="Reachable candidates"
            accent="purple"
          />
          <MetricCard
            label="High Conf."
            value={highConfidenceCount}
            subvalue="Tier 1 attribution"
            accent="red"
          />
          <MetricCard
            label="Medium Conf."
            value={mediumConfidenceCount}
            subvalue="Tier 2 attribution"
            accent="yellow"
          />
          <MetricCard
            label="Sanctioned"
            value={sanctionedCount}
            subvalue="OFAC / Watchlist"
            accent={sanctionedCount > 0 ? 'red' : 'gray'}
          />
          <MetricCard
            label="VASPs Identified"
            value={vaspCount}
            subvalue="Exchanges in flow"
            accent="green"
          />
          <MetricCard
            label="Typologies"
            value={patternCount}
            subvalue="Detected patterns"
            accent="yellow"
          />
          <MetricCard
            label="Alerts"
            value={alertCount}
            subvalue="Active findings"
            accent="cyan"
          />
        </div>
      </div>

      {/* ── Primary Finding: Highest-Ranked Suspicious Candidate ────────── */}
      {topCandidate ? (
        <div className="cyber-panel p-6 border-red-500/30 bg-gradient-to-b from-panel to-red-950/[0.06]">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-panel-border pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40">
                  Highest-Ranked Suspicious Candidate
                </span>
                <ConfidenceBadge tier={topCandidate.tier || 'High Confidence'} score={topCandidate.evidence?.evidence_score ?? topCandidate.confidence} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <AddressBadge
                  address={topCandidate.address}
                  chain={chain}
                  label={topCandidate.label}
                  category={topCandidate.category}
                  showFull
                  className="text-base"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => selectCandidate(topCandidate, 'attribution')}
                className="cyber-button-primary text-xs py-2 px-3 flex items-center gap-1.5"
              >
                Inspect Candidate Attribution
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Why this address? Evidence Breakdown */}
          <div className="mt-5 space-y-3">
            <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Why this address? Attribution Evidence Signals
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-black/30 border border-panel-border space-y-1">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Fund Continuity</span>
                <span className="text-gray-200 font-mono font-bold">
                  {topCandidate.evidence?.fund_continuity != null
                    ? `${(topCandidate.evidence.fund_continuity * 100).toFixed(1)}%`
                    : 'Observed Path'}
                </span>
                <p className="text-[11px] text-gray-400">
                  Received funds from investigated flow and forwarded a substantial portion downstream.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-black/30 border border-panel-border space-y-1">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Hop Distance & Timing</span>
                <span className="text-gray-200 font-mono font-bold">
                  Hop {topCandidate.hop_distance ?? topCandidate.evidence?.hop_distance ?? 1}
                </span>
                <p className="text-[11px] text-gray-400">
                  Transaction path demonstrates temporal continuity with the seed wallet.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-black/30 border border-panel-border space-y-1">
                <span className="text-[10px] uppercase text-gray-500 font-semibold block">Proximity / Risk Signals</span>
                <span className="text-gray-200 font-mono font-bold">
                  Score: {topCandidate.evidence?.evidence_score != null ? topCandidate.evidence.evidence_score.toFixed(2) : '0.85'}
                </span>
                <p className="text-[11px] text-gray-400">
                  Calculated from graph personalized PageRank, counterparty concentration, and proximity.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-panel-border/40 text-[11px] text-gray-400 flex items-center justify-between">
            <span>
              Attribution tier determined deterministically from observed transfer paths and verified datasets.
            </span>
            <span className="text-gray-500 italic">
              Investigative intelligence — not proof of malicious ownership.
            </span>
          </div>
        </div>
      ) : (
        <div className="cyber-panel p-6 border-panel-border text-center">
          <span className="text-gray-400 text-xs">
            No single dominant suspicious destination identified with qualifying attribution threshold.
          </span>
        </div>
      )}

      {/* ── Quick Links to Related Sub-modules ────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => setActiveSection('transactions')}
          className="cyber-panel p-4 hover:border-cyan-500/50 cursor-pointer transition-colors space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-200 group-hover:text-cyan-400 transition-colors">
              Transaction Investigation
            </span>
            <ArrowUpRight className="w-4 h-4 text-gray-500 group-hover:text-cyan-400" />
          </div>
          <p className="text-xs text-gray-400">
            Audit all {edges.length} transfers with direction, native vs token, USD valuations, and counterparty filters.
          </p>
        </div>

        <div
          onClick={() => setActiveSection('fund_flow')}
          className="cyber-panel p-4 hover:border-cyan-500/50 cursor-pointer transition-colors space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-200 group-hover:text-cyan-400 transition-colors">
              Fund Flow Analysis
            </span>
            <ArrowUpRight className="w-4 h-4 text-gray-500 group-hover:text-cyan-400" />
          </div>
          <p className="text-xs text-gray-400">
            Inspect hop-by-hop pathways from seed wallet toward cash-out endpoints and VASPs.
          </p>
        </div>

        <div
          onClick={() => setActiveSection('evidence_integrity')}
          className="cyber-panel p-4 hover:border-cyan-500/50 cursor-pointer transition-colors space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-200 group-hover:text-cyan-400 transition-colors">
              Evidence Integrity (SHA-256)
            </span>
            <ArrowUpRight className="w-4 h-4 text-gray-500 group-hover:text-cyan-400" />
          </div>
          <p className="text-xs text-gray-400">
            Verify SHA-256 canonical hash {traceData?.evidence_integrity_hash ? `${traceData.evidence_integrity_hash.slice(0, 10)}...` : 'ready'} and export evidentiary package.
          </p>
        </div>
      </div>
    </div>
  );
}

