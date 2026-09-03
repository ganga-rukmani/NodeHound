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
import TreeView from './TreeView.jsx';
import TableView from './TableView.jsx';

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

  // ── Path Finder state ──────────────────────────────────────────────────────
  const [pathFinderOpen, setPathFinderOpen] = useState(false);
  const [pathFromId, setPathFromId] = useState('');
  const [pathToId, setPathToId] = useState('');
  const [pathResult, setPathResult] = useState(null); // { fromNode, toNode, pathNodeAddresses, edges }
  const [pathActive, setPathActive] = useState(false);
  const [isolatePath, setIsolatePath] = useState(false); // show only path nodes alone

  // ── View mode: 'graph' | 'tree' | 'table' ─────────────────────────────────
  const [viewMode, setViewMode] = useState('graph');


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

  // Highlight path nodes + edges on the graph when a path search is active (Graph view only)
  useEffect(() => {
    if (viewMode !== 'graph' || !cyRef.current) return;
    const cy = cyRef.current;
    if (cy.destroyed() || !cy._private?.renderer) return;

    try {
      if (pathActive && pathResult) {
        const fromAddr = pathResult.fromNode?.address;
        const toAddr = pathResult.toNode?.address;
        const pathAddrs = new Set(pathResult.pathNodeAddresses || [fromAddr, toAddr]);

        const pathNodesEle = cy.nodes().filter((n) => pathAddrs.has(n.id()));
        const pathEdgesEle = cy.edges().filter((e) =>
          pathAddrs.has(e.data('source')) && pathAddrs.has(e.data('target'))
        );
        const otherNodesEle = cy.nodes().not(pathNodesEle);
        const otherEdgesEle = cy.edges().not(pathEdgesEle);

        if (isolatePath) {
          // Show ONLY path nodes alone - hide all background clutter
          otherNodesEle.style({ display: 'none' });
          otherEdgesEle.style({ display: 'none' });
        } else {
          // Dim background elements to very faint silhouettes
          otherNodesEle.style({
            display: 'element',
            opacity: 0.04,
          });
          otherEdgesEle.style({
            display: 'element',
            opacity: 0.02,
          });
        }

        // Highlight path edges: thick glowing cyan lines
        pathEdgesEle.style({
          display: 'element',
          opacity: 1,
          width: 5,
          'line-color': '#22d3ee',
          'target-arrow-color': '#22d3ee',
          'arrow-scale': 1.6,
          'curve-style': 'bezier',
          'z-index': 9998,
        });

        // Highlight path nodes: large 56px glowing badges with clear high-contrast labels
        pathNodesEle.forEach((n) => {
          const id = n.id();
          const isFrom = id === fromAddr;
          const isTo = id === toAddr;
          n.style({
            display: 'element',
            opacity: 1,
            width: isFrom || isTo ? 56 : 44,
            height: isFrom || isTo ? 56 : 44,
            'font-size': isFrom || isTo ? '12px' : '10px',
            'font-weight': 'bold',
            color: '#ffffff',
            'text-background-color': '#090d16',
            'text-background-opacity': 0.95,
            'text-background-padding': '5px',
            'text-background-shape': 'roundrectangle',
            'text-border-width': 1.5,
            'text-border-color': isFrom ? '#22d3ee' : isTo ? '#f97316' : '#a855f7',
            'text-border-opacity': 1,
            'border-width': 4,
            'border-style': 'solid',
            'border-color': isFrom ? '#22d3ee' : isTo ? '#f97316' : '#a855f7',
            'background-color': isFrom ? '#0891b2' : isTo ? '#ea580c' : '#7c3aed',
            'z-index': 9999,
          });
        });

        // Automatically zoom in and center directly on the path elements
        const pathCollection = pathNodesEle.union(pathEdgesEle);
        if (pathCollection.length > 0 && !cy.destroyed() && cy._private?.renderer) {
          cy.stop();
          cy.animate(
            {
              fit: {
                eles: pathCollection,
                padding: 100,
              },
            },
            { duration: 600, easing: 'ease-in-out-cubic' }
          );
        }
      } else {
        // Reset all styles
        cy.nodes().style({
          display: 'element',
          opacity: 1,
          width: (ele) => (ele.data('isSeed') ? 44 : 30),
          height: (ele) => (ele.data('isSeed') ? 44 : 30),
          'font-size': '9px',
          'font-weight': 'normal',
          color: '#cbd5e1',
          'text-background-opacity': 0,
          'border-width': (ele) => (ele.data('isLabeled') ? 2 : 2),
          'border-color': (ele) => (ele.data('isLabeled') ? '#e2e8f0' : '#64748b'),
          'border-style': (ele) => (ele.data('isLabeled') ? 'solid' : 'dashed'),
          'background-color': (ele) => ele.data('bgColor') || '#64748b',
          'z-index': 1,
        });

        cy.nodes('[?isSeed]').style({
          'border-color': '#22d3ee',
          'border-width': 3,
          'border-style': 'solid',
        });

        cy.nodes('[?isIntermediary]').style({
          'border-color': '#facc15',
          'border-width': 2,
          'border-style': 'dotted',
        });

        cy.edges().style({
          display: 'element',
          opacity: 1,
          width: (ele) => (ele.data('isBridge') ? 3 : 1.5),
          'line-color': (ele) => (ele.data('isBridge') ? '#a855f7' : '#334155'),
          'target-arrow-color': (ele) => (ele.data('isBridge') ? '#a855f7' : '#475569'),
          'arrow-scale': 1,
          'z-index': 0,
        });
      }
    } catch (_) {}
  }, [pathActive, pathResult, isolatePath, viewMode]);

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

  // ── Pure BFS Shortest Path Finder (Works across Graph, Tree, and Table) ───
  const findGraphPath = useCallback((startAddr, goalAddr) => {
    if (!startAddr || !goalAddr || startAddr === goalAddr) return null;
    const start = startAddr.toLowerCase();
    const goal = goalAddr.toLowerCase();

    // 1. Direct edge check
    const direct = edges.filter(
      (e) => (e.from_address?.toLowerCase() === start && e.to_address?.toLowerCase() === goal) ||
             (e.from_address?.toLowerCase() === goal && e.to_address?.toLowerCase() === start)
    );
    if (direct.length > 0) {
      return { pathNodeAddresses: [startAddr, goalAddr], edges: direct };
    }

    // 2. Directed BFS (Forward flow: start -> goal)
    const adj = {};
    edges.forEach((e) => {
      if (!e.from_address || !e.to_address) return;
      const u = e.from_address.toLowerCase();
      const v = e.to_address.toLowerCase();
      if (!adj[u]) adj[u] = [];
      adj[u].push({ target: v, edge: e, origTarget: e.to_address });
    });

    let queue = [{ node: start, pathNodes: [startAddr], pathEdges: [] }];
    let visited = new Set([start]);

    while (queue.length > 0) {
      const { node, pathNodes, pathEdges } = queue.shift();
      if (node === goal) {
        return { pathNodeAddresses: pathNodes, edges: pathEdges };
      }
      for (const { target, edge, origTarget } of (adj[node] || [])) {
        if (!visited.has(target)) {
          visited.add(target);
          queue.push({
            node: target,
            pathNodes: [...pathNodes, origTarget],
            pathEdges: [...pathEdges, edge],
          });
        }
      }
    }

    // 3. Undirected BFS (Any transaction linkage between start and goal)
    const undirAdj = {};
    edges.forEach((e) => {
      if (!e.from_address || !e.to_address) return;
      const u = e.from_address.toLowerCase();
      const v = e.to_address.toLowerCase();
      if (!undirAdj[u]) undirAdj[u] = [];
      if (!undirAdj[v]) undirAdj[v] = [];
      undirAdj[u].push({ target: v, edge: e, origTarget: e.to_address });
      undirAdj[v].push({ target: u, edge: e, origTarget: e.from_address });
    });

    queue = [{ node: start, pathNodes: [startAddr], pathEdges: [] }];
    visited = new Set([start]);

    while (queue.length > 0) {
      const { node, pathNodes, pathEdges } = queue.shift();
      if (node === goal) {
        return { pathNodeAddresses: pathNodes, edges: pathEdges };
      }
      for (const { target, edge, origTarget } of (undirAdj[node] || [])) {
        if (!visited.has(target)) {
          visited.add(target);
          queue.push({
            node: target,
            pathNodes: [...pathNodes, origTarget],
            pathEdges: [...pathEdges, edge],
          });
        }
      }
    }

    return null;
  }, [edges]);

  // Deduplicate node entries by address for unique select dropdown options
  const uniqueNodes = useMemo(() => {
    const seen = new Set();
    const list = [];
    (nodes || []).forEach((n) => {
      if (n?.address && !seen.has(n.address.toLowerCase())) {
        seen.add(n.address.toLowerCase());
        list.push(n);
      }
    });
    return list;
  }, [nodes]);

  // ── Path Finder logic ──────────────────────────────────────────────────────
  const handleFindPath = useCallback(() => {
    if (!pathFromId || !pathToId || pathFromId === pathToId) return;
    const fromNode = nodes.find((n) => n.address.toLowerCase() === pathFromId.toLowerCase());
    const toNode = nodes.find((n) => n.address.toLowerCase() === pathToId.toLowerCase());
    if (!fromNode || !toNode) return;

    const res = findGraphPath(pathFromId, pathToId);
    if (res) {
      setPathResult({
        fromNode,
        toNode,
        pathNodeAddresses: res.pathNodeAddresses,
        edges: res.edges,
      });
    } else {
      setPathResult({
        fromNode,
        toNode,
        pathNodeAddresses: [pathFromId, pathToId],
        edges: [],
      });
    }
    setPathActive(true);
  }, [pathFromId, pathToId, nodes, findGraphPath]);

  const zoomToPath = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !pathActive || !pathResult) return;
    const pathAddrs = pathResult.pathNodeAddresses || [pathResult.fromNode?.address, pathResult.toNode?.address];
    const pathNodesEle = cy.nodes().filter((n) => pathAddrs.includes(n.id()));
    const pathEdgesEle = cy.edges().filter((e) => {
      const src = e.data('source');
      const tgt = e.data('target');
      return pathAddrs.includes(src) && pathAddrs.includes(tgt);
    });
    const pathCollection = pathNodesEle.union(pathEdgesEle);

    if (pathCollection.length > 0) {
      cy.stop();
      cy.animate(
        {
          fit: {
            eles: pathCollection,
            padding: 100,
          },
        },
        { duration: 600, easing: 'ease-in-out-cubic' }
      );
    }
  }, [pathActive, pathResult]);

  const handleClearPath = useCallback(() => {
    setPathResult(null);
    setPathActive(false);
    setIsolatePath(false);
    if (cyRef.current) {
      cyRef.current.animate({ fit: { padding: 40 } }, { duration: 500 });
    }
  }, []);

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

        {/* ── View mode switcher ─────────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 bg-background border border-panel-border rounded-lg p-0.5 shrink-0">
          {/* Graph */}
          <button
            onClick={() => setViewMode('graph')}
            title="Graph view"
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              viewMode === 'graph'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="19" cy="19" r="2" />
              <line x1="7" y1="11" x2="17" y2="6" /><line x1="7" y1="13" x2="17" y2="18" />
            </svg>
            Graph
          </button>
          {/* Tree */}
          <button
            onClick={() => setViewMode('tree')}
            title="Tree view — hierarchical from seed node"
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              viewMode === 'tree'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 3v5M12 8h-5v5M12 8h5v5M7 13v3M17 13v3" />
            </svg>
            Tree
          </button>
          {/* Table */}
          <button
            onClick={() => setViewMode('table')}
            title="Table view — sortable node list"
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              viewMode === 'table'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-gray-500 hover:text-gray-300'
            )}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="9" x2="9" y2="21" />
            </svg>
            Table
          </button>
        </div>

        <SahyogExportButton />
        <ReportGenerator data={data} />
      </div>


      {/* ── Alert / Recommendation Banner ────────────────────────────────── */}
      <AlertBanner summary={summary} />

      {/* ── Main area: graph + optional side panel ────────────────────────── */}
      <div className="flex-grow relative flex min-h-0">

        <div className="flex-grow relative" ref={containerRef}>
          {/* ── Tree view ─────────────────────────────────────────────────── */}
          {viewMode === 'tree' && (
            <TreeView
              nodes={nodes}
              edges={edges}
              seedAddress={data.seed_address}
              onSelectNode={setSelectedNodeId}
              selectedNodeId={selectedNodeId}
              pathResult={pathResult}
              pathActive={pathActive}
              isolatePath={isolatePath}
              onClearPath={handleClearPath}
              onTogglePathFinder={() => setPathFinderOpen((v) => !v)}
            />
          )}

          {/* ── Table view ────────────────────────────────────────────────── */}
          {viewMode === 'table' && (
            <TableView
              nodes={nodes}
              edges={edges}
              seedAddress={data.seed_address}
              onSelectNode={setSelectedNodeId}
              selectedNodeId={selectedNodeId}
            />
          )}

          {/* ── Graph view (Cytoscape) ─────────────────────────────────────── */}
          {viewMode === 'graph' && (<>
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

          </>)} {/* end viewMode === 'graph' */}

          {/* Floating Controls in Top-Right: Available in both Graph and Tree views */}
          {(viewMode === 'graph' || viewMode === 'tree') && (
            <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5 z-20">
              {viewMode === 'graph' && (
                <>
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
                </>
              )}

              {/* ── Path Finder Panel ── */}
              <div className="bg-black/70 border border-panel-border rounded-lg shadow-lg backdrop-blur overflow-hidden">
                <button
                  onClick={() => setPathFinderOpen((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 w-full hover:bg-white/5 transition-colors select-none"
                >
                  <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="5" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                    <path d="M7 12h10M5 10V6a2 2 0 012-2h10a2 2 0 012 2v4" />
                  </svg>
                  <span className="text-sm font-medium text-gray-200">Find Path</span>
                  {pathActive && (
                    <span className="ml-auto text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded-full font-bold">
                      Active
                    </span>
                  )}
                  <svg
                    className={clsx('w-3 h-3 text-gray-500 transition-transform ml-auto', pathFinderOpen ? 'rotate-180' : '')}
                    fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                  >
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {pathFinderOpen && (
                  <div className="px-3 pb-3 flex flex-col gap-2 border-t border-panel-border pt-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-cyan-400 uppercase font-semibold tracking-wide">From Node</label>
                      <select
                        value={pathFromId}
                        onChange={(e) => { setPathFromId(e.target.value); handleClearPath(); }}
                        className="bg-background border border-panel-border rounded text-xs text-gray-200 px-2 py-1.5 focus:outline-none focus:border-cyan-500/50 w-48"
                      >
                        <option value="">Select node…</option>
                        {uniqueNodes.map((n) => (
                          <option key={n.address} value={n.address}>
                            {n.label ? `${n.label} (${truncateAddress(n.address)})` : truncateAddress(n.address)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-orange-400 uppercase font-semibold tracking-wide">To Node</label>
                      <select
                        value={pathToId}
                        onChange={(e) => { setPathToId(e.target.value); handleClearPath(); }}
                        className="bg-background border border-panel-border rounded text-xs text-gray-200 px-2 py-1.5 focus:outline-none focus:border-orange-500/50 w-48"
                      >
                        <option value="">Select node…</option>
                        {uniqueNodes.map((n) => (
                          <option key={n.address} value={n.address}>
                            {n.label ? `${n.label} (${truncateAddress(n.address)})` : truncateAddress(n.address)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Isolate Path Toggle */}
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer pt-1 select-none">
                      <input
                        type="checkbox"
                        checked={isolatePath}
                        onChange={(e) => setIsolatePath(e.target.checked)}
                        className="rounded bg-background border-panel-border text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Show path nodes alone (isolate)</span>
                    </label>

                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={handleFindPath}
                        disabled={!pathFromId || !pathToId || pathFromId === pathToId}
                        className="flex-grow text-xs py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
                      >
                        Find
                      </button>
                      {pathActive && (
                        <>
                          <button
                            onClick={zoomToPath}
                            className="text-xs px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-cyan-300 font-medium transition-colors flex items-center gap-1"
                            title="Zoom in on path"
                          >
                            <Maximize2 className="w-3 h-3" /> Zoom
                          </button>
                          <button
                            onClick={handleClearPath}
                            className="text-xs px-2.5 py-1.5 rounded border border-panel-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Path Results Side Panel ──────────────────────────────────────── */}
        {pathActive && pathResult && !selectedNode && (
          <div className="w-[360px] shrink-0 border-l border-panel-border bg-panel/95 backdrop-blur flex flex-col overflow-hidden animate-slide-in-right">
            {/* Header */}
            <div className="p-4 border-b border-panel-border flex flex-col gap-2.5 bg-black/20 shrink-0">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="5" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                    <path d="M7 12h10M5 10V6a2 2 0 012-2h10a2 2 0 012 2v4" />
                  </svg>
                  <h3 className="font-semibold text-base text-white">Path Transactions</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={zoomToPath}
                    className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-cyan-300 transition-colors"
                    title="Zoom in on path"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleClearPath}
                    className="text-gray-500 hover:text-white transition-colors p-1"
                    title="Clear path"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Path Node Sequence / Hops */}
              <div className="flex items-center gap-1.5 text-[11px] flex-wrap bg-background/50 p-2 rounded border border-panel-border">
                {pathResult.pathNodeAddresses && pathResult.pathNodeAddresses.length > 2 ? (
                  pathResult.pathNodeAddresses.map((addr, idx) => {
                    const nodeObj = nodes.find((n) => n.address === addr);
                    const isFirst = idx === 0;
                    const isLast = idx === pathResult.pathNodeAddresses.length - 1;
                    return (
                      <React.Fragment key={addr}>
                        {idx > 0 && <ArrowRight className="w-3 h-3 text-gray-500 shrink-0" />}
                        <span className={clsx(
                          'font-mono px-1.5 py-0.5 rounded border text-[10px]',
                          isFirst ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30 font-bold' :
                          isLast ? 'text-orange-400 bg-orange-500/10 border-orange-500/30 font-bold' :
                          'text-purple-300 bg-purple-500/10 border-purple-500/30'
                        )}>
                          {nodeObj?.label || truncateAddress(addr)}
                        </span>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <>
                    <span className="text-cyan-400 font-mono bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded font-bold">
                      {pathResult.fromNode?.label || truncateAddress(pathResult.fromNode?.address)}
                    </span>
                    <ArrowRight className="w-3 h-3 text-gray-500 shrink-0" />
                    <span className="text-orange-400 font-mono bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded font-bold">
                      {pathResult.toNode?.label || truncateAddress(pathResult.toNode?.address)}
                    </span>
                  </>
                )}
              </div>

              {/* View toggle: Isolate vs Context */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isolatePath}
                    onChange={(e) => setIsolatePath(e.target.checked)}
                    className="rounded bg-background border-panel-border text-cyan-500 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span>Show path alone (hide other nodes)</span>
                </label>
                <button
                  onClick={zoomToPath}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 font-medium"
                >
                  <Maximize2 className="w-3 h-3" /> Focus
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-grow overflow-y-auto p-4 flex flex-col gap-4">
              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Transactions Found</span>
                  <span className="text-2xl font-mono font-bold text-cyan-400">{pathResult.edges.length}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Total Value (USD)</span>
                  <span className="text-sm font-mono font-bold text-gray-200">
                    {pathResult.edges.some((e) => e.amount_usd != null)
                      ? formatUSD(pathResult.edges.reduce((s, e) => s + (e.amount_usd ?? 0), 0))
                      : '—'}
                  </span>
                </div>
              </div>

              <div className="h-px bg-panel-border" />

              {pathResult.edges.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="text-3xl">🔎</div>
                  <p className="text-sm text-gray-400">No direct transactions found between these two nodes in the current graph.</p>
                  <p className="text-xs text-gray-600">The nodes may be connected through intermediary hops.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">
                    Transactions ({pathResult.edges.length})
                  </span>
                  {pathResult.edges.map((edge, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-cyan-500/20 text-xs"
                    >
                      <ArrowRight className="w-3 h-3 text-cyan-400 shrink-0" />
                      <div className="flex flex-col flex-grow min-w-0">
                        <span className="font-mono text-gray-400 truncate text-[10px]">
                          {edge.tx_hash ? `${edge.tx_hash.slice(0, 18)}…` : '—'}
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
                  ))}
                </div>
              )}
            </div>
          </div>
        )}


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