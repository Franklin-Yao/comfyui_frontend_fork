<script setup lang="ts">
import type { Locale } from '../../../i18n/translations'
import { computed } from 'vue'
import type { HTMLAttributes } from 'vue'

import type { Installer, Platform } from '../../../composables/useDownloadUrl'
import { installers, useDownloadUrl } from '../../../composables/useDownloadUrl'
import { t } from '../../../i18n/translations'
import { captureDownloadClick } from '../../../scripts/posthog'
import BrandButton from '../../common/BrandButton.vue'

const { locale = 'en', class: customClass = '' } = defineProps<{
  locale?: Locale
  class?: HTMLAttributes['class']
}>()

const { installer, showFallback } = useDownloadUrl()

const ICONS: Record<Platform, string> = {
  windows: '/icons/os/windows.svg',
  mac: '/icons/os/apple.svg',
  linux: '/icons/os/linux.svg'
}

const offered = computed<Installer[]>(() => {
  if (installer.value) return [installer.value]
  if (showFallback.value) return ['windows', 'macArm']
  return []
})
</script>

<template>
  <BrandButton
    v-for="key in offered"
    :key
    :href="installers[key].url"
    target="_blank"
    size="lg"
    :class="customClass"
    :data-astro-prefetch="
      installers[key].platform === 'windows' ? 'false' : undefined
    "
    @click="captureDownloadClick(installers[key].platform)"
  >
    <span class="inline-flex items-center gap-2">
      <img
        :src="ICONS[installers[key].platform]"
        alt=""
        class="inline-block size-5"
      />
      <span class="text-left">
        {{ t('download.hero.downloadLocal', locale) }}
        <span class="block text-xs font-medium tracking-normal">
          {{ t(installers[key].label, locale) }}
        </span>
      </span>
    </span>
  </BrandButton>
</template>
