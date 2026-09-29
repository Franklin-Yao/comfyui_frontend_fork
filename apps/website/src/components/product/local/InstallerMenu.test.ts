import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { captureDownloadClick } from '../../../scripts/posthog'
import InstallerMenu from './InstallerMenu.vue'

vi.mock(import('../../../scripts/posthog'))

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  freeBsd:
    'Mozilla/5.0 (X11; FreeBSD amd64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
}

function visitWith(userAgent: string) {
  vi.stubGlobal('navigator', {
    userAgent,
    maxTouchPoints: 0
  } satisfies Partial<Navigator>)
}

async function openMenu() {
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'All installers' })
  )
  return user
}

describe('InstallerMenu', () => {
  it.for([
    { label: 'a recognized desktop', userAgent: UA.linux },
    { label: 'an unrecognized desktop', userAgent: UA.freeBsd }
  ])('lists every installer on $label', async ({ userAgent }) => {
    visitWith(userAgent)
    render(InstallerMenu)

    await openMenu()

    expect(
      screen
        .getAllByRole('menuitem')
        .map((item) => [item.textContent.trim(), item.getAttribute('href')])
    ).toEqual([
      ['Windows x64', 'https://comfy.org/download/windows/nsis/x64'],
      ['Windows ARM64', 'https://comfy.org/download/windows/nsis/arm64'],
      ['macOS (Apple Silicon)', 'https://download.comfy.org/mac/dmg/arm64'],
      ['Linux x64 (AppImage)', 'https://download.comfy.org/linux/appimage/x64'],
      [
        'Linux ARM64 (AppImage)',
        'https://download.comfy.org/linux/appimage/arm64'
      ]
    ])
  })

  it('offers no installers on a phone', async () => {
    visitWith(UA.iphone)

    render(InstallerMenu)
    await nextTick()

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('reports the download under the chosen installer platform', async () => {
    visitWith(UA.mac)
    render(InstallerMenu)
    const user = await openMenu()
    const linuxInstaller = screen.getByRole('menuitem', {
      name: 'Linux ARM64 (AppImage)'
    })
    linuxInstaller.addEventListener(
      'click',
      (event) => event.preventDefault(),
      { once: true }
    )

    await user.click(linuxInstaller)

    expect(captureDownloadClick).toHaveBeenCalledExactlyOnceWith('linux')
  })
})
