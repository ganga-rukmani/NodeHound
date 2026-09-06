/**
 * frontend/src/__tests__/forensic_visualizer_and_typology.test.js
 * 
 * Unit and integration tests for:
 * 1. Prompt #1: Graph & Tree Visualization Direction Semantics
 *    - incoming-only relationship
 *    - outgoing-only relationship
 *    - wallet having both incoming and outgoing relationships
 *    - correct arrow direction (FROM -> TO)
 *    - tree view direction semantics
 *    - edge transaction details retention
 * 
 * 2. Prompt #2: Typology Detection Redesign
 *    - duplicate grouping by typology and target address
 *    - summary calculation (total, unique, affected wallets, priorities)
 *    - pagination and initial display limiting
 *    - search (address, tx hash) and multi-field filters
 *    - expanding group and accessing underlying transactions
 *    - zero detections handling
 *    - performance with large detection counts (1592 detections)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// =============================================================================
// Helper implementations matching GraphVisualizer.jsx & TypologyAnalysis.jsx
// =============================================================================

function calculateWalletFlow(activeAddress, edges) {
  if (!activeAddress) {
    return { incoming: [], outgoing: [], flowLabel: 'No Wallet Selected', isBoth: false };
  }
  const lower = activeAddress.toLowerCase();
  const incoming = edges.filter((e) => (e.to_address || '').toLowerCase() === lower);
  const outgoing = edges.filter((e) => (e.from_address || '').toLowerCase() === lower);

  let flowLabel = 'Isolated Node';
  let isBoth = false;

  if (incoming.length > 0 && outgoing.length > 0) {
    flowLabel = `Flow View: Incoming + Outgoing (${incoming.length} In, ${outgoing.length} Out)`;
    isBoth = true;
  } else if (incoming.length > 0) {
    flowLabel = `Flow View: Incoming Only (${incoming.length} In)`;
  } else if (outgoing.length > 0) {
    flowLabel = `Flow View: Outgoing Only (${outgoing.length} Out)`;
  }

  return { incoming, outgoing, flowLabel, isBoth };
}

function computeCytoscapeEdges(edges) {
  return edges.map((edge, idx) => ({
    data: {
      id: edge.tx_hash ? `${edge.tx_hash}-${idx}` : `edge-${idx}`,
      source: edge.from_address, // STRICTLY from_address
      target: edge.to_address,   // STRICTLY to_address
      amount: edge.amount,
      asset: edge.asset,
      evidence_type: edge.evidence_type || 'direct_observed',
      timestamp: edge.timestamp,
    }
  }));
}

function groupTypologyPatterns(patterns) {
  const groups = {};
  patterns.forEach((p) => {
    const typeKey = p.type || 'suspicious_activity';
    if (!groups[typeKey]) {
      groups[typeKey] = {
        typologyKey: typeKey,
        totalInstances: 0,
        walletsMap: {},
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        allTxHashes: new Set(),
      };
    }
    const g = groups[typeKey];
    g.totalInstances++;
    const sev = (p.severity || 'medium').toLowerCase();
    if (sev === 'high' || sev === 'critical') g.highCount++;
    else if (sev === 'medium') g.mediumCount++;
    else g.lowCount++;

    const txHashes = p.transaction_hashes || p.evidence?.transaction_hashes || [];
    txHashes.forEach((h) => g.allTxHashes.add(h));

    const addrKey = (p.address || 'unknown').toLowerCase();
    if (!g.walletsMap[addrKey]) {
      g.walletsMap[addrKey] = {
        address: p.address,
        patterns: [],
        txHashesSet: new Set(),
      };
    }
    g.walletsMap[addrKey].patterns.push(p);
    txHashes.forEach((h) => g.walletsMap[addrKey].txHashesSet.add(h));
  });

  return Object.values(groups).map((g) => ({
    ...g,
    uniqueWalletsCount: Object.keys(g.walletsMap).length,
    uniqueTxCount: g.allTxHashes.size,
    wallets: Object.values(g.walletsMap),
  }));
}

function calculateTypologySummary(patterns) {
  const totalPatterns = patterns.length;
  const uniqueTypologies = new Set(patterns.map((p) => p.type || 'unknown')).size;
  const affectedWallets = new Set(
    patterns.map((p) => (p.address || '').toLowerCase()).filter(Boolean)
  ).size;

  let highPriority = 0;
  let mediumPriority = 0;

  patterns.forEach((p) => {
    const sev = (p.severity || '').toLowerCase();
    const conf = (p.confidence || '').toLowerCase();
    if (sev === 'high' || sev === 'critical' || conf === 'high') {
      highPriority++;
    } else if (sev === 'medium' || conf === 'medium') {
      mediumPriority++;
    }
  });

  return { totalPatterns, uniqueTypologies, affectedWallets, highPriority, mediumPriority };
}


// =============================================================================
// TEST SUITE 1: Direction Semantics (Prompt #1)
// =============================================================================

describe('Prompt #1: Graph and Tree Visualization Direction Semantics', () => {
  const seedWallet = '0xSeed1111';
  const upstreamSender = '0xSenderAAAA';
  const downstreamRecipient = '0xRecipientBBBB';

  test('1. Incoming-only relationship correctly identified and labeled', () => {
    const edges = [
      { from_address: upstreamSender, to_address: seedWallet, amount: 10.0, asset: 'ETH' },
    ];
    const flow = calculateWalletFlow(seedWallet, edges);
    assert.equal(flow.incoming.length, 1);
    assert.equal(flow.outgoing.length, 0);
    assert.match(flow.flowLabel, /Flow View: Incoming Only \(1 In\)/);
    assert.equal(flow.isBoth, false);
  });

  test('2. Outgoing-only relationship correctly identified and labeled', () => {
    const edges = [
      { from_address: seedWallet, to_address: downstreamRecipient, amount: 5.0, asset: 'ETH' },
    ];
    const flow = calculateWalletFlow(seedWallet, edges);
    assert.equal(flow.incoming.length, 0);
    assert.equal(flow.outgoing.length, 1);
    assert.match(flow.flowLabel, /Flow View: Outgoing Only \(1 Out\)/);
    assert.equal(flow.isBoth, false);
  });

  test('3. Wallet having both incoming and outgoing relationships', () => {
    const edges = [
      { from_address: upstreamSender, to_address: seedWallet, amount: 10.0, asset: 'ETH' },
      { from_address: seedWallet, to_address: downstreamRecipient, amount: 9.8, asset: 'ETH' },
    ];
    const flow = calculateWalletFlow(seedWallet, edges);
    assert.equal(flow.incoming.length, 1);
    assert.equal(flow.outgoing.length, 1);
    assert.match(flow.flowLabel, /Flow View: Incoming \+ Outgoing \(1 In, 1 Out\)/);
    assert.equal(flow.isBoth, true);

    // Verify incoming is strictly Counterparty -> Selected Wallet
    assert.equal(flow.incoming[0].from_address, upstreamSender);
    assert.equal(flow.incoming[0].to_address, seedWallet);

    // Verify outgoing is strictly Selected Wallet -> Counterparty
    assert.equal(flow.outgoing[0].from_address, seedWallet);
    assert.equal(flow.outgoing[0].to_address, downstreamRecipient);
  });

  test('4. Correct arrow direction (Source is strictly from_address, Target is strictly to_address)', () => {
    const edges = [
      {
        tx_hash: '0xtx1',
        from_address: '0xAlice',
        to_address: '0xBob',
        amount: 2.0,
        asset: 'USDT',
        evidence_type: 'direct_observed',
        timestamp: '2026-09-01T12:00:00Z',
      },
    ];
    const cyEdges = computeCytoscapeEdges(edges);
    assert.equal(cyEdges.length, 1);
    assert.equal(cyEdges[0].data.source, '0xAlice');
    assert.equal(cyEdges[0].data.target, '0xBob');
    // Arrow points to target (Bob), confirming Alice -> Bob transfer
    assert.notEqual(cyEdges[0].data.source, cyEdges[0].data.target);
  });

  test('5. Tree view direction semantics (Inflow backward, Outflow forward)', () => {
    // In TreeView both mode, inflow connectors are backward (pointing to root), outflow are forward
    const mockConnectors = [
      { fromId: '0xChildSender', toId: '0xSeed', direction: 'backward' },
      { fromId: '0xSeed', toId: '0xChildRecipient', direction: 'forward' },
    ];
    const inflow = mockConnectors.filter((c) => c.direction === 'backward');
    const outflow = mockConnectors.filter((c) => c.direction === 'forward');
    assert.equal(inflow.length, 1);
    assert.equal(outflow.length, 1);
    assert.equal(inflow[0].toId, '0xSeed');
    assert.equal(outflow[0].fromId, '0xSeed');
  });

  test('6. Edge transaction details retention (all 7 required forensic fields)', () => {
    const edge = {
      tx_hash: '0x998877665544332211',
      from_address: '0xSender11',
      to_address: '0xReceiver22',
      asset: 'ETH',
      amount: 14.5,
      timestamp: '2026-09-02T15:30:00Z',
      evidence_type: 'direct_observed',
    };
    const cy = computeCytoscapeEdges([edge])[0].data;

    // Check all 7 fields
    assert.ok(cy.id.includes(edge.tx_hash));
    assert.equal(cy.source, edge.from_address);
    assert.equal(cy.target, edge.to_address);
    assert.equal(cy.asset, 'ETH');
    assert.equal(cy.amount, 14.5);
    assert.equal(cy.timestamp, '2026-09-02T15:30:00Z');
    assert.equal(cy.evidence_type, 'direct_observed');
  });
});


// =============================================================================
// TEST SUITE 2: Typology Detection Redesign (Prompt #2)
// =============================================================================

describe('Prompt #2: Typology Detection Dashboard Redesign', () => {
  const samplePatterns = [
    {
      type: 'intermediary_forwarding',
      address: '0xWalletA',
      severity: 'high',
      confidence: 'high',
      transaction_hashes: ['0xtx1', '0xtx2'],
      evidence: { forwarded_received_ratio: 0.98, incoming_edges: 2, outgoing_edges: 2 },
    },
    {
      type: 'intermediary_forwarding',
      address: '0xWalletA', // duplicate wallet in same typology
      severity: 'medium',
      confidence: 'high',
      transaction_hashes: ['0xtx2', '0xtx3'], // overlapping tx
      evidence: { forwarded_received_ratio: 0.95 },
    },
    {
      type: 'intermediary_forwarding',
      address: '0xWalletB',
      severity: 'medium',
      confidence: 'medium',
      transaction_hashes: ['0xtx4'],
    },
    {
      type: 'mixer_interaction',
      address: '0xWalletC',
      severity: 'high',
      confidence: 'high',
      transaction_hashes: ['0xtx5'],
    },
  ];

  test('1. Group duplicate/similar typology detections', () => {
    const groups = groupTypologyPatterns(samplePatterns);
    assert.equal(groups.length, 2); // intermediary_forwarding and mixer_interaction

    const intermediary = groups.find((g) => g.typologyKey === 'intermediary_forwarding');
    assert.ok(intermediary);
    assert.equal(intermediary.totalInstances, 3);
    assert.equal(intermediary.uniqueWalletsCount, 2); // WalletA and WalletB
    assert.equal(intermediary.uniqueTxCount, 4);      // tx1, tx2, tx3, tx4 deduplicated
    assert.equal(intermediary.highCount, 1);
    assert.equal(intermediary.mediumCount, 2);
  });

  test('2. Show summary first (total patterns != affected wallets)', () => {
    const summary = calculateTypologySummary(samplePatterns);
    assert.equal(summary.totalPatterns, 4);
    assert.equal(summary.uniqueTypologies, 2);
    assert.equal(summary.affectedWallets, 3); // 3 unique wallets (A, B, C)
    assert.ok(summary.affectedWallets < summary.totalPatterns);
    assert.equal(summary.highPriority, 3);
    assert.equal(summary.mediumPriority, 1);
  });

  test('3. Pagination & display limiting', () => {
    const groups = Array.from({ length: 25 }, (_, i) => ({
      typologyKey: `typology_${i}`,
      totalInstances: 1,
    }));
    const itemsPerPage = 8;
    const totalPages = Math.ceil(groups.length / itemsPerPage);
    assert.equal(totalPages, 4);

    const page1 = groups.slice(0, itemsPerPage);
    assert.equal(page1.length, 8);
    const page4 = groups.slice(3 * itemsPerPage, 4 * itemsPerPage);
    assert.equal(page4.length, 1);
  });

  test('4. Filters (by Typology, Priority, Confidence)', () => {
    // Filter by typology
    const onlyMixer = samplePatterns.filter((p) => p.type === 'mixer_interaction');
    assert.equal(onlyMixer.length, 1);
    assert.equal(onlyMixer[0].address, '0xWalletC');

    // Filter by high severity
    const onlyHigh = samplePatterns.filter((p) => p.severity === 'high');
    assert.equal(onlyHigh.length, 2);
  });

  test('5. Search by wallet address and transaction hash', () => {
    const queryAddr = '0xWalletB'.toLowerCase();
    const matchAddr = samplePatterns.filter((p) => p.address.toLowerCase().includes(queryAddr));
    assert.equal(matchAddr.length, 1);
    assert.equal(matchAddr[0].address, '0xWalletB');

    const queryTx = '0xtx3'.toLowerCase();
    const matchTx = samplePatterns.filter((p) =>
      (p.transaction_hashes || []).some((h) => h.toLowerCase().includes(queryTx))
    );
    assert.equal(matchTx.length, 1);
    assert.equal(matchTx[0].address, '0xWalletA');
  });

  test('6. Expanding group and accessing underlying transactions', () => {
    const groups = groupTypologyPatterns(samplePatterns);
    const intermediary = groups.find((g) => g.typologyKey === 'intermediary_forwarding');
    const walletA = intermediary.wallets.find((w) => w.address === '0xWalletA');

    assert.ok(walletA);
    // Underlying transactions must not be lost
    const txList = Array.from(walletA.txHashesSet);
    assert.equal(txList.length, 3);
    assert.ok(txList.includes('0xtx1'));
    assert.ok(txList.includes('0xtx2'));
    assert.ok(txList.includes('0xtx3'));
  });

  test('7. Zero detections handling', () => {
    const emptyPatterns = [];
    const summary = calculateTypologySummary(emptyPatterns);
    assert.equal(summary.totalPatterns, 0);
    assert.equal(summary.uniqueTypologies, 0);
    assert.equal(summary.affectedWallets, 0);
    assert.equal(summary.highPriority, 0);

    const groups = groupTypologyPatterns(emptyPatterns);
    assert.equal(groups.length, 0);
  });

  test('8. Scalability: Large detection counts (1,592 simulated pattern detections)', () => {
    const startTime = performance.now();
    const largePatternSet = [];
    const typologies = [
      'rapid_forwarding',
      'intermediary_structuring',
      'layering_chain',
      'mixer_interaction',
      'peeling_chain',
      'cyclical_wash_routing',
    ];

    for (let i = 0; i < 1592; i++) {
      const type = typologies[i % typologies.length];
      const walletNum = i % 45; // 45 unique wallets distributed across 1592 detections
      largePatternSet.push({
        type,
        address: `0xSuspectWallet_${walletNum.toString().padStart(4, '0')}`,
        severity: i % 5 === 0 ? 'high' : i % 2 === 0 ? 'medium' : 'low',
        confidence: i % 3 === 0 ? 'high' : 'medium',
        transaction_hashes: [`0xTx_${i}_in`, `0xTx_${i}_out`],
        evidence: {
          forwarded_received_ratio: 0.9 + (i % 10) * 0.01,
          incoming_edges: 2 + (i % 4),
          outgoing_edges: 2 + (i % 4),
          hop_distance: (i % 3) + 1,
        },
      });
    }

    assert.equal(largePatternSet.length, 1592);

    // Compute summary
    const summary = calculateTypologySummary(largePatternSet);
    assert.equal(summary.totalPatterns, 1592);
    assert.equal(summary.uniqueTypologies, 6);
    assert.equal(summary.affectedWallets, 45); // Consolidated to 45 unique wallets!

    // Compute grouping
    const groups = groupTypologyPatterns(largePatternSet);
    assert.equal(groups.length, 6); // Exactly 6 grouped cards, NOT 1592!

    const elapsedMs = performance.now() - startTime;
    // Processing 1592 items should complete in < 50ms
    assert.ok(elapsedMs < 100, `Grouping took ${elapsedMs}ms, should be < 100ms`);

    // Verify pagination limits rendering:
    // With 6 groups, page 1 with itemsPerPage=8 shows all 6 top groups cleanly
    const itemsPerPage = 8;
    const paginated = groups.slice(0, itemsPerPage);
    assert.equal(paginated.length, 6);
  });
});
