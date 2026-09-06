import React, { useState, useMemo } from 'react';
import { Search, ArrowDownLeft, ArrowUpRight, ArrowUpDown, Download } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import TxBadge from '../common/TxBadge';
import EmptyState from '../common/EmptyState';

export default function TransactionInvestigation() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
    selectTransaction,
  } = useInvestigation();

  const { edges = [], nodes = [], chain = 'ethereum', seed_address } = traceData || {};

  // Filters
  const [directionFilter, setDirectionFilter] = useState('all'); // 'all' | 'in' | 'out'
  const [assetTypeFilter, setAssetTypeFilter] = useState('all'); // 'all' | 'native' | 'token'
  const [searchTerm, setSearchTerm] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [sortField, setSortField] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const focusAddress = (selectedAddress || seed_address || '').toLowerCase();

  // Filtered & Sorted Transactions
  const filteredEdges = useMemo(() => {
    return edges.filter((edge) => {
      const from = (edge.from_address || '').toLowerCase();
      const to = (edge.to_address || '').toLowerCase();
      const tx = (edge.tx_hash || '').toLowerCase();
      const asset = (edge.asset || '').toUpperCase();
      const isNative = ['ETH', 'BTC', 'TRX'].includes(asset);

      // Direction filter relative to focused address
      if (directionFilter === 'in' && to !== focusAddress) return false;
      if (directionFilter === 'out' && from !== focusAddress) return false;

      // Asset type filter
      if (assetTypeFilter === 'native' && !isNative) return false;
      if (assetTypeFilter === 'token' && isNative) return false;

      // Amount filter
      if (minAmount && (Number(edge.amount) || 0) < Number(minAmount)) return false;

      // Search term
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!from.includes(q) && !to.includes(q) && !tx.includes(q) && !asset.toLowerCase().includes(q)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'amount' || sortField === 'amount_usd') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = valA ? String(valA).toLowerCase() : '';
        valB = valB ? String(valB).toLowerCase() : '';
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [edges, directionFilter, assetTypeFilter, searchTerm, minAmount, sortField, sortOrder, focusAddress]);

  const totalPages = Math.ceil(filteredEdges.length / itemsPerPage) || 1;
  const paginatedEdges = filteredEdges.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const exportCSV = () => {
    const headers = ['Timestamp', 'TxHash', 'From', 'To', 'Asset', 'Amount', 'AmountUSD', 'EvidenceType', 'Chain'];
    const rows = filteredEdges.map((e) => [
      e.timestamp || '',
      e.tx_hash || '',
      e.from_address || '',
      e.to_address || '',
      e.asset || '',
      e.amount ?? '',
      e.amount_usd ?? '',
      e.evidence_type || 'direct_observed',
      e.chain || chain,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nodehound_transactions_${focusAddress.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header & Context Banner ──────────────────────────────────── */}
      <div className="cyber-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-100">Transaction Investigation Console</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400">Filtering relative to focused address:</span>
            <AddressBadge
              address={selectedAddress || seed_address}
              chain={chain}
              onClick={(addr) => selectAddress(addr, 'address_intelligence')}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="cyber-button-secondary text-xs py-2 px-3 flex items-center gap-1.5"
            title="Export filtered transactions as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV ({filteredEdges.length})
          </button>
        </div>
      </div>

      {/* ── Filters Bar ──────────────────────────────────────────────────── */}
      <div className="cyber-panel p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search address, hash, asset..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="cyber-input w-full pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-gray-400 shrink-0">Direction:</label>
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="cyber-input w-full bg-background"
          >
            <option value="all">All Directions</option>
            <option value="in">Inbound Only</option>
            <option value="out">Outbound Only</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-gray-400 shrink-0">Asset Type:</label>
          <select
            value={assetTypeFilter}
            onChange={(e) => setAssetTypeFilter(e.target.value)}
            className="cyber-input w-full bg-background"
          >
            <option value="all">All Assets</option>
            <option value="native">Native Only (ETH/BTC/TRX)</option>
            <option value="token">Tokens Only (ERC-20/TRC-20)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-gray-400 shrink-0">Min Amount:</label>
          <input
            type="number"
            placeholder="0.00"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            className="cyber-input w-full font-mono"
          />
        </div>
      </div>

      {/* ── Transaction Table ────────────────────────────────────────────── */}
      <div className="cyber-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-panel-border bg-black/40 text-[10px] text-gray-400 uppercase font-mono tracking-wider select-none">
                <th
                  onClick={() => handleSort('timestamp')}
                  className="p-3 cursor-pointer hover:text-cyan-300 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    Timestamp <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="p-3">Tx Hash</th>
                <th className="p-3">From</th>
                <th className="p-3">Direction</th>
                <th className="p-3">To</th>
                <th className="p-3">Asset</th>
                <th
                  onClick={() => handleSort('amount')}
                  className="p-3 cursor-pointer hover:text-cyan-300 transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    Amount <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('amount_usd')}
                  className="p-3 cursor-pointer hover:text-cyan-300 transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    USD Value <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="p-3">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border/40 font-mono">
              {paginatedEdges.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center">
                    <EmptyState
                      title="No Transactions Match Filter"
                      subtitle="Adjust your search, direction, or asset filters to view graph transfers."
                      type="neutral"
                    />
                  </td>
                </tr>
              ) : (
                paginatedEdges.map((edge, idx) => {
                  const isIn = (edge.to_address || '').toLowerCase() === focusAddress;
                  const isOut = (edge.from_address || '').toLowerCase() === focusAddress;
                  const fromNode = nodes.find((n) => n.address.toLowerCase() === (edge.from_address || '').toLowerCase());
                  const toNode = nodes.find((n) => n.address.toLowerCase() === (edge.to_address || '').toLowerCase());

                  return (
                    <tr
                      key={edge.tx_hash ? `${edge.tx_hash}-${idx}` : idx}
                      onClick={() => selectTransaction(edge)}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <td className="p-3 text-gray-400 whitespace-nowrap text-[11px]">
                        {edge.timestamp ? new Date(edge.timestamp).toLocaleDateString() + ' ' + new Date(edge.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="p-3">
                        <TxBadge txHash={edge.tx_hash} chain={edge.chain || chain} />
                      </td>
                      <td className="p-3">
                        <AddressBadge
                          address={edge.from_address}
                          chain={edge.chain || chain}
                          label={fromNode?.label}
                          category={fromNode?.category}
                          onClick={(addr) => selectAddress(addr, 'address_intelligence')}
                        />
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {isIn ? (
                          <span className="inline-flex items-center gap-1 text-green-400 font-bold text-[10px] bg-green-500/10 border border-green-500/30 px-1.5 py-0.5 rounded">
                            <ArrowDownLeft className="w-3 h-3" /> IN
                          </span>
                        ) : isOut ? (
                          <span className="inline-flex items-center gap-1 text-red-400 font-bold text-[10px] bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded">
                            <ArrowUpRight className="w-3 h-3" /> OUT
                          </span>
                        ) : (
                          <span className="text-gray-500 text-[10px]">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <AddressBadge
                          address={edge.to_address}
                          chain={edge.chain || chain}
                          label={toNode?.label}
                          category={toNode?.category}
                          onClick={(addr) => selectAddress(addr, 'address_intelligence')}
                        />
                      </td>
                      <td className="p-3">
                        <span className="text-cyan-300 font-sans font-medium text-[11px]">
                          {edge.asset || 'NATIVE'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-medium text-gray-200">
                        {edge.amount != null ? Number(edge.amount).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}
                      </td>
                      <td className="p-3 text-right text-gray-400">
                        {edge.amount_usd != null
                          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(edge.amount_usd)
                          : '—'}
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-black/40 border border-panel-border">
                          {edge.evidence_type || 'direct_observed'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-panel-border bg-black/30 flex items-center justify-between text-xs text-gray-400">
            <div>
              Showing {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, filteredEdges.length)} of {filteredEdges.length} transactions
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="cyber-button-secondary text-xs px-2.5 py-1 disabled:opacity-30"
              >
                Previous
              </button>
              <span className="font-mono text-gray-200">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="cyber-button-secondary text-xs px-2.5 py-1 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
