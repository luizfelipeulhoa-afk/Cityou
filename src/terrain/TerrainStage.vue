<script setup>
// O terreno dentro de uma cena TresJS: os objetos three entram por <primitive>, os controles de órbita e a
// névoa são ajustados a cada quadro desenhado. Só desenha quando algo muda (render-mode="on-demand" no canvas).
import { markRaw, onUnmounted, watch } from 'vue'
import { Fog, MOUSE, Raycaster, TOUCH, Vector2 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useLoop, useTres } from '@tresjs/core'
import { cameraLimits, constrainCamera, orbitPosition } from './camera.js'
import { createTerrainObjects } from './TerrainScene.js'
import { PALETTE } from './terrainData.js'

const props = defineProps({
  data: { type: Object, required: true }, // createTerrainData()
  camera: { type: Object, required: true }, // PerspectiveCamera, criada pelo pai com markRaw
  showBlocked: { type: Boolean, default: false },
  showVegetation: { type: Boolean, default: true },
})
const emit = defineEmits(['ready', 'pick'])

const { renderer, scene, invalidate } = useTres()
const limits = cameraLimits(props.data)
const objects = markRaw(createTerrainObjects(props.data))
const fog = markRaw(new Fog(PALETTE.sky, limits.maxFog * limits.fogStart, limits.maxFog))
scene.value.fog = fog

const controls = markRaw(new OrbitControls(props.camera, renderer.domElement))
controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
controls.dampingFactor = 0.08
controls.minDistance = limits.minDistance
controls.maxDistance = limits.maxDistance
controls.minPolarAngle = limits.minPolar
controls.maxPolarAngle = limits.maxPolar
controls.screenSpacePanning = false
controls.panSpeed = 0.7
controls.rotateSpeed = 0.55
controls.zoomSpeed = 0.8
// Os mesmos gestos da cidade: arrastar move, dois dedos (ou o botão direito) giram e aproximam.
controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE }
renderer.domElement.style.touchAction = 'none'
// invalidate() aceita um número de quadros: não pode receber o evento como argumento.
const redraw = () => invalidate()
controls.addEventListener('change', redraw)

/** Leva a câmera a um alvo, visto de um azimute (0 = de frente, do mar para os morros), ângulo e distância. */
function view({ x, z, azimuth = 0, polar = 1.05, distance = 60 }) {
  const target = props.data.lots.clampToPlayable(x, z)
  controls.target.set(target.x, 0, target.z)
  props.camera.position.set(...orbitPosition([target.x, 0, target.z], azimuth, polar, distance))
  controls.update()
  redraw()
}

useLoop().onBeforeRender(() => {
  controls.update()
  constrainCamera(props.data, limits, props.camera, controls.target, fog)
})

watch(() => props.showBlocked, (visible) => { objects.setBlockedOverlay(visible); redraw() }, { immediate: true })
watch(() => props.showVegetation, (visible) => { objects.trees.visible = visible; objects.palms.visible = visible; redraw() }, { immediate: true })

// Um toque sem arrasto escolhe o ponto do terreno sob o dedo.
const raycaster = new Raycaster(), pointer = new Vector2()
let pressed = null
const onDown = (event) => { pressed = { x: event.clientX, y: event.clientY, button: event.button } }
const onUp = (event) => {
  if (!pressed || pressed.button !== 0 || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 6) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
  raycaster.setFromCamera(pointer, props.camera)
  const [hit] = raycaster.intersectObject(objects.terrain, false)
  if (hit) emit('pick', { x: hit.point.x, y: hit.point.y, z: hit.point.z })
}
renderer.domElement.addEventListener('pointerdown', onDown)
renderer.domElement.addEventListener('pointerup', onUp)

emit('ready', { objects, controls, fog, limits, view, invalidate: redraw })

onUnmounted(() => {
  renderer.domElement.removeEventListener('pointerdown', onDown)
  renderer.domElement.removeEventListener('pointerup', onUp)
  controls.dispose()
  if (scene.value.fog === fog) scene.value.fog = null
  objects.dispose()
})
</script>

<template>
  <primitive :object="objects.group" />
  <slot />
</template>
