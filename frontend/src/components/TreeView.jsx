import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import {
  Copy,
  CheckCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ArrowRight,
  ArrowLeft,
  ChevronsRight,
  ChevronsLeft,
  Network,
  HelpCircle,
  Search,
  X
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────
const truncAddr = (addr) => (addr ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : '');

const riskColor = (score) => {
  if (score == null) return '#64748b';
  if (score > 0.7) return '#ef4444';
  if (score > 0.4) return '#eab308';
  return '#22c55e';
};

const fmtUSD = (val) =>
  val != null
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
        notation: 'compact',
      }).format(val)
    : null;

const explorerUrl = (chain, address) => {
  if (chain === 'ethereum') return `https://etherscan.io/address/${address}`;
  if (chain === 'tron') return `https://tronscan.org/#/address/${address}`;
  if (chain === 'bitcoin') return `https://www.blockchain.com/explorer/addresses/btc/${address}`;
  return null;
};

// Node card geometry
const CARD_W = 230;
const CARD_H = 76;
const COL_GAP = 120;
const ROW_GAP = 20;

// ── Layout algorithm for a directional tree ─────────────────────────────────
function computeTreeLayout(root, expandedSet, colDirection = 1, startCol = 0) {
  const positions = [];
  const connectors = [];
  let rowCursor = 0;

  function countRows(item) {
    const isExp =
      expandedSet.has(item.node.address) ||
      expandedSet.has(item.node.address?.toLowerCase());
    if (!isExp || !item.children || item.children.length === 0) {
      return 1;
    }
    return item.children.reduce((s, c) => s + countRows(c), 0);
  }

  function place(item, col) {
    const myRow = rowCursor;
    const isExp =
      expandedSet.has(item.node.address) ||
      expandedSet.has(item.node.address?.toLowerCase());
    const hasChildren = item.children && item.children.length > 0;

    if (!isExp || !hasChildren) {
      positions.push({
        id: item.node.address,
        x: col * (CARD_W + COL_GAP),
        y: rowCursor * (CARD_H + ROW_GAP),
        item,
        col,
      });
      rowCursor++;
      return myRow;
    }

    const childRows = [];
    for (const child of item.children) {
      const cRow = place(child, col + colDirection);
      childRows.push(cRow);
      connectors.push({
        fromId: item.node.address,
        toId: child.node.address,
        edgeInfo: child.inboundEdges,
        direction: colDirection >= 0 ? 'forward' : 'backward',
      });
    }

    const firstChildPos = positions.find((p) => p.id === item.children[0].node.address);
    const lastChildPos = positions.find(
      (p) => p.id === item.children[item.children.length - 1].node.address
    );
    const parentY =
      firstChildPos && lastChildPos
        ? (firstChildPos.y + lastChildPos.y) / 2
        : myRow * (CARD_H + ROW_GAP);

    positions.push({
      id: item.node.address,
      x: col * (CARD_W + COL_GAP),
      y: parentY,
      item,
      col,
    });

    return myRow;
  }

  place(root, startCol);
  return { positions, connectors };
}

// ── Node card SVG component ────────────────────────────────────────────────
function NodeCard({
  item,
  x,
  y,
  isSelected,
  isSeed,
  onSelect,
  onToggle,
  isExpanded,
  isPathNode = false,
  isPathSource = false,
  isPathTarget = false,
  isPathHop = false,
  isDimmed = false,
}) {
  const { node, children } = item;
  const hasChildren = children && children.length > 0;

  const chainColor =
    node.chain === 'ethereum'
      ? '#3b82f6'
      : node.chain === 'tron'
      ? '#ef4444'
      : '#f97316';
  const rc = riskColor(node.risk_score);

  const cardFill = isPathSource
    ? '#083344'
    : isPathTarget
    ? '#431407'
    : isPathHop
    ? '#2e1065'
    : isSelected
    ? '#0c4a6e'
    : isSeed
    ? '#164e63'
    : '#1e293b';

  const cardStroke = isPathSource
    ? '#22d3ee'
    : isPathTarget
    ? '#f97316'
    : isPathHop
    ? '#c084fc'
    : isSelected
    ? '#38bdf8'
    : isSeed
    ? '#06b6d4'
    : '#334155';

  const cardStrokeWidth = isPathSource || isPathTarget ? 3 : isPathHop || isSelected ? 2.5 : isSeed ? 2 : 1.2;

  const cardFilter = isPathSource
    ? 'drop-shadow(0 0 16px rgba(34,211,238,0.85))'
    : isPathTarget
    ? 'drop-shadow(0 0 16px rgba(249,115,22,0.85))'
    : isPathHop
    ? 'drop-shadow(0 0 12px rgba(192,132,252,0.65))'
    : isSelected
    ? 'drop-shadow(0 0 10px rgba(56,189,248,0.4))'
    : isSeed
    ? 'drop-shadow(0 0 8px rgba(6,182,212,0.3))'
    : 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.address);
      }}
      style={{
        cursor: 'pointer',
        opacity: isDimmed ? 0.14 : 1,
        transition: 'opacity 0.25s',
      }}
    >
      {/* Background card */}
      <rect
        width={CARD_W}
        height={CARD_H}
        rx={8}
        ry={8}
        fill={cardFill}
        stroke={cardStroke}
        strokeWidth={cardStrokeWidth}
        style={{ filter: cardFilter }}
      />

      {/* Left chain strip */}
      <rect x={0} y={0} width={4} height={CARD_H} rx={4} ry={4} fill={chainColor} />

      {/* Risk bar at bottom */}
      {node.risk_score != null && (
        <rect
          x={4}
          y={CARD_H - 3}
          width={(CARD_W - 4) * Math.min(node.risk_score, 1)}
          height={3}
          rx={1.5}
          fill={rc}
          opacity={0.85}
        />
      )}

      {/* Chain dot & label */}
      <circle cx={16} cy={18} r={4} fill={chainColor} />
      <text
        x={26}
        y={19}
        fontSize={11}
        fontWeight="600"
        fill={isSelected ? '#f0f9ff' : isSeed ? '#e0f2fe' : '#e2e8f0'}
        dominantBaseline="middle"
      >
        {(node.label || truncAddr(node.address)).slice(0, 20)}
        {(node.label || truncAddr(node.address)).length > 20 ? '…' : ''}
      </text>

      {/* Address */}
      <text
        x={26}
        y={35}
        fontSize={9.5}
        fill={isPathSource ? '#67e8f9' : isPathTarget ? '#fdba74' : '#94a3b8'}
        dominantBaseline="middle"
        fontFamily="monospace"
        fontWeight={isPathNode ? 'bold' : 'normal'}
      >
        {truncAddr(node.address)}
      </text>

      {/* Category / Subtitle */}
      <text
        x={26}
        y={54}
        fontSize={9}
        fill="#64748b"
        dominantBaseline="middle"
        style={{ textTransform: 'capitalize' }}
      >
        {node.category || node.chain || 'Wallet'}
      </text>

      {/* Path From Badge */}
      {isPathSource && (
        <g transform={`translate(${CARD_W - 74}, 8)`}>
          <rect width={66} height={17} rx={4} fill="#083344" stroke="#22d3ee" strokeWidth={1.5} />
          <text x={33} y={9.5} fontSize={8.5} fontWeight="800" fill="#22d3ee" textAnchor="middle" dominantBaseline="middle">
            FROM (START)
          </text>
        </g>
      )}

      {/* Path To Badge */}
      {isPathTarget && (
        <g transform={`translate(${CARD_W - 68}, 8)`}>
          <rect width={60} height={17} rx={4} fill="#431407" stroke="#f97316" strokeWidth={1.5} />
          <text x={30} y={9.5} fontSize={8.5} fontWeight="800" fill="#f97316" textAnchor="middle" dominantBaseline="middle">
            TO (TARGET)
          </text>
        </g>
      )}

      {/* Path Hop Badge */}
      {isPathHop && (
        <g transform={`translate(${CARD_W - 54}, 8)`}>
          <rect width={46} height={17} rx={4} fill="#2e1065" stroke="#c084fc" strokeWidth={1.2} />
          <text x={23} y={9.5} fontSize={8.5} fontWeight="800" fill="#c084fc" textAnchor="middle" dominantBaseline="middle">
            PATH HOP
          </text>
        </g>
      )}

      {/* Seed Badge */}
      {!isPathNode && isSeed && (
        <g transform={`translate(${CARD_W - 46}, 8)`}>
          <rect
            width={38}
            height={16}
            rx={4}
            fill="#083344"
            stroke="#0891b2"
            strokeWidth={1}
          />
          <text
            x={19}
            y={8.5}
            fontSize={8}
            fontWeight="700"
            fill="#22d3ee"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            TARGET
          </text>
        </g>
      )}

      {/* Risk percentage badge */}
      {node.risk_score != null && !isSeed && !isPathNode && (
        <g transform={`translate(${CARD_W - 46}, 8)`}>
          <rect
            width={38}
            height={16}
            rx={4}
            fill="#0f172a"
            stroke={rc}
            strokeWidth={1}
            opacity={0.8}
          />
          <text
            x={19}
            y={8.5}
            fontSize={9}
            fontWeight="700"
            fontFamily="monospace"
            fill={rc}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {Math.round(node.risk_score * 100)}%
          </text>
        </g>
      )}

      {/* Expand / Collapse Button */}
      {hasChildren && (
        <g
          transform={`translate(${CARD_W - 24}, ${CARD_H - 22})`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.address);
          }}
          style={{ cursor: 'pointer' }}
        >
          <circle
            cx={10}
            cy={10}
            r={10}
            fill={isExpanded ? '#1e293b' : '#0e7490'}
            stroke={isExpanded ? '#475569' : '#06b6d4'}
            strokeWidth={1.2}
          />
          <text
            x={10}
            y={10}
            fontSize={12}
            fontWeight="bold"
            fill={isExpanded ? '#94a3b8' : '#22d3ee'}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {isExpanded ? '−' : `+${children.length}`}
          </text>
        </g>
      )}
    </g>
  );
}

// ── SVG Curved Connector ────────────────────────────────────────────────────
function Connector({ from, to, edgeInfo, isBackward, isPathConnector = false, isDimmed = false }) {
  if (!from || !to) return null;

  // Compute connector ports
  let fromX, fromY, toX, toY;
  if (!isBackward) {
    fromX = from.x + CARD_W;
    fromY = from.y + CARD_H / 2;
    toX = to.x;
    toY = to.y + CARD_H / 2;
  } else {
    fromX = from.x;
    fromY = from.y + CARD_H / 2;
    toX = to.x + CARD_W;
    toY = to.y + CARD_H / 2;
  }

  const dx = Math.abs(toX - fromX) * 0.5;
  const path = !isBackward
    ? `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`
    : `M ${fromX} ${fromY} C ${fromX - dx} ${fromY}, ${toX + dx} ${toY}, ${toX} ${toY}`;

  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;

  const totalUSD = edgeInfo?.reduce((s, e) => s + (e.amount_usd ?? 0), 0) ?? 0;
  const txCount = edgeInfo?.length ?? 0;
  const isBridge = edgeInfo?.some((e) => e.is_inferred_bridge_edge);

  return (
    <g
      className="connector-group"
      style={{
        opacity: isDimmed ? 0.08 : 1,
        transition: 'opacity 0.25s',
      }}
    >
      {/* Path line glow backdrop if path connector */}
      {isPathConnector && (
        <path
          d={path}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={8}
          opacity={0.35}
          style={{ filter: 'drop-shadow(0 0 10px rgba(34,211,238,0.9))' }}
        />
      )}

      {/* Path line */}
      <path
        d={path}
        fill="none"
        stroke={isPathConnector ? '#22d3ee' : isBridge ? '#818cf8' : '#475569'}
        strokeWidth={isPathConnector ? 3.5 : 1.8}
        strokeDasharray={isBridge ? '5,4' : undefined}
      />

      {/* Direction arrow */}
      {!isBackward ? (
        <polygon
          points={
            isPathConnector
              ? `${toX - 10},${toY - 6} ${toX},${toY} ${toX - 10},${toY + 6}`
              : `${toX - 7},${toY - 4.5} ${toX},${toY} ${toX - 7},${toY + 4.5}`
          }
          fill={isPathConnector ? '#22d3ee' : '#64748b'}
        />
      ) : (
        <polygon
          points={
            isPathConnector
              ? `${toX + 10},${toY - 6} ${toX},${toY} ${toX + 10},${toY + 6}`
              : `${toX + 7},${toY - 4.5} ${toX},${toY} ${toX + 7},${toY + 4.5}`
          }
          fill={isPathConnector ? '#22d3ee' : '#64748b'}
        />
      )}

      {/* Transaction badge */}
      {(txCount > 0 || isPathConnector) && (
        <g transform={`translate(${midX - 32}, ${midY - 12})`}>
          <rect
            width={64}
            height={22}
            rx={4}
            fill={isPathConnector ? '#083344' : '#0f172a'}
            stroke={isPathConnector ? '#22d3ee' : '#334155'}
            strokeWidth={isPathConnector ? 1.5 : 1}
            style={{
              filter: isPathConnector
                ? 'drop-shadow(0 0 8px rgba(34,211,238,0.6))'
                : 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))',
            }}
          />
          <text
            x={32}
            y={totalUSD > 0 ? 6.5 : 11}
            fontSize={8}
            fill={isPathConnector ? '#67e8f9' : '#94a3b8'}
            fontWeight={isPathConnector ? '700' : 'normal'}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {txCount} txn{txCount > 1 ? 's' : ''}
          </text>
          {totalUSD > 0 && (
            <text
              x={32}
              y={15}
              fontSize={8}
              fontWeight="600"
              fill={isPathConnector ? '#22d3ee' : '#22c55e'}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {fmtUSD(totalUSD)}
            </text>
          )}
        </g>
      )}
    </g>
  );
}

// ── Main TreeView Component ─────────────────────────────────────────────────
export default function TreeView({
  nodes,
  edges,
  seedAddress,
  onSelectNode,
  selectedNodeId,
  pathResult = null,
  pathActive = false,
  isolatePath = false,
  onClearPath,
  onTogglePathFinder,
}) {
  // Flow mode: 'outflow' (destinations) | 'inflow' (sources) | 'both'
  const [flowMode, setFlowMode] = useState('outflow');
  const [expandedSet, setExpandedSet] = useState(() => new Set());
  const [showOrphanDrawer, setShowOrphanDrawer] = useState(false);
  const [orphanSearch, setOrphanSearch] = useState('');

  // Zoom and Pan state
  const [transform, setTransform] = useState({ scale: 1, x: 80, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // ── Path Finder Addresses & Consecutive Hop Pairs ─────────────────────────
  const pathAddrs = useMemo(() => {
    if (!pathActive || !pathResult) return new Set();
    const addrs = pathResult.pathNodeAddresses || [
      pathResult.fromNode?.address,
      pathResult.toNode?.address,
    ];
    return new Set(addrs.filter(Boolean).map((a) => a.toLowerCase()));
  }, [pathActive, pathResult]);

  const pathEdgePairs = useMemo(() => {
    if (!pathActive || !pathResult) return new Set();
    const addrs = pathResult.pathNodeAddresses || [
      pathResult.fromNode?.address,
      pathResult.toNode?.address,
    ];
    const s = new Set();
    for (let i = 0; i < addrs.length - 1; i++) {
      const u = addrs[i]?.toLowerCase();
      const v = addrs[i + 1]?.toLowerCase();
      if (u && v) {
        s.add(`${u}->${v}`);
        s.add(`${v}->${u}`);
      }
    }
    return s;
  }, [pathActive, pathResult]);

  // ── Node & Edge Hash Maps (Case-Insensitive) ──────────────────────────────
  const nodeMap = useMemo(() => {
    const m = {};
    (nodes || []).forEach((n) => {
      if (!n || !n.address) return;
      m[n.address] = n;
      m[n.address.toLowerCase()] = n;
    });
    return m;
  }, [nodes]);

  // Outflow adjacency: from -> to
  const outflowAdj = useMemo(() => {
    const adj = {};
    (edges || []).forEach((e) => {
      if (!e?.from_address) return;
      const key = e.from_address.toLowerCase();
      if (!adj[key]) adj[key] = [];
      adj[key].push(e);
    });
    return adj;
  }, [edges]);

  // Inflow adjacency: to -> from (reverse flow)
  const inflowAdj = useMemo(() => {
    const adj = {};
    (edges || []).forEach((e) => {
      if (!e?.to_address) return;
      const key = e.to_address.toLowerCase();
      if (!adj[key]) adj[key] = [];
      adj[key].push(e);
    });
    return adj;
  }, [edges]);

  // ── Intelligent Seed Resolution ──────────────────────────────────────────
  const effectiveSeedAddress = useMemo(() => {
    if (!nodes || nodes.length === 0) return null;

    if (seedAddress) {
      const match = nodeMap[seedAddress] || nodeMap[seedAddress.toLowerCase()];
      if (match) return match.address;
    }

    const ranked = [...nodes].filter((n) => n.path_rank_score != null);
    if (ranked.length > 0) {
      ranked.sort((a, b) => (b.path_rank_score || 0) - (a.path_rank_score || 0));
      return ranked[0].address;
    }

    const inAddrs = new Set((edges || []).map((e) => e.to_address?.toLowerCase()));
    const rootNode = nodes.find((n) => {
      const addr = n.address?.toLowerCase();
      return !inAddrs.has(addr) && (outflowAdj[addr]?.length > 0);
    });
    if (rootNode) return rootNode.address;

    return nodes[0]?.address || null;
  }, [nodes, edges, seedAddress, nodeMap, outflowAdj]);

  // ── Build Trees for Outflow & Inflow ──────────────────────────────────────
  const outflowTree = useMemo(() => {
    if (!effectiveSeedAddress) return null;

    const build = (addr, visited, depth) => {
      const norm = addr.toLowerCase();
      if (visited.has(norm)) return null;
      const node = nodeMap[norm] || nodeMap[addr];
      if (!node) return null;

      const next = new Set(visited);
      next.add(norm);

      const byDest = {};
      (outflowAdj[norm] || []).forEach((e) => {
        if (!e.to_address) return;
        const toNorm = e.to_address.toLowerCase();
        if (!byDest[toNorm]) byDest[toNorm] = { edgeList: [], target: e.to_address };
        byDest[toNorm].edgeList.push(e);
      });

      const children = Object.entries(byDest)
        .filter(([toNorm]) => !next.has(toNorm))
        .map(([toNorm, { edgeList, target }]) => {
          const childNode = nodeMap[toNorm] || nodeMap[target];
          const childAddr = childNode ? childNode.address : target;
          const child = build(childAddr, next, depth + 1);
          return child ? { ...child, inboundEdges: edgeList } : null;
        })
        .filter(Boolean);

      return { node, children, inboundEdges: [], depth };
    };

    return build(effectiveSeedAddress, new Set(), 0);
  }, [effectiveSeedAddress, nodeMap, outflowAdj]);

  const inflowTree = useMemo(() => {
    if (!effectiveSeedAddress) return null;

    const build = (addr, visited, depth) => {
      const norm = addr.toLowerCase();
      if (visited.has(norm)) return null;
      const node = nodeMap[norm] || nodeMap[addr];
      if (!node) return null;

      const next = new Set(visited);
      next.add(norm);

      const bySrc = {};
      (inflowAdj[norm] || []).forEach((e) => {
        if (!e.from_address) return;
        const fromNorm = e.from_address.toLowerCase();
        if (!bySrc[fromNorm]) bySrc[fromNorm] = { edgeList: [], target: e.from_address };
        bySrc[fromNorm].edgeList.push(e);
      });

      const children = Object.entries(bySrc)
        .filter(([fromNorm]) => !next.has(fromNorm))
        .map(([fromNorm, { edgeList, target }]) => {
          const childNode = nodeMap[fromNorm] || nodeMap[target];
          const childAddr = childNode ? childNode.address : target;
          const child = build(childAddr, next, depth + 1);
          return child ? { ...child, inboundEdges: edgeList } : null;
        })
        .filter(Boolean);

      return { node, children, inboundEdges: [], depth };
    };

    return build(effectiveSeedAddress, new Set(), 0);
  }, [effectiveSeedAddress, nodeMap, inflowAdj]);

  // Auto-expand first 2 levels on tree or mode change
  useEffect(() => {
    const toExpand = new Set();
    const walk = (item) => {
      if (!item) return;
      if (item.depth < 2 && item.children?.length) {
        toExpand.add(item.node.address);
        toExpand.add(item.node.address.toLowerCase());
        item.children.forEach(walk);
      }
    };
    if (flowMode === 'outflow' || flowMode === 'both') walk(outflowTree);
    if (flowMode === 'inflow' || flowMode === 'both') walk(inflowTree);
    setExpandedSet(toExpand);
  }, [effectiveSeedAddress, flowMode, outflowTree, inflowTree]);

  const toggleExpanded = (addr) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      const lower = addr.toLowerCase();
      if (next.has(addr) || next.has(lower)) {
        next.delete(addr);
        next.delete(lower);
      } else {
        next.add(addr);
        next.add(lower);
      }
      return next;
    });
  };

  // ── Layout computation ───────────────────────────────────────────────────
  const { positions, connectors, minX, maxX, minY, maxY } = useMemo(() => {
    let allPos = [];
    let allConn = [];

    if (flowMode === 'outflow' && outflowTree) {
      const res = computeTreeLayout(outflowTree, expandedSet, 1, 0);
      allPos = res.positions;
      allConn = res.connectors;
    } else if (flowMode === 'inflow' && inflowTree) {
      const res = computeTreeLayout(inflowTree, expandedSet, 1, 0);
      allPos = res.positions;
      allConn = res.connectors.map((c) => ({ ...c, direction: 'backward' }));
    } else if (flowMode === 'both') {
      const outRes = outflowTree
        ? computeTreeLayout(outflowTree, expandedSet, 1, 0)
        : { positions: [], connectors: [] };

      // For inflow in both mode, layout backwards (-col)
      const inRes = inflowTree
        ? computeTreeLayout(inflowTree, expandedSet, -1, 0)
        : { positions: [], connectors: [] };

      // Deduplicate the root seed node
      const seen = new Set();
      allPos = [];
      [...outRes.positions, ...inRes.positions].forEach((p) => {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          allPos.push(p);
        }
      });
      allConn = [
        ...outRes.connectors,
        ...inRes.connectors.map((c) => ({ ...c, direction: 'backward' })),
      ];
    }

    if (allPos.length === 0) {
      return { positions: [], connectors: [], minX: 0, maxX: 600, minY: 0, maxY: 400 };
    }

    const xs = allPos.map((p) => p.x);
    const ys = allPos.map((p) => p.y);
    return {
      positions: allPos,
      connectors: allConn,
      minX: Math.min(...xs),
      maxX: Math.max(...xs) + CARD_W,
      minY: Math.min(...ys),
      maxY: Math.max(...ys) + CARD_H,
    };
  }, [flowMode, outflowTree, inflowTree, expandedSet]);

  const posMap = useMemo(() => {
    const m = {};
    positions.forEach((p) => {
      m[p.id] = p;
      m[p.id.toLowerCase()] = p;
    });
    return m;
  }, [positions]);

  // ── Connected vs Other Cluster Nodes ──────────────────────────────────────
  const activeTreeIds = useMemo(() => {
    const s = new Set();
    positions.forEach((p) => s.add(p.id.toLowerCase()));
    return s;
  }, [positions]);

  const orphanNodes = useMemo(() => {
    return (nodes || []).filter((n) => !activeTreeIds.has(n.address?.toLowerCase()));
  }, [nodes, activeTreeIds]);

  const filteredOrphans = useMemo(() => {
    if (!orphanSearch.trim()) return orphanNodes;
    const q = orphanSearch.toLowerCase();
    return orphanNodes.filter(
      (n) =>
        n.address.toLowerCase().includes(q) ||
        (n.label && n.label.toLowerCase().includes(q)) ||
        (n.category && n.category.toLowerCase().includes(q))
    );
  }, [orphanNodes, orphanSearch]);

  // ── Pan & Zoom Handlers ───────────────────────────────────────────────────
  const isDraggingRef = useRef(false);
  const dragOriginRef = useRef({ mouseX: 0, mouseY: 0, initX: 0, initY: 0 });

  const handlePointerDown = (e) => {
    if (e.button !== 0) return; // only left click
    if (e.target.closest('button') || e.target.closest('input')) return;

    isDraggingRef.current = true;
    setIsDragging(true);
    dragOriginRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initX: transform.x,
      initY: transform.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragOriginRef.current.mouseX;
    const dy = e.clientY - dragOriginRef.current.mouseY;
    setTransform((prev) => ({
      ...prev,
      x: dragOriginRef.current.initX + dx,
      y: dragOriginRef.current.initY + dy,
    }));
  };

  const handlePointerUp = (e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  // Two-finger swipe / mouse wheel -> PAN (MOVE), Ctrl + wheel / pinch -> ZOOM
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheelNative = (e) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom or Ctrl + Wheel -> Zoom
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setTransform((prev) => {
          const nextScale = Math.min(Math.max(prev.scale * zoomFactor, 0.25), 2.5);
          const scaleRatio = nextScale / prev.scale;
          const nextX = mouseX - (mouseX - prev.x) * scaleRatio;
          const nextY = mouseY - (mouseY - prev.y) * scaleRatio;
          return { scale: nextScale, x: nextX, y: nextY };
        });
      } else {
        // Two-finger drag or trackpad swipe -> PAN (MOVE) left/right and up/down
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        setTransform((prev) => ({
          ...prev,
          x: prev.x - dx,
          y: prev.y - dy,
        }));
      }
    };

    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  const resetView = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const treeW = maxX - minX || 600;
      const treeH = maxY - minY || 400;
      const scaleX = (rect.width - 120) / treeW;
      const scaleY = (rect.height - 120) / treeH;
      const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.2);
      const centerX = (rect.width - treeW * fitScale) / 2 - minX * fitScale;
      const centerY = (rect.height - treeH * fitScale) / 2 - minY * fitScale;
      setTransform({ scale: fitScale, x: centerX, y: centerY });
    } else {
      setTransform({ scale: 1, x: 80, y: 80 });
    }
  }, [minX, maxX, minY, maxY]);

  // Center view on initial mount or mode switch
  useEffect(() => {
    if (!pathActive) {
      const timer = setTimeout(resetView, 50);
      return () => clearTimeout(timer);
    }
  }, [flowMode, resetView, pathActive]);

  // When path search is active, ensure both inflow and outflow branches are rendered
  useEffect(() => {
    if (pathActive && pathResult) {
      setFlowMode('both');
    }
  }, [pathActive, pathResult]);

  // Automatically unfold all ancestors and nodes along the found path
  useEffect(() => {
    if (!pathActive || !pathResult) return;
    const addrs = pathResult.pathNodeAddresses || [
      pathResult.fromNode?.address,
      pathResult.toNode?.address,
    ];

    setExpandedSet((prev) => {
      const next = new Set(prev);
      addrs.forEach((a) => {
        if (!a) return;
        next.add(a);
        next.add(a.toLowerCase());
      });

      const expandAncestors = (item, targetLower, path = []) => {
        if (!item) return false;
        const curr = item.node.address.toLowerCase();
        if (curr === targetLower) {
          path.forEach((addr) => {
            next.add(addr);
            next.add(addr.toLowerCase());
          });
          return true;
        }
        for (const child of item.children || []) {
          if (expandAncestors(child, targetLower, [...path, item.node.address])) {
            return true;
          }
        }
        return false;
      };

      addrs.forEach((a) => {
        if (!a) return;
        const low = a.toLowerCase();
        if (outflowTree) expandAncestors(outflowTree, low);
        if (inflowTree) expandAncestors(inflowTree, low);
      });

      return next;
    });
  }, [pathActive, pathResult, outflowTree, inflowTree]);

  // Automatically zoom and center directly on the path nodes in the tree
  const zoomToPathInTree = useCallback(() => {
    if (!pathActive || !pathResult || positions.length === 0 || !containerRef.current) return;
    const addrs = new Set(
      (pathResult.pathNodeAddresses || [
        pathResult.fromNode?.address,
        pathResult.toNode?.address,
      ])
        .filter(Boolean)
        .map((a) => a.toLowerCase())
    );

    const pathPositions = positions.filter((p) => addrs.has(p.id.toLowerCase()));
    if (pathPositions.length === 0) return;

    const xs = pathPositions.map((p) => p.x);
    const ys = pathPositions.map((p) => p.y);
    const minPX = Math.min(...xs);
    const maxPX = Math.max(...xs) + CARD_W;
    const minPY = Math.min(...ys);
    const maxPY = Math.max(...ys) + CARD_H;
    const pathW = maxPX - minPX;
    const pathH = maxPY - minPY;

    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = (rect.width - 160) / (pathW || 1);
    const scaleY = (rect.height - 160) / (pathH || 1);
    const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.45), 1.3);
    const centerX = (rect.width - pathW * fitScale) / 2 - minPX * fitScale;
    const centerY = (rect.height - pathH * fitScale) / 2 - minPY * fitScale;

    setTransform({ scale: fitScale, x: centerX, y: centerY });
  }, [pathActive, pathResult, positions]);

  // Focus on path when active
  useEffect(() => {
    if (pathActive && pathResult) {
      const timer = setTimeout(zoomToPathInTree, 120);
      return () => clearTimeout(timer);
    }
  }, [pathActive, pathResult, zoomToPathInTree]);

  if (!effectiveSeedAddress || positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
        <Network className="w-10 h-10 text-gray-600 animate-pulse" />
        <p className="text-sm">Building hierarchical transaction tree…</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-background text-gray-200 select-none">
      {/* ── Top Toolbar ───────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-panel-border bg-panel/90 backdrop-blur z-20 flex-wrap gap-2">
        {/* Left: Direction / Flow Mode Selector */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-panel-border text-xs">
          <span className="text-gray-500 font-medium px-2 py-0.5 text-[11px] uppercase tracking-wider">
            Flow:
          </span>
          <button
            onClick={() => setFlowMode('outflow')}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-all text-xs',
              flowMode === 'outflow'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
            Outflow (Destinations)
          </button>
          <button
            onClick={() => setFlowMode('inflow')}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-all text-xs',
              flowMode === 'inflow'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
            Inflow (Sources)
          </button>
          <button
            onClick={() => setFlowMode('both')}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition-all text-xs',
              flowMode === 'both'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            <Network className="w-3.5 h-3.5 text-cyan-400" />
            Flow View: Incoming + Outgoing
          </button>
        </div>

        {/* Center: Investigator Legend */}
        <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Incoming (Inflow)
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Outgoing (Outflow)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm" /> Ethereum
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm" /> Tron
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-sm" /> Bitcoin
          </span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="inline-block w-4 border-b border-dashed border-indigo-400" /> Bridge
          </span>
          <span className="text-[10px] text-gray-500 border-l border-panel-border pl-2">
            Arrow (→) = Transfer Direction (FROM → TO)
          </span>
        </div>

        {/* Right: Path Finder, Other Nodes, Zoom & Reset Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Find Path Toggle Button */}
          <button
            onClick={onTogglePathFinder}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors',
              pathActive
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-sm font-semibold'
                : 'bg-panel-border/30 border-panel-border text-gray-300 hover:text-cyan-300 hover:border-cyan-500/30'
            )}
            title="Open Find Path tool"
          >
            <Search className="w-3.5 h-3.5 text-cyan-400" />
            <span>Find Path</span>
            {pathActive && (
              <span className="ml-0.5 text-[10px] bg-cyan-400/30 text-cyan-300 px-1 py-0.2 rounded font-bold">
                Active
              </span>
            )}
          </button>

          {pathActive && (
            <>
              <button
                onClick={zoomToPathInTree}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 transition-colors font-medium"
                title="Zoom directly to path in tree"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Zoom Path</span>
              </button>
              <button
                onClick={onClearPath}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-panel-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                title="Clear path highlight"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </>
          )}

          {orphanNodes.length > 0 && (
            <button
              onClick={() => setShowOrphanDrawer(!showOrphanDrawer)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors',
                showOrphanDrawer
                  ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                  : 'bg-panel-border/30 border-panel-border text-gray-400 hover:text-yellow-300 hover:border-yellow-500/30'
              )}
            >
              <span>{orphanNodes.length} other nodes</span>
              <ChevronDown
                className={clsx('w-3.5 h-3.5 transition-transform', showOrphanDrawer && 'rotate-180')}
              />
            </button>
          )}

          <div className="flex items-center bg-black/40 rounded-md border border-panel-border p-0.5">
            <button
              onClick={() => setTransform((p) => ({ ...p, scale: Math.min(p.scale * 1.15, 2.5) }))}
              title="Zoom In"
              className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-cyan-300 transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTransform((p) => ({ ...p, scale: Math.max(p.scale * 0.85, 0.3) }))}
              title="Zoom Out"
              className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-cyan-300 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={resetView}
              title="Reset View"
              className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-cyan-300 transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Direction Semantics Sub-Banner for Both Mode */}
      {flowMode === 'both' && (
        <div className="bg-panel/95 border-b border-panel-border/80 px-4 py-1.5 flex items-center justify-between text-xs text-gray-300 z-10 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              Showing: Both Incoming &amp; Outgoing Relationships
            </span>
            <span className="text-[11px] text-gray-400">
              Left: Upstream Inflow Sources (Counterparties → Seed) &bull; Right: Downstream Outflow Destinations (Seed → Counterparties)
            </span>
          </div>
          <div className="text-[10px] text-yellow-400/90 italic">
            Notice: Separate blockchain transactions, NOT bidirectional single transfers.
          </div>
        </div>
      )}

      {/* ── Interactive Tree SVG Canvas (Takes 100% Remaining Height) ─────── */}
      <div
        ref={containerRef}
        className={clsx(
          'flex-1 min-h-0 relative w-full h-full overflow-hidden bg-[#090d16] touch-none',
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background Subtle Grid Pattern */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
          <defs>
            <pattern id="tree-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tree-grid)" />
        </svg>

        {/* Tree Render Group */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-auto"
          style={{ width: '100%', height: '100%' }}
        >
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
            {/* Draw Connectors behind nodes */}
            {connectors.map((c, i) => {
              const from = posMap[c.fromId];
              const to = posMap[c.toId];
              if (!from || !to) return null;

              const isPathConn =
                pathActive &&
                (pathEdgePairs.has(`${c.fromId.toLowerCase()}->${c.toId.toLowerCase()}`) ||
                 pathEdgePairs.has(`${c.toId.toLowerCase()}->${c.fromId.toLowerCase()}`));

              if (isolatePath && pathActive && !isPathConn) return null;

              return (
                <Connector
                  key={`${c.fromId}-${c.toId}-${i}`}
                  from={from}
                  to={to}
                  edgeInfo={c.edgeInfo}
                  isBackward={c.direction === 'backward'}
                  isPathConnector={isPathConn}
                  isDimmed={pathActive && !isPathConn}
                />
              );
            })}

            {/* Draw Node Cards */}
            {positions.map((p) => {
              const isSeed =
                p.id === effectiveSeedAddress ||
                p.id.toLowerCase() === effectiveSeedAddress?.toLowerCase();
              const isExp =
                expandedSet.has(p.id) || expandedSet.has(p.id.toLowerCase());

              const pLower = p.id.toLowerCase();
              const fromLower = pathResult?.fromNode?.address?.toLowerCase();
              const toLower = pathResult?.toNode?.address?.toLowerCase();

              const isPathNode = pathActive && pathAddrs.has(pLower);
              const isPathSource = pathActive && pLower === fromLower;
              const isPathTarget = pathActive && pLower === toLower;
              const isPathHop = isPathNode && !isPathSource && !isPathTarget;

              if (isolatePath && pathActive && !isPathNode) return null;

              return (
                <NodeCard
                  key={p.id}
                  item={p.item}
                  x={p.x}
                  y={p.y}
                  isSelected={selectedNodeId === p.id}
                  isSeed={isSeed}
                  onSelect={onSelectNode}
                  onToggle={toggleExpanded}
                  isExpanded={isExp}
                  isPathNode={isPathNode}
                  isPathSource={isPathSource}
                  isPathTarget={isPathTarget}
                  isPathHop={isPathHop}
                  isDimmed={pathActive && !isPathNode}
                />
              );
            })}
          </g>
        </svg>

        {/* Floating Quick Instructions */}
        <div className="absolute bottom-4 left-4 z-10 pointer-events-none text-[11px] text-gray-500 bg-black/60 backdrop-blur px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-3">
          <span>🖱 Drag to pan</span>
          <span>·</span>
          <span>🔍 Scroll to zoom</span>
          <span>·</span>
          <span>Click card to inspect</span>
        </div>
      </div>

      {/* ── Collapsible Other/Cluster Nodes Drawer (Never Squashes Tree) ──── */}
      {showOrphanDrawer && orphanNodes.length > 0 && (
        <div className="shrink-0 max-h-52 flex flex-col border-t border-panel-border bg-panel/95 backdrop-blur shadow-2xl z-30 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between px-4 py-2 border-b border-panel-border bg-black/40">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Other Traced Addresses ({orphanNodes.length})
              </span>
              <span className="text-[11px] text-gray-500">
                Connected via multi-hop paths outside the active tree filter
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Filter addresses..."
                  value={orphanSearch}
                  onChange={(e) => setOrphanSearch(e.target.value)}
                  className="pl-7 pr-2 py-1 text-xs bg-background border border-panel-border rounded-md text-gray-300 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 w-48"
                />
              </div>
              <button
                onClick={() => setShowOrphanDrawer(false)}
                className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-3 overflow-y-auto grow flex flex-wrap gap-2">
            {filteredOrphans.map((node) => {
              const isSelected = selectedNodeId === node.address;
              const chainDot =
                node.chain === 'ethereum'
                  ? 'bg-blue-500'
                  : node.chain === 'tron'
                  ? 'bg-red-500'
                  : 'bg-orange-500';

              return (
                <div
                  key={node.address}
                  onClick={() => onSelectNode(node.address)}
                  className={clsx(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs transition-all shadow-sm',
                    isSelected
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200'
                      : 'bg-white/5 border-panel-border text-gray-400 hover:text-gray-200 hover:border-cyan-500/40'
                  )}
                >
                  <span className={clsx('w-2 h-2 rounded-full shrink-0', chainDot)} />
                  <span className="font-medium text-gray-300">
                    {node.label || truncAddr(node.address)}
                  </span>
                  {node.risk_score != null && (
                    <span
                      className="text-[10px] font-mono font-bold"
                      style={{ color: riskColor(node.risk_score) }}
                    >
                      {Math.round(node.risk_score * 100)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
