<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import uPlot from 'uplot'

const props = withDefaults(
  defineProps<{
    data: uPlot.AlignedData
    options: Omit<uPlot.Options, 'width' | 'height'>
    height?: number
    /** Accessible description of the chart. */
    label: string
  }>(),
  { height: 200 },
)
const emit = defineEmits<{ cursor: [idx: number | null] }>()

const el = ref<HTMLDivElement>()
let chart: uPlot | undefined
let ro: ResizeObserver | undefined

function create() {
  chart?.destroy()
  if (!el.value) return
  const opts: uPlot.Options = {
    ...props.options,
    width: el.value.clientWidth || 300,
    height: props.height,
    hooks: {
      ...props.options.hooks,
      setCursor: [...(props.options.hooks?.setCursor ?? []), (u) => emit('cursor', u.cursor.idx ?? null)],
    },
  }
  chart = new uPlot(opts, props.data, el.value)
}

onMounted(() => {
  create()
  ro = new ResizeObserver(() => {
    if (chart && el.value && el.value.clientWidth !== chart.width) chart.setSize({ width: el.value.clientWidth, height: props.height })
  })
  if (el.value) ro.observe(el.value)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  chart?.destroy()
})
watch(() => props.data, (d) => chart?.setData(d))
watch(() => props.options, create)
</script>

<template>
  <div ref="el" class="uchart" role="img" :aria-label="label"></div>
</template>

<style scoped>
.uchart { width: 100%; min-width: 0; }
</style>
