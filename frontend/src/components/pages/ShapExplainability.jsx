import React, { useMemo } from 'react';
import { BarChart2, Info, ArrowUpRight, ArrowDownRight, ShieldAlert, Cpu } from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import EmptyState from '../common/EmptyState';
import clsx from 'clsx';

export default function ShapExplainability() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
  } = useInvestigation();

  const { nodes = [], chain = 'ethereum', seed_address } = traceData || {};

  const currentAddress = selectedAddress || seed_address || (nodes[0]?.address ?? '');

  const node = useMemo(() => {
    return (
      nodes.find((n) => n.address.toLowerCase() === currentAddress.toLowerCase()) || {
        address: currentAddress,
        chain,
      }
    );
  }, [nodes, currentAddress, chain]);

  // Extract real SHAP factors from node if present
  const shapFactors = useMemo(() => {
    if (node?.shap_evidence && Array.isArray(node.shap_evidence)) {
      return node.shap_evidence;
    }
    if (node?.shap_factors && Array.isArray(node.shap_factors)) {
      return node.shap_factors.map((f) => ({
        feature: f.feature,
        value: f.value ?? 0,
        shap_contribution: f.impact ?? f.contribution ?? 0,
        direction: (f.impact ?? f.contribution ?? 0) >= 0 ? 'increases_risk' : 'decreases_risk',
      }));
    }
    return [];
  }, [node]);

  const hasShap = shapFactors.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-purple-500/30 bg-gradient-to-r from-panel to-purple-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                Interpretability
              </span>
              <span className="text-xs font-mono text-gray-400">
                TreeSHAP Marginal Contributions
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-100">SHAP Behavioral Explainability</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-400">Target Address:</span>
              <AddressBadge
                address={currentAddress}
                chain={node.chain || chain}
                label={node.label}
                category={node.category}
                showFull
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400 shrink-0">Switch Address:</label>
            <select
              value={currentAddress}
              onChange={(e) => selectAddress(e.target.value)}
              className="cyber-input text-xs font-mono max-w-xs bg-background"
            >
              {nodes.map((n) => (
                <option key={n.address} value={n.address}>
                  {n.label ? `${n.label} (${n.address.slice(0, 8)}...)` : n.address}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── SHAP Content or Honest Unavailable State ─────────────────────── */}
      {!hasShap ? (
        <EmptyState
          title="SHAP Explainability Unavailable"
          subtitle="SHAP marginal attribution requires a loaded and calibrated tree-based model artifact. When model artifacts are uncalibrated or training data is insufficient, SHAP values are not fabricated."
          icon={Cpu}
          badge="INSUFFICIENT VALID TRAINING DATA"
          type="unavailable"
          action={
            <div className="text-xs text-gray-400 max-w-md mt-2">
              To inspect feature distributions without an active ML model, view the{' '}
              <button
                onClick={() => selectAddress(currentAddress, 'technical_details')}
                className="text-cyan-400 underline font-semibold"
              >
                Technical / Model Details
              </button>{' '}
              page.
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Plain-Language Explanation */}
          <div className="cyber-panel p-5 border-cyan-500/20 bg-cyan-950/[0.05]">
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider mb-1.5">
              Plain-Language Interpretation
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              {shapFactors[0]?.feature
                ? `High ${shapFactors[0].feature.replace(/_/g, ' ')} ${
                    shapFactors[1]?.feature ? `and ${shapFactors[1].feature.replace(/_/g, ' ')}` : ''
                  } contributed most strongly to the model's risk assessment for this address.`
                : 'Observed behavioral features are balanced against historical normal wallet baselines.'}
            </p>
          </div>

          {/* Feature Contribution Breakdown Table */}
          <div className="cyber-panel overflow-hidden">
            <div className="p-4 border-b border-panel-border bg-black/30 flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                Feature-Level SHAP Impact Matrix
              </h3>
              <span className="text-[10px] text-gray-500 font-mono">Sorted by |Impact|</span>
            </div>

            <div className="p-4 space-y-4">
              {shapFactors.map((factor, idx) => {
                const contribution = Number(factor.shap_contribution) || 0;
                const increasesRisk = contribution >= 0;

                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-200">
                          {factor.feature}
                        </span>
                        {factor.value != null && (
                          <span className="text-gray-400 font-mono text-[11px]">
                            (val: {factor.value})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            'font-mono font-bold text-xs',
                            increasesRisk ? 'text-red-400' : 'text-green-400'
                          )}
                        >
                          {increasesRisk ? '+' : ''}
                          {contribution.toFixed(4)}
                        </span>
                        <span
                          className={clsx(
                            'text-[10px] font-sans font-medium px-1.5 py-0.2 rounded border',
                            increasesRisk
                              ? 'text-red-300 bg-red-500/10 border-red-500/30'
                              : 'text-green-300 bg-green-500/10 border-green-500/30'
                          )}
                        >
                          {increasesRisk ? '↑ Risk' : '↓ Risk'}
                        </span>
                      </div>
                    </div>

                    {/* Visual Bar */}
                    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full transition-all duration-500',
                          increasesRisk ? 'bg-red-500' : 'bg-green-500'
                        )}
                        style={{
                          width: `${Math.min(100, Math.max(5, Math.abs(contribution) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

