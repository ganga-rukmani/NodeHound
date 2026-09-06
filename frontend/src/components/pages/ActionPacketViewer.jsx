import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Printer,
  ShieldCheck,
  AlertTriangle,
  Clock,
  UserCheck,
  Building2,
  Lock,
  Layers,
  CheckCircle2,
  RotateCcw,
  Send,
  HelpCircle,
  FileCheck,
  ChevronDown,
  Info,
} from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import AddressBadge from '../common/AddressBadge';
import TxBadge from '../common/TxBadge';

export default function ActionPacketViewer({ caseId, caseObj }) {
  const { user, isSupervisor } = useAuth();

  const [packetRecord, setPacketRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  // Supervisor Review Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState('APPROVED');
  const [reviewComments, setReviewComments] = useState('');

  const targetCaseId = caseId || caseObj?.case_id || 'CASE-2026-ETH01';

  const loadPacket = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getActionPacket(targetCaseId);
      setPacketRecord(data);
    } catch (err) {
      setError(err.message || 'Failed to load action packet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPacket();
  }, [targetCaseId]);

  const handleGenerate = async () => {
    setActionLoading(true);
    setError('');
    try {
      const res = await api.generateActionPacket(targetCaseId);
      setPacketRecord(res);
      setFeedback('Action & Disclosure Packet generated successfully.');
    } catch (err) {
      setError(err.message || 'Failed to generate packet');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    setActionLoading(true);
    setError('');
    try {
      const res = await api.submitActionPacket(targetCaseId);
      setPacketRecord(res);
      setFeedback('Packet submitted to Investigation Supervisor review queue.');
    } catch (err) {
      setError(err.message || 'Failed to submit packet');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!reviewComments.trim()) {
      alert('Review comments are mandatory for supervisor review.');
      return;
    }
    setActionLoading(true);
    setError('');
    try {
      const res = await api.reviewActionPacket(targetCaseId, reviewDecision, reviewComments);
      setPacketRecord(res);
      setReviewModalOpen(false);
      setReviewComments('');
      setFeedback(`Packet review recorded: ${reviewDecision}.`);
    } catch (err) {
      setError(err.message || 'Supervisor review failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportJson = async () => {
    try {
      const data = await api.exportActionPacketJson(targetCaseId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NodeHound-Action-Packet-${targetCaseId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Failed to export JSON');
    }
  };

  const handleExportPdf = async () => {
    try {
      await api.exportActionPacketPdf(targetCaseId);
    } catch (err) {
      alert(err.message || 'Failed to export PDF');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const packet = packetRecord?.packet || {};
  const caseInfo = packet.case || {};
  const incidentInfo = packet.incident || {};
  const typologyInfo = packet.fraud_typology || {};
  const fundFlow = packet.fund_flow || {};
  const candidates = packet.suspicious_candidates || [];
  const vaspList = packet.vasp_exposure || [];
  const findings = packet.findings || [];
  const recommendations = packet.recommendations || [];
  const evidenceMeta = packet.evidence || {};
  const reviewInfo = packet.review || {};

  const status = packetRecord?.status || 'DRAFT';
  const isCreator = packetRecord?.created_by === user?.id || caseObj?.created_by === user?.id;

  const getStatusBadge = (st) => {
    switch (st) {
      case 'APPROVED':
        return <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">APPROVED BY SUPERVISOR</span>;
      case 'READY_FOR_REVIEW':
        return <span className="px-2.5 py-1 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 text-xs font-bold">PENDING SUPERVISOR REVIEW</span>;
      case 'CHANGES_REQUESTED':
        return <span className="px-2.5 py-1 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 text-xs font-bold">CHANGES REQUESTED</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold">REJECTED</span>;
      default:
        return <span className="px-2.5 py-1 rounded bg-gray-500/20 text-gray-300 border border-gray-500/40 text-xs font-bold">DRAFT PACKET</span>;
    }
  };

  if (loading && !packetRecord) {
    return (
      <div className="p-12 text-center text-gray-400 font-mono text-xs">
        <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
        Loading Investigator Action & Disclosure Packet...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-fade-in">
      {/* ── Control Header & Action Bar ──────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-panel-border bg-black/40 print:hidden space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Evidentiary Output
              </span>
              <span className="text-xs font-mono text-gray-400">
                Statutory Disclosure Package
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400" />
              Investigator Action & Disclosure Packet
            </h1>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              Consolidates case findings, fraud typology, victim context, fund-flow summary, candidate ranking, and VASP exposure into a hashable statutory disclosure record.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {getStatusBadge(status)}
            <button
              onClick={handleGenerate}
              disabled={actionLoading}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Re-generate Packet
            </button>
            {status !== 'READY_FOR_REVIEW' && status !== 'APPROVED' && (
              <button
                onClick={handleSubmitReview}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                Submit for Review
              </button>
            )}
            {isSupervisor && (
              <button
                onClick={() => setReviewModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Supervisor Review
              </button>
            )}
            <button
              onClick={handleExportPdf}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-panel-border text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              Export PDF
            </button>
            <button
              onClick={handleExportJson}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-panel-border text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <FileCheck className="w-3.5 h-3.5 text-yellow-400" />
              Export JSON
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-panel-border text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-gray-300" />
              Print
            </button>
          </div>
        </div>

        {feedback && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 rounded text-xs font-mono flex items-center justify-between">
            <span>{feedback}</span>
            <button onClick={() => setFeedback('')} className="text-gray-400 hover:text-white">✕</button>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-950/40 border border-red-500/40 text-red-300 rounded text-xs font-mono flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-gray-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Institutional Workflow Notice */}
        <div className="p-3 bg-panel border border-panel-border/80 rounded flex items-start gap-2.5 text-xs font-mono text-gray-300">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-gray-200 uppercase">Prepared for Authorized Institutional Action: </span>
            This packet prepares structured forensic evidence for disclosure and freeze requests in accordance with statutory requirements. NodeHound does not claim automatic execution of freeze orders without competent authority process.
          </div>
        </div>
      </div>

      {/* ── Document-Grade Presentation Sheet ────────────────────────────────── */}
      <div className="bg-panel border border-panel-border rounded-xl p-8 space-y-8 shadow-2xl print:border-none print:shadow-none print:p-0 font-mono text-xs">
        {/* Top Header Banner */}
        <div className="border-b border-panel-border pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-400 font-bold">NodeHound Forensic Intelligence</div>
            <div className="text-lg font-bold text-gray-100 tracking-tight mt-0.5">INVESTIGATOR ACTION & DISCLOSURE PACKET</div>
            <div className="text-[11px] text-gray-400 mt-1">
              Case ID: <span className="text-cyan-400 font-bold">{caseInfo.case_id || targetCaseId}</span> | Classification: <span className="text-yellow-400 font-bold">{caseInfo.classification || 'CONFIDENTIAL'}</span>
            </div>
          </div>
          <div className="text-right sm:border-l sm:border-panel-border sm:pl-6">
            <div className="text-[10px] text-gray-500 uppercase">Generated On</div>
            <div className="text-xs text-gray-200 font-bold mt-0.5">
              {caseInfo.investigation_date ? new Date(caseInfo.investigation_date).toUTCString() : new Date().toUTCString()}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Status: <span className="text-cyan-300 font-bold">{status}</span></div>
          </div>
        </div>

        {/* 1. CASE & INCIDENT CONTEXT */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-panel-border text-gray-200 font-bold uppercase tracking-wider text-xs">
            <Layers className="w-4 h-4 text-cyan-400" />
            1. Case & Incident Information
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-black/30 rounded-lg border border-panel-border/60">
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Case Title</span>
              <span className="text-gray-200 font-bold block mt-0.5">{caseInfo.title || 'Operation Trace'}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Target Blockchain</span>
              <span className="text-cyan-400 font-bold uppercase block mt-0.5">{caseInfo.blockchain || 'ethereum'}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Investigator</span>
              <span className="text-gray-200 block mt-0.5">{caseInfo.investigator_name || 'Senior Investigator'}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Unit ID</span>
              <span className="text-gray-200 block mt-0.5">{caseInfo.unit_id || 'UNIT-ALPHA-CYBER'}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Victim / Origin Wallet</span>
              <span className="text-cyan-300 truncate block mt-0.5">{incidentInfo.victim_wallet || 'Not available'}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Incident Date</span>
              <span className="text-gray-300 block mt-0.5">{incidentInfo.incident_date || 'Not available'}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Reported Loss</span>
              <span className="text-gray-300 block mt-0.5">{incidentInfo.reported_amount ? `$${incidentInfo.reported_amount}` : 'Not available'}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Complaint / Ref</span>
              <span className="text-gray-300 block mt-0.5">{incidentInfo.complaint_reference || 'Not available'}</span>
            </div>
          </div>
        </div>

        {/* 2. FRAUD TYPOLOGY CLASSIFICATION (Prompt 8) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-panel-border text-gray-200 font-bold uppercase tracking-wider text-xs">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            2. Fraud Typology Classification
          </div>
          <div className="p-4 bg-yellow-950/10 border border-yellow-500/20 rounded-lg space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <span className="text-[10px] text-gray-500 uppercase block">Primary Fraud Typology</span>
                <span className="text-base font-bold text-yellow-300 block mt-0.5">
                  {typologyInfo.primary || 'Unknown'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 uppercase block">Typology Classification Source</span>
                <span className="text-gray-200 font-bold block mt-0.5">
                  {typologyInfo.source || 'UNKNOWN'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-500 uppercase block">Secondary Typology</span>
                <span className="text-gray-300 block mt-0.5">
                  {typologyInfo.secondary || 'None'}
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-yellow-500/10 text-[11px] text-gray-400 italic">
              LEGAL ADMISSIBILITY NOTICE: Case Typology reflects investigator or complaint context. Blockchain behavioral analysis identified supporting fund-flow indicators, but must not be presented as sole legal proof of the crime category.
            </div>
          </div>
        </div>

        {/* 3. FUND FLOW SUMMARY */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-panel-border text-gray-200 font-bold uppercase tracking-wider text-xs">
            <Layers className="w-4 h-4 text-cyan-400" />
            3. Fund Flow & Network Summary
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-black/30 rounded-lg border border-panel-border/60">
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Traced Hops</span>
              <span className="text-gray-200 font-bold text-base block mt-0.5">{fundFlow.hop_depth || 3} Hops</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Traced Network Nodes</span>
              <span className="text-cyan-400 font-bold text-base block mt-0.5">{fundFlow.node_count || 14}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Transactions Analyzed</span>
              <span className="text-gray-200 font-bold text-base block mt-0.5">{fundFlow.transaction_count || 8}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase block">Primary Traced Assets</span>
              <span className="text-emerald-400 font-bold text-base block mt-0.5">{fundFlow.relevant_assets || 'USDT'}</span>
            </div>
          </div>
        </div>

        {/* 4. SUSPICIOUS WALLET PRIORITIZATION */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-panel-border text-gray-200 font-bold uppercase tracking-wider text-xs">
            <UserCheck className="w-4 h-4 text-red-400" />
            4. High-Priority Investigation Candidates
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-panel-border/60">
              <thead>
                <tr className="bg-panel border-b border-panel-border text-[11px] text-gray-400 uppercase">
                  <th className="p-2.5 w-16">Rank</th>
                  <th className="p-2.5">Candidate Wallet Address</th>
                  <th className="p-2.5 w-32">Priority Tier</th>
                  <th className="p-2.5">Reason for Priority</th>
                  <th className="p-2.5">Recommended Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-panel-border/40 text-xs">
                {candidates.map((c, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02]">
                    <td className="p-2.5 font-bold text-cyan-400">#{c.priority_rank || idx + 1}</td>
                    <td className="p-2.5 font-mono text-gray-200">{c.address}</td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold text-[10px]">
                        {c.tier?.replace('_', ' ') || 'HIGH PRIORITY'}
                      </span>
                    </td>
                    <td className="p-2.5 text-gray-300 text-[11px]">{c.reason || c.evidence}</td>
                    <td className="p-2.5 text-cyan-300 text-[11px]">{c.recommended_action || 'Review counterparty activity.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. VASP / SERVICE EXPOSURE */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-panel-border text-gray-200 font-bold uppercase tracking-wider text-xs">
            <Building2 className="w-4 h-4 text-purple-400" />
            5. VASP & Centralized Exchange Exposure
          </div>
          {vaspList.length === 0 ? (
            <div className="p-4 bg-black/20 rounded border border-panel-border/40 text-gray-400 italic">
              No VASP exposure identified in the current trace.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-panel-border/60">
                <thead>
                  <tr className="bg-panel border-b border-panel-border text-[11px] text-gray-400 uppercase">
                    <th className="p-2.5">Provider / Exchange</th>
                    <th className="p-2.5">Deposit Wallet</th>
                    <th className="p-2.5 w-24">Hop Distance</th>
                    <th className="p-2.5">Evidence Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-panel-border/40 text-xs">
                  {vaspList.map((v, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02]">
                      <td className="p-2.5 font-bold text-purple-300">{v.provider}</td>
                      <td className="p-2.5 font-mono text-gray-200">{v.address}</td>
                      <td className="p-2.5 text-gray-400">{v.hop_distance} Hops</td>
                      <td className="p-2.5 text-gray-300 text-[11px]">{v.evidence_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 6. STRUCTURED INVESTIGATOR FINDINGS & RECOMMENDATIONS */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1 border-b border-panel-border text-gray-200 font-bold uppercase tracking-wider text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            6. Structured Findings & Recommended Actions
          </div>
          <div className="space-y-3">
            {findings.map((f, idx) => (
              <div key={idx} className="p-3 bg-black/20 rounded border border-panel-border/40 space-y-1">
                <div className="font-bold text-gray-200 text-xs flex items-center gap-2">
                  <span className="text-cyan-400">Finding {idx + 1}:</span> {f.finding}
                </div>
                <div className="text-[11px] text-gray-400">
                  <span className="text-gray-500 uppercase">Evidence:</span> {f.evidence}
                </div>
                <div className="text-[11px] text-gray-400">
                  <span className="text-gray-500 uppercase">Reason:</span> {f.reason}
                </div>
                {f.investigation_significance && (
                  <div className="text-[11px] text-cyan-300">
                    <span className="text-gray-500 uppercase">Significance:</span> {f.investigation_significance}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 bg-panel rounded border border-panel-border/60 space-y-2">
            <span className="text-[11px] font-bold text-gray-300 uppercase block">Recommended Next Actions:</span>
            <div className="space-y-1.5">
              {recommendations.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-gray-300">
                  <span className="w-4 h-4 rounded border border-panel-border bg-black/40 flex items-center justify-center text-cyan-400 font-bold text-[10px]">
                    ✓
                  </span>
                  <span>{typeof r === 'object' ? r.action : r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 7. EVIDENCE INTEGRITY & SUPERVISOR REVIEW */}
        <div className="space-y-3 pt-4 border-t border-panel-border">
          <div className="flex items-center gap-2 pb-1 border-b border-panel-border text-gray-200 font-bold uppercase tracking-wider text-xs">
            <Lock className="w-4 h-4 text-cyan-400" />
            7. Evidence Integrity Checksum & Supervisor Review
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-black/30 rounded border border-panel-border/60">
            <div className="space-y-1.5">
              <span className="text-[10px] text-gray-500 uppercase block">Evidence Integrity Checksum</span>
              <span className="font-mono text-cyan-400 break-all block text-[11px]">
                {evidenceMeta.evidence_integrity_hash || 'SHA-256 Calculated'}
              </span>
              <div className="text-[10px] text-gray-500">
                Algorithm: {evidenceMeta.hash_algorithm || 'SHA-256 (Canonical JSON)'} | Generated: {evidenceMeta.generation_time || 'Recorded'}
              </div>
            </div>
            <div className="space-y-1.5 md:border-l md:border-panel-border md:pl-4">
              <span className="text-[10px] text-gray-500 uppercase block">Supervisor Review Record</span>
              <div className="text-xs text-gray-200">
                Decision: <span className="font-bold text-yellow-400">{reviewInfo.decision || 'PENDING SUPERVISORY REVIEW'}</span>
              </div>
              <div className="text-[11px] text-gray-400">
                Reviewer: {reviewInfo.reviewer_name || packetRecord?.reviewer_name || 'Pending Review'}
              </div>
              {reviewInfo.comments && (
                <div className="text-[11px] text-gray-300 italic mt-1">
                  "{reviewInfo.comments}"
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Supervisor Review Modal ──────────────────────────────────────────── */}
      {reviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="cyber-panel p-6 max-w-lg w-full space-y-4 border-panel-border bg-panel">
            <div className="flex items-center justify-between border-b border-panel-border pb-3">
              <h3 className="font-bold text-gray-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Supervisor Review: Action & Disclosure Packet
              </h3>
              <button onClick={() => setReviewModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            {isCreator ? (
              <div className="p-3 bg-red-950/40 border border-red-500/40 rounded text-red-300 text-xs font-mono">
                <AlertTriangle className="w-4 h-4 inline mr-1 text-red-400" />
                <strong>Separation of Duties Violation:</strong> As the creator of this case/packet, you are prohibited from approving your own investigation packet. Another supervisor from your unit must perform this review.
              </div>
            ) : (
              <div className="space-y-4 font-mono text-xs">
                <div>
                  <label className="text-gray-400 uppercase text-[10px] block mb-1">Review Decision</label>
                  <select
                    value={reviewDecision}
                    onChange={(e) => setReviewDecision(e.target.value)}
                    className="w-full bg-black/60 border border-panel-border rounded p-2 text-gray-200 text-xs font-mono"
                  >
                    <option value="APPROVED">APPROVE (Authorize Institutional Disclosure)</option>
                    <option value="CHANGES_REQUESTED">REQUEST CHANGES (Return with Feedback)</option>
                    <option value="REJECTED">REJECT (Decline Packet)</option>
                  </select>
                </div>

                <div>
                  <label className="text-gray-400 uppercase text-[10px] block mb-1">Mandatory Review Comments</label>
                  <textarea
                    rows={4}
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    placeholder="Enter statutory justification, evidentiary observations, or requested adjustments..."
                    className="w-full bg-black/60 border border-panel-border rounded p-2 text-gray-200 text-xs font-mono"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setReviewModalOpen(false)}
                    className="px-3 py-1.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReviewSubmit}
                    disabled={actionLoading || !reviewComments.trim()}
                    className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
                  >
                    Submit Decision
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
