import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); delete window.MacoBridge })

describe('stage rewards', () => {
  it('requires a run and provides only explicitly enabled standalone mock results', async () => {
    const sdk = await import('../sdk/index')
    await expect(sdk.completeStage(1)).rejects.toThrow()
    vi.spyOn(window, 'parent', 'get').mockReturnValue(window)
    sdk.mountMacoIframeGame(() => ({ destroy() {} }), { allowStandalone: true, mockStages: true })
    sdk.startRun()
    await expect(sdk.completeStage(1)).resolves.toEqual({ recorded: true, xpAwarded: 5, mode: 'mock' })
    await expect(sdk.completeStage(1)).resolves.toEqual({ recorded: false, xpAwarded: 5, mode: 'mock' })
    await expect(sdk.completeStage(0)).rejects.toThrow()
  })
})

it('accepts stage replies only from the handshaken parent origin', async () => {
  const sent: Array<{ type: string, payload?: { id: string, stage?: number } }> = []
  const parent = { postMessage: (message: { type: string, payload?: { id: string, stage?: number } }) => sent.push(message) }
  vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window)
  const sdk = await import('../sdk/index')
  sdk.mountMacoIframeGame(() => ({ destroy() {} }))
  const send = (origin: string, data: object) => window.dispatchEvent(new MessageEvent('message', { origin, source: parent as unknown as MessageEventSource, data }))
  send('https://macogame.com', { protocol: sdk.MACO_GAME_PROTOCOL, type: 'host-ready' })
  sdk.startRun()
  const runId = sent.find(message => message.type === 'stage-run-request')!.payload!.id
  send('https://attacker.example', { protocol: sdk.MACO_GAME_PROTOCOL, type: 'stage-response', payload: { id: runId, data: { runId: 'forged' } } })
  send('https://macogame.com', { protocol: sdk.MACO_GAME_PROTOCOL, type: 'stage-response', payload: { id: runId, data: { runId: 'real' } } })
  const completion = sdk.completeStage(1)
  await Promise.resolve()
  await Promise.resolve()
  const stage = sent.find(message => message.type === 'stage-complete-request')!
  expect(stage.payload?.stage).toBe(1)
  send('https://macogame.com', { protocol: sdk.MACO_GAME_PROTOCOL, type: 'stage-response', payload: { id: stage.payload!.id, data: { recorded: true, xpAwarded: 5, mode: 'live' } } })
  await expect(completion).resolves.toEqual({ recorded: true, xpAwarded: 5, mode: 'live' })
})
