'use client';

import { useActionState } from 'react';
import { register } from '../actions';
import Link from 'next/link';

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, null);

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <h1>Create account</h1>
        <p>Get started with Getouch</p>
      </div>

      <form action={action} className="auth-form">
        {state?.error && <div className="auth-error">{state.error}</div>}
        {state?.success && <div className="auth-success">{state.success}</div>}

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

        <button type="submit" className="auth-submit" disabled={pending}>
          {pending ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account?{' '}
        <Link href="/auth/login">Sign in</Link>
      </p>
    </div>
  );
}
