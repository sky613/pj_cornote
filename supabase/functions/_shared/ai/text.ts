// 텍스트 유틸: 근거 문장 검증, 간단한 한국어/영어 토큰화 (Mock AI 용).

/** 비교용 정규화: 공백 축약, 따옴표 통일, 소문자화. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** sourceExcerpt 가 사용자 본문에 실제로 존재하는지 확인한다. */
export function isExcerptGrounded(content: string, excerpt: string): boolean {
  const needle = normalizeForMatch(excerpt)
  if (!needle) return false
  return normalizeForMatch(content).includes(needle)
}

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?。？！])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// 흔한 조사/어미. 길이 내림차순으로 검사해 가장 긴 것부터 제거한다.
const SUFFIXES = [
  '에서는', '으로는', '이라는', '에게서', '입니다', '합니다', '이며', '에서', '으로', '에게', '까지', '부터',
  '이다', '하는', '했다', '한다', '라는', '와의', '과의', '은', '는', '이', '가', '을', '를', '의', '에', '로',
  '와', '과', '도', '만', '다',
].sort((a, b) => b.length - a.length)

const STOPWORDS = new Set([
  '그리고', '그러나', '하지만', '또한', '이것', '그것', '저것', '있다', '없다', '것', '수', '등', '및', '때문',
  '통해', '위해', '대한', '같은', '경우', '사용',
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'be', 'for', 'on', 'with',
  'as', 'by', 'it', 'this', 'that', 'at', 'from',
])

export function stem(token: string): string {
  const lower = token.toLowerCase()
  if (!/[가-힣]/.test(lower)) return lower
  for (const suffix of SUFFIXES) {
    if (lower.length - suffix.length >= 2 && lower.endsWith(suffix)) {
      return lower.slice(0, -suffix.length)
    }
  }
  return lower
}

/** 의미 있는 토큰(어간) 목록. 2글자 미만과 불용어는 제외. */
export function contentTokens(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stem)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}
