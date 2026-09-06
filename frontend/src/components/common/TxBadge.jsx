import React, { useState } from 'react';
import { Copy, CheckCircle, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

export const truncateTx = (tx) => {
  if (!tx) return '';
  if (tx.length <= 16) return tx;
  return `${tx.slice(0, 10)}...${tx.slice(-6)}`;
};

export const getTxExplorerUrl = (chain, txHash) => {
  if (!txHash || txHash.startsWith('inferred_') || txHash.startsWith('cross_chain_')) return null;
  const c = (chain || 'ethereum').toLowerCase();
  if (c === 'ethereum') return `https://etherscan.io/tx/${txHash}`;
  if (c === 'tron') return `https://tronscan.org/#/transaction/${txHash}`;
  if (c === 'bitcoin') return `https://www.blockchain.com/explorer/transactions/btc/${txHash}`;
  return null;
};

export default function TxBadge({
  txHash,
  chain = 'ethereum',
  onClick,
  showFull = false,
  className = '',
}) {
  const [copied, setCopied] = useState(false);

  if (!txHash) return <span className="text-gray-500 font-mono text-xs">—</span>;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(txHash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  const expUrl = getTxExplorerUrl(chain, txHash);
  const isInferred = txHash.startsWith('cross_chain_') || txHash.startsWith('inferred_');

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5 font-mono text-xs group select-none max-w-full',
        onClick && 'cursor-pointer hover:text-cyan-300',
        className
      )}
      onClick={onClick ? () => onClick(txHash) : undefined}
      title={txHash}
    >
      {isInferred && (
        <span className="text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
          Inferred Bridge
        </span>
      )}
      <span className={clsx('text-gray-400 font-mono truncate', onClick && 'group-hover:underline text-gray-200')}>
        {showFull ? txHash : truncateTx(txHash)}
      </span>

      <button
        type="button"
        onClick={handleCopy}
        className="text-gray-500 hover:text-cyan-400 p-0.5 transition-colors shrink-0"
        title="Copy transaction hash"
      >
        {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>

      {expUrl && (
        <a
          href={expUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-gray-500 hover:text-cyan-400 p-0.5 transition-colors shrink-0"
          title={`View transaction on ${chain} explorer`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

