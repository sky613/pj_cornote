// 로컬 쓰기가 일어났음을 동기화 매니저에 알리는 경량 이벤트 버스.
const target = new EventTarget()

export function emitLocalChange(): void {
  target.dispatchEvent(new Event('change'))
}

export function onLocalChange(listener: () => void): () => void {
  target.addEventListener('change', listener)
  return () => target.removeEventListener('change', listener)
}
