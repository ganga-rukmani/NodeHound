import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import clsx from 'clsx';
import { Copy, X, ArrowRight, ArrowLeft, Maximize2, CheckCircle, ExternalLink } from 'lucide-react';
import { api } from '../api.js';
import AlertBanner from './AlertBanner.jsx';
import ReportGenerator from './ReportGenerator.jsx';
import SahyogExportButton from './SahyogExportButton.jsx';

cytoscape.use(fcose);

// ── Formatters ──────────────────────────────────────────────────────────────
const truncateAddress = (addr) =>
  addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : '';

const formatUSD = (val) =>
  val != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
    : '—';

const formatAmount = (amt, asset) =>
  amt != null ? `${Number(amt).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${asset}` : '—';

const formatDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

// ── Block explorer links ─────────────────────────────────────────────────────
const explorerUrl = (chain, address) => {
  if (chain === 'ethereum') return `https://etherscan.io/address/${address}`;
  if (chain === 'tron') return `https://tronscan.org/#/address/${address}`;
  if (chain === 'bitcoin') return `https://www.blockchain.com/explorer/addresses/btc/${address}`;
  return null;
};

// ── Risk helpers ─────────────────────────────────────────────────────────────
const riskColor = (score) => {
  if (score == null) return '#64748b';
  if (score > 0.7) return '#ef4444';
  if (score > 0.4) return '#eab308';
  return '#22c55e';
};

const riskLabel = (score) => {
  if (score == null) return 'Unknown';
  if (score > 0.7) return 'High';
  if (score > 0.4) return 'Medium';
  return 'Low';
};

// ── Cluster color helper ─────────────────────────────────────────────────────
const CLUSTER_PALETTE = ['#f472b6', '#38bdf8', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#fbbf24', '#fb7185'];
const clusterColor = (clusterId) => {
  if (!clusterId) return '#64748b';
  let hash = 0;
  for (let i = 0; i < clusterId.length; i++) hash = (hash + clusterId.charCodeAt(i)) % CLUSTER_PALETTE.length;
  return CLUSTER_PALETTE[hash];
};

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={handle} className={clsx('transition-colors', className)}>
      {copied
        ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
        : <Copy className="w-3.5 h-3.5 text-gray-500 hover:text-cyan-400" />}
    </button>
  );
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────
function NodeTooltip({ node, x, y }) {
  if (!node) return null;
  return (
    <div
      className="absolute z-30 pointer-events-none bg-black/90 border border-panel-border rounded-lg shadow-xl px-3 py-2 backdrop-blur text-xs min-w-[180px]"
      style={{ left: x + 14, top: y + 14 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={clsx(
          'text-[9px] font-medium px-1.5 py-0.5 rounded-full border shrink-0',
          node.chain === 'ethereum' ? 'text-blue-300 border-blue-500/30 bg-blue-500/10' :
          node.chain === 'tron' ? 'text-red-300 border-red-500/30 bg-red-500/10' :
          'text-orange-300 border-orange-500/30 bg-orange-500/10'
        )}>
          {node.chain?.toUpperCase()}
        </span>
        {node.risk_score != null && (
          <span
            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
            style={{ color: riskColor(node.risk_score), background: `${riskColor(node.risk_score)}22` }}
          >
            {Math.round(node.risk_score * 100)}%
          </span>
        )}
      </div>
      <div className="font-medium text-gray-100">{node.label || 'Unknown Entity'}</div>
      <div className="font-mono text-[10px] text-gray-500 mt-0.5">{truncateAddress(node.address)}</div>
      {node.category && <div className="text-[10px] text-gray-400 mt-0.5 capitalize">{node.category}</div>}
      <div className="text-[9px] text-gray-600 mt-1.5 italic">Click for full details</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Results({ data, isDemo, onBack, onLoadDemo }) {
  const { summary, nodes = [], edges = [] } = data || {};
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [crossChainActive, setCrossChainActive] = useState(false);
  const [clustersActive, setClustersActive] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [copiedEvidence, setCopiedEvidence] = useState(false);
  const cyRef = useRef(null);
  const containerRef = useRef(null);

  // Highlight bridge edges + connected nodes on toggle
  React.useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const bridges = cy.edges().filter((e) => e.data('isBridge'));
    const bridgeNodes = bridges.connectedNodes();
    if (crossChainActive) {
      cy.edges().not(bridges).animate({ style: { opacity: 0.08 } }, { duration: 300 });
      cy.nodes().not(bridgeNodes).animate({ style: { opacity: 0.2 } }, { duration: 300 });
      bridges
        .animate({ style: { 'line-color': '#d8b4fe', width: 7 } }, { duration: 300 })
        .animate({ style: { 'line-color': '#a855f7', width: 3 } }, { duration: 400 });
      bridgeNodes.animate({ style: { 'border-color': '#a855f7', 'border-width': 3 } }, { duration: 300 });
    } else {
      cy.edges().animate({ style: { opacity: 1 } }, { duration: 300 });
      cy.nodes().animate({ style: { opacity: 1 } }, { duration: 300 });
      cy.nodes().forEach((n) => {
        const isLabeled = n.data('isLabeled');
        const isSeed = n.data('isSeed');
        n.animate({ style: {
          'border-color': isSeed ? '#22d3ee' : isLabeled ? '#e2e8f0' : '#64748b',
          'border-width': isSeed ? 3 : 2,
        }}, { duration: 300 });
      });
    }
  }, [crossChainActive]);

  useEffect(() => {
    if (!selectedNodeId) {
      setSelectedNodeDetails(null);
      setDetailLoading(false);
      return;
    }

    const node = nodes.find((n) => n.address === selectedNodeId);
    if (!node) {
      setSelectedNodeDetails(null);
      setDetailLoading(false);
      return;
    }

    if (isDemo) {
      setSelectedNodeDetails(node);
      setDetailLoading(false);
      return;
    }

    let active = true;
    setDetailLoading(true);
    api.getNode(node.chain, node.address)
      .then((detail) => {
        if (active) {
          setSelectedNodeDetails(detail);
        }
      })
      .catch(() => {
        if (active) {
          setSelectedNodeDetails(node);
        }
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedNodeId, nodes, isDemo]);

  const selectedNode = useMemo(
    () => {
      if (!selectedNodeId) return null;
      const baseNode = nodes.find((n) => n.address === selectedNodeId) || null;
      if (!baseNode) return null;
      return { ...baseNode, ...(selectedNodeDetails || {}) };
    },
    [selectedNodeId, nodes, selectedNodeDetails]
  );

  const selectedNodeEdges = useMemo(
    () =>
      selectedNodeId
        ? edges.filter(
            (e) => e.from_address === selectedNodeId || e.to_address === selectedNodeId
          )
        : [],
    [selectedNodeId, edges]
  );

  // First/last seen + in/out totals for the selected node - real
  // investigator-relevant fields, derived from the edges already in view.
  const selectedNodeStats = useMemo(() => {
    if (!selectedNodeEdges.length) return null;
    const timestamps = selectedNodeEdges.map((e) => e.timestamp).filter(Boolean).sort();
    const inflows = selectedNodeEdges.filter((e) => e.to_address === selectedNodeId);
    const outflows = selectedNodeEdges.filter((e) => e.from_address === selectedNodeId);
    return {
      firstSeen: timestamps[0] || null,
      lastSeen: timestamps[timestamps.length - 1] || null,
      inCount: inflows.length,
      outCount: outflows.length,
    };
  }, [selectedNodeEdges, selectedNodeId]);

  const handleCopyEvidence = () => {
    if (!selectedNode) return;
    const evidence = {
      address: selectedNode.address,
      chain: selectedNode.chain,
      label: selectedNode.label,
      category: selectedNode.category,
      attribution_tier: selectedNode.attribution_tier,
      risk_score: selectedNode.risk_score,
      cluster_id: selectedNode.cluster_id,
      transactions_in_view: selectedNodeEdges.length,
      exported_at: new Date().toISOString(),
    };
    navigator.clipboard.writeText(JSON.stringify(evidence, null, 2));
    setCopiedEvidence(true);
    setTimeout(() => setCopiedEvidence(false), 1500);
  };

  // Addresses on the highest-risk path - used to flag intermediary/layering
  // wallets (unlabeled hops between the seed and the top destination).
  const pathAddresses = useMemo(
    () => new Set(summary?.highest_risk_path || []),
    [summary]
  );

  // Build Cytoscape elements
  const elements = useMemo(() => {
    const clusterGroups = {};
    if (clustersActive) {
      nodes.forEach((n) => {
        if (n.cluster_id) {
          (clusterGroups[n.cluster_id] = clusterGroups[n.cluster_id] || []).push(n);
        }
      });
    }

    const clusterParents = Object.entries(clusterGroups)
      .filter(([, members]) => members.length >= 2)
      .map(([clusterId, members]) => ({
        data: {
          id: `cluster-${clusterId}`,
          label: `Cluster (${members.length})`,
          isClusterParent: true,
          clusterColor: clusterColor(clusterId),
        },
        selectable: false,
        grabbable: false,
      }));

    const clusterableIds = new Set(
      Object.entries(clusterGroups).filter(([, m]) => m.length >= 2).map(([id]) => id)
    );

    const cyNodes = nodes.map((n) => {
      let bgColor = '#64748b';
      if (n.chain === 'ethereum') bgColor = '#3b82f6';
      else if (n.chain === 'tron') bgColor = '#ef4444';
      else if (n.chain === 'bitcoin') bgColor = '#f97316';

      const rc = riskColor(n.risk_score);
      const isSeed = n.address === data.seed_address;
      const isIntermediary = pathAddresses.has(n.address) && !n.is_labeled && !isSeed;
      const hasClusterParent = clustersActive && n.cluster_id && clusterableIds.has(n.cluster_id);

      return {
        data: {
          id: n.address,
          label: n.label ? (n.label.length > 12 ? n.label.slice(0, 12) + '…' : n.label) : truncateAddress(n.address),
          bgColor,
          glowColor: rc,
          risk: n.risk_score ?? 0,
          isLabeled: n.is_labeled,
          isSeed,
          isIntermediary,
          ...(hasClusterParent ? { parent: `cluster-${n.cluster_id}` } : {}),
        },
      };
    });

    const cyEdges = edges.map((e, idx) => ({
      data: {
        id: `e${idx}`,
        source: e.from_address,
        target: e.to_address,
        isBridge: e.is_inferred_bridge_edge,
      },
    }));

    return [...clusterParents, ...cyNodes, ...cyEdges];
  }, [nodes, edges, data?.seed_address, pathAddresses, clustersActive]);

  const stylesheet = useMemo(() => [
    {
      selector: 'node[?isClusterParent]',
      style: {
        shape: 'round-rectangle',
        'background-color': 'data(clusterColor)',
        'background-opacity': 0.1,
        'border-width': 1.5,
        'border-style': 'dashed',
        'border-color': 'data(clusterColor)',
        label: 'data(label)',
        'text-valign': 'top',
        'text-halign': 'center',
        'font-size': '8px',
        color: 'data(clusterColor)',
        'text-background-opacity': 0,
        padding: '12px',
      },
    },
    {
      selector: 'node',
      style: {
        'background-color': 'data(bgColor)',
        label: 'data(label)',
        color: '#cbd5e1',
        'font-family': 'Space Mono, monospace',
        'font-size': '9px',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 5,
        'border-width': (ele) => (ele.data('isLabeled') ? 2 : 2),
        'border-color': (ele) => (ele.data('isLabeled') ? '#e2e8f0' : '#64748b'),
        'border-style': (ele) => (ele.data('isLabeled') ? 'solid' : 'dashed'),
        width: (ele) => (ele.data('isSeed') ? 44 : 30),
        height: (ele) => (ele.data('isSeed') ? 44 : 30),
        'shadow-blur': (ele) => Math.max(0, ele.data('risk') * 24),
        'shadow-color': 'data(glowColor)',
        'shadow-opacity': (ele) => Math.min(0.9, ele.data('risk') * 0.85),
        'shadow-offset-x': 0,
        'shadow-offset-y': 0,
      },
    },
    {
      selector: 'node[?isSeed]',
      style: { 'border-color': '#22d3ee', 'border-width': 3, 'border-style': 'solid' },
    },
    {
      selector: 'node[?isIntermediary]',
      style: { 'border-color': '#facc15', 'border-width': 2, 'border-style': 'dotted' },
    },
    {
      selector: 'node:selected',
      style: { 'border-color': '#22d3ee', 'border-width': 3 },
    },
    {
      selector: 'edge',
      style: {
        width: (ele) => (ele.data('isBridge') ? 3 : 1.5),
        'line-color': (ele) => (ele.data('isBridge') ? '#a855f7' : '#334155'),
        'target-arrow-color': (ele) => (ele.data('isBridge') ? '#a855f7' : '#475569'),
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'line-style': (ele) => (ele.data('isBridge') ? 'dashed' : 'solid'),
        opacity: 1,
      },
    },
  ], []);

  const handleFitGraph = useCallback(() => {
    cyRef.current?.fit(undefined, 30);
  }, []);

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!nodes.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <div className="cyber-panel p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h2 className="text-xl font-semibold text-gray-200 mb-2">No Graph Data Found</h2>
          <p className="text-gray-400 text-sm mb-8">
            No nodes or edges were returned for this address. Try a different address or a wider time range.
          </p>
          <div className="flex flex-col gap-3">
            <button onClick={onBack} className="cyber-button-primary w-full py-2">
              Try Another Address
            </button>
            <button
              onClick={onLoadDemo}
              className="border border-gray-700 rounded-md py-2 text-gray-400 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors text-sm"
            >
              Load Demo Trace Instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden absolute inset-0 top-[57px]">

      {/* ── Summary Bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-panel-border bg-panel/90 backdrop-blur shrink-0 flex-wrap gap-y-2">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-white transition-colors flex items-center gap-1 text-sm shrink-0"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="h-6 w-px bg-panel-border shrink-0" />

        <div className="flex flex-col min-w-0">
          <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Seed Address</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-gray-200 truncate">{truncateAddress(data.seed_address)}</span>
            <CopyButton text={data.seed_address} />
          </div>
        </div>

        <div className="h-6 w-px bg-panel-border shrink-0" />

        <div className="flex flex-col min-w-0">
          <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Top Destination</span>
          {summary?.top_destination ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-200">{summary.top_destination.label}</span>
              <span
                className="text-sm font-mono font-bold px-2 py-0.5 rounded"
                style={{
                  color: riskColor(summary.top_destination.confidence),
                  background: `${riskColor(summary.top_destination.confidence)}22`,
                  border: `1px solid ${riskColor(summary.top_destination.confidence)}44`,
                }}
              >
                {Math.round(summary.top_destination.confidence * 100)}%
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-500 italic">No confident destination</span>
          )}
        </div>

        <div className="h-6 w-px bg-panel-border shrink-0" />

        <div className="flex flex-col">
          <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">VASP Matches</span>
          <span className="text-xs font-medium text-gray-200">{summary?.known_vasp_matches ?? 0}</span>
        </div>

        <div className="h-6 w-px bg-panel-border shrink-0" />

        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-background border border-panel-border font-mono text-gray-400">
            {summary?.total_nodes ?? nodes.length} nodes
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-background border border-panel-border font-mono text-gray-400">
            {summary?.total_edges ?? edges.length} edges
          </span>
        </div>

        {isDemo && (
          <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded shrink-0">
            Demo
          </span>
        )}

        <div className="flex-grow" />
        <SahyogExportButton />
        <ReportGenerator data={data} />
      </div>

      {/* ── Alert / Recommendation Banner ────────────────────────────────── */}
      <AlertBanner summary={summary} />

      {/* ── Main area: graph + optional side panel ────────────────────────── */}
      <div className="flex-grow relative flex min-h-0">

        <div className="flex-grow relative" ref={containerRef}>
          <CytoscapeComponent
            elements={elements}
            stylesheet={stylesheet}
            layout={{ name: 'fcose', animate: true, animationDuration: 600, randomize: false }}
            style={{ width: '100%', height: '100%' }}
            cy={(cy) => {
              cyRef.current = cy;
              cy.on('tap', 'node', (evt) => setSelectedNodeId(evt.target.id()));
              cy.on('tap', (evt) => { if (evt.target === cy) setSelectedNodeId(null); });

              // Hover tooltip - quick-glance info without needing a click,
              // so an investigator can scan a dense graph fast.
              cy.on('mouseover', 'node', (evt) => {
                const target = evt.target;
                if (target.data('isClusterParent')) return; // skip compound cluster boxes
                const nodeData = nodes.find((n) => n.address === target.id());
                if (!nodeData) return;
                const pos = target.renderedPosition();
                setHoveredNode(nodeData);
                setTooltipPos({ x: pos.x, y: pos.y });
                document.body.style.cursor = 'pointer';
              });
              cy.on('mouseout', 'node', () => {
                setHoveredNode(null);
                document.body.style.cursor = 'default';
              });
              cy.on('pan zoom drag', () => setHoveredNode(null));
            }}
          />

          {hoveredNode && <NodeTooltip node={hoveredNode} x={tooltipPos.x} y={tooltipPos.y} />}

          {/* Bottom-left legend */}
          <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap pointer-events-none">
            <div className="text-xs bg-black/70 px-3 py-2 rounded border border-panel-border backdrop-blur flex items-center gap-4">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Ethereum</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Tron</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Bitcoin</span>
              <span className="flex items-center gap-1.5 text-purple-300">
                <span className="inline-block w-6 border-b-2 border-dashed border-purple-500" /> Bridge
              </span>
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-cyan-400 inline-block" /> Seed
              </span>
              <span className="flex items-center gap-1.5 text-yellow-400">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-dotted border-yellow-400 inline-block" /> Intermediary
              </span>
            </div>
          </div>

          <button
            onClick={handleFitGraph}
            className="absolute bottom-4 right-4 p-2 rounded-md bg-black/70 border border-panel-border text-gray-400 hover:text-white transition-colors backdrop-blur"
            title="Fit to screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
            <label className="flex items-center cursor-pointer bg-black/70 border border-panel-border px-3 py-2 rounded-lg shadow-lg backdrop-blur hover:bg-white/5 transition-colors select-none">
              <div className="relative mr-3">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={crossChainActive}
                  onChange={() => setCrossChainActive((v) => !v)}
                />
                <div className={clsx('block w-10 h-5 rounded-full transition-colors duration-200', crossChainActive ? 'bg-purple-600' : 'bg-gray-700')} />
                <div className={clsx('absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow', crossChainActive ? 'translate-x-5' : 'translate-x-0')} />
              </div>
              <span className="text-sm font-medium text-gray-200">Cross-chain</span>
            </label>
            {crossChainActive && (
              <span className="text-xs text-purple-300 px-2 py-1 rounded bg-purple-900/40 border border-purple-500/30">
                Cross-chain fund movement
              </span>
            )}

            <label className="flex items-center cursor-pointer bg-black/70 border border-panel-border px-3 py-2 rounded-lg shadow-lg backdrop-blur hover:bg-white/5 transition-colors select-none">
              <div className="relative mr-3">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={clustersActive}
                  onChange={() => setClustersActive((v) => !v)}
                />
                <div className={clsx('block w-10 h-5 rounded-full transition-colors duration-200', clustersActive ? 'bg-pink-500' : 'bg-gray-700')} />
                <div className={clsx('absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 shadow', clustersActive ? 'translate-x-5' : 'translate-x-0')} />
              </div>
              <span className="text-sm font-medium text-gray-200">Clusters</span>
            </label>
          </div>
        </div>

        {/* ── Side Panel ─────────────────────────────────────────────────────── */}
        {selectedNode && (
          <div className="w-[360px] shrink-0 border-l border-panel-border bg-panel/95 backdrop-blur flex flex-col overflow-hidden animate-slide-in-right">
            <div className="p-4 border-b border-panel-border flex items-start justify-between bg-black/20 shrink-0">
              <div className="flex flex-col gap-1 min-w-0 pr-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base text-white truncate">
                    {selectedNode.label || 'Unknown Entity'}
                  </h3>
                  {selectedNode.category && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-300 capitalize shrink-0">
                      {selectedNode.category}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs text-gray-400">{truncateAddress(selectedNode.address)}</span>
                  <CopyButton text={selectedNode.address} />
                  {explorerUrl(selectedNode.chain, selectedNode.address) && (
                    <a
                      href={explorerUrl(selectedNode.chain, selectedNode.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on block explorer"
                      className="text-gray-500 hover:text-cyan-400 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={clsx(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
                    selectedNode.chain === 'ethereum' ? 'text-blue-300 border-blue-500/30 bg-blue-500/10' :
                    selectedNode.chain === 'tron' ? 'text-red-300 border-red-500/30 bg-red-500/10' :
                    'text-orange-300 border-orange-500/30 bg-orange-500/10'
                  )}>
                    {selectedNode.chain?.toUpperCase()}
                  </span>
                  {selectedNode.is_labeled && (
                    <span className="text-[10px] text-green-300 border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                      Labeled
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-gray-500 hover:text-white transition-colors p-1 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-5">
              {detailLoading && (
                <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-300">
                  Loading node details...
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Risk Score</span>
                <div className="flex items-center gap-3">
                  <span
                    className="text-3xl font-mono font-bold w-14 shrink-0"
                    style={{ color: riskColor(selectedNode.risk_score) }}
                  >
                    {selectedNode.risk_score != null
                      ? Math.round(selectedNode.risk_score * 100)
                      : '—'}
                  </span>
                  <div className="flex-grow flex flex-col gap-1">
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(selectedNode.risk_score ?? 0) * 100}%`,
                          backgroundColor: riskColor(selectedNode.risk_score),
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{riskLabel(selectedNode.risk_score)} risk</span>
                  </div>
                </div>
              </div>

              {/* First/last seen + in/out totals - real investigator fields */}
              {selectedNodeStats && (
                <>
                  <div className="h-px bg-panel-border" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">First Seen</span>
                      <span className="text-xs font-mono text-gray-300">{formatDate(selectedNodeStats.firstSeen)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Last Seen</span>
                      <span className="text-xs font-mono text-gray-300">{formatDate(selectedNodeStats.lastSeen)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Inbound Txns</span>
                      <span className="text-xs font-mono text-green-400">{selectedNodeStats.inCount}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Outbound Txns</span>
                      <span className="text-xs font-mono text-red-400">{selectedNodeStats.outCount}</span>
                    </div>
                  </div>
                </>
              )}

              {(selectedNode.attribution_tier || selectedNode.label_source || selectedNode.cluster_id != null) && (
                <>
                  <div className="h-px bg-panel-border" />
                  <div className="grid grid-cols-2 gap-3">
                    {selectedNode.attribution_tier && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Attribution Tier</span>
                        <span className="text-xs font-mono text-gray-300">{selectedNode.attribution_tier}</span>
                      </div>
                    )}
                    {selectedNode.label_source && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Label Source</span>
                        <span className="text-xs font-mono text-gray-300">{selectedNode.label_source}</span>
                      </div>
                    )}
                    {selectedNode.cluster_id != null && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Cluster ID</span>
                        <span className="text-xs font-mono text-gray-300">{selectedNode.cluster_id}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="h-px bg-panel-border" />

              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Explainability</span>
                {selectedNode.shap_factors?.length ? (
                  <div className="flex flex-col gap-3">
                    {[...selectedNode.shap_factors]
                      .sort((a, b) => Math.abs(b.impact ?? b.contribution ?? 0) - Math.abs(a.impact ?? a.contribution ?? 0))
                      .map((factor, i) => {
                        const val = factor.impact ?? factor.contribution ?? 0;
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-mono text-gray-300">{factor.feature}</span>
                              <span className="text-gray-500 tabular-nums">
                                {val > 0 ? '+' : ''}{val.toFixed(3)}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, Math.abs(val) * 120)}%`,
                                  backgroundColor: val > 0 ? '#ef4444' : '#22c55e',
                                  opacity: 0.85,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 italic p-3 bg-white/[0.03] rounded border border-white/[0.05]">
                    Explainability unavailable for this address.
                  </div>
                )}
              </div>

              <div className="h-px bg-panel-border" />

              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">
                  Transactions ({selectedNodeEdges.length})
                </span>
                {selectedNodeEdges.length === 0 ? (
                  <div className="text-xs text-gray-500 text-center py-4">No transactions in this view.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedNodeEdges.map((edge, i) => {
                      const isIn = edge.to_address === selectedNode.address;
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-xs"
                        >
                          <span className={clsx(
                            'shrink-0 flex items-center gap-0.5 font-medium',
                            isIn ? 'text-green-400' : 'text-red-400'
                          )}>
                            {isIn
                              ? <><ArrowRight className="w-3 h-3" /> IN</>
                              : <><ArrowLeft className="w-3 h-3" /> OUT</>}
                          </span>
                          <div className="flex flex-col flex-grow min-w-0">
                            <span className="font-mono text-gray-400 truncate text-[10px]">
                              {edge.tx_hash?.slice(0, 18)}…
                            </span>
                            <span className="text-gray-500 text-[10px]">
                              {edge.timestamp ? new Date(edge.timestamp).toLocaleDateString() : '—'}
                            </span>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span className="font-mono font-medium text-gray-200 text-[10px]">
                              {formatAmount(edge.amount, edge.asset)}
                            </span>
                            <span className="text-gray-500 text-[10px]">
                              {formatUSD(edge.amount_usd)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-panel-border" />

              {/* Per-node evidence export - lets an investigator cite just
                  this one address, not the whole trace. */}
              <button
                onClick={handleCopyEvidence}
                className="flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-md border border-panel-border hover:border-cyan-500/50 hover:text-cyan-300 text-gray-400 transition-colors"
              >
                {copiedEvidence ? (
                  <><CheckCircle className="w-3.5 h-3.5 text-green-400" /> Copied to clipboard</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> Copy Node Evidence (JSON)</>
                )}
              </button>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}