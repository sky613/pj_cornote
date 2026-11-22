import type {
  AiErrorCode,
  GeneratedQuestions,
  GenerateQuestionsRequest,
  GradeAnswerRequest,
  GradeResult,
  ProviderName,
} from './schemas.ts'

export interface AiCallOptions {
  signal?: AbortSignal
}

/** AI 구현체 경계. OpenAI / Mock 외의 공급자도 이 인터페이스만 구현하면 된다. */
export interface AiProvider {
  readonly name: ProviderName
  generateQuestions(input: GenerateQuestionsRequest, options?: AiCallOptions): Promise<GeneratedQuestions>
  gradeAnswer(input: GradeAnswerRequest, options?: AiCallOptions): Promise<GradeResult>
}

export class AiError extends Error {
  readonly code: AiErrorCode

  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.name = 'AiError'
    this.code = code
  }
}

/** 사용자에게 보여줄 한국어 오류 메시지. 내부 상세(원문, 스택)는 포함하지 않는다. */
export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  invalid_input: '요청 형식이 올바르지 않습니다.',
  payload_too_large: '노트가 너무 깁니다. 내용을 나눠서 요청해 주세요.',
  unauthorized: '로그인이 필요합니다.',
  rate_limited: '오늘 사용할 수 있는 AI 요청 횟수를 모두 사용했습니다.',
  timeout: 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
  upstream: 'AI 서비스에 일시적인 문제가 있습니다.',
  invalid_output: 'AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.',
  refused: 'AI가 이 요청을 처리하지 않았습니다.',
  network: '네트워크에 연결할 수 없습니다.',
  internal: '알 수 없는 오류가 발생했습니다.',
}
