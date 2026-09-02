import React, { useState, useRef, useEffect } from 'react';
import { FileDown, Check, ChevronDown, FileText, Printer, FileJson } from 'lucide-react';

// ── Integrity hash ────────────────────────────────────────────────────────────
async function hashData(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildReportSections(data) {
  const { seed_address, nodes = [], edges = [], summary = {} } = data || {};
  const labeledNodes = nodes
    .filter((n) => n.is_labeled)
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
  const pathNodes = summary.highest_risk_path || [];
  return { seed_address, nodes, edges, summary, labeledNodes, pathNodes };
}

function buildMarkdown(data, integrityHash) {
  const { seed_address, nodes, edges, summary, labeledNodes, pathNodes } = buildReportSections(data);
  const now = new Date().toISOString();
  const lines = [];

  lines.push('# NodeHound Investigation Report');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Seed Address:** \`${seed_address || 'N/A'}\``);
  lines.push(`**Integrity Hash (SHA-256):** \`${integrityHash}\``);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total nodes traced:** ${summary.total_nodes ?? nodes.length}`);
  lines.push(`- **Total edges traced:** ${summary.total_edges ?? edges.length}`);
  lines.push(`- **Known VASP matches:** ${summary.known_vasp_matches ?? labeledNodes.length}`);
  if (summary.top_destination) {
    const pct = Math.round((summary.top_destination.confidence ?? 0) * 100);
    lines.push(`- **Top likely destination:** ${summary.top_destination.label} (\`${summary.top_destination.address}\`) — ${pct}% confidence`);
  } else {
    lines.push('- **Top likely destination:** None identified with sufficient confidence');
  }
  lines.push('');

  if (pathNodes.length > 0) {
    lines.push('## Highest-Risk Fund Flow Path');
    lines.push('');
    lines.push('Ordered from seed address to top destination. Unlabeled hops are probable intermediary/layering wallets.');
    lines.push('');
    pathNodes.forEach((addr, i) => {
      const node = nodes.find((n) => n.address === addr);
      const marker = node?.is_labeled ? `**${node.label}**` : '_intermediary wallet_';
      lines.push(`${i + 1}. \`${addr}\` — ${marker}`);
    });
    lines.push('');
  }

  lines.push('## Identified VASPs / Known Entities');
  lines.push('');
  if (labeledNodes.length === 0) {
    lines.push('_No known/labeled entities found in this trace._');
  } else {
    lines.push('| Address | Label | Category | Chain | Risk Score |');
    lines.push('|---|---|---|---|---|');
    labeledNodes.forEach((n) => {
      const risk = n.risk_score != null ? `${Math.round(n.risk_score * 100)}%` : '—';
      lines.push(`| \`${n.address}\` | ${n.label || '—'} | ${n.category || '—'} | ${n.chain} | ${risk} |`);
    });
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('_This report is system-generated investigative intelligence, not a legal finding. All attributions should be independently verified before use in formal proceedings._');

  return lines.join('\n');
}

function buildPrintableHTML(data, integrityHash) {
  const { seed_address, nodes, edges, summary, labeledNodes, pathNodes } = buildReportSections(data);
  const now = new Date().toLocaleString();

  const pathRows = pathNodes
    .map((addr) => {
      const node = nodes.find((n) => n.address === addr);
      const marker = node?.is_labeled ? `<strong>${node.label}</strong>` : '<em>intermediary wallet</em>';
      return `<li><code>${addr}</code> — ${marker}</li>`;
    })
    .join('');

  const vaspRows = labeledNodes
    .map((n) => {
      const risk = n.risk_score != null ? `${Math.round(n.risk_score * 100)}%` : '—';
      return `<tr><td><code>${n.address}</code></td><td>${n.label || '—'}</td><td>${n.category || '—'}</td><td>${n.chain}</td><td>${risk}</td></tr>`;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>NodeHound Investigation Report</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; color: #1a1a1a; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.5; }
  h1 { border-bottom: 3px solid #0ea5e9; padding-bottom: 10px; }
  h2 { color: #0369a1; margin-top: 32px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  .meta { background: #f1f5f9; padding: 12px 16px; border-radius: 8px; font-size: 13px; color: #475569; margin-bottom: 24px; }
  .meta code { background: #e2e8f0; padding: 1px 5px; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; font-weight: 600; }
  code { font-family: 'SF Mono', Consolas, monospace; font-size: 12px; }
  .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 16px 0; }
  .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
  .stat-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
  .stat-value { font-size: 20px; font-weight: 700; margin-top: 2px; }
  .disclaimer { margin-top: 32px; padding: 12px 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 12px; color: #78350f; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head>
<body>
  <h1>NodeHound Investigation Report</h1>
  <div class="meta">
    <strong>Generated:</strong> ${now}<br>
    <strong>Seed Address:</strong> <code>${seed_address || 'N/A'}</code><br>
    <strong>Integrity Hash (SHA-256):</strong> <code>${integrityHash}</code>
  </div>

  <h2>Summary</h2>
  <div class="stat-grid">
    <div class="stat"><div class="stat-label">Total Nodes</div><div class="stat-value">${summary.total_nodes ?? nodes.length}</div></div>
    <div class="stat"><div class="stat-label">Total Edges</div><div class="stat-value">${summary.total_edges ?? edges.length}</div></div>
    <div class="stat"><div class="stat-label">Known VASP Matches</div><div class="stat-value">${summary.known_vasp_matches ?? labeledNodes.length}</div></div>
    <div class="stat"><div class="stat-label">Top Destination</div><div class="stat-value" style="font-size:14px">${summary.top_destination ? `${summary.top_destination.label} (${Math.round((summary.top_destination.confidence ?? 0) * 100)}%)` : 'None identified'}</div></div>
  </div>

  ${pathNodes.length > 0 ? `
  <h2>Highest-Risk Fund Flow Path</h2>
  <p style="font-size:13px;color:#64748b">Ordered from seed address to top destination. Unlabeled hops are probable intermediary/layering wallets.</p>
  <ol>${pathRows}</ol>
  ` : ''}

  <h2>Identified VASPs / Known Entities</h2>
  ${labeledNodes.length === 0 ? '<p><em>No known/labeled entities found in this trace.</em></p>' : `
  <table>
    <thead><tr><th>Address</th><th>Label</th><th>Category</th><th>Chain</th><th>Risk Score</th></tr></thead>
    <tbody>${vaspRows}</tbody>
  </table>
  `}

  <div class="disclaimer">
    This report is system-generated investigative intelligence, not a legal finding.
    All attributions should be independently verified before use in formal proceedings.
  </div>
</body>
</html>
  `.trim();
}

function buildJSONEvidence(data, integrityHash) {
  const { seed_address, nodes, edges, summary } = buildReportSections(data);
  return JSON.stringify(
    {
      report_metadata: {
        generated_by: 'NodeHound',
        generated_at: new Date().toISOString(),
        integrity_hash_sha256: integrityHash,
        disclaimer: 'System-generated investigative intelligence, not a legal finding.',
      },
      seed_address,
      summary,
      nodes,
      edges,
    },
    null,
    2
  );
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const FORMAT_OPTIONS = [
  { id: 'markdown', label: 'Markdown (.md)', icon: FileText, desc: 'Technical handoff, git-friendly' },
  { id: 'print', label: 'Printable Report', icon: Printer, desc: 'Opens for print / Save as PDF' },
  { id: 'json', label: 'JSON Evidence', icon: FileJson, desc: 'Case management / chain of custody' },
];

export default function ReportGenerator({ data }) {
  const [open, setOpen] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = async (formatId) => {
    setOpen(false);
    const rawPayload = JSON.stringify({ seed_address: data?.seed_address, nodes: data?.nodes, edges: data?.edges });
    const integrityHash = await hashData(rawPayload);

    const shortAddr = data?.seed_address ? data.seed_address.slice(0, 10) : 'trace';
    const date = new Date().toISOString().slice(0, 10);

    if (formatId === 'markdown') {
      const md = buildMarkdown(data, integrityHash);
      triggerDownload(md, `nodehound_report_${shortAddr}_${date}.md`, 'text/markdown;charset=utf-8');
    } else if (formatId === 'print') {
      const html = buildPrintableHTML(data, integrityHash);
      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    } else if (formatId === 'json') {
      const json = buildJSONEvidence(data, integrityHash);
      triggerDownload(json, `nodehound_evidence_${shortAddr}_${date}.json`, 'application/json;charset=utf-8');
    }

    setJustGenerated(true);
    setTimeout(() => setJustGenerated(false), 2000);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-panel-border bg-background hover:border-cyan-500/50 hover:text-cyan-300 text-gray-400 transition-colors shrink-0"
      >
        {justGenerated ? (
          <>
            <Check className="w-3.5 h-3.5 text-green-400" /> Done
          </>
        ) : (
          <>
            <FileDown className="w-3.5 h-3.5" /> Generate Report <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-panel border border-panel-border rounded-lg shadow-xl z-20 overflow-hidden">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors text-left border-b border-panel-border last:border-b-0"
              >
                <Icon className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-gray-200">{opt.label}</span>
                  <span className="text-[10px] text-gray-500">{opt.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}