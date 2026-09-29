import type { WebSocketRoute } from '@playwright/test'
import { expect, mergeTests } from '@playwright/test'

import { webSocketFixture } from '@e2e/fixtures/ws'

import enMessages from '@/locales/en/main.json' with { type: 'json' }
import type { FeatureFlagsWsMessage } from '@/platform/remote/comfyui/execution/types'
import type { AgentWsEvent } from '@/workbench/extensions/agent/schemas/agentApiSchema'

import {
  MESSAGE_DONE_EVENT,
  agentTest,
  messageDeltaEvent
} from '@e2e/tests/agent/agentPanelMocks'

const COLLAPSED_COUNT = 12
const MODEL_COUNT = 13
const HIDDEN_MODEL = `mesh-${MODEL_COUNT - 1}.glb`
const VISIBLE_MODELS = Array.from(
  { length: COLLAPSED_COUNT },
  (_, index) => `mesh-${index}.glb`
)

const MODEL_REPLY = Array.from(
  { length: MODEL_COUNT },
  (_, index) => `- ![mesh-${index}](/api/view?filename=mesh-${index}.glb)`
).join('\n')

type WsFrame =
  | AgentWsEvent
  | { type: 'feature_flags'; data: FeatureFlagsWsMessage }

function pushEvent(ws: WebSocketRoute, event: WsFrame): void {
  ws.send(JSON.stringify(event))
}

const test = mergeTests(agentTest, webSocketFixture)

test.describe('Agent reply assets', { tag: '@cloud' }, () => {
  test.use({ connectWebSocketToServer: false })

  test('looks up 3D previews only for the reply assets on screen', async ({
    agentPanel,
    postedMessages,
    getWebSocket
  }) => {
    // The new-test video gate runs with SLOW_MO=250; leave headroom for the
    // 13-tile expand path while retaining bounded failure reporting.
    test.setTimeout(60_000)

    const lookedUpModels = await agentPanel.mockReplyAssetPreviews()
    await test.step('send a reply containing model assets', async () => {
      await agentPanel.open()
      await agentPanel.sendMessage('show me every mesh')
      await expect.poll(() => postedMessages.length).toBeGreaterThanOrEqual(1)
      const ws = await getWebSocket()
      pushEvent(ws, { type: 'feature_flags', data: { assets: true } })
      pushEvent(ws, messageDeltaEvent(MODEL_REPLY))
      pushEvent(ws, MESSAGE_DONE_EVENT)
    })

    await test.step('render only the collapsed model previews', async () => {
      await expect(agentPanel.replyAssetTiles).toHaveCount(COLLAPSED_COUNT)
      await expect(agentPanel.replyAssetThumbnails).toHaveCount(COLLAPSED_COUNT)
      expect([...new Set(lookedUpModels)].sort()).toEqual(
        [...VISIBLE_MODELS].sort()
      )
    })

    await test.step('expand and render the remaining model preview', async () => {
      await agentPanel.root
        .getByRole('button', { name: enMessages.agent.showMore })
        .click()
      await expect(agentPanel.replyAssetTiles).toHaveCount(MODEL_COUNT)
      await expect(agentPanel.replyAssetThumbnails).toHaveCount(MODEL_COUNT)
      await expect.poll(() => new Set(lookedUpModels).size).toBe(MODEL_COUNT)
      expect(lookedUpModels).toContain(HIDDEN_MODEL)
    })
  })
})
