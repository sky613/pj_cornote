import { act, renderHook } from '@testing-library/react'
import { db } from '@/db/local/db'
import { createNote, updateNote } from './repository'
import { useAutoSave } from './useAutoSave'

describe('useAutoSave', () => {
  afterEach(() => vi.useRealTimers())

  it('debounces and merges rapid changes into a single save', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => 'saved' as const)
    const { result } = renderHook(() => useAutoSave<{ title: string; body: string }>(save, 600))

    act(() => result.current.schedule({ title: 'a' }))
    act(() => vi.advanceTimersByTime(300))
    act(() => result.current.schedule({ body: 'b' }))
    expect(result.current.status).toBe('dirty')
    act(() => vi.advanceTimersByTime(599))
    expect(save).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ title: 'a', body: 'b' })
    expect(result.current.status).toBe('saved')
  })

  it('flushes pending changes on unmount so nothing typed is lost', async () => {
    const note = await createNote()
    const { result, unmount } = renderHook(() =>
      useAutoSave<{ title: string }>(async (patch) => (await updateNote(note.id, patch)).status),
    )
    act(() => result.current.schedule({ title: '닫기 직전 입력' }))
    unmount()
    await vi.waitFor(async () => expect((await db.notes.get(note.id))?.title).toBe('닫기 직전 입력'))
  })

  it('keeps the input and reports an error when saving fails', async () => {
    let fail = true
    const save = vi.fn(async () => {
      if (fail) throw new Error('quota')
      return 'saved' as const
    })
    const { result } = renderHook(() => useAutoSave<{ title: string }>(save, 10))
    act(() => result.current.schedule({ title: 'x' }))
    await act(async () => result.current.flush())
    expect(result.current.status).toBe('error')
    fail = false
    await act(async () => result.current.flush())
    expect(save).toHaveBeenLastCalledWith({ title: 'x' })
    expect(result.current.status).toBe('saved')
  })
})
