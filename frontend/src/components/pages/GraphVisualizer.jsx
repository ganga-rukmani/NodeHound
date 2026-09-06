import React, { useState, useMemo, useRef, useEffect } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import clsx from 'clsx';
import { Maximize2, GitMerge, Layers, Search, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import TreeView from '../TreeView';

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
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const cyRef = useRef(null);

  // Cytoscape Elements
  const elements = useMemo(() => {
    const cyNodes = nodes.map((node) => {
      const isSeed = (node.address || '').toLowerCase() === (seed_address || '').toLowerCase();
      const isSelected = (node.address || '').toLowerCase() === (selectedAddress || '').toLowerCase();
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
      return {
        data: {
          id: edge.tx_hash ? `${edge.tx_hash}-${idx}` : `edge-${idx}`,
          source: edge.from_address,
          target: edge.to_address,
          amount: edge.amount,
          asset: edge.asset,
          isBridge,
        },
      };
    });

    return [...cyNodes, ...cyEdges];
  }, [nodes, edges, seed_address, selectedAddress, chain, clustersActive]);

  // Cytoscape Stylesheet
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
        width: 44,
        height: 44,
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
        'arrow-scale': 0.8,
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
    <div className="flex flex-col h-full space-y-3 animate-fade-in relative min-h-[600px]">
      {/* ── Visualizer Controls Bar ──────────────────────────────────────── */}
      <div className="cyber-panel p-3 flex items-center justify-between gap-3 text-xs">
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
          <div className="flex items-center gap-3">
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

      {/* ── View Rendering ───────────────────────────────────────────────── */}
      <div className="flex-grow cyber-panel relative overflow-hidden h-[600px] border border-panel-border bg-black/40">
        {viewMode === 'tree' ? (
          <TreeView
            nodes={nodes}
            edges={edges}
            seedAddress={seed_address}
            onSelectNode={(addr) => selectAddress(addr)}
            selectedNodeId={selectedAddress}
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
                  const edgeData = edges.find((e) => e.tx_hash === evt.target.id() || e.from_address === evt.target.data('source'));
                  if (edgeData) selectTransaction(edgeData);
                });
              }}
            />

            {/* Bottom Legend */}
            <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur px-3 py-2 rounded-lg border border-panel-border text-[11px] flex items-center gap-3 text-gray-300 pointer-events-none">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Ethereum</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> TRON</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Bitcoin</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-cyan-400" /> Seed</span>
              <span className="flex items-center gap-1.5 text-purple-300">
                <span className="inline-block w-4 border-b-2 border-dashed border-purple-400" /> Bridge
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

