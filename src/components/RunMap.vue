<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { cssVar } from '@/lib/chartTheme'

const props = defineProps<{ lat: (number | null)[]; lon: (number | null)[]; highlight?: number | null }>()
const el = ref<HTMLDivElement>()
let map: L.Map | undefined
let marker: L.CircleMarker | undefined

onMounted(() => {
  if (!el.value) return
  const pts: L.LatLngTuple[] = []
  props.lat.forEach((la, i) => {
    const lo = props.lon[i]
    if (la != null && lo != null) pts.push([la, lo])
  })
  map = L.map(el.value, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)
  if (!pts.length) return
  const accent = cssVar('--series-1')
  const route = L.polyline(pts, { color: accent, weight: 4, opacity: 0.9 }).addTo(map)
  const ring = cssVar('--surface')
  L.circleMarker(pts[0], { radius: 6, color: ring, weight: 2, fillColor: cssVar('--good'), fillOpacity: 1 }).addTo(map).bindTooltip('Start')
  L.circleMarker(pts[pts.length - 1], { radius: 6, color: ring, weight: 2, fillColor: cssVar('--critical'), fillOpacity: 1 }).addTo(map).bindTooltip('Finish')
  marker = L.circleMarker(pts[0], { radius: 7, color: ring, weight: 2, fillColor: cssVar('--text'), opacity: 0, fillOpacity: 0 }).addTo(map)
  map.fitBounds(route.getBounds(), { padding: [16, 16] })
})

watch(
  () => props.highlight,
  (i) => {
    if (!marker) return
    const la = i != null ? props.lat[i] : null
    const lo = i != null ? props.lon[i] : null
    if (la != null && lo != null) {
      marker.setLatLng([la, lo])
      marker.setStyle({ opacity: 1, fillOpacity: 1 })
    } else {
      marker.setStyle({ opacity: 0, fillOpacity: 0 })
    }
  },
)

onBeforeUnmount(() => map?.remove())
</script>

<template>
  <div ref="el" class="map" role="img" aria-label="Route map"></div>
</template>

<style scoped>
.map { height: 280px; border-radius: 10px; overflow: hidden; z-index: 0; background: var(--surface-2); }
</style>
