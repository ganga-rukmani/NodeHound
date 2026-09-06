import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Clock,
  Filter,
  Search,
  ExternalLink,
  AlertTriangle,
  Send,
  History,
  CheckCircle,
  X,
  Building,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInvestigation } from '../../context/InvestigationContext';
import { api } from '../../api';

export default function SupervisorConsole({ onSelectCase }) {
  const { user } = useAuth();
  const { setCaseMetadata, setActiveSection } = useInvestigation();

  const [consoleData, setConsoleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTab, setFilterTab] = useState('ALL'); // ALL, UNDER_REVIEW, UNASSIGNED, HIGH_PRIORITY

  // Modals
  const [reviewCaseObj, setReviewCaseObj] = useState(null);
  const [reviewDecision, setReviewDecision] = useState('APPROVED');
  const [reviewComments, setReviewComments] = useState('');

  const [assignCaseObj, setAssignCaseObj] = useState(null);
  const [selectedInvestigator, setSelectedInvestigator] = useState('');

  const [closeCaseObj, setCloseCaseObj] = useState(null);
  const [closureReason, setClosureReason] = useState('');

  const [feedback, setFeedback] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSupervisorConsole();
      setConsoleData(data);
    } catch (err) {
      setError(err.message || 'Failed to load supervisor console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const cases = consoleData?.cases || [];
  const metrics = consoleData?.metrics || {};
  const investigators = consoleData?.unit_investigators || [];

  // Filtered cases
  const filteredCases = cases.filter((c) => {
    if (filterTab === 'UNDER_REVIEW') return c.status === 'UNDER_REVIEW';
    if (filterTab === 'UNASSIGNED') return !c.assigned_investigator && c.status !== 'CLOSED';
    if (filterTab === 'HIGH_PRIORITY') return ['HIGH', 'CRITICAL'].includes(c.priority) && c.status !== 'CLOSED';
    return true;
  });

  // Handle Review
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewCaseObj) return;
    if (reviewCaseObj.created_by === user?.id && reviewDecision === 'APPROVED') {
      alert('Separation of duties: You authored this case and cannot approve it yourself.');
      return;
    }
    if (reviewDecision === 'CHANGES_REQUESTED' && !reviewComments.trim()) {
      alert('Comments are mandatory when requesting changes.');
      return;
    }

    try {
      await api.reviewCase(reviewCaseObj.case_id, reviewDecision, reviewComments);
      setFeedback(`Case ${reviewCaseObj.case_id} marked as ${reviewDecision}.`);
      setReviewCaseObj(null);
      setReviewComments('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Assignment
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignCaseObj || !selectedInvestigator) return;
    try {
      await api.assignCase(assignCaseObj.case_id, selectedInvestigator);
      setFeedback(`Case ${assignCaseObj.case_id} assigned successfully.`);
      setAssignCaseObj(null);
      setSelectedInvestigator('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Closure
  const handleCloseSubmit = async (e) => {
    e.preventDefault();
    if (!closeCaseObj || !closureReason.trim()) {
      alert('Closure justification is required.');
      return;
    }
    try {
      await api.closeCase(closeCaseObj.case_id, closureReason);
      setFeedback(`Case ${closeCaseObj.case_id} closed.`);
      setCloseCaseObj(null);
      setClosureReason('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-purple-500/30 bg-gradient-to-r from-panel via-purple-950/[0.1] to-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Supervisor Console
              </span>
              <span className="text-xs font-mono text-gray-400">
                Unit: {consoleData?.unit_id || user?.unit_id || 'UNIT-ALPHA-CYBER'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-100">Supervisory Oversight &amp; Case Queue</h2>
            <p className="text-xs text-gray-300 font-mono mt-1">
              Supervise active investigations, perform case reviews, assign unit personnel, and enforce separation of duties.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono text-purple-300 bg-black/50 px-3 py-2 rounded-lg border border-panel-border">
              Supervising: <strong className="text-white">{investigators.length}</strong> Investigators
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

      {/* ── Unit Operational Metrics Strip ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div
          onClick={() => setFilterTab('ALL')}
          className={`cyber-panel p-4 cursor-pointer transition-colors border ${
            filterTab === 'ALL' ? 'border-purple-500/60 bg-purple-950/20' : 'border-panel-border'
          }`}
        >
          <span className="text-[10px] uppercase font-mono text-gray-500">Active Cases</span>
          <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
            {metrics.active_count || 0}
          </div>
        </div>

        <div
          onClick={() => setFilterTab('UNDER_REVIEW')}
          className={`cyber-panel p-4 cursor-pointer transition-colors border ${
            filterTab === 'UNDER_REVIEW' ? 'border-amber-500/60 bg-amber-950/20' : 'border-panel-border'
          }`}
        >
          <span className="text-[10px] uppercase font-mono text-gray-500">Awaiting Review</span>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {metrics.under_review_count || 0}
          </div>
        </div>

        <div
          onClick={() => setFilterTab('UNASSIGNED')}
          className={`cyber-panel p-4 cursor-pointer transition-colors border ${
            filterTab === 'UNASSIGNED' ? 'border-red-500/60 bg-red-950/20' : 'border-panel-border'
          }`}
        >
          <span className="text-[10px] uppercase font-mono text-gray-500">Unassigned</span>
          <div className="text-xl font-bold font-mono text-rose-400 mt-1">
            {metrics.unassigned_count || 0}
          </div>
        </div>

        <div
          onClick={() => setFilterTab('HIGH_PRIORITY')}
          className={`cyber-panel p-4 cursor-pointer transition-colors border ${
            filterTab === 'HIGH_PRIORITY' ? 'border-yellow-500/60 bg-yellow-950/20' : 'border-panel-border'
          }`}
        >
          <span className="text-[10px] uppercase font-mono text-gray-500">High Priority</span>
          <div className="text-xl font-bold font-mono text-yellow-400 mt-1">
            {metrics.high_priority_count || 0}
          </div>
        </div>

        <div className="cyber-panel p-4 border-panel-border">
          <span className="text-[10px] uppercase font-mono text-gray-500">Closed / Resolved</span>
          <div className="text-xl font-bold font-mono text-gray-400 mt-1">
            {metrics.closed_count || 0}
          </div>
        </div>
      </div>

      {/* ── Supervisor Queue Table ────────────────────────────────────────── */}
      <div className="cyber-panel overflow-hidden">
        <div className="p-4 border-b border-panel-border flex items-center justify-between bg-black/30 text-xs font-mono">
          <span className="font-bold text-gray-300 uppercase">
            Unit Case Queue ({filteredCases.length} Cases)
          </span>
          <span className="text-gray-500">Filter: {filterTab}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-black/50 text-gray-400 uppercase text-[10px] border-b border-panel-border">
              <tr>
                <th className="py-3 px-4">Case ID / Title</th>
                <th className="py-3 px-4">Chain</th>
                <th className="py-3 px-4">Assigned Investigator</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Supervisory Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border/60">
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No cases match the selected queue filter.
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => {
                  const isSelf = c.created_by === user?.id;
                  return (
                    <tr key={c.case_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-cyan-400">{c.case_id}</div>
                        <div className="text-gray-200 text-xs mt-0.5">{c.title}</div>
                      </td>
                      <td className="py-3 px-4 uppercase text-[11px] text-gray-400">{c.blockchain}</td>
                      <td className="py-3 px-4">
                        {c.assignee_name ? (
                          <span className="text-gray-200">{c.assignee_name}</span>
                        ) : (
                          <span className="text-rose-400 text-[10px] uppercase font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] uppercase font-bold ${
                            c.priority === 'CRITICAL'
                              ? 'text-red-400'
                              : c.priority === 'HIGH'
                              ? 'text-yellow-400'
                              : 'text-gray-400'
                          }`}
                        >
                          {c.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                            c.status === 'UNDER_REVIEW'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : c.status === 'APPROVED'
                              ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                              : c.status === 'CLOSED'
                              ? 'bg-gray-800 text-gray-500 border-gray-700'
                              : 'bg-green-500/10 text-green-300 border-green-500/30'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Review Button */}
                          {c.status === 'UNDER_REVIEW' && (
                            <button
                              onClick={() => {
                                if (isSelf) {
                                  alert('Separation of duties: You authored this case and cannot approve it yourself.');
                                  return;
                                }
                                setReviewCaseObj(c);
                              }}
                              className={`px-2 py-1 rounded text-[11px] font-bold border flex items-center gap-1 ${
                                isSelf
                                  ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
                                  : 'bg-purple-600/30 text-purple-300 border-purple-500/50 hover:bg-purple-600/50'
                              }`}
                              title={isSelf ? 'Self-approval prevented' : 'Review submitted investigation'}
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Review
                            </button>
                          )}

                          {/* Assign Button */}
                          <button
                            onClick={() => {
                              setAssignCaseObj(c);
                              setSelectedInvestigator(c.assigned_investigator || '');
                            }}
                            className="p-1.5 rounded bg-black/40 border border-panel-border text-gray-300 hover:text-white"
                            title="Assign or reassign investigator"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>

                          {/* Close Button */}
                          {c.status === 'APPROVED' && (
                            <button
                              onClick={() => setCloseCaseObj(c)}
                              className="px-2 py-1 rounded text-[10px] font-bold border border-gray-600 text-gray-300 hover:text-white bg-black/40"
                              title="Close approved case"
                            >
                              Close
                            </button>
                          )}

                          {/* Open in Workspace */}
                          <button
                            onClick={() => {
                              if (onSelectCase) onSelectCase(c);
                              setCaseMetadata({
                                caseId: c.case_id,
                                caseTitle: c.title,
                                investigatorId: c.assigned_investigator || 'INV-001',
                                notes: c.description,
                              });
                              setActiveSection('case_workspace');
                            }}
                            className="p-1.5 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/60"
                            title="Open case in full workspace"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal: Supervisory Review ─────────────────────────────────────── */}
      {reviewCaseObj && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleReviewSubmit} className="cyber-panel p-6 max-w-md w-full border-purple-500/40 bg-panel space-y-4">
            <h3 className="text-sm font-bold uppercase font-mono text-purple-400">
              Supervisory Case Review
            </h3>
            <p className="text-xs text-gray-400 font-mono">
              Case: {reviewCaseObj.case_id} — {reviewCaseObj.title}
            </p>

            <div className="space-y-1 text-xs font-mono">
              <label className="text-gray-400 uppercase text-[10px]">Decision</label>
              <select
                value={reviewDecision}
                onChange={(e) => setReviewDecision(e.target.value)}
                className="cyber-input w-full text-xs font-mono bg-background"
              >
                <option value="APPROVED">APPROVE INVESTIGATION</option>
                <option value="CHANGES_REQUESTED">REQUEST CHANGES (Requires comment)</option>
                <option value="REJECTED">REJECT</option>
              </select>
            </div>

            <div className="space-y-1 text-xs font-mono">
              <label className="text-gray-400 uppercase text-[10px]">Supervisory Feedback</label>
              <textarea
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder="Enter formal supervisory comments or revision instructions..."
                className="cyber-input w-full h-24 text-xs font-mono p-2 bg-background resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewCaseObj(null)}
                className="cyber-button-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button type="submit" className="cyber-button-primary text-xs py-1.5 px-4">
                Submit Decision
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal: Case Assignment ────────────────────────────────────────── */}
      {assignCaseObj && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAssignSubmit} className="cyber-panel p-6 max-w-md w-full border-cyan-500/40 bg-panel space-y-4">
            <h3 className="text-sm font-bold uppercase font-mono text-cyan-400">
              Assign Case to Unit Investigator
            </h3>
            <p className="text-xs text-gray-400 font-mono">
              Case: {assignCaseObj.case_id}
            </p>

            <div className="space-y-1 text-xs font-mono">
              <label className="text-gray-400 uppercase text-[10px]">Select Unit Investigator</label>
              <select
                value={selectedInvestigator}
                onChange={(e) => setSelectedInvestigator(e.target.value)}
                className="cyber-input w-full text-xs font-mono bg-background"
                required
              >
                <option value="">-- Choose Investigator in Unit --</option>
                {investigators.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.full_name} ({inv.investigator_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssignCaseObj(null)}
                className="cyber-button-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button type="submit" className="cyber-button-primary text-xs py-1.5 px-4">
                Confirm Assignment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal: Formal Case Closure ────────────────────────────────────── */}
      {closeCaseObj && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCloseSubmit} className="cyber-panel p-6 max-w-md w-full border-gray-600 bg-panel space-y-4">
            <h3 className="text-sm font-bold uppercase font-mono text-gray-200">
              Formal Case Closure
            </h3>
            <p className="text-xs text-gray-400 font-mono">
              Case: {closeCaseObj.case_id} will be transitioned to CLOSED status.
            </p>

            <div className="space-y-1 text-xs font-mono">
              <label className="text-gray-400 uppercase text-[10px]">Closure Reason &amp; Summary</label>
              <textarea
                value={closureReason}
                onChange={(e) => setClosureReason(e.target.value)}
                placeholder="Enter justification: e.g. Investigation completed, all findings preserved..."
                className="cyber-input w-full h-24 text-xs font-mono p-2 bg-background resize-none"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCloseCaseObj(null)}
                className="cyber-button-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button type="submit" className="cyber-button-primary text-xs py-1.5 px-4">
                Close Case
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
