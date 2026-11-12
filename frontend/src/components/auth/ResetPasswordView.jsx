import ProPanelLogo from '../common/ProPanelLogo';
import React, { useState } from 'react';
import { Loader2, CheckCircle2, Eye, EyeOff, Lock, AlertCircle } from 'lucide-react';

export default function ResetPasswordView({ onSwitchTab }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    setError('');

    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 800);
  };

  return (
    <>
      <div className="auth-form-header">
        <div className="auth-brand-badge" style={{ marginBottom: '18px' }}>
          <ProPanelLogo size="lg" />
        </div>
        <h1 className="auth-title">New Password</h1>
        <p className="auth-subtitle">Create a new secure password for your CardFlow account</p>
      </div>

      {success ? (
        <div className="auth-success-box" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} color="#4ade80" />
            <strong style={{ color: '#ffffff' }}>Password Updated!</strong>
          </div>
          <span style={{ fontSize: '13.5px', lineHeight: '1.4' }}>
            Your password has been reset successfully. You can now sign in with your new credentials.
          </span>
          <button
            type="button"
            className="auth-cosmic-submit-btn"
            style={{ marginTop: '10px', height: '44px', fontSize: '14px' }}
            onClick={() => onSwitchTab?.('login')}
          >
            Sign In Now
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="auth-cosmic-form">
          {error && (
            <div className="auth-error-box">
              <AlertCircle size={17} className="auth-error-icon" />
              <span>{error}</span>
            </div>
          )}

          <div className="auth-input-group auth-input-with-icon auth-password-group">
            <Lock size={18} className="auth-input-lead-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New Password"
              className="auth-cosmic-input"
            />
            <button
              type="button"
              className="auth-show-btn"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>

          <div className="auth-input-group auth-input-with-icon">
            <Lock size={18} className="auth-input-lead-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm New Password"
              className="auth-cosmic-input"
            />
          </div>

          <button type="submit" disabled={loading} className="auth-cosmic-submit-btn" style={{ marginTop: '6px' }}>
            {loading ? (
              <>
                <Loader2 size={16} className="auth-btn-spinner" />
                <span>Updating Password…</span>
              </>
            ) : (
              <span>Update Password</span>
            )}
          </button>

          <div style={{ marginTop: '18px', textAlign: 'center' }}>
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => onSwitchTab?.('login')}
            >
              ← Back to Sign In
            </button>
          </div>
        </form>
      )}
    </>
  );
}
