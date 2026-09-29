/**
 * KIS의 공개 현재가 API는 계좌 없이 쓸 수 있는 USD/KRW 단일 현재환율 사양을 공식 예제로 확인하지 못했습니다.
 * 따라서 환율 공급자는 분리해 두고, 검증된 KIS 엔드포인트가 확인되면 이 함수만 교체합니다.
 */
export async function getUsdKrwRate(): Promise<number | undefined> {
  const runtimeEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  const configured = Number(runtimeEnv.KIS_USDKRW_FALLBACK)
  return Number.isFinite(configured) && configured > 0 ? configured : undefined
}
