import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Device } from '@twilio/voice-sdk';
import type { Call } from '@twilio/voice-sdk';

type DeviceStatusState = 'offline' | 'connecting' | 'online' | 'in-call';

type DeviceStatus = {
  state: DeviceStatusState;
  text: string;
};

type LogType = '' | 'info' | 'event' | 'error';

type LogItem = {
  id: string;
  time: string;
  message: string;
  type: LogType;
};

type TwilioTokenResponse = {
  token?: string;
  identity?: string;
  callerNumber?: string;
  defaultDestination?: string;
  clientId?: string;
};

type AuthResponse = {
  user?: {
    email: string;
  };
  client?: {
    id: string;
    name: string;
  };
};

type BrowserCallIntentResponse = {
  id?: string;
  toNumber?: string;
};

type TwilioSdkError = Error & {
  code?: number;
  description?: string;
  explanation?: string;
  twilioError?: {
    code?: number;
    description?: string;
    explanation?: string;
    causes?: string[];
    solutions?: string[];
  };
};

function nowTime(): string {
  return new Date().toLocaleTimeString('it-IT', { hour12: false });
}

function formatTwilioError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const twilioError = error as TwilioSdkError;
  const detail = twilioError.twilioError ?? twilioError;
  const parts = [
    detail.code ? `code ${detail.code}` : null,
    detail.description,
    detail.explanation,
    error.message && error.message !== detail.description ? error.message : null
  ].filter(Boolean);
  return parts.join(' - ') || error.message || 'unknown';
}

export default function BrowserCallPage() {
  const [status, setStatus] = useState<DeviceStatus>({ state: 'offline', text: 'Inizializzazione...' });
  const [identity, setIdentity] = useState('-');
  const [toNumber, setToNumber] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [hasCall, setHasCall] = useState(false);
  const [clientName, setClientName] = useState('Tenant');
  const [userEmail, setUserEmail] = useState('');
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const callerNumberRef = useRef('');
  const defaultDestinationRef = useRef('');
  const logEndRef = useRef<HTMLDivElement | null>(null);

  function addLog(message: string, type: LogType = '') {
    setLogs((items) => [...items, { id: `${Date.now()}-${items.length}`, time: nowTime(), message, type }]);
  }

  function updateStatus(state: DeviceStatusState, text: string) {
    setStatus({ state, text });
  }

  function redirectToLogin() {
    window.location.assign('/login?next=/call');
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [logs]);

  useEffect(() => {
    let mounted = true;

    async function requestMicrophone() {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (_err) {
        addLog('Permesso microfono negato o non disponibile', 'error');
      }
    }

    async function initClient() {
      if (deviceRef.current) return;

      try {
        const authResp = await fetch('/api/auth/me', { method: 'GET' });
        if (authResp.status === 401) {
          redirectToLogin();
          return;
        }
        if (!authResp.ok) {
          addLog(`Auth HTTP ${authResp.status}`, 'error');
          updateStatus('offline', 'Errore autenticazione');
          return;
        }
        const authData = (await authResp.json()) as AuthResponse;
        if (mounted) {
          setClientName(authData.client?.name || 'Tenant');
          setUserEmail(authData.user?.email || '');
        }

        addLog('Richiesta token da /twilio/token (GET)', 'info');
        updateStatus('connecting', 'Richiesta token...');

        const resp = await fetch('/twilio/token', { method: 'GET' });
        if (resp.status === 401) {
          redirectToLogin();
          return;
        }
        if (!resp.ok) {
          addLog(`Token HTTP ${resp.status}`, 'error');
          updateStatus('offline', 'Errore token');
          return;
        }

        const data = (await resp.json()) as TwilioTokenResponse;
        if (!data?.token) {
          addLog('Risposta token non valida', 'error');
          updateStatus('offline', 'Errore token');
          return;
        }

        callerNumberRef.current = data.callerNumber || '';
        defaultDestinationRef.current = data.defaultDestination || '';
        if (mounted) {
          setIdentity(data.identity || 'twilio-browser');
          setToNumber((value) => value || data.defaultDestination || '');
        }

        await requestMicrophone();

        const device = new Device(data.token, {
          logLevel: 1,
          codecPreferences: ['opus', 'pcmu'],
          edge: 'ashburn',
          enableImprovedSignalingErrorPrecision: true
        });
        deviceRef.current = device;

        device.on('registered', () => {
          if (!mounted) return;
          setIsReady(true);
          addLog('Client pronto', 'event');
          updateStatus('online', 'Device online');
        });

        device.on('unregistered', () => {
          if (!mounted) return;
          setIsReady(false);
          updateStatus('offline', 'Device offline');
        });

        device.on('error', (error) => {
          if (!mounted) return;
          addLog(`Errore client: ${formatTwilioError(error)}`, 'error');
          updateStatus('offline', 'Errore client');
        });

        await device.register();
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : 'unknown';
        addLog(`Errore inizializzazione Twilio: ${message}`, 'error');
        updateStatus('offline', 'Errore SDK');
      }
    }

    addLog('Pagina caricata. Avvio registrazione client...', 'info');
    void initClient();

    return () => {
      mounted = false;
      callRef.current?.disconnect();
      deviceRef.current?.destroy();
      deviceRef.current = null;
      callRef.current = null;
    };
  }, []);

  async function createBrowserIntent(destination: string): Promise<BrowserCallIntentResponse | null> {
    const response = await fetch('/api/calls/browser-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toNumber: destination })
    });

    if (response.status === 401) {
      redirectToLogin();
      return null;
    }

    if (!response.ok) {
      addLog(`Intent HTTP ${response.status}`, 'error');
      return null;
    }

    const data = (await response.json()) as BrowserCallIntentResponse;
    if (!data.id) {
      addLog('Intent chiamata non valido', 'error');
      return null;
    }

    return data;
  }

  async function startCall() {
    const device = deviceRef.current;
    if (!device) {
      addLog('Client non disponibile', 'error');
      return;
    }

    if (!isReady) {
      addLog('Client non pronto, attendere la connessione', 'info');
      return;
    }

    if (callRef.current) {
      addLog('Chiamata gia attiva', 'info');
      return;
    }

    const destination = toNumber.trim() || defaultDestinationRef.current;
    if (!destination) {
      addLog('Inserisci un numero di destinazione', 'error');
      return;
    }

    if (!callerNumberRef.current) {
      addLog('Caller ID Twilio non configurato', 'error');
      return;
    }

    try {
      updateStatus('connecting', 'Connessione alla chiamata...');
      addLog('Creazione intent tenant per la chiamata...', 'info');
      const intent = await createBrowserIntent(destination);
      if (!intent?.id) {
        updateStatus('online', 'Device online');
        return;
      }

      const call = await device.connect({
        params: {
          To: intent.toNumber || destination,
          intentId: intent.id
        }
      });

      callRef.current = call;
      setHasCall(true);
      addLog(`Chiamata in corso verso: ${destination}`, 'info');

      call.on('accept', () => {
        updateStatus('in-call', "In chiamata con l'assistente");
        setHasCall(true);
      });

      call.on('disconnect', () => {
        addLog('Chiamata terminata', 'event');
        callRef.current = null;
        setHasCall(false);
        updateStatus('online', 'Device online');
      });

      call.on('cancel', () => {
        callRef.current = null;
        setHasCall(false);
        updateStatus('online', 'Device online');
      });

      call.on('error', (error) => {
        addLog(`Errore chiamata: ${formatTwilioError(error)}`, 'error');
        callRef.current = null;
        setHasCall(false);
        updateStatus('online', 'Device online');
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      addLog(`Errore avvio chiamata: ${message}`, 'error');
      callRef.current = null;
      setHasCall(false);
      updateStatus('online', 'Device online');
    }
  }

  function hangupCall() {
    if (!callRef.current) return;
    addLog("Chiusura chiamata dall'utente", 'info');
    callRef.current.disconnect();
    callRef.current = null;
    setHasCall(false);
    updateStatus('online', 'Device online');
  }

  const badgeClass =
    status.state === 'online' || status.state === 'in-call'
      ? 'badge badge-ok'
      : status.state === 'connecting'
        ? 'badge badge-warn'
        : 'badge badge-err';

  return (
    <>
      <Head>
        <title>Voice AI Browser Call</title>
      </Head>
      <main className="call-page">
        <section className="call-card">
          <div className="app-topbar compact">
            <div>
              <span>{clientName}</span>
              {userEmail ? <small>{userEmail}</small> : null}
            </div>
            <nav>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/recalls">Recalls</Link>
            </nav>
          </div>
          <div className="call-card-header">
            <h1>Voice AI Browser Call</h1>
            <span className={badgeClass}>
              {status.state === 'online' ? 'Twilio' : status.state === 'connecting' ? 'Connessione' : status.state === 'in-call' ? 'In call' : 'Offline'}
            </span>
          </div>
          <div className="status-line">{status.text}</div>
          <div className="identity-line">
            Identity: <span>{identity}</span>
          </div>
          <label className="call-field">
            <span>Numero cliente da chiamare (E.164). Lascia vuoto per il default del backend.</span>
            <input
              value={toNumber}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setToNumber(event.target.value)}
              placeholder="es. +17076023342 oppure +390000000000"
            />
          </label>
          <div className="call-log">
            {logs.map((item) => (
              <div className="log-line" key={item.id}>
                <span className="log-time">[{item.time}] </span>
                <span className={`log-msg ${item.type}`}>{item.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
          <div className="call-actions">
            <button className="btn btn-primary" disabled={hasCall || !isReady} onClick={startCall}>
              Chiama assistente
            </button>
            <button className="btn btn-danger" disabled={!hasCall} onClick={hangupCall}>
              Chiudi
            </button>
          </div>
          <p className="call-hint">
            Apri questa pagina da Chrome/Firefox con il microfono attivo. Il browser usa Twilio Voice per parlare con lo stesso assistente che risponde alle chiamate telefoniche. Il numero inserito raggiunge il webhook /twilio/voice.
          </p>
        </section>
      </main>
    </>
  );
}
