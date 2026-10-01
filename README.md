# 나의 포트폴리오

## 로컬 화면 개발

```bash
npm install
npm run dev
```

Vite 개발 서버는 화면만 제공합니다. KIS 서버 API까지 함께 실행하려면 Vercel CLI를 사용합니다.

```bash
npx vercel dev
```

## 환경 변수

`.env.example`을 `.env.local`로 복사하고 아래 값을 설정합니다. 절대 `VITE_` 접두사를 사용하지 않습니다.

```bash
KIS_APP_KEY=
KIS_APP_SECRET=
```

서버 API는 `api/prices.ts`이며, 브라우저는 이 엔드포인트만 호출합니다. `KIS_APP_SECRET`과 access token은 프런트엔드 코드 및 API 응답에 포함되지 않습니다.

서버 API는 KIS OAuth Client Credentials로 access token을 발급받은 뒤 국내·해외 현재가와 USD/KRW 환율을 조회합니다.
# Token and refresh policy

- Market prices refresh once after holdings load, then every five minutes while the tab is visible. When returning to a visible tab, the app refreshes immediately only if the last successful refresh was at least five minutes ago.
- A successful or failed manual request starts a five-minute manual cooldown. Automatic refreshes use the same server endpoint but do not consume that manual cooldown.
- KIS access tokens stay server-side. A hot Vercel instance reuses its memory cache; when `UPSTASH_REDIS_REST_KV_REST_API_URL` and `UPSTASH_REDIS_REST_KV_REST_API_TOKEN` are configured, the token is also persisted under a server-only Redis key. The older `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` names remain compatible fallbacks.
- Production requires the Redis token store when no valid memory token exists, preventing a Redis outage from triggering repeated KIS token issuance.

