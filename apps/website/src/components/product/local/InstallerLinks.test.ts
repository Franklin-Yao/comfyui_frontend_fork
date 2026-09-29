import userEvent from '@testing-library/user-event'
import { render, screen, within } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { captureDownloadClick } from '../../../scripts/posthog'
import InstallerLinks from './InstallerLinks.vue'

vi.mock(import('../../../scripts/posthog'))

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
}

function visitWith(userAgent: string) {
  vi.stubGlobal('navigator', {
    userAgent,
    maxTouchPoints: 0
  } satisfies Partial<Navigator>)
}

describe('InstallerLinks', () => {
  it.for([
    { label: 'Windows', userAgent: UA.windows },
    { label: 'macOS', userAgent: UA.mac },
    { label: 'an unrecognized desktop', userAgent: UA.linux }
  ])('lists every installer on $label', async ({ userAgent }) => {
    visitWith(userAgent)

    render(InstallerLinks)

    const installers = within(
      await screen.findByRole('list', { name: 'All installers:' })
    ).getAllByRole('link')
    expect(
      installers.map((link) => [
        link.textContent.trim(),
        link.getAttribute('href')
      ])
    ).toEqual([
      ['Windows x64', 'https://comfy.org/download/windows/nsis/x64'],
      [
        'Windows ARM64 (NVIDIA GPU)',
        'https://comfy.org/download/windows/nsis/arm64'
      ],
      ['macOS (Apple Silicon)', 'https://download.comfy.org/mac/dmg/arm64']
    ])
  })

  it('lists no installers on a phone', async () => {
    visitWith(UA.iphone)

    render(InstallerLinks)
    await nextTick()

    expect(screen.queryByRole('list')).toBeNull()
  })

  it('reports the download under the chosen installer platform', async () => {
    visitWith(UA.windows)
    render(InstallerLinks)
    const macInstaller = await screen.findByRole('link', {
      name: 'macOS (Apple Silicon)'
    })
    macInstaller.addEventListener('click', (event) => event.preventDefault(), {
      once: true
    })

    await userEvent.setup().click(macInstaller)

    expect(captureDownloadClick).toHaveBeenCalledExactlyOnceWith('mac')
  })
})
