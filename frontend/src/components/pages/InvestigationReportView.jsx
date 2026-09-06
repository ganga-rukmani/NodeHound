import React, { useState } from 'react';
import { FileText, Download, Printer, Copy, CheckCircle, ShieldCheck, ExternalLink } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import RiskBadge from '../common/RiskBadge';
import ConfidenceBadge from '../common/ConfidenceBadge';

export default function InvestigationReportView() {
  const { traceData, caseMetadata } = useInvestigation();
  const [copiedMd, setCopiedMd] = useState(false);

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
    recommendations = [],
    evidence_integrity_hash,
    model_information = {},
  } = traceData || {};

  const isModelAvailable = Boolean(model_information?.chain_model_loaded);
  const hash = evidence_integrity_hash || 'SHA-256 Checksum Pending';

  // Build markdown export string
  const buildMarkdownReport = () => {
    const lines = [];
    lines.push(`# NODEHOUND FORENSIC INVESTIGATION REPORT`);
    lines.push(`**Case ID:** ${caseMetadata.caseId}`);
    lines.push(`**Case Title:** ${caseMetadata.caseTitle}`);
    lines.push(`**Investigator ID:** ${caseMetadata.investigatorId}`);
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push(`**Target Chain:** ${chain.toUpperCase()}`);
    lines.push(`**Fraud Typology:** ${caseMetadata.fraudTypology || 'Unknown'} (Source: ${caseMetadata.fraudTypologySource || 'Investigator Selected'})`);
    lines.push(`**Seed Wallet:** \`${seed_address}\``);
    lines.push(`**Evidence Integrity Checksum (SHA-256):** \`${hash}\``);
    lines.push(`\n---\n`);

    lines.push(`## 1. EXECUTIVE SUMMARY`);
    lines.push(`- **Total Graph Nodes:** ${nodes.length}`);
    lines.push(`- **Total Transfer Edges:** ${edges.length}`);
    lines.push(`- **Suspicious Candidates Identified:** ${candidates.length}`);
    lines.push(`- **Verified VASPs Intersected:** ${nodes.filter((n) => n.is_labeled).length}`);
    lines.push(`- **Typology Patterns Detected:** ${detected_patterns.length}`);
    lines.push(`- **Active Alerts:** ${alerts.length}`);
    lines.push(`\n---\n`);

    lines.push(`## 2. HIGHEST-RANKED CANDIDATE ATTRIBUTION`);
    if (candidates.length > 0) {
      const top = candidates[0];
      lines.push(`- **Candidate Address:** \`${top.address}\``);
      lines.push(`- **Attribution Tier:** ${top.tier}`);
      lines.push(`- **Evidence Score:** ${top.evidence?.evidence_score ?? '—'}`);
      lines.push(`- **Hop Distance:** ${top.hop_distance ?? '—'} hops`);
      lines.push(`- **Fund Continuity:** ${top.evidence?.fund_continuity != null ? (top.evidence.fund_continuity * 100).toFixed(1) + '%' : '—'}`);
    } else {
      lines.push(`_No qualifying suspicious candidate identified above attribution threshold._`);
    }
    lines.push(`\n---\n`);

    lines.push(`## 3. VASP & CENTRALIZED EXCHANGE TOUCHPOINTS`);
    const vasps = nodes.filter((n) => n.is_labeled);
    if (vasps.length > 0) {
      vasps.forEach((v) => {
        lines.push(`- **${v.label}** (\`${v.address}\`) — Category: ${v.category || 'VASP'} | Source: ${v.label_source || 'Verified Dataset'}`);
      });
    } else {
      lines.push(`_No verified exchange or custodial institutional touchpoints detected in this flow._`);
    }
    lines.push(`\n---\n`);

    lines.push(`## 4. TYPOLOGY FINDINGS`);
    if (detected_patterns.length > 0) {
      detected_patterns.forEach((p, i) => {
        lines.push(`${i + 1}. **${p.type}** — Target: \`${p.address || 'Graph'}\` | Severity: ${p.severity || 'Medium'}`);
      });
    } else {
      lines.push(`_No anomalous laundering or structuring typologies triggered rule thresholds._`);
    }
    lines.push(`\n---\n`);

    lines.push(`## 5. MACHINE LEARNING RISK & SHAP STATUS`);
    if (isModelAvailable) {
      lines.push(`- **Model:** XGBoost Calibrated Classifier`);
      lines.push(`- **Risk Score:** ${traceData.risk_score ?? 'Evaluated'}`);
    } else {
      lines.push(`> **NOTICE:** ML analysis unavailable due to insufficient validated training data. In strict accordance with forensic auditability, uncalibrated AI predictions are never fabricated.`);
    }
    lines.push(`\n---\n`);

    lines.push(`## 6. INVESTIGATOR RECOMMENDATIONS`);
    recommendations.forEach((r, i) => {
      lines.push(`${i + 1}. **${r.action}** (Priority: ${r.priority}, Basis: ${r.basis})`);
    });
    lines.push(`\n---\n`);

    lines.push(`## 7. AUDIT & LEGAL NOTICE`);
    lines.push(`_This investigative report is system-generated forensic intelligence based upon deterministically observed blockchain ledger transfers and verified public datasets. It does not constitute legal proof of malicious ownership or formal criminal accusation. Findings must be independently substantiated before submission in formal judicial proceedings._`);

    return lines.join('\n');
  };

  const handleDownloadMd = () => {
    const md = buildMarkdownReport();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nodehound_report_${caseMetadata.caseId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyMd = () => {
    const md = buildMarkdownReport();
    navigator.clipboard.writeText(md).then(() => {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 1500);
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* ── Top Header & Actions ─────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-black/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              Judicial & Compliance Export
            </span>
          </div>
          <h2 className="text-lg font-bold text-gray-100">Comprehensive Investigation Report</h2>
          <span className="text-xs font-mono text-gray-400">
            Case: {caseMetadata.caseId} • Checksum: {hash.slice(0, 16)}...
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopyMd}
            className="cyber-button-secondary text-xs py-2 px-3 flex items-center gap-1.5"
          >
            {copiedMd ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedMd ? 'Copied' : 'Copy Markdown'}
          </button>
          <button
            onClick={handleDownloadMd}
            className="cyber-button-secondary text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download (.md)
          </button>
          <button
            onClick={handlePrint}
            className="cyber-button-primary text-xs py-2 px-4 flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save to PDF
          </button>
        </div>
      </div>

      {/* ── Visual Printable Report Document ─────────────────────────────── */}
      <div className="cyber-panel p-8 space-y-8 bg-black/50 border border-panel-border text-gray-200">
        {/* Document Header */}
        <div className="border-b border-panel-border pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide">
              NODE<span className="text-cyan-400">HOUND</span> FORENSIC REPORT
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              Automated Blockchain Intelligence & Typology Investigation
            </p>
          </div>
          <div className="text-right text-xs font-mono space-y-0.5">
            <div>
              <span className="text-gray-500">Generated:</span> {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
            </div>
            <div>
              <span className="text-gray-500">Case ID:</span> {caseMetadata.caseId}
            </div>
            <div>
              <span className="text-gray-500">Investigator:</span> {caseMetadata.investigatorId}
            </div>
          </div>
        </div>

        {/* Section 1: Subject Case Details */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 border-b border-panel-border/50 pb-1.5">
            1. Investigation Target
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <span className="text-gray-500 block text-[10px] uppercase font-sans">Subject Address:</span>
              <span className="font-bold text-white text-sm">{seed_address}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-[10px] uppercase font-sans">Network Ledger:</span>
              <span className="uppercase text-gray-200">{chain}</span>
            </div>
          </div>
        </div>

        {/* Section 2: Executive Findings Summary */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 border-b border-panel-border/50 pb-1.5">
            2. Executive Triage Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded bg-black/40 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 font-sans block">Nodes Traced</span>
              <span className="text-lg font-bold text-gray-100">{nodes.length}</span>
            </div>
            <div className="p-3 rounded bg-black/40 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 font-sans block">Transfer Edges</span>
              <span className="text-lg font-bold text-gray-100">{edges.length}</span>
            </div>
            <div className="p-3 rounded bg-black/40 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 font-sans block">Suspicious Candidates</span>
              <span className="text-lg font-bold text-red-400">{candidates.length}</span>
            </div>
            <div className="p-3 rounded bg-black/40 border border-panel-border">
              <span className="text-[10px] uppercase text-gray-500 font-sans block">VASPs Intersected</span>
              <span className="text-lg font-bold text-green-400">{nodes.filter((n) => n.is_labeled).length}</span>
            </div>
          </div>
        </div>

        {/* Section 3: Primary Attribution Finding */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 border-b border-panel-border/50 pb-1.5">
            3. Primary Candidate Attribution
          </h3>
          {candidates.length > 0 ? (
            <div className="p-4 rounded-lg bg-black/30 border border-panel-border space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-100 font-mono text-sm">
                  {candidates[0].address}
                </span>
                <ConfidenceBadge tier={candidates[0].tier} score={candidates[0].evidence?.evidence_score} />
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-gray-300 pt-1">
                <div>Hop Distance: {candidates[0].hop_distance} Hops</div>
                <div>Continuity: {candidates[0].evidence?.fund_continuity != null ? `${(candidates[0].evidence.fund_continuity * 100).toFixed(0)}%` : '—'}</div>
                <div>Evidence Score: {candidates[0].evidence?.evidence_score ?? '—'}</div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">No qualifying suspicious candidate identified.</p>
          )}
        </div>

        {/* Section 4: Machine Learning & SHAP Status */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 border-b border-panel-border/50 pb-1.5">
            4. Machine Learning & Risk Status
          </h3>
          {isModelAvailable ? (
            <p className="text-xs text-gray-300">
              Calibrated model active with evaluated probability of {traceData.risk_score}.
            </p>
          ) : (
            <div className="p-3.5 rounded-lg bg-yellow-500/[0.04] border border-yellow-500/20 text-xs text-yellow-300">
              <strong>ML analysis unavailable due to insufficient validated training data.</strong> In strict accordance with audit standards, probabilistic ML scores are omitted rather than fabricated.
            </div>
          )}
        </div>

        {/* Section 5: Recommendations */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 border-b border-panel-border/50 pb-1.5">
            5. Recommended Next Actions
          </h3>
          <ul className="space-y-1.5 text-xs text-gray-300 list-disc list-inside">
            {recommendations.map((r, i) => (
              <li key={i}>
                <strong>{r.action}</strong> — <span className="text-gray-400">Basis: {r.basis}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Section 6: Evidence Integrity Checksum Seal */}
        <div className="space-y-3 pt-4 border-t border-panel-border">
          <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
            6. Evidence Package Integrity Checksum
          </h3>
          <div className="p-3.5 rounded-lg bg-black/60 border border-panel-border font-mono text-xs text-cyan-300 break-all select-all">
            SHA-256: {hash}
          </div>
          <div className="text-[11px] text-gray-500 italic">
            This checksum seals the underlying evidence timeline, transaction records, and intelligence sources.
          </div>
        </div>
      </div>
    </div>
  );
}

