import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

type Language = 'en' | 'it' | 'es';

type Translation = {
  heroTitle: string;
  heroSubtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  cardLabel: string;
  cardTitle: string;
  cardPoint1: string;
  cardPoint2: string;
  cardPoint3: string;
  cardPoint4: string;
  howTitle: string;
  howSubtitle: string;
  feature1Title: string;
  feature1Text: string;
  feature2Title: string;
  feature2Text: string;
  feature3Title: string;
  feature3Text: string;
  stackTitle: string;
  stackSubtitle: string;
  step1Title: string;
  step1Text: string;
  step2Title: string;
  step2Text: string;
  step3Title: string;
  step3Text: string;
  step4Title: string;
  step4Text: string;
  contactTitle: string;
  contactSubtitle: string;
  formName: string;
  formEmail: string;
  formCompany: string;
  formPhone: string;
  formMessage: string;
  formSend: string;
  formSending: string;
  formSuccess: string;
  formError: string;
  footerText: string;
};

const translations: Record<Language, Translation> = {
  en: {
    heroTitle: 'Turn missed calls into booked callbacks.',
    heroSubtitle:
      'A multi language AI receptionist that answers every call, captures the right details, and keeps your team focused on real clients.',
    ctaPrimary: 'Request a demo',
    ctaSecondary: 'See how it works',
    cardLabel: 'Value in minutes',
    cardTitle: 'Never lose a lead when the phone rings.',
    cardPoint1: 'Answers 24/7 with a human tone.',
    cardPoint2: 'Captures name, number, reason, preferred time.',
    cardPoint3: 'Tenant recall queue with secure login.',
    cardPoint4: 'Email summary to the owner after every call.',
    howTitle: 'Why teams pick it',
    howSubtitle:
      'It captures the right information, filters noise, and hands your team a clear callback list without extra tools.',
    feature1Title: 'Fewer missed leads',
    feature1Text: 'Every call gets answered, even when your team is busy or offline.',
    feature2Title: 'Clean callback info',
    feature2Text: 'Name, phone, reason, and best time to call back are captured and confirmed.',
    feature3Title: 'Less admin work',
    feature3Text: 'One private page, ordered by urgency, with a single button to close a lead.',
    stackTitle: 'What happens in a call',
    stackSubtitle: 'From ring to recap in under a minute, with language control and date validation.',
    step1Title: '1. Answer and greet',
    step1Text: 'The assistant introduces itself as your AI assistant and stays in the client language.',
    step2Title: '2. Collects callback details',
    step2Text: 'Flexible flows capture name, phone, reason, preferred time, and custom fields.',
    step3Title: '3. Confirm and save',
    step3Text: 'Recap is spoken naturally, then the lead is stored and emailed to the owner.',
    step4Title: '4. Recall queue',
    step4Text: 'Pending calls appear in a private recall page, ordered by urgency.',
    contactTitle: 'Talk to us',
    contactSubtitle: 'Leave your details and we will set up a demo for your team.',
    formName: 'Full name',
    formEmail: 'Email',
    formCompany: 'Company',
    formPhone: 'Phone',
    formMessage: 'Message',
    formSend: 'Send',
    formSending: 'Sending...',
    formSuccess: 'Thanks. We will reach out shortly.',
    formError: 'Something went wrong. Please try again.',
    footerText: 'VoiceAI Intake. Human sounding recalls, ready for production.'
  },
  it: {
    heroTitle: 'Trasforma le chiamate perse in richiami prenotati.',
    heroSubtitle:
      'Un assistente AI multi lingua che risponde sempre, raccoglie i dettagli giusti e libera il tuo team.',
    ctaPrimary: 'Richiedi una demo',
    ctaSecondary: 'Come funziona',
    cardLabel: 'Valore in pochi minuti',
    cardTitle: 'Nessun lead perso quando squilla il telefono.',
    cardPoint1: 'Risponde 24/7 con tono umano.',
    cardPoint2: 'Raccoglie nome, numero, motivo, orario.',
    cardPoint3: 'Coda richiami tenant con login sicuro.',
    cardPoint4: 'Email riepilogo al titolare dopo ogni chiamata.',
    howTitle: 'Perche i team lo scelgono',
    howSubtitle: 'Cattura le info giuste, filtra il rumore e consegna una lista richiami chiara.',
    feature1Title: 'Meno lead persi',
    feature1Text: 'Ogni chiamata viene gestita, anche quando lo studio e occupato.',
    feature2Title: 'Dati chiari',
    feature2Text: 'Nome, telefono, motivo e orario migliore vengono confermati.',
    feature3Title: 'Meno lavoro admin',
    feature3Text: 'Una pagina privata ordinata per urgenza e un pulsante per chiudere.',
    stackTitle: 'Cosa succede in una chiamata',
    stackSubtitle: 'Dal primo squillo al riepilogo in meno di un minuto, con controllo lingua e date valide.',
    step1Title: '1. Risponde e saluta',
    step1Text: 'Si presenta come assistente AI del cliente e resta nella lingua scelta.',
    step2Title: '2. Raccoglie i dettagli del richiamo',
    step2Text: 'Flussi flessibili catturano nome, telefono, motivo, orario e campi custom.',
    step3Title: '3. Conferma e salva',
    step3Text: 'Il riepilogo e naturale, poi il lead viene salvato e inviato via email.',
    step4Title: '4. Coda richiami',
    step4Text: 'I richiami in sospeso appaiono in una pagina privata, ordinati per urgenza.',
    contactTitle: 'Parliamone',
    contactSubtitle: 'Lascia i tuoi dati e organizziamo una demo.',
    formName: 'Nome e cognome',
    formEmail: 'Email',
    formCompany: 'Azienda',
    formPhone: 'Telefono',
    formMessage: 'Messaggio',
    formSend: 'Invia',
    formSending: 'Invio in corso...',
    formSuccess: 'Grazie. Ti contatteremo a breve.',
    formError: 'Errore. Riprova tra poco.',
    footerText: 'VoiceAI Intake. Richiami dal suono umano, pronti per la produzione.'
  },
  es: {
    heroTitle: 'Convierte llamadas perdidas en devoluciones programadas.',
    heroSubtitle:
      'Un asistente AI multilengua que responde siempre, recoge los datos correctos y libera al equipo.',
    ctaPrimary: 'Solicitar demo',
    ctaSecondary: 'Como funciona',
    cardLabel: 'Valor en minutos',
    cardTitle: 'No pierdas leads cuando suena el telefono.',
    cardPoint1: 'Responde 24/7 con tono humano.',
    cardPoint2: 'Captura nombre, numero, motivo, horario.',
    cardPoint3: 'Cola de recalls por tenant con login seguro.',
    cardPoint4: 'Email resumen al responsable tras cada llamada.',
    howTitle: 'Por que lo eligen',
    howSubtitle: 'Captura la informacion correcta, filtra el ruido y entrega una lista clara de devoluciones.',
    feature1Title: 'Menos leads perdidos',
    feature1Text: 'Cada llamada recibe respuesta, aunque el equipo este ocupado.',
    feature2Title: 'Datos claros',
    feature2Text: 'Nombre, telefono, motivo y mejor horario quedan confirmados.',
    feature3Title: 'Menos trabajo admin',
    feature3Text: 'Una pagina privada ordenada por urgencia y un boton para cerrar.',
    stackTitle: 'Que pasa en una llamada',
    stackSubtitle: 'Desde el primer tono hasta el resumen en menos de un minuto, con control de idioma y fechas validas.',
    step1Title: '1. Responder y saludar',
    step1Text: 'Se presenta como asistente AI del cliente y mantiene el idioma configurado.',
    step2Title: '2. Captura los detalles del callback',
    step2Text: 'Flujos flexibles capturan nombre, telefono, motivo, horario y campos custom.',
    step3Title: '3. Confirmar y guardar',
    step3Text: 'El resumen es natural, luego se guarda el lead y se envia un email.',
    step4Title: '4. Cola de recalls',
    step4Text: 'Los pendientes aparecen en una pagina privada ordenada por urgencia.',
    contactTitle: 'Hablemos',
    contactSubtitle: 'Deja tus datos y coordinamos una demo.',
    formName: 'Nombre completo',
    formEmail: 'Email',
    formCompany: 'Empresa',
    formPhone: 'Telefono',
    formMessage: 'Mensaje',
    formSend: 'Enviar',
    formSending: 'Enviando...',
    formSuccess: 'Gracias. Te contactaremos pronto.',
    formError: 'Algo salio mal. Intentalo de nuevo.',
    footerText: 'VoiceAI Intake. Recalls con tono humano listos para produccion.'
  }
};

export default function LandingPage() {
  const [lang, setLang] = useState<Language>('en');
  const [status, setStatus] = useState('');
  const dict = translations[lang] || translations.en;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlLang = params.get('lang');
    const browserLang = navigator.language?.slice(0, 2);
    const nextLang = getSupportedLanguage(urlLang) ?? getSupportedLanguage(browserLang) ?? 'en';
    setLang(nextLang);
    document.documentElement.lang = nextLang;
  }, []);

  function changeLang(nextLang: Language) {
    setLang(nextLang);
    document.documentElement.lang = nextLang;
    const params = new URLSearchParams(window.location.search);
    params.set('lang', nextLang);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(dict.formSending);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload: Record<string, FormDataEntryValue | string> = Object.fromEntries(formData.entries());
    payload.locale = lang;
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        setStatus(dict.formError);
        return;
      }
      form.reset();
      setStatus(dict.formSuccess);
    } catch (_err) {
      setStatus(dict.formError);
    }
  }

  return (
    <>
      <Head>
        <title>VoiceAI - AI Assistant for Missed Calls</title>
      </Head>
      <section className="landing-hero">
        <div className="landing-container">
          <nav className="landing-nav">
            <div className="landing-brand">VoiceAI</div>
            <div className="landing-nav-actions">
              <Link className="landing-login-link" href="/login">Login</Link>
              <div className="lang-toggle">
                {(['en', 'it', 'es'] as Language[]).map((item) => (
                  <button className={`lang-btn ${lang === item ? 'active' : ''}`} key={item} onClick={() => changeLang(item)}>
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </nav>
          <div className="landing-hero-grid">
            <div>
              <h1 className="landing-headline">{dict.heroTitle}</h1>
              <p className="landing-subhead">{dict.heroSubtitle}</p>
              <div className="landing-cta-row">
                <a className="landing-cta primary" href="#contact">{dict.ctaPrimary}</a>
                <a className="landing-cta secondary" href="#how">{dict.ctaSecondary}</a>
              </div>
            </div>
            <div className="landing-hero-card">
              <div className="landing-card-label">{dict.cardLabel}</div>
              <div className="landing-card-title">{dict.cardTitle}</div>
              <div className="landing-card-list">
                <div>{dict.cardPoint1}</div>
                <div>{dict.cardPoint2}</div>
                <div>{dict.cardPoint3}</div>
                <div>{dict.cardPoint4}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="landing-section light" id="how">
        <div className="landing-container">
          <h2 className="landing-section-title">{dict.howTitle}</h2>
          <p className="landing-section-desc">{dict.howSubtitle}</p>
          <div className="landing-grid-3">
            <Feature title={dict.feature1Title} text={dict.feature1Text} />
            <Feature title={dict.feature2Title} text={dict.feature2Text} />
            <Feature title={dict.feature3Title} text={dict.feature3Text} />
          </div>
        </div>
      </section>
      <section className="landing-section" id="stack">
        <div className="landing-container">
          <h2 className="landing-section-title">{dict.stackTitle}</h2>
          <p className="landing-section-desc">{dict.stackSubtitle}</p>
          <div className="landing-steps">
            <Step title={dict.step1Title} text={dict.step1Text} />
            <Step title={dict.step2Title} text={dict.step2Text} />
            <Step title={dict.step3Title} text={dict.step3Text} />
            <Step title={dict.step4Title} text={dict.step4Text} />
          </div>
        </div>
      </section>
      <section className="landing-section light" id="contact">
        <div className="landing-container">
          <h2 className="landing-section-title">{dict.contactTitle}</h2>
          <p className="landing-section-desc">{dict.contactSubtitle}</p>
          <form className="landing-contact" onSubmit={submitContact}>
            <div className="landing-contact-grid">
              <Field label={dict.formName} name="name" required />
              <Field label={dict.formEmail} name="email" type="email" required />
              <Field label={dict.formCompany} name="company" />
              <Field label={dict.formPhone} name="phone" />
            </div>
            <label className="landing-field full">
              <span>{dict.formMessage}</span>
              <textarea name="message" rows="4" required />
            </label>
            <div className="landing-contact-actions">
              <button className="landing-send-btn" type="submit">{dict.formSend}</button>
              <span className="landing-status">{status}</span>
            </div>
          </form>
        </div>
      </section>
      <footer className="landing-footer">
        <div className="landing-container">{dict.footerText}</div>
      </footer>
    </>
  );
}

function getSupportedLanguage(value: string | null | undefined): Language | null {
  if (value === 'en' || value === 'it' || value === 'es') return value;
  return null;
}

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
};

function Field({ label, name, type = 'text', required = false }: FieldProps) {
  return (
    <label className="landing-field">
      <span>{label}</span>
      <input type={type} name={name} required={required} />
    </label>
  );
}

type TextBlockProps = {
  title: string;
  text: string;
};

function Feature({ title, text }: TextBlockProps) {
  return (
    <div className="landing-feature">
      <div className="landing-feature-title">{title}</div>
      <div className="landing-feature-text">{text}</div>
    </div>
  );
}

function Step({ title, text }: TextBlockProps) {
  return (
    <div className="landing-step">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
