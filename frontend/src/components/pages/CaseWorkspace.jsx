import React, { useState, useEffect } from 'react';
import {
  FolderLock,
  ArrowLeft,
  Clock,
  FileEdit,
  ShieldCheck,
  Send,
  UserCheck,
  History,
  Tag,
  AlertTriangle,
  ChevronRight,
  Activity,
  Layers,
  Share2,
  Cpu,
  FileSearch,
  FileText,
  Building2,
  Plus,
  Info,
} from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

// Child tab views
import SuspiciousWalletPrioritization from './SuspiciousWalletPrioritization';
import FundFlowDna from './FundFlowDna';
import InvestigationReplay from './InvestigationReplay';

export default function CaseWorkspace({ caseObj, onBack }) {
  const { user, isSupervisor, isInvestigator } = useAuth();
  const { setActiveSection, setCaseMetadata } = useInvestigation();

  const [activeTab, setActiveTab] = useState('overview');
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Supervisor Review Modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState('APPROVED');
  const [reviewComments, setReviewComments] = useState('');

  // Case Close Modal state
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closureReason, setClosureReason] = useState('');

  const currentCase = caseObj || {
    case_id: 'CASE-2026-ETH01',
    title: 'Operation Tether Flow',
    description: 'Multi-hop fund routing investigation tracking suspected illicit liquidation.',
    blockchain: 'ethereum',
    seed_address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    victim_wallet: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    assigned_investigator: 'usr_inv_101',
    creator_name: 'Officer Alex Vance',
    assignee_name: 'Officer Alex Vance',
    supervisor_id: 'usr_sup_001',
    priority: 'HIGH',
    status: 'ACTIVE',
    classification: 'CONFIDENTIAL',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-06T14:30:00Z',
    hop_count: 3,
  };

  // Load timeline and notes for case
  useEffect(() => {
    let isMounted = true;
    async function loadTimelineAndNotes() {
      setLoading(true);
      try {
        const [tlRes, notesRes] = await Promise.all([
          api.getCaseTimeline(currentCase.case_id).catch(() => ({ events: [] })),
          api.getCaseNotes(currentCase.case_id).catch(() => []),
        ]);
        if (isMounted) {
          setTimelineEvents(tlRes.events || []);
          setNotes(notesRes || []);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadTimelineAndNotes();
    return () => {
      isMounted = false;
    };
  }, [currentCase.case_id]);

  // Submit for Review
  const handleSubmitReview = async () => {
    try {
      await api.submitCaseForReview(currentCase.case_id);
      setFeedback('Case submitted for supervisory review.');
      currentCase.status = 'UNDER_REVIEW';
    } catch (err) {
      alert(err.message);
    }
  };

  // Supervisor Review
  const handleReviewSubmit = async () => {
    try {
      await api.reviewCase(currentCase.case_id, reviewDecision, reviewComments);
      setFeedback(`Case status updated to ${reviewDecision}.`);
      currentCase.status = reviewDecision;
      setReviewModalOpen(false);
      setReviewComments('');
    } catch (err) {
      alert(err.message);
    }
  };

  // Supervisor Case Close
  const handleCloseCase = async () => {
    if (!closureReason.trim()) {
      alert('Closure justification is required.');
      return;
    }
    try {
      await api.closeCase(currentCase.case_id, closureReason);
      setFeedback('Case successfully closed.');
      currentCase.status = 'CLOSED';
      setCloseModalOpen(false);
      setClosureReason('');
    } catch (err) {
      alert(err.message);
    }
  };

  // Add Investigator Note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    try {
      const note = await api.createCaseNote(currentCase.case_id, newNote);
      setNotes((prev) => [...prev, note]);
      setNewNote('');
      setFeedback('Investigator note added.');
    } catch (err) {
      alert(err.message);
    }
  };

  const isOwner = currentCase.created_by === user?.id || currentCase.assigned_investigator === user?.id;
  const isSelfCreator = isSupervisor && currentCase.created_by === user?.id;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Case Header Strip ─────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-gradient-to-r from-panel via-cyan-950/[0.1] to-panel">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={onBack}
                className="cyber-button-secondary text-xs py-1 px-2.5 flex items-center gap-1 text-gray-300"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Cases</span>
              </button>
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                {currentCase.case_id}
              </span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                {currentCase.blockchain}
              </span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/30">
                {currentCase.classification}
              </span>
              <span
                className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                  currentCase.status === 'ACTIVE'
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : currentCase.status === 'UNDER_REVIEW'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : currentCase.status === 'APPROVED'
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                    : 'bg-gray-800 text-gray-400 border-gray-700'
                }`}
              >
                {currentCase.status}
              </span>
            </div>

            <h2 className="text-xl font-bold text-gray-100">{currentCase.title}</h2>
            <p className="text-xs text-gray-400 font-mono mt-1 max-w-3xl">
              {currentCase.description}
            </p>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isInvestigator && isOwner && (currentCase.status === 'ACTIVE' || currentCase.status === 'CHANGES_REQUESTED') && (
              <button
                onClick={handleSubmitReview}
                className="cyber-button-primary text-xs py-1.5 px-3 flex items-center gap-1.5 font-mono"
              >
                <Send className="w-3.5 h-3.5" />
                Submit for Review
              </button>
            )}

            {isSupervisor && currentCase.status === 'UNDER_REVIEW' && (
              <button
                onClick={() => {
                  if (isSelfCreator) {
                    alert('Separation of duties: You created this case and cannot approve it yourself.');
                    return;
                  }
                  setReviewModalOpen(true);
                }}
                className={`text-xs py-1.5 px-3 rounded font-mono font-bold flex items-center gap-1.5 border ${
                  isSelfCreator
                    ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                    : 'bg-purple-600/30 text-purple-300 border-purple-500/50 hover:bg-purple-600/50'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Supervisor Review
              </button>
            )}

            {isSupervisor && currentCase.status === 'APPROVED' && (
              <button
                onClick={() => setCloseModalOpen(true)}
                className="cyber-button-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 text-gray-200 hover:text-white font-mono"
              >
                Close Case
              </button>
            )}
          </div>
        </div>

        {/* Case Metadata Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-4 pt-3 border-t border-panel-border/60 text-xs font-mono">
          <div>
            <span className="text-[10px] text-gray-500 uppercase block">Victim / Seed Wallet</span>
            <span className="font-bold text-cyan-400 truncate block mt-0.5">
              {currentCase.seed_address ? `${currentCase.seed_address.slice(0, 10)}...` : 'Not assigned'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase block">Investigator</span>
            <span className="font-bold text-gray-200 block mt-0.5">
              {currentCase.assignee_name || currentCase.creator_name || 'Unassigned'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase block">Supervisor</span>
            <span className="font-bold text-gray-200 block mt-0.5">
              {currentCase.supervisor_id ? 'Supervisory Agent' : 'Awaiting Review'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase block">Priority</span>
            <span className="font-bold text-yellow-400 block mt-0.5">{currentCase.priority}</span>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase block">Hop Depth</span>
            <span className="font-bold text-gray-200 block mt-0.5">{currentCase.hop_count} Hops</span>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase block">Last Updated</span>
            <span className="font-bold text-gray-400 block mt-0.5">
              {currentCase.updated_at ? new Date(currentCase.updated_at).toLocaleDateString() : '—'}
            </span>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="cyber-panel p-3 text-xs font-mono bg-cyan-950/40 border-cyan-500/30 text-cyan-300 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback('')} className="text-gray-400 hover:text-white">✕</button>
        </div>
      )}

      {/* ── Case Workspace Tab Navigation ──────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-panel-border overflow-x-auto pb-1 text-xs font-mono">
        {[
          { id: 'overview', label: 'Case Overview' },
          { id: 'prioritization', label: 'Suspicious Wallet Prioritization' },
          { id: 'fund_flow_dna', label: 'Fund Flow DNA' },
          { id: 'replay', label: 'Investigation Replay' },
          { id: 'timeline', label: 'Case Timeline' },
          { id: 'notes', label: 'Investigator Notes' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 rounded-t-lg font-medium whitespace-nowrap transition-colors border-t border-x ${
              activeTab === tab.id
                ? 'bg-panel border-cyan-500/50 text-cyan-300 font-bold'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/[0.02]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      <div>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Case Summary KPI Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="cyber-panel p-4 space-y-1">
                <span className="text-[10px] font-mono text-gray-500 uppercase">Traced Wallets</span>
                <div className="text-2xl font-bold font-mono text-cyan-400">14</div>
                <span className="text-[11px] text-gray-400 font-mono">Bounded 3-hop trace</span>
              </div>
              <div className="cyber-panel p-4 space-y-1">
                <span className="text-[10px] font-mono text-gray-500 uppercase">High-Priority Candidates</span>
                <div className="text-2xl font-bold font-mono text-red-400">3</div>
                <span className="text-[11px] text-gray-400 font-mono">Multi-signal ranked</span>
              </div>
              <div className="cyber-panel p-4 space-y-1">
                <span className="text-[10px] font-mono text-gray-500 uppercase">VASP Exposure</span>
                <div className="text-2xl font-bold font-mono text-purple-400">2 Identified</div>
                <span className="text-[11px] text-gray-400 font-mono">Exchange hot deposits</span>
              </div>
              <div className="cyber-panel p-4 space-y-1">
                <span className="text-[10px] font-mono text-gray-500 uppercase">Evidence Integrity</span>
                <div className="text-2xl font-bold font-mono text-green-400">SHA-256</div>
                <span className="text-[11px] text-gray-400 font-mono">Audit trail verified</span>
              </div>
            </div>

            {/* Quick Access Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                onClick={() => setActiveTab('prioritization')}
                className="cyber-panel p-5 border-panel-border hover:border-cyan-500/60 cursor-pointer bg-panel/60 transition-all space-y-2"
              >
                <h4 className="text-xs font-bold font-mono uppercase text-cyan-400">
                  1. Suspicious Wallet Prioritization
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed font-mono">
                  Inspect ranked candidate wallets, defensible evidence signals, and recommended actions.
                </p>
              </div>

              <div
                onClick={() => setActiveTab('fund_flow_dna')}
                className="cyber-panel p-5 border-panel-border hover:border-purple-500/60 cursor-pointer bg-panel/60 transition-all space-y-2"
              >
                <h4 className="text-xs font-bold font-mono uppercase text-purple-400">
                  2. Fund Flow DNA
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed font-mono">
                  Analyze behavioral signatures, flow velocity, fan-in/fan-out, and forwarding continuity.
                </p>
              </div>

              <div
                onClick={() => setActiveTab('replay')}
                className="cyber-panel p-5 border-panel-border hover:border-green-500/60 cursor-pointer bg-panel/60 transition-all space-y-2"
              >
                <h4 className="text-xs font-bold font-mono uppercase text-green-400">
                  3. Investigation Replay
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed font-mono">
                  Follow chronological fund propagation step-by-step with interactive timeline playback.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'prioritization' && <SuspiciousWalletPrioritization />}
        {activeTab === 'fund_flow_dna' && <FundFlowDna />}
        {activeTab === 'replay' && <InvestigationReplay />}

        {/* ── Case Timeline View ───────────────────────────────────────────── */}
        {activeTab === 'timeline' && (
          <div className="cyber-panel p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-panel-border pb-3">
              <h3 className="text-xs font-bold uppercase font-mono tracking-wider text-cyan-400">
                Immutable Case Timeline &amp; Audit Trail
              </h3>
              <span className="text-xs font-mono text-gray-500">
                Total Events: {timelineEvents.length}
              </span>
            </div>

            <div className="space-y-3">
              {timelineEvents.map((evt, idx) => (
                <div
                  key={evt.event_id || idx}
                  className="p-3.5 rounded-lg bg-black/40 border border-panel-border text-xs font-mono flex items-start justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-200">{evt.action}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        {evt.role || 'AGENT'}
                      </span>
                    </div>
                    <p className="text-gray-400 text-[11px] leading-relaxed">
                      {evt.details}
                    </p>
                  </div>
                  <div className="text-right text-[10px] text-gray-500 shrink-0">
                    <div>{evt.actor}</div>
                    <div className="text-gray-600 mt-0.5">
                      {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Investigator Notes View ─────────────────────────────────────── */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            {/* Note Entry Box */}
            <form onSubmit={handleAddNote} className="cyber-panel p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-mono font-bold text-gray-300">
                  Add Investigator Observation Note
                </span>
                <span className="text-[10px] font-mono text-amber-400 uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  INVESTIGATOR NOTE (Distinct from Blockchain Evidence)
                </span>
              </div>

              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Enter investigation notes, intelligence cross-references, or subpoena notes..."
                className="cyber-input w-full h-24 text-xs font-mono p-3 bg-background resize-none"
              />

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="cyber-button-primary text-xs py-1.5 px-4 font-mono font-bold uppercase"
                >
                  Save Note
                </button>
              </div>
            </form>

            {/* Notes List */}
            <div className="space-y-2.5">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="cyber-panel p-4 border-panel-border bg-black/40 space-y-2 text-xs font-mono"
                >
                  <div className="flex items-center justify-between text-gray-400 border-b border-panel-border/50 pb-2">
                    <span className="font-bold text-cyan-400">{n.author_name}</span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-200 leading-relaxed">{n.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Supervisor Review ──────────────────────────────────────── */}
      {reviewModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="cyber-panel p-6 max-w-md w-full border-purple-500/40 bg-panel space-y-4">
            <h3 className="text-sm font-bold uppercase font-mono text-purple-400">
              Perform Supervisory Review
            </h3>
            <p className="text-xs text-gray-400 font-mono">Case: {currentCase.case_id}</p>

            <div className="space-y-1 text-xs font-mono">
              <label className="text-gray-400 uppercase text-[10px]">Decision</label>
              <select
                value={reviewDecision}
                onChange={(e) => setReviewDecision(e.target.value)}
                className="cyber-input w-full text-xs font-mono bg-background"
              >
                <option value="APPROVED">APPROVE INVESTIGATION</option>
                <option value="CHANGES_REQUESTED">REQUEST CHANGES</option>
                <option value="REJECTED">REJECT</option>
              </select>
            </div>

            <div className="space-y-1 text-xs font-mono">
              <label className="text-gray-400 uppercase text-[10px]">Review Feedback</label>
              <textarea
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder="Enter mandatory supervisory feedback..."
                className="cyber-input w-full h-24 text-xs font-mono p-2 bg-background resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setReviewModalOpen(false)}
                className="cyber-button-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                onClick={handleReviewSubmit}
                className="cyber-button-primary text-xs py-1.5 px-4"
              >
                Submit Decision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Case Closure ───────────────────────────────────────────── */}
      {closeModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="cyber-panel p-6 max-w-md w-full border-gray-600 bg-panel space-y-4">
            <h3 className="text-sm font-bold uppercase font-mono text-gray-200">
              Formal Investigation Case Closure
            </h3>
            <p className="text-xs text-gray-400 font-mono">
              Case: {currentCase.case_id} will be marked as CLOSED. Investigation records remain preserved.
            </p>

            <div className="space-y-1 text-xs font-mono">
              <label className="text-gray-400 uppercase text-[10px]">Closure Justification</label>
              <textarea
                value={closureReason}
                onChange={(e) => setClosureReason(e.target.value)}
                placeholder="Enter formal justification for closing this case..."
                className="cyber-input w-full h-24 text-xs font-mono p-2 bg-background resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setCloseModalOpen(false)}
                className="cyber-button-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseCase}
                className="cyber-button-primary text-xs py-1.5 px-4"
              >
                Confirm Closure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
