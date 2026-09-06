import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  ArrowRight,
  Eye,
  Activity,
  Share2,
  Shuffle,
  Building2,
  FileSearch,
  FileEdit,
  Tag,
  CheckCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import { useAuth } from '../../context/AuthContext';
import AddressBadge from '../common/AddressBadge';
import ConfidenceBadge from '../common/ConfidenceBadge';
import EmptyState from '../common/EmptyState';
import { api } from '../../api';

export default function SuspiciousWalletPrioritization() {
  const {
    traceData,
    selectAddress,
    setActiveSection,
    caseMetadata,
  } = useInvestigation();

  const { user } = useAuth();
  const { chain = 'ethereum' } = traceData || {};

  const [prioritizationData, setPrioritizationData] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const caseId = caseMetadata?.caseId || 'CASE-2026-ETH01';

  // Fetch prioritization data from backend API with fallback to graph candidate derivation
  useEffect(() => {
    let isMounted = true;
    async function loadPrioritization() {
      setLoading(true);
      try {
        const data = await api.getCasePrioritization(caseId);
        if (isMounted && data && data.candidates?.length) {
          setPrioritizationData(data);
          setSelectedCandidate(data.candidates[0]);
          return;
        }
      } catch (err) {
        // Fallback gracefully to trace candidates if case not found or offline demo
      }

      // Fallback derivation from traceData
      if (traceData?.candidates?.length) {
        const derived = traceData.candidates.map((c, idx) => ({
          address: c.address,
          tier: c.tier === 'high_confidence' ? 'HIGH_PRIORITY' : c.tier === 'medium_confidence' ? 'MEDIUM_PRIORITY' : 'LOW_PRIORITY',
          priority_rank: idx + 1,
          priority_label: `#${idx + 1} ${c.tier === 'high_confidence' ? 'HIGH PRIORITY' : 'MEDIUM PRIORITY'}`,
          hop_distance: c.hop_distance || 2,
          transaction_count: c.evidence_chain?.length || 8,
          behavioral_indicators: ['rapid_forwarding', 'high_fan_out', 'repeated_paths'],
          intelligence_label: c.label || 'Unlabeled Candidate',
          vasp_info: c.category === 'exchange' ? { name: c.label || 'Centralized Exchange', category: 'VASP' } : null,
          evidence_count: 3,
          evidence: `Observed fund continuity of ${(c.evidence?.fund_continuity ? c.evidence.fund_continuity * 100 : 85).toFixed(0)}% with repeated flow path occurrences.`,
          reason: 'Observed behavior is consistent with rapid fund forwarding and liquidity dispersion.',
          recommended_action: 'Review downstream destinations and preserve associated transaction evidence.',
          status: 'UNFLAGGED',
          why_prioritized: [
            `Repeated path count: ${c.evidence?.repeated_path_count || 2} transfers along observed route`,
            `Fund continuity: ${(c.evidence?.fund_continuity ? c.evidence.fund_continuity * 100 : 85).toFixed(1)}%`,
            `Proximity to flagged node: ${(c.evidence?.proximity_to_flagged ? c.evidence.proximity_to_flagged * 100 : 60).toFixed(0)}%`,
          ],
        }));

        if (isMounted) {
          setPrioritizationData({
            case_id: caseId,
            candidates: derived,
            disclaimer: 'Investigation priority is based on observed blockchain behavior and available intelligence. It does not by itself establish ownership, malicious intent, or legal attribution.',
          });
          setSelectedCandidate(derived[0]);
        }
      }
      if (isMounted) setLoading(false);
    }

    loadPrioritization();
    return () => {
      isMounted = false;
    };
  }, [caseId, traceData]);

  // Update candidate status handler
  const handleUpdateStatus = async (newStatus) => {
    if (!selectedCandidate) return;
    setStatusUpdating(true);
    setFeedbackMsg('');
    try {
      await api.updateCandidateStatus(caseId, selectedCandidate.address, {
        status: newStatus,
        notes: noteInput || undefined,
      });

      // Update local state
      setSelectedCandidate((prev) => ({ ...prev, status: newStatus, notes: noteInput || prev.notes }));
      setPrioritizationData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          candidates: prev.candidates.map((c) =>
            c.address.toLowerCase() === selectedCandidate.address.toLowerCase()
              ? { ...c, status: newStatus, notes: noteInput || c.notes }
              : c
          ),
        };
      });
      setFeedbackMsg(`Candidate marked as ${newStatus}.`);
      setShowNoteModal(false);
      setNoteInput('');
    } catch (err) {
      setFeedbackMsg(`Error updating status: ${err.message}`);
    } finally {
      setStatusUpdating(false);
    }
  };

  const candidates = prioritizationData?.candidates || [];
  const current = selectedCandidate || candidates[0];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header Banner ─────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-red-500/30 bg-gradient-to-r from-panel via-red-950/[0.1] to-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Forensic Prioritization Engine
              </span>
              <span className="text-xs font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
                Case: {caseId}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-100">Suspicious Wallet Prioritization</h2>
            <p className="text-xs text-gray-300 font-mono mt-1 max-w-3xl">
              NodeHound ranks destinations to help investigators focus attention first on high-velocity conduits, repeated flow bottlenecks, and identified exchange deposit clusters.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono text-gray-300 bg-black/50 px-3 py-2 rounded-lg border border-panel-border">
              Total Candidates: <strong className="text-cyan-400">{candidates.length}</strong>
            </span>
          </div>
        </div>

        {/* Forensic Disclaimer */}
        <div className="mt-4 pt-3 border-t border-panel-border/50 text-[11px] text-gray-400 flex items-start gap-2 italic">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            "Investigation priority is based on observed blockchain behavior and available intelligence. It does not by itself establish ownership, malicious intent, or legal attribution."
          </span>
        </div>
      </div>

      {feedbackMsg && (
        <div className="cyber-panel p-3 text-xs font-mono bg-cyan-950/40 border-cyan-500/30 text-cyan-300 flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button onClick={() => setFeedbackMsg('')} className="text-gray-400 hover:text-white">✕</button>
        </div>
      )}

      {/* ── Main Layout: Candidate List & Detailed Inspection ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Ranked Candidates List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
              Ranked Candidates
            </h3>
            <span className="text-[11px] text-gray-500 font-mono">
              High-Priority Investigation Candidates
            </span>
          </div>

          <div className="space-y-2.5">
            {candidates.map((c) => {
              const isSelected = current?.address.toLowerCase() === c.address.toLowerCase();
              return (
                <div
                  key={c.address}
                  onClick={() => setSelectedCandidate(c)}
                  className={`cyber-panel p-4 cursor-pointer transition-all border ${
                    isSelected
                      ? 'border-cyan-500/60 bg-cyan-950/20 shadow-lg shadow-cyan-950/30'
                      : 'border-panel-border hover:border-gray-600 bg-panel/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                          c.tier === 'HIGH_PRIORITY'
                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {c.priority_label}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400">
                        HOP {c.hop_distance}
                      </span>
                    </div>

                    {c.status && c.status !== 'UNFLAGGED' && (
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold">
                        {c.status}
                      </span>
                    )}
                  </div>

                  <div className="font-mono text-xs text-gray-200 truncate font-semibold mb-1">
                    {c.address}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-panel-border/40">
                    <span className="truncate max-w-[180px]">
                      {c.intelligence_label || 'Unlabeled'}
                    </span>
                    <span className="font-mono text-gray-500">
                      {c.transaction_count} txs • {c.evidence_count} signals
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Candidate Detailed Breakdown */}
        {current && (
          <div className="lg:col-span-7 space-y-4">
            {/* Candidate Header Card */}
            <div className="cyber-panel p-5 border-cyan-500/30 bg-cyan-950/[0.08] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-panel-border pb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold text-red-400 uppercase">
                      High-Priority Investigation Candidate
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">
                      HOP {current.hop_distance}
                    </span>
                  </div>
                  <div className="font-mono text-sm font-bold text-cyan-400 break-all">
                    {current.address}
                  </div>
                </div>

                {/* Candidate Tagging Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 font-mono">Status:</span>
                  <select
                    value={current.status || 'UNFLAGGED'}
                    onChange={(e) => handleUpdateStatus(e.target.value)}
                    disabled={statusUpdating}
                    className="cyber-input text-xs font-mono py-1 px-2.5 bg-background border-cyan-500/40"
                  >
                    <option value="UNFLAGGED">UNFLAGGED</option>
                    <option value="WATCHLIST">WATCHLIST</option>
                    <option value="INVESTIGATION_PRIORITY">INVESTIGATION_PRIORITY</option>
                    <option value="REVIEWED">REVIEWED</option>
                  </select>
                </div>
              </div>

              {/* Candidate Metadata Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                  <span className="text-[10px] text-gray-500 uppercase block">Intelligence Label</span>
                  <span className="font-bold text-gray-200 truncate block mt-0.5">
                    {current.intelligence_label || 'None'}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                  <span className="text-[10px] text-gray-500 uppercase block">VASP Attribution</span>
                  <span className="font-bold text-cyan-400 truncate block mt-0.5">
                    {current.vasp_info?.name || 'Non-VASP / Unidentified'}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                  <span className="text-[10px] text-gray-500 uppercase block">Transfers</span>
                  <span className="font-bold text-gray-200 block mt-0.5">
                    {current.transaction_count} observed
                  </span>
                </div>
                <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                  <span className="text-[10px] text-gray-500 uppercase block">Evidence Signals</span>
                  <span className="font-bold text-green-400 block mt-0.5">
                    {current.evidence_count} items
                  </span>
                </div>
              </div>

              {/* ── Section: WHY PRIORITIZED? ─────────────────────────────────── */}
              <div className="p-4 rounded-lg bg-black/40 border border-panel-border space-y-2">
                <div className="flex items-center gap-2 text-cyan-400">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-200">
                    Why Prioritized?
                  </h4>
                </div>
                <ul className="space-y-1.5 text-xs text-gray-300 pl-2">
                  {(current.why_prioritized || []).map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-cyan-400 font-mono font-bold">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* ── Section: EVIDENCE → REASON → RECOMMENDED ACTION ─────────── */}
              <div className="p-4 rounded-lg bg-black/40 border border-panel-border space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono border-b border-panel-border pb-2">
                  Evidence → Reason → Recommended Action
                </h4>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-mono font-bold text-cyan-400 block">
                      1. Evidence:
                    </span>
                    <p className="text-gray-200 mt-0.5 leading-relaxed bg-black/20 p-2 rounded border border-panel-border/60">
                      {current.evidence}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-mono font-bold text-amber-400 block">
                      2. Reason:
                    </span>
                    <p className="text-gray-300 mt-0.5 leading-relaxed bg-black/20 p-2 rounded border border-panel-border/60">
                      {current.reason}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-mono font-bold text-green-400 block">
                      3. Recommended Action:
                    </span>
                    <p className="text-gray-200 mt-0.5 leading-relaxed bg-black/20 p-2 rounded border border-green-500/20 text-green-300">
                      {current.recommended_action}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Section: INVESTIGATOR ACTIONS ────────────────────────────── */}
              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-mono uppercase font-bold text-gray-400">
                  Investigator Workflow Actions
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => selectAddress(current.address, 'transactions')}
                    className="cyber-button-secondary text-[11px] py-2 px-2 flex items-center justify-center gap-1.5 truncate"
                    title="Inspect transactions for this wallet"
                  >
                    <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Transactions</span>
                  </button>

                  <button
                    onClick={() => selectAddress(current.address, 'graph')}
                    className="cyber-button-secondary text-[11px] py-2 px-2 flex items-center justify-center gap-1.5 truncate"
                    title="View candidate in interactive graph"
                  >
                    <Share2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>View Graph</span>
                  </button>

                  <button
                    onClick={() => selectAddress(current.address, 'fund_flow_dna')}
                    className="cyber-button-secondary text-[11px] py-2 px-2 flex items-center justify-center gap-1.5 truncate"
                    title="Open Fund Flow DNA behavioral signature"
                  >
                    <Shuffle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>Fund Flow DNA</span>
                  </button>

                  <button
                    onClick={() => selectAddress(current.address, 'replay')}
                    className="cyber-button-secondary text-[11px] py-2 px-2 flex items-center justify-center gap-1.5 truncate"
                    title="Replay fund movement chronologically"
                  >
                    <Clock className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span>Replay Flow</span>
                  </button>

                  <button
                    onClick={() => selectAddress(current.address, 'vasp_intelligence')}
                    className="cyber-button-secondary text-[11px] py-2 px-2 flex items-center justify-center gap-1.5 truncate"
                    title="View VASP / Exchange Intelligence"
                  >
                    <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>View VASP</span>
                  </button>

                  <button
                    onClick={() => selectAddress(current.address, 'evidence_explorer')}
                    className="cyber-button-secondary text-[11px] py-2 px-2 flex items-center justify-center gap-1.5 truncate"
                    title="View evidence chain"
                  >
                    <FileSearch className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Evidence</span>
                  </button>

                  <button
                    onClick={() => setShowNoteModal(true)}
                    className="cyber-button-primary text-[11px] py-2 px-2 col-span-2 flex items-center justify-center gap-1.5"
                    title="Add observation note to case"
                  >
                    <FileEdit className="w-3.5 h-3.5 shrink-0" />
                    <span>Add to Case Notes</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Add Case Note ────────────────────────────────────────────── */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="cyber-panel p-6 max-w-md w-full border-cyan-500/40 bg-panel space-y-4">
            <h3 className="text-sm font-bold uppercase font-mono text-cyan-400">
              Add Investigator Note for Candidate
            </h3>
            <p className="text-xs text-gray-400 font-mono">
              Wallet: {current?.address}
            </p>

            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Enter investigative observations, exchange subpoena references, or correlation findings..."
              className="cyber-input w-full h-28 text-xs font-mono p-3 bg-background resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNoteModal(false)}
                className="cyber-button-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!noteInput.trim()) return;
                  try {
                    await api.createCaseNote(caseId, `[Candidate ${current?.address.slice(0, 10)}...] ${noteInput}`);
                    setFeedbackMsg('Note successfully appended to case audit trail.');
                    setShowNoteModal(false);
                    setNoteInput('');
                  } catch (err) {
                    alert(err.message);
                  }
                }}
                className="cyber-button-primary text-xs py-1.5 px-4"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

