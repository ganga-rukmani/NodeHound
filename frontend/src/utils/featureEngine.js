/**
 * utils/featureEngine.js
 *
 * Deterministic behavioral feature calculation replicating scoring/chain_features.py.
 * Ensures the investigator UI can extract and display exact feature values and
 * defensible interpretations directly from graph edges and nodes.
 */

export function calculateAddressFeatures(address, nodes = [], edges = [], chain = 'ethereum') {
  if (!address) return null;
  const target = address.toLowerCase();

  const ins = edges.filter((e) => (e.to_address || '').toLowerCase() === target);
  const outs = edges.filter((e) => (e.from_address || '').toLowerCase() === target);

  const in_volume = ins.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const out_volume = outs.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const in_usd = ins.reduce((sum, e) => sum + (Number(e.amount_usd) || 0), 0);
  const out_usd = outs.reduce((sum, e) => sum + (Number(e.amount_usd) || 0), 0);

  const fromAddresses = new Set(ins.map((e) => (e.from_address || '').toLowerCase()).filter(Boolean));
  const toAddresses = new Set(outs.map((e) => (e.to_address || '').toLowerCase()).filter(Boolean));
  const counterparties = new Set([...fromAddresses, ...toAddresses]);

  const timestamps = [...ins, ...outs]
    .map((e) => (e.timestamp ? new Date(e.timestamp).getTime() : null))
    .filter((t) => t != null && !isNaN(t))
    .sort((a, b) => a - b);

  const txHashes = new Set([...ins, ...outs].map((e) => e.tx_hash).filter(Boolean));
  const assets = new Set([...ins, ...outs].map((e) => e.asset).filter(Boolean));

  // Active days calculation for velocity
  const uniqueDays = new Set(
    timestamps.map((t) => new Date(t).toISOString().slice(0, 10))
  );
  const activeDaysCount = Math.max(uniqueDays.size, 1);
  const transaction_velocity = txHashes.size / activeDaysCount;

  const firstSeen = timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : null;
  const lastSeen = timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString() : null;
  const active_duration_hours =
    timestamps.length > 1
      ? (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 3600)
      : 0.0;

  const out_in_ratio = in_volume > 0 ? out_volume / in_volume : 0.0;
  const amount_retained = Math.max(0, in_volume - out_volume);
  const amount_forwarded = Math.min(in_volume, out_volume);

  const token_transfer_count = [...ins, ...outs].filter(
    (e) => !['ETH', 'BTC', 'TRX'].includes((e.asset || '').toUpperCase())
  ).length;

  const utxo_inferred_edges = [...ins, ...outs].filter(
    (e) => e.evidence_type === 'utxo_allocation_inferred'
  ).length;

  // Largest counterparty calculation
  const counterpartyVolumes = {};
  [...ins, ...outs].forEach((e) => {
    const other = (e.to_address || '').toLowerCase() === target ? e.from_address : e.to_address;
    if (other) {
      counterpartyVolumes[other] = (counterpartyVolumes[other] || 0) + (Number(e.amount) || 0);
    }
  });
  let largestCounterparty = null;
  let largestCounterpartyVol = 0;
  Object.entries(counterpartyVolumes).forEach(([addr, vol]) => {
    if (vol > largestCounterpartyVol) {
      largestCounterpartyVol = vol;
      largestCounterparty = addr;
    }
  });

  // Interpretations derived purely from verified features
  const interpretations = [];
  if (toAddresses.size >= 5) {
    interpretations.push({
      title: 'High fan-out detected',
      severity: 'medium',
      description: `Address distributed funds to ${toAddresses.size} distinct destination addresses.`,
    });
  }
  if (fromAddresses.size >= 5) {
    interpretations.push({
      title: 'High fan-in detected',
      severity: 'low',
      description: `Address collected funds from ${fromAddresses.size} distinct origin addresses.`,
    });
  }
  if (transaction_velocity >= 3) {
    interpretations.push({
      title: 'High transaction velocity',
      severity: 'medium',
      description: `Observed an average of ${transaction_velocity.toFixed(1)} transfers per active day.`,
    });
  }
  if (out_in_ratio >= 0.8 && in_volume > 0) {
    interpretations.push({
      title: 'High out/in forwarding ratio',
      severity: 'high',
      description: `Approximately ${(out_in_ratio * 100).toFixed(1)}% of all received volume was forwarded.`,
    });
  }
  if (token_transfer_count >= 3) {
    interpretations.push({
      title: 'Token transfer activity observed',
      severity: 'informational',
      description: `Recorded ${token_transfer_count} non-native asset/token transfers.`,
    });
  }

  return {
    address,
    chain,
    in_count: ins.length,
    out_count: outs.length,
    total_transactions: txHashes.size,
    in_volume,
    out_volume,
    in_usd,
    out_usd,
    amount_retained,
    amount_forwarded,
    out_in_ratio,
    unique_counterparties: counterparties.size,
    fan_in: fromAddresses.size,
    fan_out: toAddresses.size,
    largest_counterparty: largestCounterparty,
    counterparty_concentration: counterparties.size > 0 ? 1 / counterparties.size : 0,
    transaction_velocity,
    active_duration_hours,
    active_days: uniqueDays.size,
    first_seen: firstSeen,
    last_seen: lastSeen,
    asset_count: assets.size,
    assets: Array.from(assets),
    token_transfer_count,
    contract_interaction_count: token_transfer_count,
    utxo_inferred_edges,
    interpretations,
  };
}

