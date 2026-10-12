export function safeAuthReturnTo(value: string | null, fallback: string): string {
  return value && /^\/(?!\/)/.test(value) && value.length <= 500 ? value : fallback;
}
