import { useState } from 'react';
import Landing from './components/Landing';
import Loading from './components/Loading';
import Results from './components/Results';
import Dashboard from './components/Dashboard';
import { api } from './api.js';
import { addCase } from './caseHistory';
import demoTraceData from './demo/sample_trace.json';
import demoTronTrace from './demo/tron_trace.json';
import demoBitcoinTrace from './demo/bitcoin_trace.json';

const DEMO_FIXTURES = {
  ethereum: demoTraceData,
  tron: demoTronTrace,
  bitcoin: demoBitcoinTrace,
};

function normalizeDemo(data, chain) {
  const fixture = JSON.parse(JSON.stringify(data));
  fixture._demo = true;
  fixture.data_source = 'bundled_offline_fixture';
  fixture.scoring_status = fixture.scoring_status || 'offline_demo';
  fixture.model_version = fixture.model_version || `${chain}-demo-v1`;
  fixture.timeline = fixture.timeline?.length
    ? fixture.timeline
    : [...(fixture.edges || [])].sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  if (!fixture.candidates?.length && fixture.summary?.top_destination) {
    const destination = fixture.summary.top_destination;
    fixture.candidates = [{
      ...destination,
      chain,
      tier: destination.tier || 'medium_confidence',
      hop_distance: fixture.summary.highest_risk_path?.length - 1 || 0,
      evidence: {
        evidence_score: destination.confidence ?? 0,
        known_label: destination.label,
        data_source: fixture.data_source,
      },
      evidence_chain: fixture.timeline,
    }];
  }
  fixture.summary = {
    ...fixture.summary,
    candidates: fixture.candidates,
    insufficient_evidence: fixture.summary?.insufficient_evidence ?? !fixture.candidates?.length,
  };
  return fixture;
}

function App() {
  const [view, setView] = useState('landing'); // 'landing' | 'loading' | 'results' | 'error'
  const [traceData, setTraceData] = useState(null);
  const [error, setError] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [activeChain, setActiveChain] = useState('ethereum');

  const handleTrace = async (config) => {
    setActiveChain(config.chain);
    setError(null);
    setView('loading');

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

      // Handle 501 bitcoin - backend returns 501 but we guard in UI too
      setTraceData(data);
      setIsDemo(!!data._demo || !!data._fallback);
      setView('results');

      // Log to case history for the analytics dashboard - demo traces
      // are intentionally excluded so the dashboard reflects real
      // investigative work only.
      if (!data._demo && !data._fallback) {
        addCase({
          seed_address: data.seed_address,
          chain: config.chain,
          top_destination: data.summary?.top_destination,
          known_vasp_matches: data.summary?.known_vasp_matches,
          total_nodes: data.summary?.total_nodes,
          total_edges: data.summary?.total_edges,
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;

      if (err.status === 501) {
        setError({
          type: 'bitcoin',
          message: 'Bitcoin tracing is not yet available. Try Ethereum or Tron, or load the Demo Trace.',
        });
      } else if (err.status === 429) {
        setError({
          type: 'quota',
          message: 'The live Ethereum trace hit the public BigQuery quota limit. Use the Demo Trace or try a shorter time window.',
        });
      } else if (err.status === 503) {
        setError({
          type: 'network',
          message: err.message || 'The live trace provider is temporarily unavailable. Please try again in a moment or load the Demo Trace.',
        });
      } else if (err.message?.includes('fetch')) {
        setError({
          type: 'network',
          message: 'Could not connect to the NodeHound backend. Make sure the API server is running on port 8080.',
        });
      } else {
        setError({
          type: 'general',
          message: err.message || 'An unexpected error occurred.',
        });
      }
      setView('error');
    } finally {
      setAbortController(null);
    }
  };

  const handleLoadDemo = (chain = 'ethereum') => {
    const fixture = normalizeDemo(DEMO_FIXTURES[chain] || DEMO_FIXTURES.ethereum, chain);
    setActiveChain(chain);
    setIsDemo(true);
    setTraceData(fixture);
    setView('results');
  };

  const handleCancel = () => {
    if (abortController) abortController.abort();
    setAbortController(null);
    handleLoadDemo(activeChain);
  };

  const handleBack = () => {
    setView('landing');
    setTraceData(null);
    setError(null);
    setIsDemo(false);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden text-gray-200">
      <header className="px-6 py-4 border-b border-panel-border bg-panel flex justify-between items-center z-10 shrink-0">
        <h1
          className="text-xl font-semibold tracking-wide text-gray-100 flex items-center gap-2 cursor-pointer"
          onClick={handleBack}
        >
          <span className="text-accent-primary">Node</span>Hound
        </h1>
                <div className="flex items-center gap-3">
          {isDemo && view === 'results' && (
            <span className="text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded">
              Demo Trace
            </span>
          )}
          <button
            onClick={() => setView('dashboard')}
            className="text-xs text-gray-400 hover:text-cyan-300 transition-colors px-3 py-1.5 rounded-md border border-panel-border hover:border-cyan-500/40"
          >
            Dashboard
          </button>
        </div>
      </header>

      <main className="flex-grow flex flex-col relative w-full overflow-hidden">
        {view === 'landing' && (
          <div className="p-6 max-w-7xl mx-auto w-full h-full overflow-y-auto">
            <Landing onTrace={handleTrace} onLoadDemo={handleLoadDemo} />
          </div>
        )}

        {view === 'loading' && (
          <Loading onCancel={handleCancel} />
        )}

        {view === 'results' && traceData && (
          <Results
            data={traceData}
            isDemo={isDemo}
            onBack={handleBack}
            onLoadDemo={(chain) => handleLoadDemo(chain || traceData?.nodes?.[0]?.chain || 'ethereum')}
          />
        )}

        {view === 'dashboard' && (
          <Dashboard onBack={handleBack} />
        )}

        {view === 'error' && (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="cyber-panel p-8 max-w-md w-full text-center">
              {error?.type === 'bitcoin' ? (
                <>
                  <div className="text-4xl mb-4">₿</div>
                  <h2 className="text-xl font-semibold text-orange-400 mb-2">Bitcoin Not Yet Available</h2>
                </>
              ) : error?.type === 'quota' ? (
                <>
                  <div className="text-4xl mb-4">⏳</div>
                  <h2 className="text-xl font-semibold text-yellow-400 mb-2">Quota Exceeded</h2>
                </>
              ) : error?.type === 'network' ? (
                <>
                  <div className="text-4xl mb-4">🔌</div>
                  <h2 className="text-xl font-semibold text-red-400 mb-2">Cannot Reach Backend</h2>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-4">⚠️</div>
                  <h2 className="text-xl font-semibold text-yellow-400 mb-2">Trace Failed</h2>
                </>
              )}
              <p className="text-gray-400 text-sm mb-8">{error?.message}</p>
              <div className="flex flex-col gap-3">
                <button onClick={handleBack} className="cyber-button-primary w-full">
                  Try Another Address
                </button>
                <button onClick={handleLoadDemo} className="cyber-button-secondary w-full border border-gray-700 rounded-md py-2">
                  Load Demo Trace Instead
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
