<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  markRaw,
  onBeforeUnmount,
  ref,
  watch
} from 'vue'
import { useI18n } from 'vue-i18n'

import { generateModelThumbnail } from '@/components/load3d/modelThumbnail'
import Button from '@/components/ui/button/Button.vue'
import {
  findOutputAsset,
  findServerPreviewUrl,
  isAssetPreviewSupported
} from '@/platform/assets/utils/assetPreviewUtil'
import { useDialogStore } from '@/stores/dialogStore'
import { cn } from '@comfyorg/tailwind-utils'

import type { ReplyAsset } from '../../../utils/replyAssets'
import { replyAssetResultItem } from '../../../utils/replyAssets'
import ReplyAudioCard from './ReplyAudioCard.vue'

const { assets } = defineProps<{ assets: ReplyAsset[] }>()

const { t } = useI18n()

/* Three rows of the four-column grid, per DES-530. */
const COLLAPSED_COUNT = 12

const visual = computed(() => assets.filter((asset) => asset.kind !== 'audio'))
const audio = computed(() => assets.filter((asset) => asset.kind === 'audio'))

const expanded = ref(false)
const collapsible = computed(() => visual.value.length > COLLAPSED_COUNT)
const visibleVisual = computed(() =>
  expanded.value || !collapsible.value
    ? visual.value
    : visual.value.slice(0, COLLAPSED_COUNT)
)

const multi = computed(() => visual.value.length > 1)

const AUDIO_COLLAPSED_COUNT = 5

const audioExpanded = ref(false)
const audioCollapsible = computed(
  () => audio.value.length > AUDIO_COLLAPSED_COUNT
)
const visibleAudio = computed(() =>
  audioExpanded.value || !audioCollapsible.value
    ? audio.value
    : audio.value.slice(0, AUDIO_COLLAPSED_COUNT)
)

const gridColsClass = computed(() => {
  const count = visual.value.length
  if (count <= 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-2'
  if (count === 3) return 'grid-cols-3'
  return 'grid-cols-4'
})

const galleryAssets = computed(() =>
  visual.value.filter((asset) => asset.kind !== '3D')
)
const galleryItems = computed(() =>
  galleryAssets.value.map(replyAssetResultItem)
)
const galleryIndex = ref(-1)

/**
 * One entry per model url; dropping the entry and cancelling its in-flight
 * work are the same synchronous act.
 *
 * `controller` must be `markRaw`: a `ref` deep-proxies nested objects, so an
 * unwrapped `state.controller === controller` comparison would compare a
 * proxy against the raw controller and always be false, silently disowning
 * every pending strand.
 */
type ThumbnailState =
  | { phase: 'loading'; controller: AbortController; attempts: number }
  | {
      phase: 'retryPending'
      timeout: ReturnType<typeof setTimeout>
      attempts: number
    }
  | { phase: 'paused'; attempts: number }
  | { phase: 'ready'; src: string }
  | { phase: 'gaveUp' }

/** Retries after the initial render attempt. */
const MAX_THUMBNAIL_RETRIES = 2
const THUMBNAIL_RETRY_DELAY_MS = 2000

const thumbnailState = ref<Record<string, ThumbnailState>>({})
const assetNames = ref<Record<string, string>>({})
/** Dialog-close refresh timers; not tied to a url, so bulk-cleared on unmount. */
const refreshTimeouts = new Set<ReturnType<typeof setTimeout>>()
let mounted = true

/** Stop whatever `state` has in flight: an abortable render or a pending retry. */
function cancelThumbnailState(state: ThumbnailState | undefined): void {
  if (state?.phase === 'loading') state.controller.abort()
  else if (state?.phase === 'retryPending') clearTimeout(state.timeout)
}

onBeforeUnmount(() => {
  mounted = false
  for (const state of Object.values(thumbnailState.value)) {
    cancelThumbnailState(state)
  }
  for (const timeout of refreshTimeouts) clearTimeout(timeout)
  refreshTimeouts.clear()
})

/** Whether `url`'s current entry is still the `loading` strand owned by `controller`. */
function owns(url: string, controller: AbortController): boolean {
  const state = thumbnailState.value[url]
  return state?.phase === 'loading' && state.controller === controller
}

/** Look up a server-rendered preview, falling back to an offscreen render. */
function loadModelThumbnail(url: string, filename: string, attempts = 0): void {
  const controller = markRaw(new AbortController())
  thumbnailState.value[url] = { phase: 'loading', controller, attempts }

  void findServerPreviewUrl(filename)
    .then(async (preview) => {
      if (!mounted || !owns(url, controller)) return
      if (preview) {
        thumbnailState.value[url] = { phase: 'ready', src: preview }
        return
      }
      const result = await generateModelThumbnail(
        url,
        filename,
        controller.signal
      )
      if (!mounted || !owns(url, controller)) return
      if (result.status === 'rendered') {
        thumbnailState.value[url] = { phase: 'ready', src: result.dataUrl }
      } else if (result.status === 'failed' || result.status === 'busy') {
        scheduleThumbnailRetry(url, filename, attempts)
      } else {
        thumbnailState.value[url] = { phase: 'gaveUp' }
      }
    })
    .catch(() => {
      if (!mounted || !owns(url, controller)) return
      scheduleThumbnailRetry(url, filename, attempts)
    })
}

/**
 * A `failed` render may be a transient deadline expiry rather than a
 * genuinely unrenderable model, so it gets a bounded retry instead of
 * pinning the box icon for the message's lifetime.
 */
function scheduleThumbnailRetry(
  url: string,
  filename: string,
  attempts: number
): void {
  if (attempts >= MAX_THUMBNAIL_RETRIES) {
    thumbnailState.value[url] = { phase: 'gaveUp' }
    return
  }
  const nextAttempts = attempts + 1
  const timeout = setTimeout(() => {
    if (!mounted) return
    loadModelThumbnail(url, filename, nextAttempts)
  }, THUMBNAIL_RETRY_DELAY_MS)
  thumbnailState.value[url] = {
    phase: 'retryPending',
    timeout: markRaw(timeout),
    attempts: nextAttempts
  }
}

/** Frees the shared render queue when a 3D asset leaves `visibleVisual`. */
function hideThumbnail(url: string): void {
  const state = thumbnailState.value[url]
  if (state?.phase === 'ready' || state?.phase === 'gaveUp') return
  cancelThumbnailState(state)
  thumbnailState.value[url] = {
    phase: 'paused',
    attempts: state?.attempts ?? 0
  }
}

/**
 * Starts a fresh load for a (re)visible 3D asset unless one is already in
 * flight, ready, or has spent its retry budget.
 */
function showThumbnail(url: string, filename: string): void {
  const state = thumbnailState.value[url]
  if (!state) loadModelThumbnail(url, filename)
  else if (state.phase === 'paused') {
    loadModelThumbnail(url, filename, state.attempts)
  }
}

watch(
  () => [
    ...visibleVisual.value.filter((asset) => asset.kind === '3D'),
    ...visibleAudio.value
  ],
  (lookups) => {
    if (!isAssetPreviewSupported()) return
    const visible3D = lookups.filter((asset) => asset.kind === '3D')
    const visibleUrls = new Set(visible3D.map((asset) => asset.url))
    for (const url of Object.keys(thumbnailState.value)) {
      if (!visibleUrls.has(url)) hideThumbnail(url)
    }
    for (const { url, filename } of visible3D) {
      showThumbnail(url, filename)
    }
    for (const { url, filename } of lookups) {
      if (!(url in assetNames.value)) {
        assetNames.value[url] = ''
        void findOutputAsset(filename)
          .then((record) => {
            if (mounted && record?.name) assetNames.value[url] = record.name
          })
          .catch(() => {})
      }
    }
  },
  { immediate: true }
)

const Load3dViewerContent = defineAsyncComponent(
  () => import('@/components/load3d/Load3dViewerContent.vue')
)
const MediaLightbox = defineAsyncComponent(
  () => import('@/components/sidebar/tabs/queue/MediaLightbox.vue')
)

function refreshModelThumbnail(asset: ReplyAsset, retry = true): void {
  const state = thumbnailState.value[asset.url]
  if (!mounted || !isAssetPreviewSupported() || state?.phase === 'ready') return
  void findServerPreviewUrl(asset.filename).then((preview) => {
    if (!mounted) return
    if (preview) {
      // Overwriting a `loading`/`retryPending` entry would leave its
      // controller/timer unreachable, so cancel before replacing it.
      cancelThumbnailState(thumbnailState.value[asset.url])
      thumbnailState.value[asset.url] = { phase: 'ready', src: preview }
    } else if (retry) {
      const timeout = setTimeout(() => {
        refreshTimeouts.delete(timeout)
        refreshModelThumbnail(asset, false)
      }, 2000)
      refreshTimeouts.add(timeout)
    }
  })
}

function modelThumbnailSrc(url: string): string {
  const state = thumbnailState.value[url]
  return state?.phase === 'ready' ? state.src : ''
}

function inspect(asset: ReplyAsset): void {
  if (asset.kind === '3D') {
    useDialogStore().showDialog({
      key: 'asset-3d-viewer',
      title: assetNames.value[asset.url] || asset.filename,
      component: Load3dViewerContent,
      props: { modelUrl: asset.url },
      dialogComponentProps: {
        renderer: 'reka',
        size: 'full',
        contentClass: 'left-1/2 w-[80vw] sm:max-w-[80vw] h-[80vh] max-h-[80vh]',
        maximizable: true,
        onClose: () => refreshModelThumbnail(asset)
      }
    })
    return
  }
  galleryIndex.value = galleryAssets.value.indexOf(asset)
}

function playPreview(event: Event): void {
  const video = event.target
  if (video instanceof HTMLVideoElement) void video.play().catch(() => {})
}

function stopPreview(event: Event): void {
  const video = event.target
  if (video instanceof HTMLVideoElement) video.pause()
}
</script>

<template>
  <div data-testid="reply-asset-group" class="my-4 flex flex-col gap-2">
    <div v-if="visibleVisual.length" :class="cn('grid gap-1', gridColsClass)">
      <button
        v-for="asset in visibleVisual"
        :key="asset.url"
        type="button"
        :aria-label="asset.label ?? asset.filename"
        :class="
          cn(
            'relative cursor-pointer overflow-hidden rounded-lg border-none p-0',
            multi && 'aspect-square bg-secondary-background-hover',
            !multi && asset.kind === '3D' && 'justify-self-end'
          )
        "
        @click="inspect(asset)"
      >
        <img
          v-if="asset.kind === 'image'"
          :src="asset.url"
          :alt="asset.label ?? asset.filename"
          data-testid="reply-image-preview"
          loading="lazy"
          :class="multi ? 'size-full object-cover' : 'block h-auto max-w-full'"
        />
        <video
          v-else-if="asset.kind === 'video'"
          :src="asset.url"
          data-testid="reply-video-preview"
          muted
          loop
          playsinline
          preload="metadata"
          :class="multi ? 'size-full object-cover' : 'block h-auto max-w-full'"
          @mouseenter="playPreview"
          @mouseleave="stopPreview"
        />
        <img
          v-else-if="modelThumbnailSrc(asset.url)"
          :src="modelThumbnailSrc(asset.url)"
          :alt="asset.label ?? asset.filename"
          loading="lazy"
          :class="multi ? 'size-full object-cover' : 'block h-auto max-w-full'"
        />
        <span
          v-else
          :class="
            cn(
              'flex items-center justify-center',
              multi
                ? 'size-full'
                : 'aspect-square w-40 bg-secondary-background-hover'
            )
          "
        >
          <span class="icon-[lucide--box] size-6 text-muted-foreground" />
        </span>
        <span
          v-if="asset.kind === 'video'"
          data-testid="reply-video-affordance"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span
            class="flex size-9 items-center justify-center rounded-full bg-black/60 text-white shadow-sm backdrop-blur-sm"
          >
            <span class="icon-[lucide--play] size-4 fill-current" />
          </span>
        </span>
      </button>
    </div>

    <Button
      v-if="collapsible"
      type="button"
      variant="outline"
      size="sm"
      class="self-center rounded-full border-component-node-border"
      @click="expanded = !expanded"
    >
      {{ expanded ? t('agent.showLess') : t('agent.showMore') }}
      <span
        :class="
          cn('icon-[lucide--chevron-down] size-3', expanded && 'rotate-180')
        "
      />
    </Button>

    <div v-if="audio.length" class="flex flex-col gap-1">
      <ReplyAudioCard
        v-for="asset in visibleAudio"
        :key="asset.url"
        :asset
        :title="assetNames[asset.url] || asset.filename"
      />
      <Button
        v-if="audioCollapsible"
        type="button"
        variant="outline"
        size="sm"
        class="self-center rounded-full border-component-node-border"
        @click="audioExpanded = !audioExpanded"
      >
        {{ audioExpanded ? t('agent.showLess') : t('agent.showMore') }}
        <span
          :class="
            cn(
              'icon-[lucide--chevron-down] size-3',
              audioExpanded && 'rotate-180'
            )
          "
        />
      </Button>
    </div>

    <MediaLightbox
      v-if="galleryIndex !== -1"
      :all-gallery-items="galleryItems"
      :active-index="galleryIndex"
      @update:active-index="galleryIndex = $event"
    />
  </div>
</template>
