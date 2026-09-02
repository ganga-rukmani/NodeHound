/**
 * api.js — thin wrapper around the NodeHound backend.
 *
 * Uses Vite's dev proxy (vite.config.js) to forward /health, /trace, /node
 * to http://localhost:8000 — no CORS issues, no hardcoded base URL needed.
 *
 * In production, set VITE_API_URL to the deployed backend origin.
 */

const BASE_URL = import.meta.env.VITE_API_URL || '';

const request = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    const err = new Error(error.detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
};

export const api = {
  /** GET /health */
  health: () => request('/health'),

  /** POST /trace */
  trace: (body) =>
    request('/trace', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** GET /node/{chain}/{address} */
  getNode: (chain, address) => request(`/node/${chain}/${address}`),
};
