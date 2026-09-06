/**
 * api.js — API client with JWT Bearer authentication, automatic header injection,
 * and comprehensive endpoints for Forensics, Auth, RBAC/ABAC Case Management.
 */

const BASE_URL = import.meta.env.VITE_API_URL || '';

const request = async (path, options = {}) => {
  const token = localStorage.getItem('nodehound_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    const err = new Error(error.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = error;
    throw err;
  }

  return res.json();
};

export const api = {
  // ── Blockchain Forensics Pipeline ──────────────────────────────────────────
  health: () => request('/health'),

  trace: (body) =>
    request('/trace', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getNode: (chain, address) => request(`/node/${chain}/${address}`),

  getTimeline: (chain, address) => request(`/timeline/${chain}/${address}`),

  // ── Authentication & Identity ─────────────────────────────────────────────
  login: (credentials) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  registerRequest: (data) =>
    request('/api/auth/register-request', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  refresh: (refreshToken) =>
    request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  logout: (refreshToken) =>
    request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  getMe: () => request('/api/auth/me'),

  setupMfa: () => request('/api/auth/mfa/setup', { method: 'POST' }),

  verifyMfa: (secret, code) =>
    request('/api/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ secret, code }),
    }),

  getPendingUsers: () => request('/api/auth/users/pending'),

  approveUser: (userId) => request(`/api/auth/users/${userId}/approve`, { method: 'POST' }),

  // ── Case Management (RBAC + ABAC + IDOR Protected) ────────────────────────
  listCases: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.append('status_filter', params.status);
    if (params.priority) query.append('priority_filter', params.priority);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return request(`/api/cases${qs}`);
  },

  createCase: (caseData) =>
    request('/api/cases', {
      method: 'POST',
      body: JSON.stringify(caseData),
    }),

  getCase: (caseId) => request(`/api/cases/${caseId}`),

  updateCase: (caseId, updates) =>
    request(`/api/cases/${caseId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  submitCaseForReview: (caseId) =>
    request(`/api/cases/${caseId}/submit-review`, {
      method: 'POST',
    }),

  reviewCase: (caseId, decision, comments) =>
    request(`/api/cases/${caseId}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, comments }),
    }),

  assignCase: (caseId, investigatorId) =>
    request(`/api/cases/${caseId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ investigator_id: investigatorId }),
    }),

  getCaseAuditLogs: (caseId) => request(`/api/cases/${caseId}/audit-logs`),

  getDashboardMetrics: () => request('/api/cases/dashboard/metrics'),

  // ── Prompts 3 to 7: Prioritization, DNA, Replay, Governance ────────────────
  getCasePrioritization: (caseId) => request(`/api/cases/${caseId}/prioritization`),

  updateCandidateStatus: (caseId, address, data) =>
    request(`/api/cases/${caseId}/candidates/${address}/status`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getFundFlowDna: (caseId, address) => request(`/api/cases/${caseId}/dna/${address}`),

  getInvestigationReplay: (caseId) => request(`/api/cases/${caseId}/replay`),

  getCaseTimeline: (caseId) => request(`/api/cases/${caseId}/timeline`),

  getCaseNotes: (caseId) => request(`/api/cases/${caseId}/notes`),

  createCaseNote: (caseId, content) =>
    request(`/api/cases/${caseId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  closeCase: (caseId, reason) =>
    request(`/api/cases/${caseId}/close`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getSupervisorConsole: () => request('/api/cases/supervisor/console'),
};
