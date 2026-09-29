import { render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

import DownloadLocalButton from './DownloadLocalButton.vue'

vi.mock(import('../../../scripts/posthog'))

const UA = {
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  freeBsd:
    'Mozilla/5.0 (X11; FreeBSD amd64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
}

describe('DownloadLocalButton', () => {
  it.for([
    {
      label: 'Windows',
      userAgent: UA.windows,
      buttons: [
        [
          'DOWNLOAD DESKTOP Windows x64',
          'https://comfy.org/download/windows/nsis/x64'
        ]
      ]
    },
    {
      label: 'Linux',
      userAgent: UA.linux,
      buttons: [
        [
          'DOWNLOAD DESKTOP Linux x64 (AppImage)',
          'https://download.comfy.org/linux/appimage/x64'
        ]
      ]
    },
    {
      label: 'an unrecognized desktop',
      userAgent: UA.freeBsd,
      buttons: [
        [
          'DOWNLOAD DESKTOP Windows x64',
          'https://comfy.org/download/windows/nsis/x64'
        ],
        [
          'DOWNLOAD DESKTOP macOS (Apple Silicon)',
          'https://download.comfy.org/mac/dmg/arm64'
        ]
      ]
    }
  ])(
    'names the installer each button downloads on $label',
    async ({ userAgent, buttons }) => {
      vi.stubGlobal('navigator', {
        userAgent,
        maxTouchPoints: 0
      } satisfies Partial<Navigator>)

      render(DownloadLocalButton)

      const links = await screen.findAllByRole('link')
      expect(
        links.map((link) => [
          link.textContent.replace(/\s+/g, ' ').trim(),
          link.getAttribute('href')
        ])
      ).toEqual(buttons)
    }
  )
})
