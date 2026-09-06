import React, { useState } from 'react';
import { Copy, CheckCircle, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

export const truncateAddress = (addr) => {
  if (!addr) return '';
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
};

export const getExplorerUrl = (chain, address) => {
  if (!address) return null;
  const c = (chain || 'ethereum').toLowerCase();
  if (c === 'ethereum') return `https://etherscan.io/address/${address}`;
  if (c === 'tron') return `https://tronscan.org/#/address/${address}`;
  if (c === 'bitcoin') return `https://www.blockchain.com/explorer/addresses/btc/${address}`;
  return null;
};

export default function AddressBadge({
  address,
  chain = 'ethereum',
  label,
  category,
  tier,
  onClick,
  isSeed = false,
  showFull = false,
  className = '',
}) {
  const [copied, setCopied] = useState(false);

  if (!address) return <span className="text-gray-500 font-mono text-xs">—</span>;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  const expUrl = getExplorerUrl(chain, address);

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5 font-mono text-xs group select-none max-w-full',
        onClick && 'cursor-pointer hover:text-cyan-300',
        className
      )}
      onClick={onClick ? () => onClick(address) : undefined}
      title={address}
    >
      {isSeed && (
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shrink-0">
          Seed
        </span>
      )}
      {label ? (
        <span className="font-sans font-medium text-gray-200 truncate max-w-[160px] bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/10 text-[11px]">
          {label}
        </span>
      ) : null}

      <span className={clsx('text-gray-300 font-mono truncate', onClick && 'group-hover:underline')}>
        {showFull ? address : truncateAddress(address)}
      </span>

      {category && (
        <span className="text-[9px] font-sans uppercase font-medium px-1 py-0.2 rounded bg-gray-800 text-gray-400 border border-gray-700 shrink-0">
          {category}
        </span>
      )}

      {tier && tier !== 'unknown' && tier !== 'unattributed' && (
        <span className="text-[9px] font-sans capitalize px-1 py-0.2 rounded bg-purple-900/30 text-purple-300 border border-purple-500/30 shrink-0">
          {tier.replace('_', ' ')}
        </span>
      )}

      <button
        type="button"
        onClick={handleCopy}
        className="text-gray-500 hover:text-cyan-400 p-0.5 transition-colors shrink-0"
        title="Copy address"
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
          title={`View on ${chain} explorer`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

