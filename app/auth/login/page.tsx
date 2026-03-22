'use client';

import { useActionState } from 'react';
import { login } from '../actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <h1>Welcome back</h1>
        <p>Sign in to your account</p>
      </div>

      <form action={action} className="auth-form">
        {state?.error && <div className="auth-error">{state.error}</div>}

        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
            autoFocus
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
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="auth-submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p className="auth-switch">
        Don&apos;t have an account?{' '}
        <a href="https://auth.getouch.co/auth/register">Create one</a>
      </p>
    </div>
  );
}
