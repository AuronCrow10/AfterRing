# Voice AI Intake

Multi-tenant Voice AI intake system for missed calls and browser-originated calls.
It serves a Next.js frontend and an Express API from the same Node process, connects
Twilio Voice Media Streams to OpenAI Realtime, uses Deepgram for TTS audio, and
stores tenants, call sessions, leads, plans, users, and browser call intents in
Postgres through Prisma.

## What is included

- Public landing page with EN/IT/ES copy and a contact form.
- Tenant registration, login, logout, and HTTP-only cookie sessions.
- Tenant dashboard with links to recalls and browser calling.
- Twilio PSTN intake through `/twilio/voice` and `/twilio/media-stream`.
- Twilio Browser Voice page at `/call` using short-lived tenant call intents.
- Recall queue at `/recalls`, scoped to the logged-in tenant.
- OpenAI Realtime intake flow with localized prompts for IT/EN/ES/FR/DE.
- Custom intake steps through `ClientIntakeConfig.steps`.
- Email delivery for contact requests and saved intake leads through Mailjet SMTP.
- Usage tracking for call duration plus optional OpenAI, Deepgram, and Twilio cost logging.

## Stack

- Next.js pages frontend.
- Express HTTP server with WebSocket support.
- Twilio Voice, Twilio Voice SDK, and Twilio Media Streams.
- OpenAI Realtime WebSocket API.
- Deepgram TTS output encoded for 8 kHz mu-law telephony.
- Prisma 5 with PostgreSQL.
- Nodemailer with Mailjet SMTP.

## Project layout

```text
pages/                 Next.js pages for landing, login, dashboard, calls, recalls
src/index.ts           Server bootstrap
src/server.ts          Express, Next, HTTP, and WebSocket server setup
src/routes/            API and Twilio webhook routes
src/services/          Realtime, media stream, auth, plan, usage, email, intake logic
src/config/            Environment, provider clients, prompts, logger, database
src/middleware/        Auth, request logging, error handling
src/utils/             Telephony, time, UUID, and barge-in helpers
prisma/schema.prisma   Database schema
prisma/migrations/     Prisma migrations
scripts/               Utility harnesses
```

## Environment

Create `.env` in the repository root. The server validates these variables on
startup in `src/config/env.ts`.

Required:

```text
DATABASE_URL=
PUBLIC_BASE_URL=

OPENAI_API_KEY=
DEEPGRAM_API_KEY=
DEEPGRAM_TTS_MODEL=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_API_KEY_SID=
TWILIO_API_KEY_SECRET=
TWILIO_TWIML_APP_SID=
TWILIO_CALLER_ID=
TWILIO_INBOUND_NUMBER=

JWT_SECRET=

MAILJET_API_KEY=
MAILJET_API_SECRET=
MAIL_FROM_EMAIL=
CONTACT_EMAIL=
```

Common optional variables:

```text
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
AUTH_COOKIE_NAME=voiceai_session
OPENAI_REALTIME_MODEL=gpt-realtime
DEEPGRAM_TTS_ENCODING=mulaw
DEEPGRAM_TTS_SAMPLE_RATE=8000
MAILJET_SMTP_HOST=in-v3.mailjet.com
MAILJET_SMTP_PORT=587
MAIL_FROM_NAME=Voice AI Assistant
INTAKE_DEFAULT_LOCALE=it-IT
ASSISTANT_TIMEZONE_LABEL=local
VAD_SILENCE_MS=300
PHONE_CHUNK_DEADLINE_MS=1500
PHONE_ENTRY_TIMEOUT_MS=2500
BARGE_IN_AVG_ABS_THRESHOLD=950
BARGE_IN_FRAMES_REQUIRED=3
OPENAI_INPUT_COST_PER_1K=0
OPENAI_OUTPUT_COST_PER_1K=0
DEEPGRAM_TTS_COST_PER_1K_CHARS=0
TWILIO_COST_PER_MINUTE=0
```

`JWT_SECRET` must be at least 32 characters. `PUBLIC_BASE_URL` must be the public
HTTPS base URL that Twilio can reach, for example an ngrok URL during local
testing or the production domain in deployment.

## Database

Generate the Prisma client and apply migrations:

```text
npm run prisma:generate
npm run prisma:migrate:deploy
```

For local migration development:

```text
npm run prisma:migrate:dev
```

The normal way to create a tenant is through `/login` in register mode. The auth
routes also expose `POST /api/auth/bootstrap`, which creates the first owner
account only when no users exist.

`prisma/seed.ts` is present as a manual demo-data helper, but there is no seed
script wired in `package.json`; update it before using it directly.

## Running

Install dependencies:

```text
npm install
```

Start development mode:

```text
npm run dev
```

Build and run production output:

```text
npm run build
NODE_ENV=production
npm start
```

Set `NODE_ENV=production` in your process manager or shell before `npm start`.
Docker Compose sets this automatically.

The Express server prepares and serves the Next.js app, so API routes, pages, and
the Twilio WebSocket all run on the same port.

## Docker VPS deployment

The recommended MVP VPS layout is:

- `db`: PostgreSQL container with a persistent Docker volume.
- `app`: one Node container serving Express APIs, the Twilio WebSocket, and the Next.js frontend.
- Nginx or Caddy on the host terminates HTTPS and proxies to `127.0.0.1:3000`.

Create your production env file from the Docker example:

```text
cp .env.docker.example .env
```

Set every provider secret, use a long random `POSTGRES_PASSWORD`, and set:

```text
PUBLIC_BASE_URL=https://your-domain.example
```

Start the stack:

```text
docker compose up -d --build
```

The app container waits for Postgres, runs `prisma migrate deploy`, then starts
`node dist/index.js`. The Compose file binds the app to `127.0.0.1:3000` by
default so it is only reachable through your host reverse proxy.

For Nginx, make sure WebSocket upgrades are passed through because Twilio connects
to `/twilio/media-stream`:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

Use URL-safe characters in `POSTGRES_PASSWORD` or URL-encode special characters,
because Compose builds `DATABASE_URL` from that value for the app container.

## Twilio setup

Configure the Twilio phone number voice webhook:

```text
POST https://<PUBLIC_BASE_URL>/twilio/voice
```

Configure the TwiML App used by the browser Voice SDK with the same voice request
URL:

```text
POST https://<PUBLIC_BASE_URL>/twilio/voice
```

Set `TWILIO_TWIML_APP_SID` to that TwiML App SID. The application returns TwiML
that connects calls to:

```text
wss://<PUBLIC_BASE_URL>/twilio/media-stream?callSessionId=...&token=...
```

The media stream URL is protected with a per-call `CallSession.mediaStreamToken`.
In production, Twilio webhooks are validated with `X-Twilio-Signature` and
`TWILIO_AUTH_TOKEN`.

## Main pages

- `/` public landing page and contact form.
- `/login` login and tenant registration.
- `/dashboard` tenant workspace.
- `/call` authenticated Twilio Browser Voice client.
- `/recalls` authenticated recall queue.

## API and webhook routes

- `GET /health` health check.
- `POST /api/contact` sends a contact request email to `CONTACT_EMAIL`.
- `GET /api/auth/me` returns the current cookie session.
- `POST /api/auth/login` logs in an existing user.
- `POST /api/auth/register` creates a tenant and owner user.
- `POST /api/auth/logout` clears the auth cookie.
- `POST /api/auth/bootstrap` creates the first owner user only if no users exist.
- `POST /api/calls/browser-intent` creates a 10-minute tenant call intent.
- `GET /api/recalls` lists pending leads for the logged-in tenant.
- `POST /api/recalls/:leadId/called` marks a lead as called.
- `POST /twilio/voice` returns TwiML that starts the media stream.
- `POST /twilio/status` finalizes completed, failed, busy, no-answer, or canceled calls.
- `GET /twilio/token` returns an authenticated browser Voice access token.
- `WS /twilio/media-stream` receives Twilio audio and streams synthesized replies.

## Call flow

1. Twilio sends the incoming PSTN call, or browser Voice call, to `/twilio/voice`.
2. The route resolves the tenant from the destination number or browser call intent.
3. Plan limits are checked before accepting the call.
4. A `CallSession` is created with a one-time media stream token.
5. Twilio connects to `/twilio/media-stream`.
6. Caller audio is sent to OpenAI Realtime as `g711_ulaw`.
7. Realtime text responses are synthesized by Deepgram and streamed back to Twilio.
8. The assistant confirms required intake fields and calls `save_intake_lead`.
9. The saved lead appears in `/recalls` and is emailed if the client has `notificationEmail`.
10. The assistant calls `end_call`, which completes the Twilio call through the REST API.

## Testing

Run the barge-in utility harness:

```text
npm run test:harness
```

End-to-end PSTN test:

1. Start the app with a public HTTPS/WSS URL in `PUBLIC_BASE_URL`.
2. Point the Twilio phone number voice webhook to `/twilio/voice`.
3. Call `TWILIO_INBOUND_NUMBER`.
4. Confirm a `CallSession` and `IntakeLead` are created.

Browser Voice test:

1. Register or log in at `/login`.
2. Open `/call` in Chrome or Firefox and allow microphone access.
3. Leave the destination blank to use `TWILIO_INBOUND_NUMBER`, or enter an E.164 number.
4. Start the call; the page creates `/api/calls/browser-intent` before dialing.

## Notes

- Browser-protected pages and APIs use the signed cookie named by `AUTH_COOKIE_NAME`.
- Registration creates a tenant on the default `PLAN_500` plan.
- `ClientIntakeConfig.steps` can override the default intake fields per tenant.
- Lead notification emails are sent only when `Client.notificationEmail` is set.
- Cost logging is informational and controlled by the `*_COST_*` environment variables.
