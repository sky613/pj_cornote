import { selectProvider } from './selectProvider.ts'

const env = (values: Record<string, string>) => (key: string) => values[key]

describe('selectProvider', () => {
  it('uses mock without an API key', () => {
    expect(selectProvider(env({})).name).toBe('mock')
    expect(selectProvider(env({ AI_PROVIDER: 'openai' })).name).toBe('mock')
  })
  it('uses OpenAI when a key is present unless mock is forced', () => {
    expect(selectProvider(env({ OPENAI_API_KEY: 'sk-x' })).name).toBe('openai')
    expect(selectProvider(env({ OPENAI_API_KEY: 'sk-x', AI_PROVIDER: 'mock' })).name).toBe('mock')
  })
})
