import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Layers,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Clock,
  Info,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  CheckCircle,
  BarChart3,
  Wallet,
  Activity,
  Maximize2
} from 'lucide-react';
import clsx from 'clsx';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import TxBadge from '../common/TxBadge';
import SeverityBadge from '../common/SeverityBadge';
import ConfidenceBadge from '../common/ConfidenceBadge';
import EmptyState from '../common/EmptyState';

const ITEMS_PER_PAGE = 8;

export default function TypologyAnalysis() {
  const {
    traceData,
    selectAddress,
    selectTransaction,
    caseMetadata,
  } = useInvestigation();

  const { detected_patterns = [], chain = 'ethereum' } = traceData || {};
  const fraudTypology = caseMetadata?.fraudTypology || 'Unknown';
  const fraudSource = caseMetadata?.fraudTypologySource || 'Investigator Selected';

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypologyFilter, setSelectedTypologyFilter] = useState('ALL');
  const [selectedConfidenceFilter, setSelectedConfidenceFilter] = useState('ALL');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('ALL');
  const [selectedHopFilter, setSelectedHopFilter] = useState('ALL');

  // Pagination & Expansion State
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedFindings, setExpandedFindings] = useState({});
  const [showAllGroups, setShowAllGroups] = useState(false);

  // 1. Calculate High-Level Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalPatterns = detected_patterns.length;
    const uniqueTypologies = new Set(detected_patterns.map((p) => p.type || 'unknown')).size;
    const affectedWallets = new Set(
      detected_patterns.map((p) => (p.address || '').toLowerCase()).filter(Boolean)
    ).size;

    let highPriority = 0;
    let mediumPriority = 0;

    detected_patterns.forEach((p) => {
      const sev = (p.severity || '').toLowerCase();
      const conf = (p.confidence || '').toLowerCase();
      if (sev === 'high' || sev === 'critical' || conf === 'high') {
        highPriority++;
      } else if (sev === 'medium' || conf === 'medium') {
        mediumPriority++;
      }
    });

    return {
      totalPatterns,
      uniqueTypologies,
      affectedWallets,
      highPriority,
      mediumPriority,
    };
  }, [detected_patterns]);

  // 2. Extract Available Typology Types for Filter
  const availableTypologies = useMemo(() => {
    const types = new Set(detected_patterns.map((p) => p.type).filter(Boolean));
    return Array.from(types).sort();
  }, [detected_patterns]);

  // 3. Filter Patterns Safely
  const filteredPatterns = useMemo(() => {
    return detected_patterns.filter((pattern) => {
      const pType = pattern.type || '';
      const pAddr = (pattern.address || '').toLowerCase();
      const pConf = (pattern.confidence || '').toLowerCase();
      const pSev = (pattern.severity || '').toLowerCase();
      const evidence = pattern.evidence || {};
      const txHashes = Array.isArray(pattern.transaction_hashes)
        ? pattern.transaction_hashes
        : Array.isArray(evidence.transaction_hashes)
        ? evidence.transaction_hashes
        : [];

      // Typology Filter
      if (selectedTypologyFilter !== 'ALL' && pType !== selectedTypologyFilter) {
        return false;
      }

      // Confidence Filter
      if (selectedConfidenceFilter !== 'ALL' && pConf !== selectedConfidenceFilter.toLowerCase()) {
        return false;
      }

      // Priority/Severity Filter
      if (selectedPriorityFilter !== 'ALL' && pSev !== selectedPriorityFilter.toLowerCase()) {
        return false;
      }

      // Hop Filter
      if (selectedHopFilter !== 'ALL') {
        const hop = pattern.hop_distance ?? evidence.hop_distance;
        if (hop != null && String(hop) !== selectedHopFilter) {
          return false;
        }
      }

      // Search Filter (Target Wallet or Transaction Hash)
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const matchesAddr = pAddr.includes(query);
        const matchesTx = txHashes.some((tx) => (tx || '').toLowerCase().includes(query));
        const matchesType = pType.toLowerCase().includes(query);
        if (!matchesAddr && !matchesTx && !matchesType) {
          return false;
        }
      }

      return true;
    });
  }, [
    detected_patterns,
    selectedTypologyFilter,
    selectedConfidenceFilter,
    selectedPriorityFilter,
    selectedHopFilter,
    searchTerm,
  ]);

  // 4. Group Patterns by Typology -> Target Wallet (Deduplication & Hierarchy)
  const groupedTypologies = useMemo(() => {
    const groups = {};

    filteredPatterns.forEach((pattern) => {
      const typeKey = pattern.type || 'suspicious_activity';
      if (!groups[typeKey]) {
        groups[typeKey] = {
          typologyKey: typeKey,
          title: typeKey
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          totalInstances: 0,
          walletsMap: {},
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          allTxHashes: new Set(),
        };
      }

      const g = groups[typeKey];
      g.totalInstances += 1;

      const sev = (pattern.severity || 'medium').toLowerCase();
      if (sev === 'high' || sev === 'critical') g.highCount++;
      else if (sev === 'medium') g.mediumCount++;
      else g.lowCount++;

      const evidence = pattern.evidence || {};
      const txHashes = Array.isArray(pattern.transaction_hashes)
        ? pattern.transaction_hashes
        : Array.isArray(evidence.transaction_hashes)
        ? evidence.transaction_hashes
        : [];
      txHashes.forEach((h) => g.allTxHashes.add(h));

      const addrKey = (pattern.address || 'unspecified_address').toLowerCase();
      if (!g.walletsMap[addrKey]) {
        g.walletsMap[addrKey] = {
          address: pattern.address,
          typology: typeKey,
          patterns: [],
          highestSeverity: pattern.severity || 'medium',
          highestConfidence: pattern.confidence || 'medium',
          txHashesSet: new Set(),
        };
      }

      const w = g.walletsMap[addrKey];
      w.patterns.push(pattern);
      txHashes.forEach((h) => w.txHashesSet.add(h));

      // Severity ranking
      const sevWeights = { critical: 4, high: 3, medium: 2, low: 1 };
      if (sevWeights[sev] > (sevWeights[w.highestSeverity.toLowerCase()] || 0)) {
        w.highestSeverity = pattern.severity;
      }
    });

    // Convert map to sorted array (Prioritize by High Count, Total Wallets, Instances)
    return Object.values(groups)
      .map((g) => ({
        ...g,
        uniqueWalletsCount: Object.keys(g.walletsMap).length,
        uniqueTxCount: g.allTxHashes.size,
        wallets: Object.values(g.walletsMap).sort((a, b) => {
          const sevWeights = { critical: 4, high: 3, medium: 2, low: 1 };
          return (sevWeights[b.highestSeverity.toLowerCase()] || 0) - (sevWeights[a.highestSeverity.toLowerCase()] || 0);
        }),
      }))
      .sort((a, b) => {
        if (b.highCount !== a.highCount) return b.highCount - a.highCount;
        return b.uniqueWalletsCount - a.uniqueWalletsCount;
      });
  }, [filteredPatterns]);

  // Toggle Group Expansion
  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Toggle Single Finding Detail Expansion
  const toggleFinding = (id) => {
    setExpandedFindings((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Pagination for Typology Groups
  const totalGroups = groupedTypologies.length;
  const totalPages = Math.ceil(totalGroups / ITEMS_PER_PAGE) || 1;
  const displayedGroups = showAllGroups
    ? groupedTypologies
    : groupedTypologies.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="space-y-6 animate-fade-in text-gray-200">
      {/* ── 1. Page Header ─────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-yellow-500/20 bg-gradient-to-r from-panel to-yellow-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                Behavioral Intelligence
              </span>
              <span className="text-xs font-mono text-gray-400">
                Consolidated Typology Dashboard
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-100">Fraud &amp; Laundering Typology Detection</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-3xl">
              Consolidated behavioral pattern recognition prioritizing layered money routing, rapid forwarding, structuring, and mixing indicators without unbounded duplicate cards.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-yellow-400 bg-black/40 px-3 py-2 rounded-lg border border-panel-border">
              {summaryMetrics.totalPatterns} Pattern Instance{summaryMetrics.totalPatterns !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. Top Summary KPI Cards (Summary First) ───────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="cyber-panel p-4 border-panel-border bg-black/30">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[11px] uppercase font-mono">Total Patterns</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-gray-100">{summaryMetrics.totalPatterns}</div>
          <span className="text-[10px] text-gray-500 mt-0.5 block">Observed graph matches</span>
        </div>

        <div className="cyber-panel p-4 border-panel-border bg-black/30">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[11px] uppercase font-mono">Unique Typologies</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-purple-300">{summaryMetrics.uniqueTypologies}</div>
          <span className="text-[10px] text-gray-500 mt-0.5 block">Categorical classifications</span>
        </div>

        <div className="cyber-panel p-4 border-panel-border bg-black/30">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[11px] uppercase font-mono">Affected Wallets</span>
            <Wallet className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-blue-300">{summaryMetrics.affectedWallets}</div>
          <span className="text-[10px] text-gray-500 mt-0.5 block">Distinct suspect addresses</span>
        </div>

        <div className="cyber-panel p-4 border-panel-border bg-black/30">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[11px] uppercase font-mono">High-Priority</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-red-400">{summaryMetrics.highPriority}</div>
          <span className="text-[10px] text-gray-500 mt-0.5 block">Urgent forensic candidates</span>
        </div>

        <div className="cyber-panel p-4 border-panel-border bg-black/30 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-[11px] uppercase font-mono">Medium-Priority</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400">{summaryMetrics.mediumPriority}</div>
          <span className="text-[10px] text-gray-500 mt-0.5 block">Secondary correlation signals</span>
        </div>
      </div>

      {/* ── 3. Legal / Attribution Distinction Banner (Requirement 6) ──────── */}
      <div className="cyber-panel p-4 border-panel-border bg-black/40 space-y-2">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-gray-100">
              Forensic Attribution &amp; Typology Distinction Notice:
            </p>
            <p className="text-gray-300 leading-relaxed font-sans">
              Behavioural typology indicates a transaction pattern consistent with the detected category. It does not establish criminal intent, ownership or legal attribution.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-panel-border/60 text-xs font-mono">
          <div className="p-2.5 bg-panel border border-yellow-500/20 rounded">
            <span className="text-[10px] uppercase text-yellow-400 font-bold block">CASE TYPOLOGY CONTEXT:</span>
            <div className="font-bold text-gray-100 mt-0.5">{fraudTypology}</div>
            <div className="text-[10px] text-gray-500">Source: {fraudSource}</div>
          </div>
          <div className="p-2.5 bg-panel border border-cyan-500/20 rounded">
            <span className="text-[10px] uppercase text-cyan-400 font-bold block">OBSERVED BEHAVIORAL FINDINGS:</span>
            <div className="font-bold text-gray-100 mt-0.5">
              {summaryMetrics.uniqueTypologies > 0
                ? `${summaryMetrics.uniqueTypologies} typology categories detected across ${summaryMetrics.affectedWallets} wallets`
                : 'Standard fund routing with no anomalous laundering indicators'}
            </div>
            <div className="text-[10px] text-gray-500">Objective on-chain structural analysis</div>
          </div>
        </div>
      </div>

      {/* ── 4. Search & Filter Bar (Requirement 9 & 10) ────────────────────── */}
      <div className="cyber-panel p-4 border-panel-border bg-panel/70 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search wallet address, tx hash, or typology name..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-black/60 border border-panel-border text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-xs font-mono"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Typology Filter */}
          <select
            value={selectedTypologyFilter}
            onChange={(e) => {
              setSelectedTypologyFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-black/60 border border-panel-border rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Typologies ({availableTypologies.length})</option>
            {availableTypologies.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </select>

          {/* Priority / Severity Filter */}
          <select
            value={selectedPriorityFilter}
            onChange={(e) => {
              setSelectedPriorityFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-black/60 border border-panel-border rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Priorities</option>
            <option value="HIGH">High Priority</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>

          {/* Confidence Filter */}
          <select
            value={selectedConfidenceFilter}
            onChange={(e) => {
              setSelectedConfidenceFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-black/60 border border-panel-border rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Confidences</option>
            <option value="HIGH">High Confidence</option>
            <option value="MEDIUM">Medium Confidence</option>
            <option value="LOW">Low Confidence</option>
          </select>

          {/* Hop Filter */}
          <select
            value={selectedHopFilter}
            onChange={(e) => {
              setSelectedHopFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-black/60 border border-panel-border rounded-lg px-2.5 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Hops</option>
            <option value="1">Hop 1</option>
            <option value="2">Hop 2</option>
            <option value="3">Hop 3+</option>
          </select>

          {/* Clear Filters */}
          {(searchTerm || selectedTypologyFilter !== 'ALL' || selectedPriorityFilter !== 'ALL' || selectedConfidenceFilter !== 'ALL' || selectedHopFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedTypologyFilter('ALL');
                setSelectedPriorityFilter('ALL');
                setSelectedConfidenceFilter('ALL');
                setSelectedHopFilter('ALL');
                setCurrentPage(1);
              }}
              className="text-cyan-400 hover:underline px-2 py-1 text-xs"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── 5. Grouped Prioritized Findings List (Requirement 1, 3 & 4) ──────── */}
      {groupedTypologies.length === 0 ? (
        <EmptyState
          title="No Matching Typologies Found"
          subtitle={
            detected_patterns.length === 0
              ? 'The analyzed graph did not trigger automated behavioral thresholds for intermediary structuring, rapid forwarding, or mixing.'
              : 'No detected pattern matched the active search keywords or filter criteria.'
          }
          icon={ShieldAlert}
          type="neutral"
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-gray-400 px-1">
            <span>
              Showing {displayedGroups.length} of {totalGroups} Prioritized Typology Group{totalGroups !== 1 ? 's' : ''} ({filteredPatterns.length} total patterns)
            </span>
            <button
              onClick={() => setShowAllGroups(!showAllGroups)}
              className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
            >
              {showAllGroups ? 'Show Paginated (Top 8)' : 'View All Groups'}
            </button>
          </div>

          {displayedGroups.map((group) => {
            const isGroupOpen = expandedGroups[group.typologyKey] ?? true; // default open

            return (
              <div
                key={group.typologyKey}
                className="cyber-panel border-panel-border bg-black/30 overflow-hidden transition-all duration-200"
              >
                {/* Typology Group Card Header */}
                <div
                  onClick={() => toggleGroup(group.typologyKey)}
                  className="p-4 cursor-pointer hover:bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-panel-border/60 select-none"
                >
                  <div className="flex items-center gap-3">
                    <button className="text-gray-400 hover:text-white transition-colors p-0.5">
                      {isGroupOpen ? (
                        <ChevronDown className="w-5 h-5 text-cyan-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base text-gray-100">{group.title}</h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-panel border border-panel-border text-gray-300">
                          {group.uniqueWalletsCount} wallet{group.uniqueWalletsCount !== 1 ? 's' : ''} affected
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-panel border border-panel-border text-gray-400">
                          {group.uniqueTxCount} supporting tx{group.uniqueTxCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Priority Pill Breakdown */}
                  <div className="flex items-center gap-2 shrink-0">
                    {group.highCount > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30">
                        High: {group.highCount}
                      </span>
                    )}
                    {group.mediumCount > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                        Med: {group.mediumCount}
                      </span>
                    )}
                    {group.lowCount > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30">
                        Low: {group.lowCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Typology Group Body: Wallets within this Typology */}
                {isGroupOpen && (
                  <div className="p-4 space-y-3 bg-panel/30">
                    <div className="grid grid-cols-1 gap-3">
                      {group.wallets.map((walletEntry, wIdx) => {
                        const findingId = `${group.typologyKey}-${walletEntry.address}`;
                        const isFindingOpen = expandedFindings[findingId] || false;
                        const firstPattern = walletEntry.patterns[0] || {};
                        const evidence = firstPattern.evidence || {};
                        const txHashesList = Array.from(walletEntry.txHashesSet);

                        return (
                          <div
                            key={wIdx}
                            className="p-3.5 rounded-lg bg-black/40 border border-panel-border/80 hover:border-panel-border transition-colors space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded bg-panel text-cyan-400 shrink-0">
                                  <Wallet className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <AddressBadge
                                      address={walletEntry.address}
                                      chain={chain}
                                      onClick={(addr) => selectAddress(addr, 'address_intelligence')}
                                      showFull
                                    />
                                    <SeverityBadge severity={walletEntry.highestSeverity} />
                                    {walletEntry.highestConfidence && (
                                      <ConfidenceBadge tier={walletEntry.highestConfidence} />
                                    )}
                                  </div>
                                  <div className="text-[10px] text-gray-400 mt-1 font-mono flex items-center gap-3">
                                    <span>
                                      {walletEntry.patterns.length} pattern detection{walletEntry.patterns.length !== 1 ? 's' : ''}
                                    </span>
                                    <span>&bull;</span>
                                    <span>{txHashesList.length} supporting transaction{txHashesList.length !== 1 ? 's' : ''}</span>
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => toggleFinding(findingId)}
                                className="cyber-button-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 self-start sm:self-auto"
                              >
                                <span>{isFindingOpen ? 'Hide Evidence' : 'View Evidence & Details'}</span>
                                {isFindingOpen ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>

                            {/* ── 6. Expandable Finding Evidence Details (Requirement 7 & 8) ─ */}
                            {isFindingOpen && (
                              <div className="pt-3 border-t border-panel-border/70 space-y-3 animate-fade-in text-xs font-mono">
                                {/* Reason for detection */}
                                <div className="p-2.5 rounded bg-panel border border-panel-border text-gray-300 font-sans">
                                  <strong className="text-gray-100 font-mono text-[11px] block mb-0.5">
                                    Why this pattern was detected:
                                  </strong>
                                  {firstPattern.description ||
                                    firstPattern.explanation ||
                                    `Observed on-chain flow matching ${group.title} structural thresholds (high forwarding velocity / multiple hop distribution).`}
                                </div>

                                {/* Evidence Metrics Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                  {evidence.forwarded_received_ratio != null && (
                                    <div className="p-2 rounded bg-black/40 border border-panel-border">
                                      <span className="text-[10px] text-gray-500 uppercase block">Forwarding Ratio</span>
                                      <span className="text-yellow-400 font-bold">
                                        {(evidence.forwarded_received_ratio * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                  )}
                                  {evidence.incoming_edges != null && (
                                    <div className="p-2 rounded bg-black/40 border border-panel-border">
                                      <span className="text-[10px] text-gray-500 uppercase block">Incoming Transfers</span>
                                      <span className="text-gray-200 font-bold">{evidence.incoming_edges}</span>
                                    </div>
                                  )}
                                  {evidence.outgoing_edges != null && (
                                    <div className="p-2 rounded bg-black/40 border border-panel-border">
                                      <span className="text-[10px] text-gray-500 uppercase block">Outgoing Transfers</span>
                                      <span className="text-gray-200 font-bold">{evidence.outgoing_edges}</span>
                                    </div>
                                  )}
                                  {evidence.max_time_gap_seconds != null && (
                                    <div className="p-2 rounded bg-black/40 border border-panel-border">
                                      <span className="text-[10px] text-gray-500 uppercase block">Time Window</span>
                                      <span className="text-cyan-400 font-bold">
                                        {Math.round(evidence.max_time_gap_seconds / 60)} mins
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Underlying Supporting Transactions */}
                                {txHashesList.length > 0 && (
                                  <div className="space-y-1.5 pt-1">
                                    <span className="text-[10px] uppercase text-gray-500 font-bold block tracking-wider">
                                      Supporting Transaction Evidence ({txHashesList.length}):
                                    </span>
                                    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1 bg-black/20 rounded border border-panel-border/50">
                                      {txHashesList.map((txHash, txIdx) => (
                                        <div
                                          key={txIdx}
                                          onClick={() => selectTransaction(txHash)}
                                          className="cursor-pointer hover:opacity-80"
                                          title="Click to inspect full transaction forensic drawer"
                                        >
                                          <TxBadge txHash={txHash} chain={chain} />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── 7. Pagination Controls ───────────────────────────────────────── */}
          {!showAllGroups && totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-3 text-xs text-gray-400">
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  className="cyber-button-secondary py-1 px-2.5 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5 inline mr-1" /> Previous
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  className="cyber-button-secondary py-1 px-2.5 disabled:opacity-40"
                >
                  Next <ChevronRight className="w-3.5 h-3.5 inline ml-1" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
