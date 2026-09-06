import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { addCase } from '../caseHistory';

const InvestigationContext = createContext(null);

export function InvestigationProvider({ children }) {
  const [activeSection, setActiveSection] = useState('overview'); // defaults to 'overview' once traced, 'new_investigation' initially
  const [caseMetadata, setCaseMetadata] = useState({
    caseId: `CASE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-001`,
    caseTitle: 'Blockchain Asset Trace',
    investigatorId: 'INV-042',
    notes: 'Tracing outbound fund flows and identifying potential laundering typologies.',
    maxHops: 3,
    startTime: '',
    endTime: '',
  });

  const [traceData, setTraceData] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [activeChain, setActiveChain] = useState('ethereum');

  // Selected entities for cross-page investigator context persistence
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [txDrawerOpen, setTxDrawerOpen] = useState(false);

  // In-session alert review status mapping: alertId -> status ('new' | 'reviewed' | 'escalated' | 'dismissed')
  const [alertStatuses, setAlertStatuses] = useState({});

  // When traceData loads, initialize selected address to seed or top candidate
  const setTraceResult = (data, meta = {}) => {
    setTraceData(data);
    setIsDemo(Boolean(data._demo || data._fallback));
    const chain = data.chain || meta.chain || 'ethereum';
    setActiveChain(chain);

    if (meta.caseId || meta.caseTitle) {
      setCaseMetadata((prev) => ({
        ...prev,
        ...meta,
      }));
    }

    // Default selected address to top candidate or seed address
    const topCandidate = data.candidates?.[0]?.address || data.summary?.top_destination?.address;
    const seed = data.seed_address;
    setSelectedAddress(topCandidate || seed || null);
    setSelectedTransaction(null);
    setSelectedAlert(null);
    setSelectedEvidence(null);
    setActiveSection('overview');

    // Record into analytics history if not demo
    if (!data._demo && !data._fallback && seed) {
      addCase({
        seed_address: seed,
        chain,
        top_destination: data.summary?.top_destination,
        known_vasp_matches: data.summary?.known_vasp_matches,
        total_nodes: data.summary?.total_nodes || data.nodes?.length,
        total_edges: data.summary?.total_edges || data.edges?.length,
      });
    }
  };

  // Find currently selected candidate object
  const selectedCandidate = useMemo(() => {
    if (!traceData?.candidates?.length || !selectedAddress) return null;
    return (
      traceData.candidates.find(
        (c) => c.address.toLowerCase() === selectedAddress.toLowerCase()
      ) || null
    );
  }, [traceData, selectedAddress]);

  // Find currently selected node object
  const selectedNode = useMemo(() => {
    if (!traceData?.nodes?.length || !selectedAddress) return null;
    return (
      traceData.nodes.find(
        (n) => n.address.toLowerCase() === selectedAddress.toLowerCase()
      ) || null
    );
  }, [traceData, selectedAddress]);

  // Navigation and cross-linking actions
  const selectAddress = (addr, targetSection) => {
    if (!addr) return;
    setSelectedAddress(addr);
    if (targetSection) {
      setActiveSection(targetSection);
    }
  };

  const selectTransaction = (tx, openDrawer = true, targetSection) => {
    if (!tx) return;
    let txObj = tx;
    if (typeof tx === 'string' && traceData?.edges) {
      txObj = traceData.edges.find((e) => e.tx_hash === tx) || { tx_hash: tx };
    }
    setSelectedTransaction(txObj);
    if (openDrawer) {
      setTxDrawerOpen(true);
    }
    if (targetSection) {
      setActiveSection(targetSection);
    }
  };

  const selectCandidate = (candidate, targetSection = 'attribution') => {
    if (!candidate) return;
    setSelectedAddress(candidate.address);
    if (targetSection) {
      setActiveSection(targetSection);
    }
  };

  const selectAlert = (alert, targetSection = 'alerts') => {
    if (!alert) return;
    setSelectedAlert(alert);
    if (alert.address) {
      setSelectedAddress(alert.address);
    }
    if (targetSection) {
      setActiveSection(targetSection);
    }
  };

  const updateAlertStatus = (alertKey, newStatus) => {
    setAlertStatuses((prev) => ({
      ...prev,
      [alertKey]: newStatus,
    }));
  };

  const clearCase = () => {
    setTraceData(null);
    setSelectedAddress(null);
    setSelectedTransaction(null);
    setSelectedAlert(null);
    setSelectedEvidence(null);
    setActiveSection('new_investigation');
  };

  return (
    <InvestigationContext.Provider
      value={{
        activeSection,
        setActiveSection,
        caseMetadata,
        setCaseMetadata,
        traceData,
        setTraceData,
        isDemo,
        activeChain,
        setActiveChain,
        selectedAddress,
        selectedCandidate,
        selectedNode,
        selectedTransaction,
        selectedAlert,
        selectedEvidence,
        setSelectedEvidence,
        txDrawerOpen,
        setTxDrawerOpen,
        alertStatuses,
        updateAlertStatus,
        setTraceResult,
        selectAddress,
        selectTransaction,
        selectCandidate,
        selectAlert,
        clearCase,
      }}
    >
      {children}
    </InvestigationContext.Provider>
  );
}

export function useInvestigation() {
  const context = useContext(InvestigationContext);
  if (!context) {
    throw new Error('useInvestigation must be used within an InvestigationProvider');
  }
  return context;
}

