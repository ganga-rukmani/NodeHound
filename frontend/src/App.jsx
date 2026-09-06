import React, { useState } from 'react';
import { api } from './api.js';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InvestigationProvider, useInvestigation } from './context/InvestigationContext';
import Loading from './components/Loading';
import Dashboard from './components/Dashboard';
import InvestigatorHeader from './components/layout/InvestigatorHeader';
import InvestigatorSidebar from './components/layout/InvestigatorSidebar';
import TxDetailDrawer from './components/common/TxDetailDrawer';
import AuthModal from './components/auth/AuthModal';

// Case Governance & 18 Page Views + Graph
import CaseManagement from './components/pages/CaseManagement';
import NewInvestigation from './components/pages/NewInvestigation';
import InvestigationOverview from './components/pages/InvestigationOverview';
import TransactionInvestigation from './components/pages/TransactionInvestigation';
import AddressIntelligence from './components/pages/AddressIntelligence';
import BehavioralAnalysis from './components/pages/BehavioralAnalysis';
import FundFlowAnalysis from './components/pages/FundFlowAnalysis';
import SuspiciousAttribution from './components/pages/SuspiciousAttribution';
import VaspIntelligence from './components/pages/VaspIntelligence';
import TypologyAnalysis from './components/pages/TypologyAnalysis';
import MixerCrossChain from './components/pages/MixerCrossChain';
import AiRiskAnalysis from './components/pages/AiRiskAnalysis';
import ShapExplainability from './components/pages/ShapExplainability';
import AlertsView from './components/pages/AlertsView';
import RecommendationsView from './components/pages/RecommendationsView';
import EvidenceExplorer from './components/pages/EvidenceExplorer';
import EvidenceIntegrity from './components/pages/EvidenceIntegrity';
import InvestigationReportView from './components/pages/InvestigationReportView';
import TechnicalModelDetails from './components/pages/TechnicalModelDetails';
import GraphVisualizer from './components/pages/GraphVisualizer';

// Demo Fixtures
import demoEthTrace from './demo/sample_trace.json';
import demoTronTrace from './demo/tron_trace.json';
import demoBtcTrace from './demo/bitcoin_trace.json';

const DEMO_FIXTURES = {
  ethereum: demoEthTrace,
  tron: demoTronTrace,
  bitcoin: demoBtcTrace,
};

function normalizeDemo(data, chain = 'ethereum') {
  const fixture = JSON.parse(JSON.stringify(data));
  fixture._demo = true;
  fixture.chain = chain;
  fixture.data_source = 'bundled_offline_fixture';
  fixture.timeline = fixture.timeline?.length
    ? fixture.timeline
    : [...(fixture.edges || [])].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

  // Ensure candidates exist
  if (!fixture.candidates?.length) {
    const topDest = fixture.summary?.top_destination || (fixture.nodes?.find((n) => n.is_labeled) || fixture.nodes?.[1]);
    if (topDest) {
      fixture.candidates = [
        {
          address: topDest.address,
          label: topDest.label,
          category: topDest.category || 'exchange',
          chain,
          tier: 'high_confidence',
          hop_distance: 2,
          total_received: 29000,
          total_forwarded: 19000,
          evidence: {
            evidence_score: topDest.confidence ?? 0.88,
            fund_continuity: 0.85,
            repeated_path_count: 2,
            counterparty_concentration: 0.5,
            proximity_to_flagged: 0.6,
            known_label: topDest.label,
            label_source: 'Verified Offline Fixture',
          },
          evidence_chain: fixture.timeline.slice(0, 3),
        },
      ];
    }
  }

  // Ensure detected patterns exist
  if (!fixture.detected_patterns?.length) {
    fixture.detected_patterns = [
      {
        type: 'intermediary_forwarding',
        address: fixture.nodes?.[2]?.address || fixture.edges?.[0]?.to_address,
        severity: 'medium',
        confidence: 'medium_confidence',
        evidence: {
          incoming_edges: 2,
          outgoing_edges: 1,
          forwarded_received_ratio: 0.85,
          transaction_hashes: fixture.edges?.slice(0, 3).map((e) => e.tx_hash) || [],
        },
        disclaimer: 'Behavior is consistent with intermediary forwarding; it does not establish illicit intent or ownership.',
      },
    ];
  }

  // Ensure alerts exist
  if (!fixture.alerts?.length) {
    fixture.alerts = [
      {
        type: 'high_priority_candidate',
        severity: 'high',
        address: fixture.candidates?.[0]?.address,
        tier: 'high_confidence',
        evidence: fixture.candidates?.[0]?.evidence_chain || [],
      },
      {
        type: 'intermediary_forwarding',
        severity: 'medium',
        address: fixture.nodes?.[2]?.address,
        evidence: fixture.detected_patterns?.[0]?.evidence,
      },
    ];
  }

  // Ensure recommendations exist
  if (!fixture.recommendations?.length) {
    fixture.recommendations = [
      {
        priority: 'high',
        action: 'Preserve and review the evidence chain for the highest-ranked candidate.',
        basis: 'ranked graph candidate with observed transfer path',
      },
      {
        priority: 'medium',
        action: 'Review intermediary and multi-hop activity with transaction-level records.',
        basis: 'detected_patterns',
      },
    ];
  }

  // Ensure model information
  fixture.model_information = fixture.model_information || {
    chain_model_loaded: false,
    status: 'INSUFFICIENT_VALID_TRAINING_DATA',
    risk_score_disclaimer: 'Behavioral risk is an estimate and is not proof of attacker ownership.',
  };

  // Ensure integrity hash
  fixture.evidence_integrity_hash =
    fixture.evidence_integrity_hash ||
    'a8f9c4d293847b2c019d84e756a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9';

  return fixture;
}

function MainWorkspace() {
  const {
    activeSection,
    setActiveSection,
    traceData,
    setTraceResult,
    selectedTransaction,
    txDrawerOpen,
    setTxDrawerOpen,
    selectAddress,
    clearCase,
  } = useInvestigation();

  const { authModalOpen } = useAuth();

  const [viewState, setViewState] = useState('app'); // 'app' | 'loading' | 'dashboard' | 'error'
  const [error, setError] = useState(null);
  const [abortController, setAbortController] = useState(null);

  const handleStartTrace = async (config) => {
    setError(null);
    setViewState('loading');

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const data = await api.trace({
        seed_address: config.address,
        chain: config.chain,
        max_hops: config.maxHops,
        start_time: config.startTime || undefined,
        end_time: config.endTime || undefined,
      });

      if (controller.signal.aborted) return;

      setTraceResult(data, {
        chain: config.chain,
        maxHops: config.maxHops,
        startTime: config.startTime,
        endTime: config.endTime,
      });
      setViewState('app');
    } catch (err) {
      if (controller.signal.aborted) return;

      if (err.status === 501) {
        setError({
          type: 'bitcoin',
          title: 'Bitcoin Tracing Initializing',
          message: 'Bitcoin tracing is currently in offline mode or requires BigQuery credentials. Load the Bitcoin Demo Trace to inspect the pipeline.',
        });
      } else if (err.status === 503) {
        setError({
          type: 'network',
          title: 'Blockchain Ingestion Provider Unavailable',
          message: err.message || 'The chain ingestion provider requires API credentials (GCP_PROJECT_ID or TRONGRID_API_KEY). You can load the offline demo trace to test the full investigator platform.',
        });
      } else if (err.status === 500) {
        const msg = err.message || '';
        const isQuota = msg.toLowerCase().includes('quota') || msg.includes('403') || msg.toLowerCase().includes('bytes scanned');
        setError({
          type: isQuota ? 'quota_exceeded' : 'cloud_credentials',
          title: isQuota ? 'Google Cloud BigQuery Scan Quota Exceeded' : 'Live Ingestion Error (500)',
          message: isQuota
            ? 'Your query exceeded the Google Cloud BigQuery free scan quota (unbounded dates scan 6+ years of Ethereum data). To fix: enter a 1-day or 2-day date range (e.g. 2024-01-01 to 2024-01-02), enable GCP billing, or click "Load Offline Demo Trace" below to explore without limits.'
            : (msg || 'Live blockchain query encountered a backend error. Try setting a 1-day date window (e.g. 2024-01-01 to 2024-01-02) or load the offline demo trace below.'),
        });
      } else if (err.message?.includes('fetch') || err.status === 0) {
        setError({
          type: 'network',
          title: 'Cannot Reach NodeHound Backend API',
          message: 'Could not connect to the backend server at http://127.0.0.1:8080. Start the backend with: uvicorn api.main:app --port 8080 or use offline demo mode.',
        });
      } else {
        setError({
          type: 'general',
          title: 'Trace Ingestion Failed',
          message: err.message || 'An unexpected error occurred during graph generation.',
        });
      }
      setViewState('error');
    } finally {
      setAbortController(null);
    }
  };

  const handleLoadDemo = (chain = 'ethereum') => {
    const raw = DEMO_FIXTURES[chain] || DEMO_FIXTURES.ethereum;
    const normalized = normalizeDemo(raw, chain);
    setTraceResult(normalized, {
      caseId: `DEMO-${chain.toUpperCase()}-001`,
      caseTitle: `${chain.toUpperCase()} Suspicious Flow Trace (Offline Fixture)`,
      investigatorId: 'INV-DEMO',
      chain,
    });
    setViewState('app');
  };

  const handleCancelLoading = () => {
    if (abortController) abortController.abort();
    setAbortController(null);
    setViewState('app');
  };

  // If no trace has been loaded yet, show the New Investigation form (or Case Management)
  const currentSection = (!traceData && activeSection !== 'case_management') ? 'new_investigation' : activeSection;

  return (
    <div className="flex flex-col h-screen overflow-hidden text-gray-200 bg-background">
      {/* Global Top Header */}
      <InvestigatorHeader
        onOpenDashboard={() => setViewState('dashboard')}
        onNewInvestigation={() => {
          clearCase();
          setActiveSection('new_investigation');
        }}
      />

      {/* Main Workspace Layout */}
      <div className="flex flex-grow overflow-hidden relative">
        {viewState === 'loading' && (
          <div className="w-full h-full flex items-center justify-center">
            <Loading onCancel={handleCancelLoading} />
          </div>
        )}

        {viewState === 'dashboard' && (
          <div className="w-full h-full overflow-y-auto">
            <Dashboard onBack={() => setViewState('app')} />
          </div>
        )}

        {viewState === 'error' && (
          <div className="w-full h-full flex items-center justify-center p-6">
            <div className="cyber-panel p-8 max-w-md w-full text-center space-y-4">
              <div className="text-4xl">⚠️</div>
              <h2 className="text-lg font-bold text-yellow-400">{error?.title}</h2>
              <p className="text-xs text-gray-400 leading-relaxed">{error?.message}</p>
              <div className="flex flex-col gap-2 pt-4">
                <button
                  onClick={() => setViewState('app')}
                  className="cyber-button-primary w-full py-2 text-xs"
                >
                  Return to Investigation Setup
                </button>
                <button
                  onClick={() => handleLoadDemo('ethereum')}
                  className="cyber-button-secondary w-full py-2 text-xs"
                >
                  Load Offline Demo Trace
                </button>
              </div>
            </div>
          </div>
        )}

        {viewState === 'app' && (
          <>
            {/* Sidebar Navigation */}
            <InvestigatorSidebar />

            {/* Content Area */}
            <main className="flex-grow overflow-y-auto p-6 relative">
              <div className="max-w-7xl mx-auto w-full pb-12">
                {currentSection === 'case_management' && (
                  <CaseManagement
                    onSelectCase={(caseObj) => {
                      if (caseObj.seed_address) {
                        setActiveSection('new_investigation');
                      }
                    }}
                  />
                )}
                {currentSection === 'new_investigation' && (
                  <NewInvestigation
                    onStartTrace={handleStartTrace}
                    onLoadDemo={handleLoadDemo}
                    isLoading={false}
                  />
                )}
                {currentSection === 'overview' && <InvestigationOverview />}
                {currentSection === 'transactions' && <TransactionInvestigation />}
                {currentSection === 'address_intelligence' && <AddressIntelligence />}
                {currentSection === 'behavioral_analysis' && <BehavioralAnalysis />}
                {currentSection === 'fund_flow' && <FundFlowAnalysis />}
                {currentSection === 'graph' && <GraphVisualizer />}
                {currentSection === 'attribution' && <SuspiciousAttribution />}
                {currentSection === 'vasp_intelligence' && <VaspIntelligence />}
                {currentSection === 'typology' && <TypologyAnalysis />}
                {currentSection === 'mixer_cross_chain' && <MixerCrossChain />}
                {currentSection === 'ai_risk' && <AiRiskAnalysis />}
                {currentSection === 'shap_explainability' && <ShapExplainability />}
                {currentSection === 'technical_details' && <TechnicalModelDetails />}
                {currentSection === 'alerts' && <AlertsView />}
                {currentSection === 'recommendations' && <RecommendationsView />}
                {currentSection === 'evidence_explorer' && <EvidenceExplorer />}
                {currentSection === 'evidence_integrity' && <EvidenceIntegrity />}
                {currentSection === 'report' && <InvestigationReportView />}
              </div>
            </main>

            {/* Slide-out Transaction Investigation Drawer */}
            {txDrawerOpen && selectedTransaction && (
              <TxDetailDrawer
                transaction={selectedTransaction}
                onClose={() => setTxDrawerOpen(false)}
                onSelectAddress={(addr) => {
                  setTxDrawerOpen(false);
                  selectAddress(addr, 'address_intelligence');
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Global Auth & Persona Modal */}
      {authModalOpen && <AuthModal />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <InvestigationProvider>
        <MainWorkspace />
      </InvestigationProvider>
    </AuthProvider>
  );
}
