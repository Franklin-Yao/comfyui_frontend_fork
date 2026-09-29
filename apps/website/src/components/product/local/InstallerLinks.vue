<script setup lang="ts">
import type { Locale, TranslationKey } from '../../../i18n/translations'
import { useId } from 'vue'

import type { Platform } from '../../../composables/useDownloadUrl'
import {
  downloadUrls,
  useDownloadUrl
} from '../../../composables/useDownloadUrl'
import { t } from '../../../i18n/translations'
import { captureDownloadClick } from '../../../scripts/posthog'

const { locale = 'en' } = defineProps<{ locale?: Locale }>()

const { platform, showFallback } = useDownloadUrl()

const labelId = useId()

const installers: {
  platform: Platform
  href: string
  label: TranslationKey
}[] = [
  {
    platform: 'windows',
    href: downloadUrls.windows,
    label: 'download.hero.installers.windowsX64'
  },
  {
    platform: 'windows',
    href: downloadUrls.windowsArm,
    label: 'download.hero.installers.windowsArm64'
  },
  {
    platform: 'mac',
    href: downloadUrls.macArm,
    label: 'download.hero.installers.macArm64'
  }
]
</script>

<template>
  <div
    v-if="platform || showFallback"
    class="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-primary-comfy-canvas/70"
  >
    <span :id="labelId">{{ t('download.hero.installers.label', locale) }}</span>
    <ul
      :aria-labelledby="labelId"
      class="flex flex-wrap items-center gap-x-4 gap-y-1"
    >
      <li v-for="installer in installers" :key="installer.href">
        <a
          :href="installer.href"
          target="_blank"
          rel="noopener noreferrer"
          data-astro-prefetch="false"
          class="underline underline-offset-2 hover:text-primary-comfy-canvas"
          @click="captureDownloadClick(installer.platform)"
        >
          {{ t(installer.label, locale) }}
        </a>
      </li>
    </ul>
  </div>
</template>
