import React from 'react';
import { X, ExternalLink, ArrowRight, ShieldCheck, Clock, Layers } from 'lucide-react';
import AddressBadge from './AddressBadge';
import TxBadge, { getTxExplorerUrl } from './TxBadge';
import clsx from 'clsx';

export default function TxDetailDrawer({
  transaction,
  chain = 'ethereum',
  onClose,
  onSelectAddress,
}) {
  if (!transaction) return null;

  const expUrl = getTxExplorerUrl(transaction.chain || chain, transaction.tx_hash);
  const isInferred = transaction.is_inferred_bridge_edge || (transaction.tx_hash || '').startsWith('cross_chain_');

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-panel/95 backdrop-blur-md border-l border-panel-border shadow-2xl flex flex-col animate-slide-in-right">
      {/* Drawer Header */}
      <div className="p-4 border-b border-panel-border flex items-center justify-between bg-black/30">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="font-semibold text-sm text-gray-100">Transaction Investigation</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-grow overflow-y-auto p-5 space-y-5 text-xs">
        {/* Transaction Hash Card */}
        <div className="p-3 rounded-lg bg-white/[0.03] border border-panel-border space-y-2">
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">
            Transaction Hash
          </span>
          <div className="flex items-center justify-between gap-2">
            <TxBadge txHash={transaction.tx_hash} chain={transaction.chain || chain} showFull />
          </div>
          {isInferred && (
            <div className="p-2 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] mt-2">
              Inferred bridge edge correlated by matching timestamp and asset volume across chains.
            </div>
          )}
        </div>

        {/* Value & Asset Display */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-white/[0.03] border border-panel-border">
            <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">
              Transfer Amount
            </span>
            <div className="text-base font-mono font-bold text-gray-100 mt-1">
              {transaction.amount != null ? Number(transaction.amount).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}{' '}
              <span className="text-xs text-cyan-400 font-sans font-medium">{transaction.asset || 'NATIVE'}</span>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-white/[0.03] border border-panel-border">
            <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">
              USD Value
            </span>
            <div className="text-base font-mono font-bold text-gray-100 mt-1">
              {transaction.amount_usd != null
                ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(transaction.amount_usd)
                : '—'}
            </div>
          </div>
        </div>

        {/* Parties / Counterparties */}
        <div className="p-3.5 rounded-lg bg-white/[0.03] border border-panel-border space-y-3">
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">
            Transfer Flow
          </span>

          <div className="space-y-1">
            <div className="text-[10px] text-gray-400 font-medium">From Address:</div>
            <AddressBadge
              address={transaction.from_address}
              chain={transaction.chain || chain}
              onClick={onSelectAddress}
              showFull
            />
          </div>

          <div className="flex justify-center my-1">
            <ArrowRight className="w-4 h-4 text-cyan-400/80 rotate-90 sm:rotate-0" />
          </div>

          <div className="space-y-1">
            <div className="text-[10px] text-gray-400 font-medium">To Address:</div>
            <AddressBadge
              address={transaction.to_address}
              chain={transaction.chain || chain}
              onClick={onSelectAddress}
              showFull
            />
          </div>
        </div>

        {/* Forensic Metadata */}
        <div className="p-3 rounded-lg bg-white/[0.03] border border-panel-border space-y-2.5">
          <span className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">
            Forensic Metadata
          </span>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-gray-500">Chain:</span>{' '}
              <span className="font-mono text-gray-200 capitalize">{transaction.chain || chain}</span>
            </div>
            <div>
              <span className="text-gray-500">Block Number:</span>{' '}
              <span className="font-mono text-gray-200">{transaction.block_number ?? '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">Timestamp:</span>{' '}
              <span className="font-mono text-gray-200">
                {transaction.timestamp ? new Date(transaction.timestamp).toLocaleString() : '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Evidence Type:</span>{' '}
              <span className="font-mono text-cyan-300">
                {transaction.evidence_type || (isInferred ? 'inferred_bridge' : 'direct_observed')}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Edge Confidence:</span>{' '}
              <span className="font-mono text-gray-200">
                {transaction.edge_confidence != null ? `${(transaction.edge_confidence * 100).toFixed(0)}%` : '100%'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Drawer Footer Actions */}
      <div className="p-4 border-t border-panel-border bg-black/30 flex items-center justify-between gap-3">
        {expUrl && (
          <a
            href={expUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="cyber-button-secondary text-xs flex items-center gap-1.5 py-2 px-3"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Blockchain Explorer
          </a>
        )}
        <button
          onClick={onClose}
          className="cyber-button-primary text-xs py-2 px-4 ml-auto"
        >
          Done
        </button>
      </div>
    </div>
  );
}

