import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

type RecallItem = {
  id: string;
  capturedName?: string | null;
  capturedPhone?: string | null;
  capturedEmail?: string | null;
  capturedReason?: string | null;
  preferredContactTime?: string | null;
  rawSummary?: string | null;
  extraFields?: Record<string, unknown> | null;
  createdAt: string;
};

type RecallsResponse = {
  client?: {
    id: string;
    name: string;
  };
  items?: RecallItem[];
};

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

export default function RecallsPage() {
  const router = useRouter();
  const [clientName, setClientName] = useState('Loading...');
  const [items, setItems] = useState<RecallItem[]>([]);
  const [message, setMessage] = useState('Loading recalls...');

  async function loadRecalls() {
    setMessage('Loading recalls...');
    const response = await fetch('/api/recalls');
    if (response.status === 401) {
      void router.replace('/login?next=/recalls');
      return;
    }
    if (!response.ok) {
      setClientName('Unavailable');
      setMessage('This recall page is not available.');
      setItems([]);
      return;
    }

    const data = (await response.json()) as RecallsResponse;
    setClientName(data.client?.name || 'Recall Queue');
    if (!data.items || data.items.length === 0) {
      setItems([]);
      setMessage('No pending recalls. You are all caught up.');
      return;
    }
    setItems(data.items);
    setMessage('');
  }

  async function markCalled(id: string) {
    const response = await fetch(`/api/recalls/${id}/called`, {
      method: 'POST'
    });
    if (response.status === 401) {
      void router.replace('/login?next=/recalls');
      return;
    }
    if (!response.ok) return;
    await loadRecalls();
  }

  useEffect(() => {
    void loadRecalls();
  }, []);

  return (
    <>
      <Head>
        <title>Recall Queue</title>
      </Head>
      <div className="recalls-page">
        <header className="recalls-header">
          <div className="app-topbar">
            <div>
              <span>{clientName}</span>
              <small>Recall queue</small>
            </div>
            <nav>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/call">Browser call</Link>
            </nav>
          </div>
          <h1>Recall Queue</h1>
          <p>Active callbacks for the logged-in tenant. Mark items as completed once you have called back.</p>
        </header>
        <main className="recalls-main">
          <section className="recalls-panel">
            <div className="recalls-meta">
              <div className="recalls-client-pill">{clientName}</div>
              <div className="recalls-actions">
                <Link className="recalls-call-button" href="/call">Open browser call</Link>
                <button className="recalls-refresh" onClick={loadRecalls}>Refresh</button>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="recalls-empty">{message}</div>
            ) : (
              <table className="recalls-table">
                <thead>
                  <tr>
                    <th>Caller</th>
                    <th>Reason</th>
                    <th>When</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="recalls-name">{item.capturedName || 'Unknown caller'}</div>
                        <div className="recalls-muted">{item.capturedPhone || ''}</div>
                        {item.capturedEmail ? <div className="recalls-muted">{item.capturedEmail}</div> : null}
                      </td>
                      <td>
                        <div>{item.capturedReason || ''}</div>
                        {item.rawSummary ? <div className="recalls-muted">{item.rawSummary}</div> : null}
                        {item.extraFields && typeof item.extraFields === 'object' ? (
                          <div className="recalls-extras">
                            {Object.entries(item.extraFields).map(([key, value]) => (
                              <span key={key}>{key}: {String(value ?? '')}</span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="recalls-chip">{item.preferredContactTime ? formatDate(item.preferredContactTime) : 'ASAP'}</div>
                        <div className="recalls-muted">Received {formatDate(item.createdAt)}</div>
                      </td>
                      <td>
                        <button className="recalls-call-button" onClick={() => markCalled(item.id)}>Mark as called</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </>
  );
}
