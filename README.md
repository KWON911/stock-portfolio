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
KIS_ENV=production
```

서버 API는 `api/prices.ts`이며, 브라우저는 이 엔드포인트만 호출합니다. APP_SECRET과 access token은 프런트엔드 코드 및 API 응답에 포함되지 않습니다.

KIS의 계좌 없이 쓸 수 있는 USD/KRW 단일 현재환율 공개 API 사양은 공식 예제로 확인하지 못했습니다. 현재 `api/kis/exchangeRate.ts`는 공급자를 분리하고, 필요 시 `KIS_USDKRW_FALLBACK` 값을 사용합니다. 공식 환율 엔드포인트가 확인되면 해당 파일만 교체하면 됩니다.
