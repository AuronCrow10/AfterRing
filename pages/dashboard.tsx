import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type MeResponse = {
  user?: {
    email: string;
    role: string;
  };
  client?: {
    name: string;
    locale: string;
    timezone: string;
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    async function loadMe() {
      const response = await fetch('/api/auth/me');
      if (response.status === 401) {
        void router.replace('/login?next=/dashboard');
        return;
      }
      if (response.ok) {
        setMe((await response.json()) as MeResponse);
      }
    }
    void loadMe();
  }, [router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    void router.replace('/login');
  }

  return (
    <>
      <Head>
        <title>VoiceAI Dashboard</title>
      </Head>
      <main className="dashboard-page">
        <section className="dashboard-shell">
          <div className="app-topbar">
            <div>
              <span>{me?.client?.name || 'VoiceAI'}</span>
              <small>{me?.user?.email || 'Loading...'}</small>
            </div>
            <nav>
              <Link href="/">Landing</Link>
              <button onClick={logout}>Logout</button>
            </nav>
          </div>
          <header className="dashboard-header">
            <h1>Tenant workspace</h1>
            <p>Use the recall queue for captured leads and the browser call page for tenant-scoped WebRTC calls.</p>
          </header>
          <div className="dashboard-grid">
            <Link className="dashboard-tile" href="/recalls">
              <strong>Recall queue</strong>
              <span>View pending callback requests collected by the assistant.</span>
            </Link>
            <Link className="dashboard-tile" href="/call">
              <strong>Browser call</strong>
              <span>Open the Twilio WebRTC client and attach new call data to this tenant.</span>
            </Link>
          </div>
          <dl className="dashboard-meta">
            <div>
              <dt>Locale</dt>
              <dd>{me?.client?.locale || '-'}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{me?.client?.timezone || '-'}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{me?.user?.role || '-'}</dd>
            </div>
          </dl>
        </section>
      </main>
    </>
  );
}
