import ProPanelLogo from '../common/ProPanelLogo';
import React, { useState } from 'react';
import { Loader2, KeyRound, Lock, Eye, EyeOff, User, AlertCircle } from 'lucide-react';
import { authApi } from '../../services/api';

export default function LoginView({ onLoginSuccess, onSwitchTab }) {
  // authMode: 'password' | 'pin' | 'create-pin'
  const [authMode, setAuthMode] = useState('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const rememberMe = true;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noPinForAccount, setNoPinForAccount] = useState(false);

  // 1. Password Login
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNoPinForAccount(false);
    try {
      const res = await authApi.login(username, password, rememberMe);
      if (res.success || res.authenticated) {
        onLoginSuccess?.(res.user || { username, role: res.role });
      } else {
        setError(res.message || 'Invalid credentials. Please check and try again.');
      }
    } catch (err) {
      if (err?.response?.status === 403 || err?.response?.status === 401 || err?.response?.status === 400) {
        setError(err.response?.data?.message || 'Invalid username or password.');
      } else {
        setError(err?.response?.data?.message || 'Unable to connect to authentication server.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. PIN Login
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (!pin.trim()) {
      setError('Please enter your security PIN.');
      return;
    }
    setLoading(true);
    setError('');
    setNoPinForAccount(false);
    try {
      const res = await authApi.loginWithPin(username, pin, rememberMe);
      if (res.success || res.authenticated) {
        onLoginSuccess?.(res.user || { username, role: res.role });
      } else if (res.has_pin === false) {
        setNoPinForAccount(true);
        setError('No security PIN configured for this account yet.');
      } else {
        setError(res.message || 'Incorrect PIN. Please try again.');
      }
    } catch (err) {
      const msg = err.response?.data?.message;
      if (err.response?.data?.has_pin === false) {
        setNoPinForAccount(true);
        setError('No security PIN configured for this account yet.');
      } else {
        setError(msg || 'Authentication failed. Please check your PIN.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 3. Create PIN
  const handleCreatePinSubmit = async (e) => {
    e.preventDefault();
    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
      setError('PIN must be 4 to 8 numeric digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match. Please re-enter.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authApi.createPin(username, password, pin, rememberMe);
      if (res.success || res.authenticated) {
        onLoginSuccess?.(res.user || { username, role: res.role });
      } else {
        setError(res.message || 'Failed to create PIN. Please verify your password.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create PIN. Please check your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="auth-form-header">
        <div className="auth-brand-badge" style={{ marginBottom: '18px' }}>
          <ProPanelLogo size="lg" />
        </div>
        <h1 className="auth-title">
          {authMode === 'password' && 'Sign In'}
          {authMode === 'pin' && 'Sign In with PIN'}
          {authMode === 'create-pin' && 'Create Security PIN'}
        </h1>
        <p className="auth-subtitle">
          {authMode === 'password' && 'Enter your credentials to access your workspace'}
          {authMode === 'pin' && 'Fast access with your 4-6 digit security PIN'}
          {authMode === 'create-pin' && 'Verify your password to configure your account PIN'}
        </p>
      </div>

      {/* ── MODE 1: PASSWORD LOGIN ── */}
      {authMode === 'password' && (
        <form onSubmit={handlePasswordSubmit} className="auth-cosmic-form">
          {error && (
            <div className="auth-error-box">
              <AlertCircle size={17} className="auth-error-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* Username, Email or Phone */}
          <div className="auth-input-group auth-input-with-icon">
            <User size={18} className="auth-input-lead-icon" />
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username, Email or Phone"
              className="auth-cosmic-input"
              autoComplete="username"
            />
          </div>

          {/* Password with Eye toggle */}
          <div className="auth-input-group auth-input-with-icon auth-password-group">
            <Lock size={18} className="auth-input-lead-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="auth-cosmic-input"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-show-btn"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>

          {/* Forgot Password */}
          <div className="auth-forgot-row">
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => onSwitchTab?.('forgot')}
            >
              Forgot Password?
            </button>
          </div>

          {/* Primary Submit Button */}
          <button type="submit" disabled={loading} className="auth-cosmic-submit-btn">
            {loading ? (
              <>
                <Loader2 size={16} className="auth-btn-spinner" />
                <span>Signing In…</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>

          {/* Divider */}
          <div className="auth-cosmic-divider">
            <span>or</span>
          </div>

          {/* Action: Login with PIN */}
          <button
            type="button"
            className="auth-pin-action-btn"
            onClick={() => {
              setAuthMode('pin');
              setError('');
              setNoPinForAccount(false);
            }}
          >
            <KeyRound size={16} color="#c084fc" />
            <span>Sign In with PIN</span>
          </button>
        </form>
      )}

      {/* ── MODE 2: PIN LOGIN ── */}
      {authMode === 'pin' && (
        <form onSubmit={handlePinSubmit} className="auth-cosmic-form">
          {error && (
            <div className="auth-error-box">
              <AlertCircle size={17} className="auth-error-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* If account has no PIN, show Create PIN helper card */}
          {noPinForAccount && (
            <div className="auth-create-pin-banner">
              <div>
                <strong>No PIN found</strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', opacity: 0.85 }}>Set up your fast security PIN now.</p>
              </div>
              <button
                type="button"
                className="auth-create-pin-btn"
                onClick={() => {
                  setAuthMode('create-pin');
                  setError('');
                }}
              >
                Create PIN
              </button>
            </div>
          )}

          {/* Username */}
          <div className="auth-input-group auth-input-with-icon">
            <User size={18} className="auth-input-lead-icon" />
            <input
              type="text"
              required
              autoFocus={!username}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username, Email or Phone"
              className="auth-cosmic-input"
              autoComplete="username"
            />
          </div>

          {/* PIN Input with Eye toggle */}
          <div className="auth-input-group auth-input-with-icon auth-password-group">
            <KeyRound size={18} className="auth-input-lead-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={8}
              required
              autoFocus={Boolean(username)}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 4-6 Digit PIN"
              className="auth-cosmic-input"
              style={{ letterSpacing: showPassword ? 'normal' : '4px', fontSize: '16px' }}
            />
            <button
              type="button"
              className="auth-show-btn"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide PIN' : 'Show PIN'}
              aria-label={showPassword ? 'Hide PIN' : 'Show PIN'}
            >{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>

          {/* Create PIN Option Link */}
          <div className="auth-forgot-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => {
                setAuthMode('create-pin');
                setError('');
              }}
            >
              No PIN yet? Create PIN
            </button>
          </div>

          {/* Submit PIN */}
          <button type="submit" disabled={loading} className="auth-cosmic-submit-btn">
            {loading ? (
              <>
                <Loader2 size={16} className="auth-btn-spinner" />
                <span>Verifying PIN…</span>
              </>
            ) : (
              <span>Sign In with PIN</span>
            )}
          </button>

          {/* Divider */}
          <div className="auth-cosmic-divider">
            <span>or</span>
          </div>

          {/* Switch back to Password Login */}
          <button
            type="button"
            className="auth-pin-action-btn"
            onClick={() => {
              setAuthMode('password');
              setError('');
              setNoPinForAccount(false);
            }}
          >
            <Lock size={15} color="#c084fc" />
            <span>Sign In with Password</span>
          </button>
        </form>
      )}

      {/* ── MODE 3: CREATE PIN ── */}
      {authMode === 'create-pin' && (
        <form onSubmit={handleCreatePinSubmit} className="auth-cosmic-form">
          {error && (
            <div className="auth-error-box">
              <AlertCircle size={17} className="auth-error-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* Identifier */}
          <div className="auth-input-group auth-input-with-icon">
            <User size={18} className="auth-input-lead-icon" />
            <input
              type="text"
              required
              autoFocus={!username}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username, Email or Phone"
              className="auth-cosmic-input"
              autoComplete="username"
            />
          </div>

          {/* Account Password to authorize PIN setup */}
          <div className="auth-input-group auth-input-with-icon auth-password-group">
            <Lock size={18} className="auth-input-lead-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoFocus={Boolean(username)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Account Password (for verification)"
              className="auth-cosmic-input"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-show-btn"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>

          {/* New PIN */}
          <div className="auth-input-group auth-input-with-icon">
            <KeyRound size={18} className="auth-input-lead-icon" />
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="New 4-8 Digit PIN"
              className="auth-cosmic-input"
              style={{ letterSpacing: '3px' }}
            />
          </div>

          {/* Confirm PIN */}
          <div className="auth-input-group auth-input-with-icon">
            <KeyRound size={18} className="auth-input-lead-icon" />
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              required
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Confirm New PIN"
              className="auth-cosmic-input"
              style={{ letterSpacing: '3px' }}
            />
          </div>

          {/* Submit Create PIN */}
          <button type="submit" disabled={loading} className="auth-cosmic-submit-btn">
            {loading ? (
              <>
                <Loader2 size={16} className="auth-btn-spinner" />
                <span>Setting PIN & Signing In…</span>
              </>
            ) : (
              <span>Save PIN & Sign In</span>
            )}
          </button>

          {/* Cancel back to PIN login */}
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => {
                setAuthMode('pin');
                setError('');
              }}
            >
              ← Back to PIN Login
            </button>
          </div>
        </form>
      )}
    </>
  );
}
