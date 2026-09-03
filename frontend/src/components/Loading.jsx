import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const STAGES = [
  "Querying chain data...",
  "Fetching transaction graph...",
  "Matching known entities...",
  "Running graph analysis...",
  "Ranking likely destinations...",
  "Scoring risk...",
  "Finalizing attribution...",
];

export default function Loading({ onCancel }) {
  const [stageIndex, setStageIndex] = useState(0);
  const [dots, setDots] = useState('');

  // Cycle stage messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((i) => (i + 1) % STAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 relative">
      {/* Scanning pulse ring */}
      <div className="relative flex items-center justify-center w-32 h-32">
        <div className="absolute inset-0 rounded-full border-2 border-cyan-500/30 animate-ping"></div>
        <div className="absolute inset-4 rounded-full border-2 border-cyan-400/50 animate-ping" style={{ animationDelay: '0.5s' }}></div>
        <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/50 flex items-center justify-center">
          {/* NodeHound icon */}
          <svg className="w-8 h-8 text-cyan-400 animate-spin" style={{ animationDuration: '3s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
        </div>
      </div>

      {/* Status text */}
      <div className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-2xl font-semibold text-white">
          Tracing wallet across chains{dots}
        </h2>
        <p className="text-gray-400 text-sm font-mono transition-all duration-700 min-h-[20px]">
          {STAGES[stageIndex]}
        </p>
        <p className="text-gray-600 text-xs mt-2">This can take up to 2 minutes for large traces.</p>
      </div>

      {/* Progress bar (cosmetic, not real progress) */}
      <div className="w-80 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 animate-progress-bar rounded-full"></div>
      </div>

      {/* Escape hatch */}
      <button
        onClick={onCancel}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-cyan-400 transition-colors mt-4 border border-gray-700 hover:border-cyan-500/50 px-4 py-2 rounded-md"
      >
        <X className="w-4 h-4" />
        Cancel and use Demo Trace instead
      </button>
    </div>
  );
}
