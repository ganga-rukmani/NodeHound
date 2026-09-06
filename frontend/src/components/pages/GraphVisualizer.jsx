import React, { useState, useMemo, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import clsx from 'clsx';
import {
  Maximize2,
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Info,
  Layers,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import TreeView from '../TreeView';
import AddressBadge from '../common/AddressBadge';
import TxBadge from '../common/TxBadge';

cytoscape.use(fcose);

const riskColor = (score) => {
  if (score == null) return '#64748b';
  if (score > 0.7) return '#ef4444';
  if (score > 0.4) return '#eab308';
  return '#22c55e';
};

const CLUSTER_PALETTE = ['#f472b6', '#38bdf8', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#fbbf24', '#fb7185'];
const clusterColor = (clusterId) => {
  if (!clusterId) return '#64748b';
  let hash = 0;
  for (let i = 0; i < clusterId.length; i++) hash = (hash + clusterId.charCodeAt(i)) % CLUSTER_PALETTE.length;
  return CLUSTER_PALETTE[hash];
};

export default function GraphVisualizer() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
    selectTransaction,
  } = useInvestigation();

  const { nodes = [], edges = [], seed_address, chain = 'ethereum' } = traceData || {};

  const [viewMode, setViewMode] = useState('graph'); // 'graph' | 'tree'
  const [crossChainActive, setCrossChainActive] = useState(false);
  const [clustersActive, setClustersActive] = useState(false);

  const cyRef = useRef(null);

  // Active address being inspected (default to selectedAddress or seed_address)
  const activeAddress = selectedAddress || seed_address;

  // Separate incoming and outgoing transfers around activeAddress
  const { incomingEdges, outgoingEdges, flowLabel, flowDescription } = useMemo(() => {
    if (!activeAddress) {
      return { incomingEdges: [], outgoingEdges: [], flowLabel: 'No Wallet Selected', flowDescription: '' };
    }
    const lower = activeAddress.toLowerCase();
    const inc = edges.filter((e) => (e.to_address || '').toLowerCase() === lower);
    const out = edges.filter((e) => (e.from_address || '').toLowerCase() === lower);

    let label = 'Isolated Node';
    let desc = 'No connected transfers observed within current trace hops.';

    if (inc.length > 0 && out.length > 0) {
      label = `Flow View: Incoming + Outgoing (${inc.length} In, ${out.length} Out)`;
      desc = 'Selected wallet participates in separate inbound and outbound transfers. Never represents a single bidirectional transaction.';
    } else if (inc.length > 0) {
      label = `Flow View: Incoming Only (${inc.length} In)`;
      desc = 'All observed transactions are inbound funds received from upstream counterparties.';
    } else if (out.length > 0) {
      label = `Flow View: Outgoing Only (${out.length} Out)`;
      desc = 'All observed transactions are outbound funds dispatched to downstream counterparties.';
    }

    return { incomingEdges: inc, outgoingEdges: out, flowLabel: label, flowDescription: desc };
  }, [activeAddress, edges]);

  // Cytoscape Elements
  const elements = useMemo(() => {
    const activeLower = (activeAddress || '').toLowerCase();

    const cyNodes = nodes.map((node) => {
      const isSeed = (node.address || '').toLowerCase() === (seed_address || '').toLowerCase();
      const isSelected = (node.address || '').toLowerCase() === activeLower;
      let nodeColor = '#3b82f6';
      if (node.chain === 'tron') nodeColor = '#ef4444';
      if (node.chain === 'bitcoin') nodeColor = '#f97316';

      if (clustersActive && node.cluster_id) {
        nodeColor = clusterColor(String(node.cluster_id));
      }

      return {
        data: {
          id: node.address,
          label: node.label || `${node.address.slice(0, 6)}...${node.address.slice(-4)}`,
          fullAddress: node.address,
          chain: node.chain || chain,
          isSeed,
          isSelected,
          isLabeled: Boolean(node.is_labeled),
          riskScore: node.risk_score,
          color: nodeColor,
        },
      };
    });

    const cyEdges = edges.map((edge, idx) => {
      const isBridge = edge.is_inferred_bridge_edge || (edge.tx_hash || '').startsWith('cross_chain_');
      const isIncoming = (edge.to_address || '').toLowerCase() === activeLower;
      const isOutgoing = (edge.from_address || '').toLowerCase() === activeLower;

      return {
        data: {
          id: edge.tx_hash ? `${edge.tx_hash}-${idx}` : `edge-${idx}`,
          source: edge.from_address,
          target: edge.to_address,
          amount: edge.amount,
          asset: edge.asset,
          isBridge,
          isIncoming,
          isOutgoing,
          isFocused: isIncoming || isOutgoing,
        },
      };
    });

    return [...cyNodes, ...cyEdges];
  }, [nodes, edges, seed_address, activeAddress, chain, clustersActive]);

  // Cytoscape Stylesheet with directional emphasis
  const stylesheet = useMemo(() => [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'background-color': 'data(color)',
        'font-size': '10px',
        color: '#e2e8f0',
        'text-valign': 'bottom',
        'text-margin-y': 5,
        'border-width': 2,
        'border-color': '#64748b',
        width: 32,
        height: 32,
      },
    },
    {
      selector: 'node[?isSeed]',
      style: {
        'border-color': '#22d3ee',
        'border-width': 4,
        width: 42,
        height: 42,
        'font-weight': 'bold',
        color: '#22d3ee',
      },
    },
    {
      selector: 'node[?isSelected]',
      style: {
        'border-color': '#f59e0b',
        'border-width': 4,
        width: 46,
        height: 46,
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': '#475569',
        'target-arrow-color': '#475569',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'arrow-scale': 0.85,
      },
    },
    {
      selector: 'edge[?isIncoming]',
      style: {
        'line-color': '#10b981',
        'target-arrow-color': '#10b981',
        width: 2.5,
        'arrow-scale': 1.1,
      },
    },
    {
      selector: 'edge[?isOutgoing]',
      style: {
        'line-color': '#f59e0b',
        'target-arrow-color': '#f59e0b',
        width: 2.5,
        'arrow-scale': 1.1,
      },
    },
    {
      selector: 'edge[?isBridge]',
      style: {
        'line-color': '#a855f7',
        'target-arrow-color': '#a855f7',
        'line-style': 'dashed',
        width: 2.5,
      },
    },
  ], []);

  const handleFitGraph = () => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 50);
    }
  };

  return (
    <div className="flex flex-col space-y-4 animate-fade-in relative">
      {/* ── Visualizer Controls Bar ──────────────────────────────────────── */}
      <div className="cyber-panel p-3 flex items-center justify-between gap-3 text-xs flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-black/40 p-1 rounded-lg border border-panel-border">
            <button
              onClick={() => setViewMode('graph')}
              className={clsx(
                'px-3 py-1 rounded text-xs font-semibold transition-colors',
                viewMode === 'graph' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-gray-400 hover:text-white'
              )}
            >
              Interactive Cytoscape Graph
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={clsx(
                'px-3 py-1 rounded text-xs font-semibold transition-colors',
                viewMode === 'tree' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-gray-400 hover:text-white'
              )}
            >
              Hierarchical Hop Tree
            </button>
          </div>
        </div>

        {viewMode === 'graph' && (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer text-gray-300 select-none">
              <input
                type="checkbox"
                checked={crossChainActive}
                onChange={(e) => setCrossChainActive(e.target.checked)}
                className="rounded bg-black border-panel-border text-purple-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="font-medium">Highlight Cross-Chain</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer text-gray-300 select-none">
              <input
                type="checkbox"
                checked={clustersActive}
                onChange={(e) => setClustersActive(e.target.checked)}
                className="rounded bg-black border-panel-border text-pink-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="font-medium">Color by Entity Cluster</span>
            </label>

            <button
              onClick={handleFitGraph}
              className="cyber-button-secondary text-xs py-1 px-2.5 flex items-center gap-1"
              title="Fit graph to view"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Fit Screen
            </button>
          </div>
        )}
      </div>

      {/* ── View Rendering Canvas ────────────────────────────────────────── */}
      <div className="cyber-panel relative overflow-hidden h-[540px] border border-panel-border bg-black/40">
        {viewMode === 'tree' ? (
          <TreeView
            nodes={nodes}
            edges={edges}
            seedAddress={seed_address}
            onSelectNode={(addr) => selectAddress(addr)}
            selectedNodeId={activeAddress}
          />
        ) : (
          <>
            <CytoscapeComponent
              elements={elements}
              stylesheet={stylesheet}
              layout={{ name: 'fcose', animate: true, animationDuration: 600 }}
              style={{ width: '100%', height: '100%' }}
              cy={(cy) => {
                cyRef.current = cy;
                cy.on('tap', 'node', (evt) => {
                  selectAddress(evt.target.id());
                });
                cy.on('tap', 'edge', (evt) => {
                  const edgeSource = evt.target.data('source');
                  const edgeTarget = evt.target.data('target');
                  const edgeData = edges.find(
                    (e) =>
                      e.tx_hash === evt.target.id() ||
                      ((e.from_address || '').toLowerCase() === (edgeSource || '').toLowerCase() &&
                       (e.to_address || '').toLowerCase() === (edgeTarget || '').toLowerCase())
                  );
                  if (edgeData) selectTransaction(edgeData);
                });
              }}
            />

            {/* Bottom Investigator Legend */}
            <div className="absolute bottom-3 left-3 bg-black/85 backdrop-blur px-3 py-2 rounded-lg border border-panel-border text-[11px] flex items-center gap-3 text-gray-300 pointer-events-none flex-wrap max-w-xl z-10 shadow-lg">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Incoming (Inflow)
              </span>
              <span className="flex items-center gap-1 text-amber-400 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Outgoing (Outflow)
              </span>
              <span className="flex items-center gap-1 text-cyan-300">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-cyan-400" /> Seed
              </span>
              <span className="flex items-center gap-1 text-purple-300">
                <span className="inline-block w-3 border-b-2 border-dashed border-purple-400" /> Bridge
              </span>
              <span className="text-[10px] text-gray-400 border-l border-panel-border pl-2">
                Arrow direction (→) = Observed blockchain transfer direction (FROM → TO)
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Selected Wallet Flow Inspector (Prompt #1) ────────────────────── */}
      {activeAddress && (
        <div className="cyber-panel p-5 border-panel-border bg-black/40 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-panel-border/70 pb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  Forensic Flow Inspector
                </span>
                <span className="text-xs font-semibold text-gray-200">
                  {flowLabel}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Inspected Wallet:</span>
                <AddressBadge
                  address={activeAddress}
                  chain={chain}
                  onClick={(addr) => selectAddress(addr)}
                  showFull
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono text-gray-400 bg-panel px-3 py-1.5 rounded border border-panel-border">
                {incomingEdges.length + outgoingEdges.length} Associated Transfer{incomingEdges.length + outgoingEdges.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Legal / Semantic Advisory Banner */}
          <div className="p-3 bg-panel/80 border border-panel-border rounded-lg text-xs text-gray-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-gray-100">Directional Integrity Notice:</strong> Blockchain transfers move strictly from sender to recipient (<code className="text-cyan-300">from_address → to_address</code>). When both incoming and outgoing relationships exist, they reflect <strong className="text-yellow-300">distinct sequential transactions</strong>, NOT money moving back-and-forth simultaneously.
            </p>
          </div>

          {/* Grouped Transfers: Incoming Funds vs Outgoing Funds */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Incoming Funds */}
            <div className="p-4 rounded-lg bg-panel border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between border-b border-panel-border/60 pb-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <ArrowDownLeft className="w-4 h-4" />
                  Incoming Funds ({incomingEdges.length})
                </div>
                <span className="text-[10px] text-gray-400 font-mono">Counterparty → Wallet</span>
              </div>

              {incomingEdges.length === 0 ? (
                <div className="text-xs text-gray-500 italic py-4 text-center">
                  No incoming transfers detected for this wallet in the trace window.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {incomingEdges.map((edge, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectTransaction(edge)}
                      className="p-2.5 rounded bg-black/40 border border-panel-border hover:border-emerald-500/60 cursor-pointer transition-colors text-xs font-mono space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-400 font-bold">
                          +{Number(edge.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })}{' '}
                          <span className="text-[10px] text-gray-300">{edge.asset || 'NATIVE'}</span>
                        </span>
                        {edge.amount_usd != null && (
                          <span className="text-gray-400 text-[10px]">
                            ${Number(edge.amount_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-300">
                        <span className="text-gray-500">From:</span>
                        <span className="truncate max-w-[150px]">{edge.from_address}</span>
                        <ArrowRight className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="text-gray-400">Target</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>{edge.timestamp ? new Date(edge.timestamp).toLocaleDateString() : 'Direct observed'}</span>
                        <span className="text-cyan-400 hover:underline">Click for Tx Details →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Outgoing Funds */}
            <div className="p-4 rounded-lg bg-panel border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between border-b border-panel-border/60 pb-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <ArrowUpRight className="w-4 h-4" />
                  Outgoing Funds ({outgoingEdges.length})
                </div>
                <span className="text-[10px] text-gray-400 font-mono">Wallet → Counterparty</span>
              </div>

              {outgoingEdges.length === 0 ? (
                <div className="text-xs text-gray-500 italic py-4 text-center">
                  No outgoing transfers detected for this wallet in the trace window.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {outgoingEdges.map((edge, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectTransaction(edge)}
                      className="p-2.5 rounded bg-black/40 border border-panel-border hover:border-amber-500/60 cursor-pointer transition-colors text-xs font-mono space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-amber-400 font-bold">
                          -{Number(edge.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })}{' '}
                          <span className="text-[10px] text-gray-300">{edge.asset || 'NATIVE'}</span>
                        </span>
                        {edge.amount_usd != null && (
                          <span className="text-gray-400 text-[10px]">
                            ${Number(edge.amount_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-300">
                        <span className="text-gray-400">Target</span>
                        <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="text-gray-500">To:</span>
                        <span className="truncate max-w-[150px]">{edge.to_address}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>{edge.timestamp ? new Date(edge.timestamp).toLocaleDateString() : 'Direct observed'}</span>
                        <span className="text-cyan-400 hover:underline">Click for Tx Details →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
