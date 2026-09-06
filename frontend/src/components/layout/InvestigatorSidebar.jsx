import React from 'react';
import {
  FolderLock,
  PlusCircle,
  LayoutDashboard,
  Layers,
  UserCheck,
  Activity,
  GitCommit,
  GitMerge,
  Share2,
  Building2,
  AlertTriangle,
  Shuffle,
  Cpu,
  BarChart2,
  Terminal,
  BellRing,
  Compass,
  FileSearch,
  Lock,
  FileText,
  FileCheck,
  Target,
  Dna,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { useInvestigation } from '../../context/InvestigationContext';
import { useAuth } from '../../context/AuthContext';
import clsx from 'clsx';

export default function InvestigatorSidebar() {
  const { activeSection, setActiveSection, traceData } = useInvestigation();
  const { isSupervisor } = useAuth();
  const isTraced = Boolean(traceData);

  const navGroups = [
    {
      title: 'Investigation Scope',
      items: [
        { id: 'case_management', label: '0. Cases & Governance (RBAC)', icon: FolderLock },
        ...(isSupervisor ? [{ id: 'supervisor_console', label: 'Supervisor Console', icon: ShieldCheck }] : []),
        { id: 'case_workspace', label: 'Case Workspace', icon: FolderLock },
        { id: 'new_investigation', label: '1. New Investigation', icon: PlusCircle },
        { id: 'overview', label: '2. Case Overview', icon: LayoutDashboard },
      ],
    },
    {
      title: 'Network & Fund Movement',
      items: [
        { id: 'transactions', label: '3. Transactions', icon: Layers },
        { id: 'fund_flow_dna', label: 'Fund Flow DNA', icon: Dna },
        { id: 'replay', label: 'Investigation Replay', icon: Clock },
        { id: 'address_intelligence', label: '4. Address Intelligence', icon: UserCheck },
        { id: 'behavioral_analysis', label: '5. Behavioral Analysis', icon: Activity },
        { id: 'fund_flow', label: '6. Fund Flow Analysis', icon: GitCommit },
        { id: 'graph', label: 'Interactive Graph & Tree', icon: Share2 },
      ],
    },
    {
      title: 'Intelligence & Attribution',
      items: [
        { id: 'prioritization', label: '7. Suspicious Prioritization', icon: Target },
        { id: 'attribution', label: 'Suspicious Attribution', icon: UserCheck },
        { id: 'vasp_intelligence', label: '8. VASP / Exchange Intel', icon: Building2 },
        { id: 'typology', label: '9. Typology Detection', icon: AlertTriangle },
        { id: 'mixer_cross_chain', label: '10. Mixer / Cross-Chain', icon: Shuffle },
      ],
    },
    {
      title: 'Machine Learning',
      items: [
        { id: 'ai_risk', label: '11. AI Risk Analysis', icon: Cpu },
        { id: 'shap_explainability', label: '12. SHAP Explainability', icon: BarChart2 },
        { id: 'technical_details', label: '18. Technical / Features', icon: Terminal },
      ],
    },
    {
      title: 'Evidentiary Output',
      items: [
        { id: 'action_packet', label: 'Action & Disclosure Packet', icon: FileCheck },
        { id: 'alerts', label: '13. Alert Stream', icon: BellRing },
        { id: 'recommendations', label: '14. Recommendations', icon: Compass },
        { id: 'evidence_explorer', label: '15. Evidence Explorer', icon: FileSearch },
        { id: 'evidence_integrity', label: '16. Evidence Integrity (SHA-256)', icon: Lock },
        { id: 'report', label: '17. Investigation Report', icon: FileText },
      ],
    },
  ];

  const unrestrictedIds = new Set([
    'new_investigation',
    'case_management',
    'case_workspace',
    'supervisor_console',
    'prioritization',
    'fund_flow_dna',
    'replay',
    'action_packet',
  ]);

  return (
    <aside className="w-64 shrink-0 bg-panel/95 border-r border-panel-border flex flex-col h-full overflow-hidden select-none">
      <div className="flex-grow overflow-y-auto py-4 px-3 space-y-6">
        {navGroups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-1">
            <h4 className="px-3 text-[10px] uppercase font-mono font-bold tracking-wider text-gray-500">
              {group.title}
            </h4>

            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                const isDisabled = !isTraced && !unrestrictedIds.has(item.id);

                return (
                  <button
                    key={item.id}
                    disabled={isDisabled}
                    onClick={() => setActiveSection(item.id)}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left group',
                      isActive
                        ? 'bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30'
                        : isDisabled
                        ? 'text-gray-600 cursor-not-allowed opacity-40'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                    )}
                  >
                    <Icon
                      className={clsx(
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive
                          ? 'text-cyan-400'
                          : isDisabled
                          ? 'text-gray-600'
                          : 'text-gray-500 group-hover:text-gray-300'
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar Footer Status */}
      <div className="p-3 border-t border-panel-border bg-black/40 text-[11px] font-mono text-gray-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className={clsx('w-2 h-2 rounded-full', isTraced ? 'bg-green-400' : 'bg-yellow-500')} />
          {isTraced ? 'Investigation Active' : 'Ready for Ingestion'}
        </span>
        <span className="text-[10px] text-gray-500">v2.1</span>
      </div>
    </aside>
  );
}

