const HISTORY_KEY = 'nodehound_case_history';
const MAX_HISTORY = 50;

// Lightweight per-case snapshot only - NOT full nodes/edges (would bloat
// localStorage fast). Enough to power dashboard aggregates without
// re-fetching or duplicating the full trace payload.
export function addCase({ seed_address, chain, top_destination, known_vasp_matches, total_nodes, total_edges }) {
  try {
    const existing = getCases();
    const entry = {
      seed_address,
      chain,
      top_destination: top_destination || null,
      known_vasp_matches: known_vasp_matches ?? 0,
      total_nodes: total_nodes ?? 0,
      total_edges: total_edges ?? 0,
      timestamp: Date.now(),
    };
    const updated = [entry, ...existing].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable/full - fail silently, dashboard just shows less history
  }
}

export function getCases() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}