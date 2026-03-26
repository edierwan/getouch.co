'use client';

import { useActionState } from 'react';
import { updateProfile, sendPhoneOtp, verifyPhone } from './actions';
import { useEffect, useState } from 'react';

interface ProfileProps {
  name: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  role: string;
  avatarUrl: string | null;
  createdAt: string;
}

export default function ProfileClient({ profile }: { profile: ProfileProps }) {
  const [profileState, profileAction, profilePending] = useActionState(updateProfile, null);
  const [otpSendState, otpSendAction, otpSendPending] = useActionState(sendPhoneOtp, null);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyPhone, null);

  const [showOtpInput, setShowOtpInput] = useState(false);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);

  useEffect(() => {
    if (otpSendState?.pendingPhone) {
      setShowOtpInput(true);
      setPendingPhone(otpSendState.pendingPhone);
    }
  }, [otpSendState]);

  useEffect(() => {
    if (verifyState?.success) {
      setShowOtpInput(false);
    }
  }, [verifyState]);

  return (
    <div className="profile-wrap">
      {/* ── Profile form ── */}
      <div className="profile-card">
        <div className="profile-card-hd">
          <h2>Personal Information</h2>
          <p>Update your name, phone number, and avatar.</p>
        </div>

        <form action={profileAction} className="profile-form">
          {profileState?.error && <div className="auth-error">{profileState.error}</div>}
          {profileState?.success && <div className="auth-success">{profileState.success}</div>}

          <div className="profile-avatar-row">
            <div className="profile-avatar">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} />
              ) : (
                <span>{profile.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="profile-avatar-fields">
              <label className="profile-label" htmlFor="avatarUrl">Avatar URL</label>
              <input
                id="avatarUrl"
                name="avatarUrl"
                type="url"
                defaultValue={profile.avatarUrl ?? ''}
                placeholder="https://…"
                className="profile-input"
              />
              <span className="profile-hint">Optional — paste a public image URL</span>
            </div>
          </div>

          <div className="profile-row">
            <div className="profile-field">
              <label className="profile-label" htmlFor="name">Full Name</label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={profile.name}
                required
                className="profile-input"
              />
            </div>
            <div className="profile-field">
              <label className="profile-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                defaultValue={profile.email}
                disabled
                className="profile-input profile-input-disabled"
              />
              <span className="profile-hint">Email cannot be changed</span>
            </div>
          </div>

          <div className="profile-row">
            <div className="profile-field">
              <label className="profile-label" htmlFor="phone">
                Phone Number
                {profile.phoneVerified && (
                  <span className="portal-verified-badge" style={{ marginLeft: '0.5rem' }}>✓ Verified</span>
                )}
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={profile.phone ?? ''}
                placeholder="0123456789"
                className="profile-input"
              />
              <span className="profile-hint">Malaysian number (e.g. 0123456789)</span>
            </div>
            <div className="profile-field">
              <label className="profile-label">Role</label>
              <div className={`role-badge role-${profile.role}`} style={{ display: 'inline-flex', marginTop: '0.4rem' }}>
                {profile.role}
              </div>
            </div>
          </div>

          <div className="profile-actions">
            <button type="submit" className="profile-save-btn" disabled={profilePending}>
              {profilePending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Phone verification ── */}
      {profile.phone && !profile.phoneVerified && (
        <div className="profile-card">
          <div className="profile-card-hd">
            <h2>Verify WhatsApp Number</h2>
            <p>Verify your phone to use WhatsApp as a backup login method.</p>
          </div>

          {!showOtpInput ? (
            <form action={otpSendAction}>
              {otpSendState?.error && <div className="auth-error">{otpSendState.error}</div>}
              <input type="hidden" name="phone" value={profile.phone} />
              <button type="submit" className="profile-verify-btn" disabled={otpSendPending}>
                {otpSendPending ? 'Sending…' : `Send Code to +${profile.phone}`}
              </button>
            </form>
          ) : (
            <form action={verifyAction} className="profile-form">
              {verifyState?.error && <div className="auth-error">{verifyState.error}</div>}
              {otpSendState?.success && <div className="auth-success">{otpSendState.success}</div>}
              <input type="hidden" name="phone" value={pendingPhone ?? profile.phone} />
              <div className="profile-field" style={{ maxWidth: '160px' }}>
                <label className="profile-label" htmlFor="otp">Enter 4-digit code</label>
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
                  className="profile-input otp-input"
                />
              </div>
              <div className="profile-actions">
                <button type="submit" className="profile-save-btn" disabled={verifyPending}>
                  {verifyPending ? 'Verifying…' : 'Verify Phone'}
                </button>
                <button
                  type="button"
                  className="profile-cancel-btn"
                  onClick={() => setShowOtpInput(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Account info ── */}
      <div className="profile-card">
        <div className="profile-card-hd">
          <h2>Account Status</h2>
          <p>Your account verification and membership details.</p>
        </div>
        <div className="profile-info-grid">
          <div className="profile-info-item">
            <span className="profile-info-label">Member Since</span>
            <span className="profile-info-value">
              {new Date(profile.createdAt).toLocaleDateString('en-MY', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Email Verification</span>
            <span className={profile.emailVerified ? 'portal-verified-badge' : 'portal-unverified-badge'}>
              {profile.emailVerified ? '✓ Verified' : '✗ Not verified'}
            </span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">WhatsApp Verification</span>
            <span className={profile.phoneVerified ? 'portal-verified-badge' : 'portal-unverified-badge'}>
              {profile.phoneVerified ? '✓ Verified' : profile.phone ? '✗ Not verified' : '— No number set'}
            </span>
          </div>
          <div className="profile-info-item">
            <span className="profile-info-label">Account Role</span>
            <span className={`role-badge role-${profile.role}`}>{profile.role}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
