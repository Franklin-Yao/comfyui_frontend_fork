import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromPartial } from '@total-typescript/shoehorn'
import type * as THREE from 'three'

import type Load3d from '@/extensions/core/load3d/Load3d'
import { generateModelThumbnail } from './modelThumbnail'

type ThumbnailLoad3d = Pick<Load3d, 'loadModel' | 'captureThumbnail' | 'remove'>

const isAssetPreviewSupported = vi.hoisted(() => vi.fn(() => false))
const persistThumbnail = vi.hoisted(() =>
  vi.fn(async (_assetName: string, _blob: Blob) => {})
)
vi.mock(import('@/platform/assets/utils/assetPreviewUtil'), () => ({
  isAssetPreviewSupported,
  persistThumbnail
}))

const createLoad3d = vi.hoisted(() => vi.fn<() => ThumbnailLoad3d>())
vi.mock<unknown>(import('@/extensions/core/load3d/createLoad3d'), () => ({
  createLoad3d
}))

const reportError = vi.hoisted(() => vi.fn())
vi.mock(import('@/platform/telemetry/reportError'), () => ({ reportError }))

const releaseSharedRenderer = vi.hoisted(() => vi.fn())
vi.mock(import('@/renderer/three/sharedWebGLRenderer'), { spy: true })

import { acquireSharedRenderer } from '@/renderer/three/sharedWebGLRenderer'

function mockInstance(
  overrides: Partial<ThumbnailLoad3d> = {}
): ThumbnailLoad3d {
  return {
    loadModel: vi.fn().mockResolvedValue('loaded'),
    captureThumbnail: vi.fn().mockResolvedValue('data:image/png;base64,thumb'),
    remove: vi.fn(),
    ...overrides
  }
}

describe('generateModelThumbnail', () => {
  beforeEach(() => {
    createLoad3d.mockReset()
    isAssetPreviewSupported.mockReset().mockReturnValue(false)
    persistThumbnail.mockReset()
    reportError.mockReset()
    releaseSharedRenderer.mockReset()
    vi.mocked(acquireSharedRenderer).mockReturnValue({
      renderer: fromPartial<THREE.WebGLRenderer>({}),
      release: releaseSharedRenderer
    })
  })

  it('renders offscreen, returns the data url, and disposes the instance', async () => {
    const instance = mockInstance()
    createLoad3d.mockReturnValue(instance)

    const result = await generateModelThumbnail(
      '/api/view?filename=a.glb',
      'a.glb'
    )

    expect(result).toEqual({
      status: 'rendered',
      dataUrl: 'data:image/png;base64,thumb'
    })
    expect(instance.loadModel).toHaveBeenCalledWith(
      '/api/view?filename=a.glb',
      undefined,
      { silent: true }
    )
    expect(instance.remove).toHaveBeenCalledTimes(1)
    expect(persistThumbnail).not.toHaveBeenCalled()
  })

  it('releases the queue the moment a running render is aborted', async () => {
    vi.useFakeTimers()
    try {
      const stalled = mockInstance({
        loadModel: vi.fn<Load3d['loadModel']>(() => new Promise(() => {}))
      })
      const next = mockInstance()
      createLoad3d.mockReturnValueOnce(stalled).mockReturnValueOnce(next)
      const controller = new AbortController()

      const abortedRun = generateModelThumbnail(
        '/slow.glb',
        'slow.glb',
        controller.signal
      )
      const nextRun = generateModelThumbnail('/next.glb', 'next.glb')
      await vi.advanceTimersByTimeAsync(0)
      expect(createLoad3d).toHaveBeenCalledTimes(1)

      controller.abort()
      await vi.advanceTimersByTimeAsync(0)

      await expect(abortedRun).resolves.toEqual({ status: 'cancelled' })
      await expect(nextRun).resolves.toEqual({
        status: 'rendered',
        dataUrl: 'data:image/png;base64,thumb'
      })
      expect(stalled.remove).toHaveBeenCalledOnce()
      // The abandoned `stalled` render's underlying withTimeout deadline is
      // not cancelled by the caller abort (see module doc: the transfer and
      // parse are not abortable and run to completion in the background),
      // so a live timer for it — and for `next`'s own in-flight deadline —
      // is expected here, not zero.
      expect(reportError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips a queued render whose caller aborted before its turn', async () => {
    const blocked = mockInstance({
      loadModel: vi.fn<Load3d['loadModel']>(() => new Promise(() => {}))
    })
    const skipped = mockInstance()
    createLoad3d.mockReturnValueOnce(blocked).mockReturnValueOnce(skipped)
    const controller = new AbortController()

    vi.useFakeTimers()
    try {
      const blockedRun = generateModelThumbnail('/stuck.glb', 'stuck.glb')
      const skippedRun = generateModelThumbnail(
        '/next.glb',
        'next.glb',
        controller.signal
      )
      controller.abort()
      await vi.advanceTimersByTimeAsync(15_000)

      await expect(blockedRun).resolves.toEqual({ status: 'failed' })
      await expect(skippedRun).resolves.toEqual({ status: 'cancelled' })
      expect(createLoad3d).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a failed render and still disposes the instance', async () => {
    const instance = mockInstance({
      loadModel: vi.fn().mockRejectedValue(new Error('bad model'))
    })
    createLoad3d.mockReturnValue(instance)

    const result = await generateModelThumbnail('/broken.glb', 'broken.glb')

    expect(result).toEqual({ status: 'failed' })
    expect(instance.remove).toHaveBeenCalledTimes(1)
  })

  it('reports a non-loaded model outcome as a failure', async () => {
    const instance = mockInstance({
      loadModel: vi.fn().mockResolvedValue('empty')
    })
    createLoad3d.mockReturnValue(instance)

    await expect(
      generateModelThumbnail('/unknown.bin', 'unknown.bin')
    ).resolves.toEqual({ status: 'failed' })
    expect(reportError).toHaveBeenCalledOnce()
  })

  it('reports renderer acquisition failures as a failed result', async () => {
    vi.mocked(acquireSharedRenderer).mockImplementationOnce(() => {
      throw new Error('WebGL context unavailable')
    })

    await expect(
      generateModelThumbnail('/model.glb', 'model.glb')
    ).resolves.toEqual({ status: 'failed' })
    expect(reportError).toHaveBeenCalledOnce()
    expect(createLoad3d).not.toHaveBeenCalled()
  })

  it('redacts credentials from protocol-relative URLs before reporting', async () => {
    const instance = mockInstance({
      loadModel: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'Could not load //user:secret@example.com/model.glb?token=private'
          )
        )
    })
    createLoad3d.mockReturnValue(instance)

    await generateModelThumbnail(
      '//user:secret@example.com/model.glb?token=private',
      'model.glb'
    )

    expect(reportError.mock.calls[0][0]).toMatchObject({
      message: 'Could not load //example.com/model.glb'
    })
    expect(reportError.mock.calls[0][0].stack).not.toContain('secret')
    expect(reportError.mock.calls[0][0].stack).not.toContain('private')
  })

  it('runs generations one at a time', async () => {
    let releaseFirst!: () => void
    const first = mockInstance({
      loadModel: vi.fn(
        () =>
          new Promise<'loaded'>((resolve) => {
            releaseFirst = () => resolve('loaded')
          })
      )
    })
    const second = mockInstance()
    createLoad3d.mockReturnValueOnce(first).mockReturnValueOnce(second)

    const firstRun = generateModelThumbnail('/one.glb', 'one.glb')
    const secondRun = generateModelThumbnail('/two.glb', 'two.glb')
    await vi.waitFor(() => expect(createLoad3d).toHaveBeenCalledTimes(1))

    releaseFirst()
    await firstRun
    expect(releaseSharedRenderer).not.toHaveBeenCalled()
    await secondRun

    expect(createLoad3d).toHaveBeenCalledTimes(2)
    expect(releaseSharedRenderer).toHaveBeenCalledOnce()
  })

  it('rejects a 33rd queued render and restores capacity after cancellation', async () => {
    const controllers = Array.from({ length: 32 }, () => new AbortController())
    const stalled = mockInstance({
      loadModel: vi.fn<Load3d['loadModel']>(() => new Promise(() => {}))
    })
    createLoad3d.mockReturnValue(stalled)

    const accepted = controllers.map((controller, index) =>
      generateModelThumbnail(
        `/queued-${index}.glb`,
        `queued-${index}.glb`,
        controller.signal
      )
    )
    await vi.waitFor(() => expect(stalled.loadModel).toHaveBeenCalledOnce())

    await expect(
      generateModelThumbnail('/busy.glb', 'busy.glb')
    ).resolves.toEqual({ status: 'busy' })

    controllers[0].abort()
    await expect(accepted[0]).resolves.toEqual({ status: 'cancelled' })

    const restoredController = new AbortController()
    const restored = generateModelThumbnail(
      '/restored.glb',
      'restored.glb',
      restoredController.signal
    )
    restoredController.abort()
    controllers.slice(1).forEach((controller) => controller.abort())

    await expect(Promise.all(accepted.slice(1))).resolves.toEqual(
      Array.from({ length: 31 }, () => ({ status: 'cancelled' }))
    )
    await expect(restored).resolves.toEqual({ status: 'cancelled' })
    expect(createLoad3d).toHaveBeenCalledOnce()
    expect(releaseSharedRenderer).toHaveBeenCalledOnce()
  })

  it('times out a stuck load, disposes it, and advances the queue', async () => {
    vi.useFakeTimers()
    try {
      const stuck = mockInstance({
        loadModel: vi.fn<Load3d['loadModel']>(() => new Promise(() => {}))
      })
      const next = mockInstance()
      createLoad3d.mockReturnValueOnce(stuck).mockReturnValueOnce(next)

      const stuckRun = generateModelThumbnail('/stuck.glb', 'stuck.glb')
      const nextRun = generateModelThumbnail('/next.glb', 'next.glb')
      await vi.waitFor(() => expect(createLoad3d).toHaveBeenCalledTimes(1))

      await vi.advanceTimersByTimeAsync(15_000)

      await expect(stuckRun).resolves.toEqual({ status: 'failed' })
      await expect(nextRun).resolves.toEqual({
        status: 'rendered',
        dataUrl: 'data:image/png;base64,thumb'
      })
      expect(stuck.remove).toHaveBeenCalledTimes(1)
      expect(next.loadModel).toHaveBeenCalledWith('/next.glb', undefined, {
        silent: true
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out a stuck capture and advances the queue', async () => {
    vi.useFakeTimers()
    try {
      const stuck = mockInstance({
        captureThumbnail: vi.fn(() => new Promise<string>(() => {}))
      })
      const next = mockInstance()
      createLoad3d.mockReturnValueOnce(stuck).mockReturnValueOnce(next)

      const stuckRun = generateModelThumbnail('/stuck.glb', 'stuck.glb')
      const nextRun = generateModelThumbnail('/next.glb', 'next.glb')
      await vi.waitFor(() => expect(stuck.captureThumbnail).toHaveBeenCalled())

      await vi.advanceTimersByTimeAsync(15_000)

      await expect(stuckRun).resolves.toEqual({ status: 'failed' })
      await expect(nextRun).resolves.toEqual({
        status: 'rendered',
        dataUrl: 'data:image/png;base64,thumb'
      })
      expect(stuck.remove).toHaveBeenCalledOnce()
      expect(next.captureThumbnail).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('persists a supported asset thumbnail after rendering', async () => {
    const instance = mockInstance()
    createLoad3d.mockReturnValue(instance)
    isAssetPreviewSupported.mockReturnValue(true)
    const blob = new Blob(['thumbnail'], { type: 'image/png' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(blob))

    await generateModelThumbnail('/model.glb', 'model.glb')
    await vi.waitFor(() => expect(persistThumbnail).toHaveBeenCalledOnce())

    const [assetName, persistedBlob] = persistThumbnail.mock.calls[0]
    expect(assetName).toBe('model.glb')
    expect(persistedBlob).toBeInstanceOf(Blob)
    expect(persistedBlob.type).toBe('image/png')
    await expect(persistedBlob.text()).resolves.toBe('thumbnail')
  })
})
