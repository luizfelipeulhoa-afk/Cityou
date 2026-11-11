<script setup>
// Laboratório da migração para TresJS. Só existe no `npm run dev` (/tres-lab.html): não entra no build.
// Mostra as duas peças da estrutura: o SpaceMarker dentro de uma cena TresJS (SpaceMarkerNode)
// e um GLB carregado de forma declarativa (GlbModel), ambos com a regra de glbMaterial.js.
import { computed, markRaw, onMounted, ref, shallowRef, watchEffect } from 'vue'
import { Box3, NeutralToneMapping, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three'
import { TresCanvas } from '@tresjs/core'
import { WORLD_MODELS_MANIFEST, WORLD_SPACES, latLonToVector3 } from '../world/worldSpaces.js'
import { surfaceFrame } from '../world/geo.js'
import GlbModel from './GlbModel.vue'
import SpaceMarkerNode from './SpaceMarkerNode.vue'

const RADIUS = 5
const SIZE = 0.6
const query = new URLSearchParams(location.search)

const mode = ref(query.get('modo') === 'glb' ? 'glb' : 'marcador')
const spaceId = ref(WORLD_SPACES.some(item => item.id === query.get('espaco')) ? query.get('espaco') : 'cristo-redentor')
const desbloqueado = ref(true)
const concluido = ref(false)
const available = ref(null) // ids com GLB, de manifest.json
const loadState = ref('carregando')
const fit = shallowRef({ scale: [1, 1, 1], position: [0, 0, 0] })

const space = computed(() => WORLD_SPACES.find(item => item.id === spaceId.value))
const modelUrl = computed(() => (available.value?.includes(space.value.id) ? space.value.glbPath : ''))
const status = computed(() => (!available.value ? 'carregando' : modelUrl.value ? loadState.value : 'sem GLB'))

// Mesma câmera e mesmas luzes do mapa-mundo, para comparar o resultado lado a lado.
const camera = markRaw(new PerspectiveCamera(35, 1, 0.1, 100))
const sun = shallowRef([0, 0, 0])

watchEffect(() => {
  if (mode.value === 'glb') {
    camera.up.set(0, 1, 0)
    camera.position.set(0, 0.9, 2.6)
    camera.lookAt(0, 0.26, 0)
  }
  else {
    const up = latLonToVector3(space.value.lat, space.value.lon, 1)
    const { south } = surfaceFrame(up)
    camera.up.copy(up)
    camera.position.copy(up).multiplyScalar(RADIUS + 0.95).addScaledVector(south, 2.2)
    camera.lookAt(up.clone().multiplyScalar(RADIUS + 0.3))
  }
  sun.value = camera.position.clone().addScaledVector(camera.up, 1.5).toArray()
  loadState.value = 'carregando'
})

onMounted(async () => {
  try {
    const list = await (await fetch(WORLD_MODELS_MANIFEST)).json()
    available.value = Array.isArray(list) ? list : []
  }
  catch {
    available.value = []
  }
})

// Ajusta o GLB cru a 1 unidade, com a base no chão (no marcador, quem faz isso é o fitModel).
function frame(scene) {
  scene.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(scene)
  if (scene.parent) box.applyMatrix4(scene.parent.matrixWorld.clone().invert())
  const size = box.getSize(new Vector3()), center = box.getCenter(new Vector3())
  const s = 1 / Math.max(size.x, size.y, size.z, 1e-6)
  fit.value = { scale: [s, s, s], position: [-center.x * s, -box.min.y * s, -center.z * s] }
  loadState.value = 'pronto'
}

function onReady(context) {
  window.__tresLab = { context, status }
}
</script>

<template>
  <main class="lab">
    <header class="lab-bar">
      <strong>Laboratório 3D declarativo</strong>
      <label>Peça
        <select v-model="mode">
          <option value="marcador">SpaceMarkerNode (marcador do mapa)</option>
          <option value="glb">GlbModel (GLB puro)</option>
        </select>
      </label>
      <label>Espaço
        <select v-model="spaceId">
          <option v-for="item in WORLD_SPACES" :key="item.id" :value="item.id">{{ item.nome }}</option>
        </select>
      </label>
      <label v-if="mode === 'marcador'"><input v-model="desbloqueado" type="checkbox"> desbloqueado</label>
      <label v-if="mode === 'marcador'"><input v-model="concluido" type="checkbox"> concluído</label>
      <span class="lab-status" role="status">{{ status }}</span>
    </header>
    <div class="lab-stage">
      <TresCanvas
        :camera="camera" :alpha="true" :clear-alpha="0" :antialias="true" :dpr="[1, 1.75]" :shadows="false"
        :tone-mapping="NeutralToneMapping" :tone-mapping-exposure="1.05" :output-color-space="SRGBColorSpace"
        render-mode="always" @ready="onReady"
      >
        <TresHemisphereLight :args="[0xeaf6ff, 0x4d5f8f, 1.15]" />
        <TresDirectionalLight :args="[0xfff3df, 2.3]" :position="sun" />
        <template v-if="available">
          <SpaceMarkerNode
            v-if="mode === 'marcador'" :key="space.id" :space="space" :surface-radius="RADIUS" :size="SIZE"
            :desbloqueado="desbloqueado" :concluido="concluido" :model-url="modelUrl"
            @model="loadState = 'pronto'"
          />
          <TresGroup v-else :scale="fit.scale" :position="fit.position">
            <GlbModel :url="modelUrl" @ready="frame" @error="loadState = 'erro'" />
          </TresGroup>
        </template>
      </TresCanvas>
    </div>
    <p v-if="available && !modelUrl" class="lab-note">
      {{ space.nome }} não tem GLB: {{ mode === 'marcador' ? 'o marcador mostra o monumento em código.' : 'nada a mostrar nesta peça.' }}
    </p>
  </main>
</template>

<style>
html, body, #app { height: 100%; margin: 0; }
body { background: radial-gradient(120% 90% at 50% 38%, #3b62b0 0%, #233f7f 38%, #13234d 70%, #0b1430 100%); color: #f4f7ff; font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; }
.lab { height: 100%; display: flex; flex-direction: column; }
.lab-bar { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 10px 16px; background: rgb(11 20 48 / 0.72); }
.lab-bar label { display: inline-flex; gap: 6px; align-items: center; }
.lab-bar select { font: inherit; padding: 4px 6px; border-radius: 6px; }
.lab-status { margin-left: auto; opacity: 0.8; }
.lab-stage { flex: 1; min-height: 0; position: relative; }
.lab-note { position: absolute; left: 16px; bottom: 12px; margin: 0; opacity: 0.85; }
</style>
