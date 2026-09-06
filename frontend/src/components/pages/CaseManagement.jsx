import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderLock,
  Plus,
  Search,
  Filter,
  UserCheck,
  Send,
  ExternalLink,
  History,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInvestigation } from '../../context/InvestigationContext';
import { api } from '../../api';

export default function CaseManagement() {
  const { user, isSupervisor, isInvestigator } = useAuth();
  const { setCaseMetadata, setActiveSection } = useInvestigation();

  const [cases, setCases] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [reviewModalCase, setReviewModalCase] = useState(null);
  const [assignModalCase, setAssignModalCase] = useState(null);
  const [auditDrawerCase, setAuditDrawerCase] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  // Form states
  const [newCase, setNewCase] = useState({
    title: '',
    description: '',
    blockchain: 'ethereum',
    seed_address: '',
    priority: 'HIGH',
    classification: 'CONFIDENTIAL',
    hop_count: 2,
    start_date: '2024-01-01',
    end_date: '2024-01-02',
  });

  const [reviewDecision, setReviewDecision] = useState('APPROVED');
  const [reviewComments, setReviewComments] = useState('');
  const [assignTarget, setAssignTarget] = useState('');

  // Load cases and dashboard metrics
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [casesRes, metricsRes] = await Promise.all([
        api.listCases({ status: statusFilter !== 'ALL' ? statusFilter : undefined }),
        api.getDashboardMetrics().catch(() => null),
      ]);
      setCases(casesRes || []);
      if (metricsRes) setMetrics(metricsRes.metrics || null);
    } catch (err) {
      setError(err.message || 'Failed to load case management records.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create Case Handler
  const handleCreateCase = async (e) => {
    e.preventDefault();
    try {
      await api.createCase(newCase);
      setCreateModalOpen(false);
      setNewCase({
        title: '',
        description: '',
        blockchain: 'ethereum',
        seed_address: '',
        priority: 'HIGH',
        classification: 'CONFIDENTIAL',
        hop_count: 2,
        start_date: '2024-01-01',
        end_date: '2024-01-02',
      });
      loadData();
    } catch (err) {
      alert(`Error creating case: ${err.message}`);
    }
  };

  // Submit for Review Handler
  const handleSubmitReview = async (caseId) => {
    try {
      await api.submitCaseForReview(caseId);
      loadData();
    } catch (err) {
      alert(`Submission failed: ${err.message}`);
    }
  };

  // Review Case Handler (Supervisor)
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewModalCase) return;
    try {
      await api.reviewCase(reviewModalCase.case_id, reviewDecision, reviewComments);
      setReviewModalCase(null);
      setReviewComments('');
      loadData();
    } catch (err) {
      alert(`Review action rejected: ${err.message}`);
    }
  };

  // Assign Case Handler (Supervisor)
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignModalCase || !assignTarget) return;
    try {
      await api.assignCase(assignModalCase.case_id, assignTarget);
      setAssignModalCase(null);
      setAssignTarget('');
      loadData();
    } catch (err) {
      alert(`Assignment failed: ${err.message}`);
    }
  };

  // View Audit Logs
  const handleOpenAudit = async (c) => {
    setAuditDrawerCase(c);
    try {
      const logs = await api.getCaseAuditLogs(c.case_id);
      setAuditLogs(logs || []);
    } catch (_err) {
      setAuditLogs([]);
    }
  };

  // Open in Investigator Workspace
  const handleOpenInInvestigator = (c) => {
    setCaseMetadata({
      caseId: c.case_id,
      caseTitle: c.title,
      investigatorId: user?.investigator_id || 'INV-001',
      notes: c.description,
    });
    setActiveSection('new_investigation');
  };

  // Filtered cases list
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const matchesSearch =
        c.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.case_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.seed_address?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [cases, searchQuery]);

  const getStatusBadge = (status) => {
    const map = {
      ACTIVE: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      UNDER_REVIEW: 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse',
      CHANGES_REQUESTED: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
      APPROVED: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      CLOSED: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
      ARCHIVED: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
      DRAFT: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    };
    return (
      <span className={`text-[11px] font-mono px-2 py-0.5 rounded border font-semibold ${map[status] || map.DRAFT}`}>
        {status}
      </span>
    );
  };

  const getPriorityBadge = (priority) => {
    const map = {
      CRITICAL: 'text-red-400 font-bold',
      HIGH: 'text-orange-400 font-semibold',
      MEDIUM: 'text-amber-400',
      LOW: 'text-gray-400',
    };
    return <span className={`text-xs font-mono ${map[priority] || 'text-gray-400'}`}>{priority}</span>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-gradient-to-r from-panel to-cyan-950/[0.1]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                RBAC &amp; ABAC Case Management
              </span>
              <span className="text-xs font-mono text-gray-400">
                Unit: {user?.unit_id || 'UNASSIGNED'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-100">Forensic Investigation Cases</h2>
            <p className="text-xs text-gray-300 font-mono mt-0.5">
              Role: <strong className="text-cyan-400">{user?.role}</strong> | Investigator ID: {user?.investigator_id}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCreateModalOpen(true)}
              className="cyber-button-primary px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Investigation Case
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="cyber-panel p-4 border-red-500/40 bg-red-950/20 text-red-300 text-xs font-mono flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Role Specific KPI Metrics ─────────────────────────────────────── */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {isInvestigator ? (
            <>
              <div className="cyber-panel p-4 border-emerald-500/20 bg-black/40 space-y-1">
                <span className="text-[10px] uppercase font-mono text-gray-400 block">My Active Cases</span>
                <span className="text-2xl font-mono font-bold text-emerald-400">{metrics.my_active_cases ?? 0}</span>
                <span className="text-[10px] text-gray-500 block">Assigned or created</span>
              </div>
              <div className="cyber-panel p-4 border-amber-500/20 bg-black/40 space-y-1">
                <span className="text-[10px] uppercase font-mono text-gray-400 block">Under Review</span>
                <span className="text-2xl font-mono font-bold text-amber-400">{metrics.my_cases_under_review ?? 0}</span>
                <span className="text-[10px] text-gray-500 block">Awaiting supervisor</span>
              </div>
              <div className="cyber-panel p-4 border-red-500/20 bg-black/40 space-y-1">
                <span className="text-[10px] uppercase font-mono text-gray-400 block">High / Critical Priority</span>
                <span className="text-2xl font-mono font-bold text-red-400">{metrics.my_high_priority_cases ?? 0}</span>
                <span className="text-[10px] text-gray-500 block">Requires rapid action</span>
              </div>
              <div className="cyber-panel p-4 border-cyan-500/20 bg-black/40 space-y-1">
                <span className="text-[10px] uppercase font-mono text-gray-400 block">Closed Cases</span>
                <span className="text-2xl font-mono font-bold text-cyan-400">{metrics.my_closed_cases ?? 0}</span>
                <span className="text-[10px] text-gray-500 block">Completed forensic files</span>
              </div>
            </>
          ) : isSupervisor ? (
            <>
              <div className="cyber-panel p-4 border-purple-500/20 bg-black/40 space-y-1">
                <span className="text-[10px] uppercase font-mono text-gray-400 block">Unit Active Cases</span>
                <span className="text-2xl font-mono font-bold text-purple-300">{metrics.unit_active_cases ?? 0}</span>
                <span className="text-[10px] text-gray-500 block">{user?.unit_id}</span>
              </div>
              <div className="cyber-panel p-4 border-amber-500/20 bg-black/40 space-y-1">
                <span className="text-[10px] uppercase font-mono text-gray-400 block">Review Queue</span>
                <span className="text-2xl font-mono font-bold text-amber-400">{metrics.cases_under_review ?? 0}</span>
                <span className="text-[10px] text-gray-500 block">Pending approval</span>
              </div>
              <div className="cyber-panel p-4 border-orange-500/20 bg-black/40 space-y-1">
                <span className="text-[10px] uppercase font-mono text-gray-400 block">Unassigned Cases</span>
                <span className="text-2xl font-mono font-bold text-orange-400">{metrics.unassigned_cases ?? 0}</span>
                <span className="text-[10px] text-gray-500 block">Needs assignment</span>
              </div>
              <div className="cyber-panel p-4 border-red-500/20 bg-black/40 space-y-1">
                <span className="text-[10px] uppercase font-mono text-gray-400 block">Unit High Priority</span>
                <span className="text-2xl font-mono font-bold text-red-400">{metrics.high_priority_cases ?? 0}</span>
                <span className="text-[10px] text-gray-500 block">High / Critical tier</span>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Filters & Search Bar ─────────────────────────────────────────── */}
      <div className="cyber-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/40">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Case ID, title, or target address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="cyber-input w-full pl-9 text-xs font-mono"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="text-xs text-gray-400 font-mono">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="cyber-input text-xs font-mono bg-background"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="CHANGES_REQUESTED">Changes Requested</option>
            <option value="APPROVED">Approved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* ── Cases Table ─────────────────────────────────────────────────── */}
      <div className="cyber-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/60 border-b border-panel-border text-gray-400 uppercase font-mono text-[11px]">
              <tr>
                <th className="py-3 px-4">Case ID / Title</th>
                <th className="py-3 px-4">Chain / Target</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Unit / Assigned</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border/50 text-gray-200">
              {filteredCases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500 font-mono">
                    {loading ? 'Loading authorized case records...' : 'No authorized cases found for your credentials.'}
                  </td>
                </tr>
              ) : (
                filteredCases.map((c) => {
                  const isOwner = c.created_by === user?.id || c.assigned_investigator === user?.id;
                  const canSubmitReview = isInvestigator && isOwner && (c.status === 'ACTIVE' || c.status === 'CHANGES_REQUESTED');
                  const isSelfCreator = isSupervisor && c.created_by === user?.id;

                  return (
                    <tr key={c.case_id} className="hover:bg-cyan-950/[0.06] transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-cyan-400 block">{c.case_id}</span>
                        <span className="text-gray-100 font-medium block mt-0.5">{c.title}</span>
                        <span className="text-[10px] text-gray-500 line-clamp-1">{c.description}</span>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">
                          {c.blockchain}
                        </span>
                        <span className="text-gray-400 block text-[11px] mt-1 truncate max-w-xs" title={c.seed_address}>
                          {c.seed_address}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">{getStatusBadge(c.status)}</td>

                      <td className="py-3.5 px-4">{getPriorityBadge(c.priority)}</td>

                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <span className="text-gray-300 block">{c.unit_id}</span>
                        <span className="text-gray-500 block text-[10px]">
                          {c.assigned_investigator ? `Inv: ${c.assigned_investigator}` : 'Unassigned'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Open in Investigator workspace */}
                          <button
                            onClick={() => handleOpenInInvestigator(c)}
                            title="Open in Forensics Investigator"
                            className="p-1.5 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/60"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          {/* Submit for Review (Investigator) */}
                          {canSubmitReview && (
                            <button
                              onClick={() => handleSubmitReview(c.case_id)}
                              className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-[11px] font-mono flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              Submit
                            </button>
                          )}

                          {/* Supervisory Review (Supervisor) */}
                          {isSupervisor && c.status === 'UNDER_REVIEW' && (
                            <button
                              onClick={() => {
                                if (isSelfCreator) {
                                  alert('Separation of duties: You created this case and cannot approve it yourself.');
                                  return;
                                }
                                setReviewModalCase(c);
                              }}
                              disabled={isSelfCreator}
                              className={`px-2 py-1 rounded border text-[11px] font-mono flex items-center gap-1 ${
                                isSelfCreator
                                  ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                                  : 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20'
                              }`}
                              title={isSelfCreator ? 'Self-approval prohibited' : 'Perform Supervisory Review'}
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Review
                            </button>
                          )}

                          {/* Assign (Supervisor) */}
                          {isSupervisor && (
                            <button
                              onClick={() => setAssignModalCase(c)}
                              title="Assign or reassign case"
                              className="p-1.5 rounded bg-black/40 border border-panel-border text-gray-300 hover:text-white"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Audit Logs */}
                          <button
                            onClick={() => handleOpenAudit(c)}
                            title="View Forensic Audit Trail"
                            className="p-1.5 rounded bg-black/40 border border-panel-border text-gray-400 hover:text-cyan-400"
                          >
                            <History className="w-3.5 h-3.5" />
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

      {/* ── Modal: Create Case ────────────────────────────────────────────── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="cyber-panel max-w-md w-full border-cyan-500/40 bg-panel-bg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-panel-border pb-3">
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
                <FolderLock className="w-4 h-4 text-cyan-400" />
                Open New Forensic Case
              </h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCase} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-gray-400 font-medium">Case Title</label>
                <input
                  type="text"
                  required
                  placeholder="Operation Dark Liquidity"
                  value={newCase.title}
                  onChange={(e) => setNewCase({ ...newCase, title: e.target.value })}
                  className="cyber-input w-full text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 font-medium">Description / Forensic Scope</label>
                <textarea
                  rows={2}
                  placeholder="Detailed investigative rationale and scope..."
                  value={newCase.description}
                  onChange={(e) => setNewCase({ ...newCase, description: e.target.value })}
                  className="cyber-input w-full text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-gray-400 font-medium">Blockchain</label>
                  <select
                    value={newCase.blockchain}
                    onChange={(e) => setNewCase({ ...newCase, blockchain: e.target.value })}
                    className="cyber-input w-full text-xs font-mono bg-background"
                  >
                    <option value="ethereum">Ethereum (ETH)</option>
                    <option value="tron">Tron (TRX/TRC20)</option>
                    <option value="bitcoin">Bitcoin (BTC)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-gray-400 font-medium">Priority</label>
                  <select
                    value={newCase.priority}
                    onChange={(e) => setNewCase({ ...newCase, priority: e.target.value })}
                    className="cyber-input w-full text-xs font-mono bg-background"
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 font-medium">Seed Address</label>
                <input
                  type="text"
                  required
                  placeholder="0xdac17f958d2ee523a2206206994597c13d831ec7"
                  value={newCase.seed_address}
                  onChange={(e) => setNewCase({ ...newCase, seed_address: e.target.value })}
                  className="cyber-input w-full text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-gray-400 font-medium">Start Date</label>
                  <input
                    type="date"
                    value={newCase.start_date}
                    onChange={(e) => setNewCase({ ...newCase, start_date: e.target.value })}
                    className="cyber-input w-full text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-gray-400 font-medium">End Date</label>
                  <input
                    type="date"
                    value={newCase.end_date}
                    onChange={(e) => setNewCase({ ...newCase, end_date: e.target.value })}
                    className="cyber-input w-full text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-black/40 border border-panel-border text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cyber-button-primary px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
                >
                  Create Case
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Supervisory Review ─────────────────────────────────────── */}
      {reviewModalCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="cyber-panel max-w-md w-full border-purple-500/40 bg-panel-bg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-panel-border pb-3">
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                Supervisory Review &amp; Approval
              </h3>
              <button onClick={() => setReviewModalCase(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded bg-black/40 border border-panel-border space-y-1 font-mono text-xs">
              <span className="text-purple-300 font-bold block">{reviewModalCase.case_id}</span>
              <span className="text-gray-300 font-sans block">{reviewModalCase.title}</span>
              <span className="text-gray-500 text-[11px] block">Created by: {reviewModalCase.created_by}</span>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-gray-400 font-medium">Supervisory Decision</label>
                <select
                  value={reviewDecision}
                  onChange={(e) => setReviewDecision(e.target.value)}
                  className="cyber-input w-full text-xs font-mono bg-background"
                >
                  <option value="APPROVED">APPROVE INVESTIGATION</option>
                  <option value="CHANGES_REQUESTED">REQUEST CHANGES</option>
                  <option value="REJECTED">REJECT INVESTIGATION</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 font-medium">Supervisory Findings / Directive Notes</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record formal supervisory directives, evidential soundness, and rationale..."
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  className="cyber-input w-full text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewModalCase(null)}
                  className="px-3 py-1.5 rounded bg-black/40 border border-panel-border text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider"
                >
                  Submit Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Case Assignment ────────────────────────────────────────── */}
      {assignModalCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="cyber-panel max-w-md w-full border-cyan-500/40 bg-panel-bg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-panel-border pb-3">
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-cyan-400" />
                Assign Case to Unit Investigator
              </h3>
              <button onClick={() => setAssignModalCase(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-300 font-mono">
              Case: <span className="text-cyan-400 font-bold">{assignModalCase.case_id}</span> ({assignModalCase.unit_id})
            </p>

            <form onSubmit={handleAssignSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-gray-400 font-medium">Select Investigator in Unit</label>
                <select
                  value={assignTarget}
                  onChange={(e) => setAssignTarget(e.target.value)}
                  className="cyber-input w-full text-xs font-mono bg-background"
                  required
                >
                  <option value="">-- Choose Unit Investigator --</option>
                  <option value="usr_inv_101">Officer Alex Vance (INV-101) - Unit Alpha</option>
                  <option value="usr_inv_202">Detective Marcus Reed (INV-202) - Unit Beta</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssignModalCase(null)}
                  className="px-3 py-1.5 rounded bg-black/40 border border-panel-border text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cyber-button-primary px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Drawer: Audit Logs ────────────────────────────────────────────── */}
      {auditDrawerCase && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-panel-bg border-l border-panel-border h-full p-6 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-panel-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-cyan-400" />
                  Immutable Forensic Audit Log
                </h3>
                <span className="text-xs font-mono text-cyan-400">{auditDrawerCase.case_id}</span>
              </div>
              <button onClick={() => setAuditDrawerCase(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Every authorization decision, state change, and supervisory review on this case is cryptographically logged for chain-of-custody defensibility.
            </p>

            <div className="space-y-3">
              {auditLogs.length === 0 ? (
                <div className="p-4 text-center text-gray-500 font-mono text-xs">
                  No audit entries recorded yet.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-lg bg-black/40 border border-panel-border space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-gray-200">{log.action}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                          log.outcome === 'ALLOWED'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                            : 'text-red-400 bg-red-500/10 border-red-500/30'
                        }`}
                      >
                        {log.outcome}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-mono block">
                      {new Date(log.timestamp).toLocaleString()} | Actor: {log.user_id}
                    </span>
                    {log.details && <p className="text-[11px] text-gray-300 mt-1">{log.details}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

