<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from 'reka-ui'

import type { Locale } from '../../../i18n/translations'
import { installers, useDownloadUrl } from '../../../composables/useDownloadUrl'
import { t } from '../../../i18n/translations'
import { captureDownloadClick } from '../../../scripts/posthog'

const { locale = 'en' } = defineProps<{ locale?: Locale }>()

const { platform, showFallback } = useDownloadUrl()

const itemClass =
  'flex cursor-pointer items-center rounded-xl px-3 py-2 text-sm text-primary-comfy-canvas outline-none transition-colors select-none hover:bg-primary-comfy-yellow hover:text-primary-comfy-ink focus:bg-primary-comfy-yellow focus:text-primary-comfy-ink'
</script>

<template>
  <div v-if="platform || showFallback" class="mt-6">
    <DropdownMenuRoot>
      <DropdownMenuTrigger
        class="inline-flex cursor-pointer items-center gap-1 text-sm text-primary-comfy-canvas/70 underline underline-offset-2 hover:text-primary-comfy-canvas"
      >
        {{ t('download.hero.installers.label', locale) }}
        <ChevronDown class="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="start"
          :side-offset="8"
          class="z-50 min-w-56 rounded-2xl border border-primary-comfy-ink-light bg-site-dropdown p-2 shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <DropdownMenuItem
            v-for="installer in installers"
            :key="installer.url"
            as-child
          >
            <a
              :href="installer.url"
              target="_blank"
              rel="noopener noreferrer"
              data-astro-prefetch="false"
              :class="itemClass"
              @click="captureDownloadClick(installer.platform)"
            >
              {{ t(installer.label, locale) }}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>
