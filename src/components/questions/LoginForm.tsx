import { useId, useState } from 'react';
import { api, ApiError } from '../../lib/client/api';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

export default function LoginForm() {
  const id = useId();
  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  const linkProblem = params.get('error') === 'link';
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  if (state.kind === 'sent') {
    return (
      <p role="status">If that address has an account, a sign-in link is on its way.</p>
    );
  }

  return (
    <form
      className="tq-login"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ kind: 'sending' });
        try {
          await api('/api/auth/login', { method: 'POST', body: { email: email.trim(), next: params.get('next') ?? undefined } });
          setState({ kind: 'sent' });
        } catch (err) {
          setState({ kind: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong.' });
        }
      }}
    >
      {linkProblem && (
        <div className="tq-aside tq-aside--caution" role="alert">
          <p>
            <strong>This sign-in link no longer works</strong>
          </p>
          <p>It may have expired or already been used. Send yourself a new one below.</p>
        </div>
      )}
      <label htmlFor={`${id}-email`}>Email address</label>
      <input
        id={`${id}-email`}
        className="tq-input"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={state.kind === 'error'}
        aria-describedby={state.kind === 'error' ? `${id}-error` : undefined}
      />
      {state.kind === 'error' && (
        <p id={`${id}-error`} className="tq-error">
          {state.message}
        </p>
      )}
      <button type="submit" className="tq-button tq-button--primary tq-button--large" aria-disabled={state.kind === 'sending'}>
        {state.kind === 'sending' ? 'Sending…' : linkProblem ? 'Send a new link' : 'Send sign-in link'}
      </button>
    </form>
  );
}
