import React, { useMemo } from 'react';
import {
  HelpCircle,
  Layers,
  ArrowDown,
  Compass,
  TrendingUp,
  FileCheck2,
  Eye,
  CheckCircle2,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import AddressBadge from '../common/AddressBadge';
import { calculateAddressFeatures } from '../../utils/featureEngine';

export default function ShapExplainability() {
  const {
    traceData,
    selectedAddress,
    selectAddress,
  } = useInvestigation();

  const {
    nodes = [],
    edges = [],
    chain = 'ethereum',
    seed_address,
  } = traceData || {};

  const currentAddress = selectedAddress || seed_address || (nodes[0]?.address ?? '');

  const node = useMemo(() => {
    return (
      nodes.find((n) => n.address.toLowerCase() === currentAddress.toLowerCase()) || {
        address: currentAddress,
        chain,
      }
    );
  }, [nodes, currentAddress, chain]);

  const features = useMemo(() => {
    return calculateAddressFeatures(currentAddress, nodes, edges, chain);
  }, [currentAddress, nodes, edges, chain]);

  const pipelineSteps = [
    { title: 'Blockchain Activity', desc: 'Raw ledger events & transfers' },
    { title: 'Behavioral Feature Extraction', desc: 'Deterministic feature pipeline' },
    { title: '13 Behavioral Features', desc: 'Normalized address profile vector' },
    { title: 'Calibrated XGBoost', desc: 'Ensemble gradient boosted trees' },
    { title: 'TreeSHAP', desc: 'Game-theoretic attribution algorithm' },
    { title: 'Feature-Level Explanation', desc: 'Local feature contribution vectors' },
  ];

  const featureGroups = [
    {
      category: 'TRANSACTION BEHAVIOR',
      description: 'Transaction frequency, volume cadence, and bidirectional distribution',
      features: [
        {
          name: 'in_count',
          label: 'Inbound Transaction Count',
          desc: 'Number of discrete transactions transferring assets into address',
          value: features.in_count ?? 0,
        },
        {
          name: 'out_count',
          label: 'Outbound Transaction Count',
          desc: 'Number of discrete transactions transferring assets out of address',
          value: features.out_count ?? 0,
        },
        {
          name: 'transaction_velocity',
          label: 'Transaction Velocity',
          desc: 'Transaction throughput rate calculated across observed active window',
          value: `${(features.transaction_velocity ?? 0).toFixed(2)} tx/hr`,
        },
      ],
    },
    {
      category: 'FUND FLOW BEHAVIOR',
      description: 'Cumulative capital movement, net retention, and pass-through ratios',
      features: [
        {
          name: 'in_volume',
          label: 'Total Inbound Volume',
          desc: 'Cumulative value received across native and token transfers',
          value: (features.in_volume ?? 0).toFixed(3),
        },
        {
          name: 'out_volume',
          label: 'Total Outbound Volume',
          desc: 'Cumulative value disbursed across native and token transfers',
          value: (features.out_volume ?? 0).toFixed(3),
        },
        {
          name: 'out_in_ratio',
          label: 'Out-to-In Volume Ratio',
          desc: 'Ratio of forwarded value against received funds (structuring/pass-through metric)',
          value: features.out_in_ratio != null ? `${(features.out_in_ratio * 100).toFixed(1)}%` : '0%',
        },
      ],
    },
    {
      category: 'NETWORK TOPOLOGY',
      description: 'Graph connectivity, branching factors, and counterparty dispersion',
      features: [
        {
          name: 'unique_counterparties',
          label: 'Unique Counterparties',
          desc: 'Distinct direct counterparty addresses interacting with target',
          value: features.unique_counterparties ?? 0,
        },
        {
          name: 'fan_in',
          label: 'Fan-In Degree',
          desc: 'Number of distinct inbound sender entities in graph neighborhood',
          value: features.fan_in ?? 0,
        },
        {
          name: 'fan_out',
          label: 'Fan-Out Degree',
          desc: 'Number of distinct outbound recipient entities in graph neighborhood',
          value: features.fan_out ?? 0,
        },
      ],
    },
    {
      category: 'TEMPORAL BEHAVIOR',
      description: 'Activity duration, timestamp delta, and active operational span',
      features: [
        {
          name: 'active_duration_hours',
          label: 'Active Duration (Hours)',
          desc: 'Hours elapsed between earliest and latest recorded transaction in trace',
          value: `${(features.active_duration_hours ?? 0).toFixed(1)} hrs`,
        },
      ],
    },
    {
      category: 'ASSET / CONTRACT BEHAVIOR',
      description: 'Token contract interaction, asset diversity, and program calls',
      features: [
        {
          name: 'asset_count',
          label: 'Asset Count',
          desc: 'Count of unique asset identifiers (native + ERC-20 / TRC-20 tokens)',
          value: features.asset_count ?? 1,
        },
        {
          name: 'token_transfer_count',
          label: 'Token Transfer Count',
          desc: 'Total number of standard fungible token event transfer logs',
          value: features.token_transfer_count ?? 0,
        },
        {
          name: 'contract_interaction_count',
          label: 'Contract Interaction Count',
          desc: 'Invocations involving verified smart contracts or router endpoints',
          value: features.contract_interaction_count ?? 0,
        },
      ],
    },
  ];

  const investigatorBenefits = [
    {
      title: '1. Feature Contribution',
      desc: 'Shows which behavioral indicators influence the model assessment.',
      icon: Compass,
      accent: 'text-cyan-400',
    },
    {
      title: '2. Direction of Influence',
      desc: 'Distinguishes features contributing toward higher or lower model risk.',
      icon: TrendingUp,
      accent: 'text-purple-400',
    },
    {
      title: '3. Explainable Decisions',
      desc: 'Provides an interpretable layer between model output and investigator review.',
      icon: FileCheck2,
      accent: 'text-emerald-400',
    },
    {
      title: '4. Forensic Transparency',
      desc: 'Helps investigators understand the behavioral evidence considered by the model.',
      icon: Eye,
      accent: 'text-amber-400',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 border-purple-500/30 bg-gradient-to-r from-panel to-purple-950/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                TreeSHAP Feature Contributions
              </span>
              <span className="text-xs font-mono text-gray-400">
                Model Interpretability Architecture
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-100">SHAP Behavioral Explainability</h2>
            <p className="text-xs text-purple-300/80 font-mono mt-0.5">
              TreeSHAP Feature Contributions &amp; Additive Attribution Methodology
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400 font-mono">Target Address:</span>
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
            <label className="text-xs text-gray-400 shrink-0 font-mono">Switch Target:</label>
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

      {/* ── Production Explainability Status Panel ─────────────────────────── */}
      <div className="cyber-panel p-5 border-cyan-500/30 bg-black/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono font-bold text-gray-200">
              PRODUCTION EXPLAINABILITY
            </span>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              SHAP Integration Ready
            </span>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
            Validated model artifacts enable TreeSHAP to generate wallet-specific feature contributions during production inference.
          </p>
        </div>

        <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-3 py-1.5 rounded border border-cyan-500/30 whitespace-nowrap self-start sm:self-auto">
          Additivity: \u03a3\u03a6\u1d62 = f(x) - E[f(x)]
        </span>
      </div>

      {/* ── What is SHAP? ─────────────────────────────────────────────────── */}
      <div className="cyber-panel p-6 space-y-3">
        <div className="flex items-center gap-2 text-cyan-400">
          <HelpCircle className="w-5 h-5" />
          <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
            WHAT IS SHAP?
          </h3>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
          SHAP (SHapley Additive exPlanations) provides feature-level interpretability for the behavioral risk model. It explains how individual behavioral indicators contribute to a model's risk assessment.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="p-3 rounded-lg bg-black/40 border border-panel-border space-y-1">
            <span className="text-gray-200 font-semibold block">Game-Theoretic Foundation</span>
            <span className="text-gray-400 text-[11px]">
              Grounded in cooperative game theory (Shapley values) ensuring fair marginal contribution allocation.
            </span>
          </div>
          <div className="p-3 rounded-lg bg-black/40 border border-panel-border space-y-1">
            <span className="text-gray-200 font-semibold block">Local Interpretability</span>
            <span className="text-gray-400 text-[11px]">
              Explains why a specific wallet received its classification based on its distinct vector profile.
            </span>
          </div>
          <div className="p-3 rounded-lg bg-black/40 border border-panel-border space-y-1">
            <span className="text-gray-200 font-semibold block">Audit &amp; Courtroom Ready</span>
            <span className="text-gray-400 text-[11px]">
              Provides transparent, defensible explanations without opaque black-box reasoning.
            </span>
          </div>
        </div>
      </div>

      {/* ── Explainability Pipeline ───────────────────────────────────────── */}
      <div className="cyber-panel p-6 space-y-5">
        <div className="border-b border-panel-border pb-3">
          <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            EXPLAINABILITY PIPELINE
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Visual pipeline transforming on-chain state into local feature attribution vectors.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {pipelineSteps.map((step, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-black/50 border border-panel-border flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    Step {idx + 1}
                  </span>
                  {idx < pipelineSteps.length - 1 && (
                    <span className="text-gray-600 text-xs hidden lg:inline font-mono">→</span>
                  )}
                </div>
                <h4 className="text-xs font-bold text-gray-100 mb-1 leading-snug">
                  {step.title}
                </h4>
                <p className="text-[11px] text-gray-400 leading-tight">
                  {step.desc}
                </p>
              </div>

              {idx < pipelineSteps.length - 1 && (
                <div className="lg:hidden flex justify-center pt-2">
                  <ArrowDown className="w-3.5 h-3.5 text-gray-600" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 13 Behavioral Features Used for Explainability ─────────────────── */}
      <div className="cyber-panel p-6 space-y-5">
        <div className="border-b border-panel-border pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              13 BEHAVIORAL FEATURES USED FOR EXPLAINABILITY
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              The 13 deterministic indicators evaluated by TreeSHAP to assign marginal risk attribution.
            </p>
          </div>
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30 self-start sm:self-auto">
            Target Active Vector
          </span>
        </div>

        <div className="space-y-4">
          {featureGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
                  {group.category}
                </span>
                <span className="text-[11px] text-gray-500 font-mono">
                  {group.description}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {group.features.map((feat, fIdx) => (
                  <div
                    key={fIdx}
                    className="p-3 rounded-lg bg-black/40 border border-panel-border hover:border-purple-500/40 transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-xs font-mono font-bold text-gray-100">
                        {feat.name}
                      </code>
                      <span className="text-xs font-mono font-bold text-cyan-400">
                        {feat.value}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-300 font-medium block">
                      {feat.label}
                    </span>
                    <p className="text-[10px] text-gray-500 leading-tight">
                      {feat.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── How SHAP Supports the Investigator ─────────────────────────────── */}
      <div className="cyber-panel p-6 space-y-5">
        <div className="border-b border-panel-border pb-3">
          <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
            HOW SHAP SUPPORTS THE INVESTIGATOR
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Key operational advantages of game-theoretic attribution in digital asset investigations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {investigatorBenefits.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div
                key={idx}
                className="p-4 rounded-xl bg-black/40 border border-panel-border hover:border-cyan-500/40 transition-colors space-y-2.5"
              >
                <div className="p-2 rounded-lg bg-white/[0.03] border border-panel-border w-fit">
                  <Icon className={`w-5 h-5 ${b.accent}`} />
                </div>
                <h4 className="text-xs font-bold text-gray-100">
                  {b.title}
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  "{b.desc}"
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Forensic Interpretability Note ───────────────────────────────── */}
      <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs text-purple-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-purple-300">FORENSIC INTERPRETABILITY NOTE</div>
          <p className="text-xs text-purple-200/90 leading-relaxed">
            SHAP explanations describe model behavior and should be interpreted alongside transaction evidence, graph relationships, address intelligence, and investigator assessment. They do not constitute proof of malicious ownership.
          </p>
        </div>
      </div>
    </div>
  );
}
