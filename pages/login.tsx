import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useEffect, useState } from 'react';

type AuthMode = 'login' | 'register';

type AuthResponse = {
  error?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientName, setClientName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const nextPath = typeof router.query.next === 'string' && router.query.next.startsWith('/')
    ? router.query.next
    : '/dashboard';

  useEffect(() => {
    async function checkSession() {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        void router.replace(nextPath);
      }
    }
    void checkSession();
  }, [nextPath, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        clientName
      })
    });

    const data = (await response.json().catch(() => ({}))) as AuthResponse;
    setBusy(false);

    if (!response.ok) {
      setMessage(data.error || 'Authentication failed.');
      return;
    }

    void router.replace(nextPath);
  }

  return (
    <>
      <Head>
        <title>VoiceAI Login</title>
      </Head>
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-brand">
            <span>VoiceAI</span>
            <Link href="/">Landing</Link>
          </div>
          <h1>{mode === 'register' ? 'Create tenant account' : 'Sign in'}</h1>
          <p>
            {mode === 'register'
              ? 'Create a tenant workspace and owner account for recalls and browser calling.'
              : 'Use your tenant account to access recalls and browser calling.'}
          </p>
          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' ? (
              <label>
                <span>Tenant name</span>
                <input placeholder="Company or practice name" value={clientName} onChange={(event) => setClientName(event.target.value)} required />
              </label>
            ) : null}
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              <span>Password</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
            </label>
            {message ? <div className="auth-message">{message}</div> : null}
            <button className="auth-submit" disabled={busy} type="submit">
              {busy ? 'Working...' : mode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <button className="auth-link-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create tenant account' : 'Back to login'}
          </button>
        </section>
      </main>
    </>
  );
}
