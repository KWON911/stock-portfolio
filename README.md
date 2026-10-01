# 나의 포트폴리오

## 로컬 화면 개발

```bash
npm install
npm run dev
```

Vite 개발 서버는 화면만 제공합니다. 토스증권 서버 API까지 함께 실행하려면 Vercel CLI를 사용합니다.

```bash
npx vercel dev
```

## 환경 변수

`.env.example`을 `.env.local`로 복사하고 아래 값을 설정합니다. 절대 `VITE_` 접두사를 사용하지 않습니다.

```bash
TOSS_CLIENT_ID=
TOSS_CLIENT_SECRET=
```

서버 API는 `api/prices.ts`이며, 브라우저는 이 엔드포인트만 호출합니다. APP_SECRET과 access token은 프런트엔드 코드 및 API 응답에 포함되지 않습니다.

서버 API는 토스증권 OAuth Client Credentials로 access token을 발급받은 뒤 현재가와 USD/KRW 환율을 조회합니다. 환율 API가 일시적으로 실패할 때만 선택적으로 `TOSS_USDKRW_FALLBACK` 값을 설정할 수 있습니다.
# Token and refresh policy

- Market prices are refreshed only by the user pressing **시세 갱신**. Automatic initial, interval, and visibility refresh are disabled by default.
- A successful or failed manual request starts a five-minute client cooldown to avoid repeated Toss API requests.
- Toss access tokens stay server-side. A hot Vercel instance reuses its memory cache; when `UPSTASH_REDIS_REST_KV_REST_API_URL` and `UPSTASH_REDIS_REST_KV_REST_API_TOKEN` are configured, the token is also persisted under a server-only Redis key. The older `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` names remain compatible fallbacks.
- Without those optional Upstash variables the app remains functional in memory-only mode, but a Vercel cold start can require a new token.

