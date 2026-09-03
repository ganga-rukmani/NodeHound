import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Copy, CheckCircle } from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────
const truncAddr = (addr) => (addr ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : '');

const riskColor = (score) => {
  if (score == null) return '#64748b';
  if (score > 0.7) return '#ef4444';
  if (score > 0.4) return '#eab308';
  return '#22c55e';
};

const explorerUrl = (chain, address) => {
  if (chain === 'ethereum') return `https://etherscan.io/address/${address}`;
  if (chain === 'tron') return `https://tronscan.org/#/address/${address}`;
  if (chain === 'bitcoin') return `https://www.blockchain.com/explorer/addresses/btc/${address}`;
  return null;
};

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="transition-colors ml-1"
    >
      {copied ? (
        <CheckCircle className="w-3 h-3 text-green-400" />
      ) : (
        <Copy className="w-3 h-3 text-gray-600 hover:text-cyan-400" />
      )}
    </button>
  );
}

// ── sortable header ────────────────────────────────────────────────────────
function Th({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field;
  return (
    <th
      className="px-3 py-2 text-left text-[10px] text-gray-500 uppercase tracking-wide font-semibold cursor-pointer hover:text-gray-300 transition-colors select-none whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp className="w-3 h-3 text-cyan-400" />
          ) : (
            <ArrowDown className="w-3 h-3 text-cyan-400" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

// ── chain pill ─────────────────────────────────────────────────────────────
function ChainPill({ chain }) {
  const cls =
    chain === 'ethereum'
      ? 'text-blue-300 border-blue-500/30 bg-blue-500/10'
      : chain === 'tron'
      ? 'text-red-300 border-red-500/30 bg-red-500/10'
      : 'text-orange-300 border-orange-500/30 bg-orange-500/10';
  return (
    <span className={clsx('text-[9px] font-medium px-1.5 py-0.5 rounded-full border', cls)}>
      {chain?.toUpperCase()}
    </span>
  );
}

// ── main export ────────────────────────────────────────────────────────────
export default function TableView({ nodes, edges, seedAddress, onSelectNode, selectedNodeId }) {
  const [sortField, setSortField] = useState('risk_score');
  const [sortDir, setSortDir] = useState('desc');
  const [chainFilter, setChainFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Precompute in/out counts per node
  const edgeCounts = useMemo(() => {
    const counts = {};
    nodes.forEach((n) => { counts[n.address] = { inCount: 0, outCount: 0, inUSD: 0, outUSD: 0 }; });
    edges.forEach((e) => {
      if (counts[e.from_address]) {
        counts[e.from_address].outCount += 1;
        counts[e.from_address].outUSD += e.amount_usd ?? 0;
      }
      if (counts[e.to_address]) {
        counts[e.to_address].inCount += 1;
        counts[e.to_address].inUSD += e.amount_usd ?? 0;
      }
    });
    return counts;
  }, [nodes, edges]);

  const chains = useMemo(() => [...new Set(nodes.map((n) => n.chain).filter(Boolean))], [nodes]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    let list = nodes;
    if (chainFilter !== 'all') list = list.filter((n) => n.chain === chainFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (n) =>
          n.address?.toLowerCase().includes(q) ||
          n.label?.toLowerCase().includes(q) ||
          n.category?.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let av, bv;
      if (sortField === 'risk_score') { av = a.risk_score ?? -1; bv = b.risk_score ?? -1; }
      else if (sortField === 'label') { av = (a.label || a.address || '').toLowerCase(); bv = (b.label || b.address || '').toLowerCase(); }
      else if (sortField === 'chain') { av = a.chain || ''; bv = b.chain || ''; }
      else if (sortField === 'inCount') { av = edgeCounts[a.address]?.inCount ?? 0; bv = edgeCounts[b.address]?.inCount ?? 0; }
      else if (sortField === 'outCount') { av = edgeCounts[a.address]?.outCount ?? 0; bv = edgeCounts[b.address]?.outCount ?? 0; }
      else if (sortField === 'inUSD') { av = edgeCounts[a.address]?.inUSD ?? 0; bv = edgeCounts[b.address]?.inUSD ?? 0; }
      else if (sortField === 'category') { av = a.category || ''; bv = b.category || ''; }
      if (typeof av === 'string') return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });
  }, [nodes, chainFilter, search, sortField, sortDir, edgeCounts]);

  const fmtUSD = (v) =>
    v > 0
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v)
      : '—';

  return (
    <div className="absolute inset-0 overflow-auto flex flex-col">
      {/* ── toolbar ── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-panel-border bg-panel/80 backdrop-blur flex-wrap">
        {/* search */}
        <input
          type="text"
          placeholder="Search address, label, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-background border border-panel-border rounded-md text-xs text-gray-200 placeholder-gray-600 px-3 py-1.5 focus:outline-none focus:border-cyan-500/50 w-64"
        />

        {/* chain filter */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChainFilter('all')}
            className={clsx(
              'text-[10px] px-2 py-1 rounded-md border transition-colors',
              chainFilter === 'all'
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                : 'border-panel-border text-gray-500 hover:text-gray-300'
            )}
          >
            All
          </button>
          {chains.map((c) => (
            <button
              key={c}
              onClick={() => setChainFilter(c === chainFilter ? 'all' : c)}
              className={clsx(
                'text-[10px] px-2 py-1 rounded-md border transition-colors capitalize',
                chainFilter === c
                  ? c === 'ethereum'
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                    : c === 'tron'
                    ? 'border-red-500/50 bg-red-500/10 text-red-300'
                    : 'border-orange-500/50 bg-orange-500/10 text-orange-300'
                  : 'border-panel-border text-gray-500 hover:text-gray-300'
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[10px] text-gray-600 font-mono">
          {filtered.length} / {nodes.length} nodes
        </span>
      </div>

      {/* ── table ── */}
      <div className="grow overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-panel border-b border-panel-border">
            <tr>
              <Th label="Address / Label" field="label" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <Th label="Chain" field="chain" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <Th label="Category" field="category" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <Th label="Risk" field="risk_score" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <Th label="In Txns" field="inCount" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <Th label="In USD" field="inUSD" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <Th label="Out Txns" field="outCount" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((node) => {
              const isSelected = selectedNodeId === node.address;
              const isSeed = node.address === seedAddress;
              const counts = edgeCounts[node.address] || {};
              const explorerHref = explorerUrl(node.chain, node.address);
              return (
                <tr
                  key={node.address}
                  onClick={() => onSelectNode(isSelected ? null : node.address)}
                  className={clsx(
                    'border-b border-panel-border cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-cyan-500/10 border-l-2 border-l-cyan-500'
                      : 'hover:bg-white/[0.03]'
                  )}
                >
                  {/* Address/Label */}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className={clsx('font-medium text-gray-100 truncate max-w-[180px]', isSeed && 'text-cyan-300')}>
                          {node.label || truncAddr(node.address)}
                        </span>
                        {isSeed && (
                          <span className="text-[8px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1 py-0.5 rounded-full shrink-0">
                            Seed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="font-mono text-[10px] text-gray-500">{truncAddr(node.address)}</span>
                        <CopyBtn text={node.address} />
                        {explorerHref && (
                          <a
                            href={explorerHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-600 hover:text-cyan-400 transition-colors ml-0.5"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Chain */}
                  <td className="px-3 py-2.5">
                    <ChainPill chain={node.chain} />
                  </td>

                  {/* Category */}
                  <td className="px-3 py-2.5 text-gray-400 capitalize text-[10px]">
                    {node.category || '—'}
                  </td>

                  {/* Risk */}
                  <td className="px-3 py-2.5">
                    {node.risk_score != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${node.risk_score * 100}%`,
                              backgroundColor: riskColor(node.risk_score),
                            }}
                          />
                        </div>
                        <span
                          className="font-mono font-bold text-[10px]"
                          style={{ color: riskColor(node.risk_score) }}
                        >
                          {Math.round(node.risk_score * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>

                  {/* In Txns */}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-green-400 font-mono">{counts.inCount ?? 0}</span>
                      {counts.inUSD > 0 && (
                        <span className="text-[9px] text-gray-500">{fmtUSD(counts.inUSD)}</span>
                      )}
                    </div>
                  </td>

                  {/* In USD */}
                  <td className="px-3 py-2.5 font-mono text-gray-400 text-[10px]">
                    {fmtUSD(counts.inUSD)}
                  </td>

                  {/* Out Txns */}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-red-400 font-mono">{counts.outCount ?? 0}</span>
                      {counts.outUSD > 0 && (
                        <span className="text-[9px] text-gray-500">{fmtUSD(counts.outUSD)}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500 text-sm italic">
                  No nodes match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

