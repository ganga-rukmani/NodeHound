import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Clock,
  ArrowRight,
  ShieldAlert,
  Layers,
  ChevronRight,
  ChevronLeft,
  Info,
  Activity,
  Maximize2,
} from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import { api } from '../../api';

export default function InvestigationReplay() {
  const { traceData, caseMetadata, selectAddress } = useInvestigation();
  const caseId = caseMetadata?.caseId || 'CASE-2026-ETH01';
  const { chain = 'ethereum', seed_address } = traceData || {};

  const [replayData, setReplayData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 4x

  const timerRef = useRef(null);

  // Load replay event stream from backend API or derive from traceData edges
  useEffect(() => {
    let isMounted = true;
    async function loadReplay() {
      setLoading(true);
      try {
        const data = await api.getInvestigationReplay(caseId);
        if (isMounted && data && data.events?.length) {
          setReplayData(data);
          setLoading(false);
          return;
        }
      } catch (err) {
        // Fallback gracefully
      }

      // Fallback derivation from traceData edges
      if (traceData?.edges?.length) {
        const sortedEdges = [...traceData.edges].sort((a, b) => {
          const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return tA - tB;
        });

        const derivedEvents = sortedEdges.map((e, idx) => {
          const isSeedSource = (e.from_address || '').toLowerCase() === (seed_address || '').toLowerCase();
          const hopNum = isSeedSource ? 1 : 2;
          const isCandidate = (traceData.candidates || []).some(
            (c) => (c.address || '').toLowerCase() === (e.to_address || '').toLowerCase()
          );

          return {
            event_index: idx,
            source: e.from_address || 'Not available',
            destination: e.to_address || 'Not available',
            asset: e.asset || (chain === 'bitcoin' ? 'BTC' : 'ETH'),
            amount: e.amount != null ? Number(e.amount) : null,
            timestamp: e.timestamp || 'Not available',
            tx_hash: e.tx_hash || 'Not available',
            block: e.block_number != null ? e.block_number : 'Not available',
            hop: hopNum,
            hop_label: hopNum === 1 ? 'HOP 1 - Intermediate Conduit' : 'HOP 2 - Downstream Node',
            evidence_type: e.evidence_type || 'direct_transfer',
            event_type: 'FUND MOVEMENT DETECTED',
            is_high_priority_candidate: isCandidate,
            candidate_label: isCandidate ? 'HIGH-PRIORITY INVESTIGATION CANDIDATE' : null,
          };
        });

        if (isMounted) {
          setReplayData({
            case_id: caseId,
            events: derivedEvents,
            total_events: derivedEvents.length,
            disclaimer: 'Replay visually renders chronological transfers from verified blockchain ingestion. It does not modify underlying evidence.',
          });
        }
      }
      if (isMounted) setLoading(false);
    }

    loadReplay();
    return () => {
      isMounted = false;
    };
  }, [caseId, traceData, seed_address, chain]);

  const events = replayData?.events || [];
  const totalEvents = events.length;
  const currentEvent = events[currentIndex] || null;

  // Playback timer
  useEffect(() => {
    if (isPlaying && totalEvents > 0) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= totalEvents - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 2000 / playbackSpeed);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isPlaying, totalEvents, playbackSpeed]);

  const handlePlayPause = () => {
    if (currentIndex >= totalEvents - 1 && !isPlaying) {
      setCurrentIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setCurrentIndex((prev) => Math.min(totalEvents - 1, prev + 1));
  };

  // Traversed nodes & edges for graph visualization
  const traversedEvents = useMemo(() => {
    return events.slice(0, currentIndex + 1);
  }, [events, currentIndex]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header & Disclaimer ───────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-cyan-500/30 bg-gradient-to-r from-panel via-cyan-950/[0.1] to-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Investigation Replay
              </span>
              <span className="text-xs font-mono text-gray-400">
                Chronological Graph Fund Flow Progression
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-100">Chronological Fund Movement Replay</h2>
            <p className="text-xs text-gray-300 font-mono mt-1 max-w-3xl">
              Visually trace how funds propagated through intermediary addresses, peeling chains, and candidate wallets over time.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono text-cyan-400 bg-black/50 px-3 py-2 rounded-lg border border-panel-border">
              Step: <strong>{totalEvents > 0 ? currentIndex + 1 : 0}</strong> / {totalEvents}
            </span>
          </div>
        </div>

        {/* Forensic Disclaimer */}
        <div className="mt-4 pt-3 border-t border-panel-border/50 text-[11px] text-gray-400 flex items-start gap-2 italic">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            "Replay is a forensic visualization of recorded blockchain transactions. It does not modify original transaction hashes, amounts, or timestamps."
          </span>
        </div>
      </div>

      {/* ── Playback Controls & Timeline Scrubber ─────────────────────────── */}
      <div className="cyber-panel p-5 border-panel-border bg-black/50 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Main Transport Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="cyber-button-secondary p-2 rounded text-xs flex items-center gap-1"
              title="Reset to beginning"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={handleStepBack}
              disabled={currentIndex === 0}
              className="cyber-button-secondary p-2 rounded text-xs disabled:opacity-30"
              title="Step back"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handlePlayPause}
              className="cyber-button-primary px-4 py-2 text-xs flex items-center gap-2 font-mono font-bold uppercase"
              title={isPlaying ? 'Pause replay' : 'Start replay'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              onClick={handleStepForward}
              disabled={currentIndex >= totalEvents - 1}
              className="cyber-button-secondary p-2 rounded text-xs disabled:opacity-30"
              title="Step forward"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Speed Multiplier */}
            <div className="flex items-center gap-1 pl-3 border-l border-panel-border">
              {[1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Current Timestamp & Event Indicator */}
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-gray-300">
              <span className="text-gray-500">Event Time:</span>
              <span className="text-cyan-400 font-bold">
                {currentEvent?.timestamp || 'Not available'}
              </span>
            </div>
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="space-y-1.5 pt-1">
          <input
            type="range"
            min="0"
            max={Math.max(0, totalEvents - 1)}
            value={currentIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentIndex(Number(e.target.value));
            }}
            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex justify-between text-[10px] font-mono text-gray-500">
            <span>Event 1: Start of Ingestion Window</span>
            <span>Event {totalEvents}: Latest Traced Activity</span>
          </div>
        </div>
      </div>

      {/* ── Active Event Banner & Details ─────────────────────────────────── */}
      {currentEvent && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Visual Flow Animation & Step Sequence */}
          <div className="lg:col-span-7 space-y-4">
            {/* Visual Replay Flow Canvas */}
            <div className="cyber-panel p-6 border-cyan-500/30 bg-black/40 min-h-[280px] flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between border-b border-panel-border pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                  <span className="text-xs font-mono font-bold uppercase text-cyan-300">
                    {currentEvent.event_type}
                  </span>
                </div>

                {currentEvent.is_high_priority_candidate && (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {currentEvent.candidate_label}
                  </span>
                )}
              </div>

              {/* Dynamic Hop Visualization */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-6">
                {/* Source Node */}
                <div
                  onClick={() => selectAddress(currentEvent.source)}
                  className="cyber-panel p-4 max-w-[220px] w-full text-center border-panel-border hover:border-cyan-500 cursor-pointer bg-panel transition-all"
                >
                  <span className="text-[10px] font-mono uppercase text-gray-500 block mb-1">
                    Source (Sender)
                  </span>
                  <div className="font-mono text-xs font-bold text-gray-200 truncate">
                    {currentEvent.source}
                  </div>
                  <span className="text-[9px] font-mono text-gray-400 block mt-1">
                    HOP {Math.max(0, (currentEvent.hop || 1) - 1)}
                  </span>
                </div>

                {/* Animated Directional Arrow */}
                <div className="flex flex-col items-center justify-center px-2">
                  <span className="text-xs font-mono font-bold text-cyan-400 mb-1">
                    {currentEvent.amount != null
                      ? `${currentEvent.amount.toLocaleString()} ${currentEvent.asset}`
                      : 'Amount Not available'}
                  </span>
                  <div className="flex items-center text-cyan-400 animate-pulse">
                    <ArrowRight className="w-6 h-6" />
                  </div>
                </div>

                {/* Destination Node */}
                <div
                  onClick={() => selectAddress(currentEvent.destination)}
                  className={`cyber-panel p-4 max-w-[220px] w-full text-center cursor-pointer transition-all border ${
                    currentEvent.is_high_priority_candidate
                      ? 'border-red-500/60 bg-red-950/20 shadow-lg shadow-red-950/30'
                      : 'border-panel-border hover:border-cyan-500 bg-panel'
                  }`}
                >
                  <span className="text-[10px] font-mono uppercase text-gray-500 block mb-1">
                    Destination (Recipient)
                  </span>
                  <div className="font-mono text-xs font-bold text-cyan-300 truncate">
                    {currentEvent.destination}
                  </div>
                  <span className="text-[9px] font-mono text-gray-400 block mt-1">
                    {currentEvent.hop_label}
                  </span>
                </div>
              </div>

              {/* Hop Progression Strip */}
              <div className="pt-2 border-t border-panel-border flex items-center justify-between text-[11px] font-mono text-gray-400">
                <span>HOP 0: Seed / Victim</span>
                <span>→</span>
                <span className={currentEvent.hop >= 1 ? 'text-cyan-400 font-bold' : 'text-gray-600'}>
                  HOP 1: Intermediate
                </span>
                <span>→</span>
                <span className={currentEvent.hop >= 2 ? 'text-purple-400 font-bold' : 'text-gray-600'}>
                  HOP 2: Candidate
                </span>
                <span>→</span>
                <span className={currentEvent.hop >= 3 ? 'text-amber-400 font-bold' : 'text-gray-600'}>
                  HOP 3: Liquidity
                </span>
              </div>
            </div>

            {/* Traversed Events Timeline List */}
            <div className="cyber-panel p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
                Traversed History (Steps 1 to {currentIndex + 1})
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs font-mono pr-1">
                {traversedEvents.map((e, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentIndex(idx);
                    }}
                    className={`p-2 rounded flex items-center justify-between cursor-pointer border ${
                      idx === currentIndex
                        ? 'bg-cyan-950/30 border-cyan-500/50 text-cyan-300'
                        : 'bg-black/30 border-panel-border text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-[10px] text-gray-500 font-bold">#{idx + 1}</span>
                      <span className="truncate max-w-[120px]">{e.source.slice(0, 10)}...</span>
                      <span>→</span>
                      <span className="truncate max-w-[120px]">{e.destination.slice(0, 10)}...</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold">
                        {e.amount != null ? `${e.amount} ${e.asset}` : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Transaction Detail Panel */}
          <div className="lg:col-span-5 space-y-4">
            <div className="cyber-panel p-5 border-cyan-500/30 bg-panel space-y-4">
              <div className="border-b border-panel-border pb-3">
                <span className="text-xs font-mono uppercase text-gray-400 block mb-1">
                  Current Transaction Details
                </span>
                <h3 className="text-sm font-bold text-gray-100 font-mono">
                  Event #{currentEvent.event_index + 1} Metadata
                </h3>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-gray-500 uppercase block">Transaction Hash</span>
                  <div className="font-bold text-cyan-400 break-all bg-black/40 p-2 rounded border border-panel-border mt-0.5">
                    {currentEvent.tx_hash}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                    <span className="text-[10px] text-gray-500 uppercase block">Asset</span>
                    <span className="font-bold text-gray-200 block mt-0.5">{currentEvent.asset}</span>
                  </div>

                  <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                    <span className="text-[10px] text-gray-500 uppercase block">Amount</span>
                    <span className="font-bold text-green-400 block mt-0.5">
                      {currentEvent.amount != null ? currentEvent.amount.toLocaleString() : 'Not available'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                    <span className="text-[10px] text-gray-500 uppercase block">Block Number</span>
                    <span className="font-bold text-gray-200 block mt-0.5">
                      {currentEvent.block != null ? currentEvent.block : 'Not available'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded bg-black/40 border border-panel-border">
                    <span className="text-[10px] text-gray-500 uppercase block">Hop Designator</span>
                    <span className="font-bold text-purple-400 block mt-0.5">
                      HOP {currentEvent.hop}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-gray-500 uppercase block">Timestamp</span>
                  <div className="text-gray-200 bg-black/40 p-2 rounded border border-panel-border mt-0.5">
                    {currentEvent.timestamp}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-gray-500 uppercase block">Evidence Type</span>
                  <div className="text-gray-200 bg-black/40 p-2 rounded border border-panel-border mt-0.5 uppercase">
                    {currentEvent.evidence_type}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

