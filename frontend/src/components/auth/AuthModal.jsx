import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Mail,
  User,
  Building2,
  KeyRound,
  X,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Fingerprint,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

export default function AuthModal() {
  const {
    authModalOpen,
    setAuthModalOpen,
    authModalTab,
    setAuthModalTab,
    login,
    switchPersona,
    loading,
    user,
    logout,
  } = useAuth();

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMfaCode, setLoginMfaCode] = useState('');

  // Register form state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regInvestigatorId, setRegInvestigatorId] = useState('');
  const [regDepartment, setRegDepartment] = useState('Cyber Crime Division');
  const [regUnit, setRegUnit] = useState('UNIT-ALPHA-CYBER');
  const [regDesignation, setRegDesignation] = useState('Forensic Analyst');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Status message state
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!authModalOpen) return null;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await login(loginEmail, loginPassword, loginMfaCode || null);
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    try {
      const res = await api.registerRequest({
        full_name: regFullName,
        organization_email: regEmail,
        investigator_id: regInvestigatorId,
        department: regDepartment,
        unit: regUnit,
        designation: regDesignation,
        requested_role: 'INVESTIGATOR',
        password: regPassword,
        confirm_password: regConfirmPassword,
      });
      setStatusMsg(res.message);
      setAuthModalTab('login');
    } catch (err) {
      setErrorMsg(err.message || 'Registration request failed.');
    }
  };

  const handleQuickSwitch = async (persona) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await switchPersona(persona);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to switch persona.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="cyber-panel max-w-lg w-full border-cyan-500/40 bg-panel-bg shadow-2xl relative overflow-hidden">
        {/* Header bar */}
        <div className="p-4 border-b border-panel-border bg-black/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
                NodeHound Security &amp; Access Control
              </h3>
              <p className="text-[11px] text-gray-400 font-mono">
                Zero Trust Zero-Knowledge Forensic SOC Gateway
              </p>
            </div>
          </div>
          <button
            onClick={() => setAuthModalOpen(false)}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-panel-border bg-black/30">
          <button
            onClick={() => { setAuthModalTab('login'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase transition-colors border-b-2 ${
              authModalTab === 'login'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Sign In / Persona
          </button>
          <button
            onClick={() => { setAuthModalTab('register'); setErrorMsg(null); }}
            className={`flex-1 py-2.5 text-xs font-mono font-bold uppercase transition-colors border-b-2 ${
              authModalTab === 'register'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Request Access
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusMsg && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {authModalTab === 'login' && (
            <div className="space-y-4">
              {/* Quick Persona Switcher for Evaluation */}
              <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 space-y-2">
                <span className="text-[10px] uppercase font-mono font-bold text-cyan-400 flex items-center gap-1.5">
                  <Fingerprint className="w-3.5 h-3.5" />
                  Quick Access Forensic Personas (1-Click Switch)
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleQuickSwitch('supervisor')}
                    className="p-2 rounded bg-black/60 border border-purple-500/30 hover:border-purple-400 text-left"
                  >
                    <span className="font-bold text-purple-300 block">Agent Connor</span>
                    <span className="text-[10px] text-gray-400 font-mono">Supervisor (Unit Alpha)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSwitch('investigator1')}
                    className="p-2 rounded bg-black/60 border border-cyan-500/30 hover:border-cyan-400 text-left"
                  >
                    <span className="font-bold text-cyan-300 block">Officer Vance</span>
                    <span className="text-[10px] text-gray-400 font-mono">Investigator (Unit Alpha)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSwitch('investigator2')}
                    className="p-2 rounded bg-black/60 border border-amber-500/30 hover:border-amber-400 text-left"
                  >
                    <span className="font-bold text-amber-300 block">Detective Reed</span>
                    <span className="text-[10px] text-gray-400 font-mono">Investigator (Unit Beta)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSwitch('admin')}
                    className="p-2 rounded bg-black/60 border border-gray-500/30 hover:border-gray-400 text-left"
                  >
                    <span className="font-bold text-gray-300 block">Tech Davis</span>
                    <span className="text-[10px] text-gray-400 font-mono">SysAdmin (Platform)</span>
                  </button>
                </div>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-panel-border"></div>
                <span className="flex-shrink mx-4 text-[10px] font-mono text-gray-500 uppercase">
                  Or Sign In With Credentials
                </span>
                <div className="flex-grow border-t border-panel-border"></div>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Organization Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="investigator1@nodehound.gov"
                      className="cyber-input w-full pl-9 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Argon2id Master Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="cyber-input w-full pl-9 text-xs font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">TOTP MFA Code (Optional)</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      maxLength={6}
                      value={loginMfaCode}
                      onChange={(e) => setLoginMfaCode(e.target.value)}
                      placeholder="6-digit authenticator code"
                      className="cyber-input w-full pl-9 text-xs font-mono tracking-widest"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="cyber-button-primary w-full py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 mt-4"
                >
                  <Shield className="w-4 h-4" />
                  {loading ? 'Authenticating...' : 'Sign In To Secure SOC'}
                </button>
              </form>
            </div>
          )}

          {authModalTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Full Name</label>
                  <input
                    type="text"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="cyber-input w-full text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Badge / Investigator ID</label>
                  <input
                    type="text"
                    value={regInvestigatorId}
                    onChange={(e) => setRegInvestigatorId(e.target.value)}
                    placeholder="INV-504"
                    className="cyber-input w-full text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Official Organization Email</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="j.doe@investigation.gov"
                  className="cyber-input w-full text-xs font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Unit / Squad</label>
                  <input
                    type="text"
                    value={regUnit}
                    onChange={(e) => setRegUnit(e.target.value)}
                    placeholder="UNIT-ALPHA-CYBER"
                    className="cyber-input w-full text-xs font-mono"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Designation</label>
                  <input
                    type="text"
                    value={regDesignation}
                    onChange={(e) => setRegDesignation(e.target.value)}
                    placeholder="Forensic Analyst"
                    className="cyber-input w-full text-xs"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Password (Min 10 chars, Upper/Lower/Digit/Special)</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="SecurePassword2026!"
                  className="cyber-input w-full text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium">Confirm Password</label>
                <input
                  type="password"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="cyber-input w-full text-xs font-mono"
                  required
                />
              </div>

              <p className="text-[11px] text-gray-400 italic">
                * Note: In compliance with zero-trust standards, registration requests are held in PENDING state until verified and activated by a designated Investigation Supervisor.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="cyber-button-primary w-full py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 mt-4"
              >
                <UserCheck className="w-4 h-4" />
                {loading ? 'Submitting Request...' : 'Submit Account Request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

