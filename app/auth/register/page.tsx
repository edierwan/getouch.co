'use client';

import { useActionState } from 'react';
import { register, verifyWhatsappOtp, resendWhatsappOtp } from '../actions';
import Link from 'next/link';

export default function RegisterPage() {
  const [regState, regAction, regPending] = useActionState(register, null);
  const [otpState, otpAction, otpPending] = useActionState(verifyWhatsappOtp, null);
  const [resendState, resendAction, resendPending] = useActionState(resendWhatsappOtp, null);

  const showOtpStep = regState?.requireOtp === true;

  /* ─── OTP Verification Step ─── */
  if (showOtpStep) {
    return (
      <div className="auth-card">
        <div className="auth-card-header">
          <h1>Enter WhatsApp Code</h1>
          <p>We sent a 4-digit code to your WhatsApp number.</p>
        </div>

        <form action={otpAction} className="auth-form">
          {otpState?.error && <div className="auth-error">{otpState.error}</div>}
          {resendState?.success && <div className="auth-success">{resendState.success}</div>}
          {resendState?.error && <div className="auth-error">{resendState.error}</div>}

          <div className="auth-success otp-hint">
            {regState?.success}
          </div>

          <input type="hidden" name="phone" value={regState.phone} />

          <div className="auth-field">
            <label htmlFor="otp">WhatsApp Code</label>
            <input
              id="otp"
              name="otp"
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="XXXX"
              required
              autoFocus
              className="otp-input"
            />
          </div>

          <button type="submit" className="auth-submit" disabled={otpPending}>
            {otpPending ? 'Verifying…' : 'Verify & Activate Account'}
          </button>
        </form>

        <form action={resendAction} className="otp-resend-form">
          <input type="hidden" name="phone" value={regState.phone} />
          <p className="auth-switch">
            Didn&apos;t receive it?{' '}
            <button
              type="submit"
              className="auth-link-btn"
              disabled={resendPending}
            >
              {resendPending ? 'Sending…' : 'Resend code'}
            </button>
          </p>
        </form>

        <p className="auth-switch" style={{ marginTop: '0.5rem' }}>
          Or verify via the link in your email instead.
        </p>
      </div>
    );
  }

  /* ─── Registration Form ─── */
  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <h1>Create account</h1>
        <p>Get started with Getouch</p>
      </div>

      <form action={regAction} className="auth-form">
        {regState?.error && <div className="auth-error">{regState.error}</div>}
        {regState?.success && !regState.requireOtp && (
          <div className="auth-success">{regState.success}</div>
        )}

        <div className="auth-field">
          <label htmlFor="name">Full Name</label>
          <input
            id="name"
            name="name"
            type="text"
            placeholder="John Doe"
            required
            autoComplete="name"
            autoFocus
          />
        </div>

        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="phone">
            Phone Number{' '}
            <span className="auth-field-hint">(optional — for WhatsApp verification)</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="0123456789"
            autoComplete="tel"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder="••••••••"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="auth-submit" disabled={regPending}>
          {regPending ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account?{' '}
        <Link href="/auth/login">Sign in</Link>
      </p>
    </div>
  );
}

