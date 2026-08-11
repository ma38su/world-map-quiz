import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { ELEVATION_TEXTURE_URL, loadElevationHeatmaps } from './elevationHeatmap'
import { buildCountries, type Country } from './countryData'
import { MAP_COLORS } from './mapConstants'
export type { Country } from './countryData'

type Props = {
  target: Country | null
  onReady: (countries: Country[]) => void
  showElevation?: boolean
  resetNorthSignal?: number
  autoRotate?: boolean
}

const RADIUS = 2.08

function toVector([lon, lat]: [number, number], radius = RADIUS + 0.012) {
  const phi = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lon + 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

function drawCountry(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, country: Country, highlighted = false) {
  const { width, height } = canvas
  ctx.fillStyle = highlighted ? MAP_COLORS.target : MAP_COLORS.land
  ctx.strokeStyle = highlighted ? MAP_COLORS.targetBorder : MAP_COLORS.border
  ctx.lineWidth = highlighted ? 3 : 1.35
  for (const polygon of country.polygons) {
    for (const copy of [-1, 0, 1]) {
      ctx.beginPath()
      for (const ring of polygon) {
        let previousLongitude = ring[0]?.[0] ?? 0
        ring.forEach(([rawLongitude, lat], index) => {
          let longitude = rawLongitude
          while (longitude - previousLongitude > 180) longitude -= 360
          while (longitude - previousLongitude < -180) longitude += 360
          previousLongitude = longitude
          const x = ((longitude + 180) / 360 + copy) * width
          const y = ((90 - lat) / 180) * height
          if (index) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        })
        ctx.closePath()
      }
      ctx.fill('evenodd')
      ctx.stroke()
    }
  }
}

function drawBaseMap(canvas: HTMLCanvasElement, countries: Country[], heatmap?: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, MAP_COLORS.oceanCenter); gradient.addColorStop(.55, '#4e7783'); gradient.addColorStop(1, MAP_COLORS.oceanEdge)
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  if (heatmap) {
    ctx.globalAlpha = .62
    ctx.drawImage(heatmap, 0, 0, width, height)
    ctx.globalAlpha = 1
  }
  for (const country of countries) drawCountry(ctx, canvas, country)
}

function composeMap(canvas: HTMLCanvasElement, baseCanvas: HTMLCanvasElement, countries: Country[], targetId?: string) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(baseCanvas, 0, 0)
  const target = targetId ? countries.find((country) => country.id === targetId) : undefined
  if (target) drawCountry(ctx, canvas, target, true)
}

export default function Globe({ target, onReady, showElevation = false, resetNorthSignal = 0, autoRotate = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [webglUnavailable, setWebglUnavailable] = useState(false)
  const textureRef = useRef<THREE.CanvasTexture | null>(null)
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const baseElevationRef = useRef(false)
  const countriesRef = useRef<Country[]>([])
  const heatmapRef = useRef<HTMLCanvasElement | undefined>(undefined)
  const currentTargetRef = useRef<string | undefined>(undefined)
  const targetRotation = useRef({ x: 0.18, y: -0.35 })
  const globeRef = useRef<THREE.Group | null>(null)
  const markerRef = useRef<THREE.Sprite | null>(null)
  const zoomRef = useRef(6.9)
  const focusLockedRef = useRef(false)
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const elevationRef = useRef<THREE.Texture | null>(null)
  const showElevationRef = useRef(showElevation)
  const autoRotateRef = useRef(autoRotate)
  const aliveRef = useRef(true)
  const requestRenderRef = useRef<() => void>(() => {})
  showElevationRef.current = showElevation
  autoRotateRef.current = autoRotate

  useEffect(() => {
    aliveRef.current = true
    const host = hostRef.current
    if (!host) return
    const countries = buildCountries()
    countriesRef.current = countries
    onReady(countries)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.z = 6.9
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setWebglUnavailable(true)
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      setWebglUnavailable(true)
    }
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost)

    const globe = new THREE.Group()
    globeRef.current = globe
    globe.rotation.set(targetRotation.current.x, targetRotation.current.y, 0)
    scene.add(globe)

    const canvas = document.createElement('canvas')
    canvas.width = 2048; canvas.height = 1024
    const baseCanvas = document.createElement('canvas')
    baseCanvas.width = canvas.width; baseCanvas.height = canvas.height
    baseCanvasRef.current = baseCanvas
    mapCanvasRef.current = canvas
    drawBaseMap(baseCanvas, countries)
    baseElevationRef.current = false
    composeMap(canvas, baseCanvas, countries)
    const mapTexture = new THREE.CanvasTexture(canvas)
    mapTexture.colorSpace = THREE.SRGBColorSpace
    textureRef.current = mapTexture
    const sphereMaterial = new THREE.MeshStandardMaterial({
        map: mapTexture,
        displacementScale: 0,
        displacementBias: -0.018,
        bumpScale: 0,
        roughness: 0.84,
        metalness: 0.02,
      })
    materialRef.current = sphereMaterial
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 128, 96), sphereMaterial)
    globe.add(sphere)

    const markerCanvas = document.createElement('canvas')
    markerCanvas.width = 128; markerCanvas.height = 128
    const markerContext = markerCanvas.getContext('2d')!
    const markerGradient = markerContext.createRadialGradient(64, 64, 25, 64, 64, 61)
    markerGradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
    markerGradient.addColorStop(.4, 'rgba(255, 255, 255, 0)')
    markerGradient.addColorStop(.47, 'rgba(255, 255, 255, 1)')
    markerGradient.addColorStop(.53, 'rgba(255, 255, 255, 1)')
    markerGradient.addColorStop(.56, 'rgba(244, 84, 62, 1)')
    markerGradient.addColorStop(.7, 'rgba(244, 84, 62, .95)')
    markerGradient.addColorStop(.82, 'rgba(244, 84, 62, .28)')
    markerGradient.addColorStop(1, 'rgba(244, 84, 62, 0)')
    markerContext.fillStyle = markerGradient
    markerContext.fillRect(0, 0, 128, 128)
    const markerTexture = new THREE.CanvasTexture(markerCanvas)
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture, transparent: true, depthTest: true, depthWrite: false }))
    marker.scale.set(.42, .42, 1)
    marker.visible = false
    markerRef.current = marker
    globe.add(marker)

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.035, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x72d6ff, transparent: true, opacity: .08, side: THREE.BackSide }),
    )
    globe.add(atmosphere)
    scene.add(new THREE.HemisphereLight(0xc8efff, 0x06101b, 2.4))
    const sun = new THREE.DirectionalLight(0xffffff, 3.2); sun.position.set(-4, 5, 6); scene.add(sun)
    const rim = new THREE.DirectionalLight(0x2aa7ff, 1.8); rim.position.set(5, -1, -3); scene.add(rim)

    let dragging = false, px = 0, py = 0
    let frame = 0
    let previousTime = performance.now()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animate = (time = performance.now()) => {
      frame = 0
      const elapsedSeconds = Math.min(.05, (time - previousTime) / 1000)
      previousTime = time
      const autoRotating = autoRotateRef.current && !reduceMotion && !dragging
      if (!focusLockedRef.current) {
        if (autoRotating) targetRotation.current.y += elapsedSeconds * .05
        globe.rotation.x += (targetRotation.current.x - globe.rotation.x) * .055
        globe.rotation.y += (targetRotation.current.y - globe.rotation.y) * .055
      }
      camera.position.z += (zoomRef.current - camera.position.z) * .08
      if (!document.hidden) renderer.render(scene, camera)
      const rotationMoving = !focusLockedRef.current && (
        Math.abs(targetRotation.current.x - globe.rotation.x) > .0001 ||
        Math.abs(targetRotation.current.y - globe.rotation.y) > .0001
      )
      const zoomMoving = Math.abs(zoomRef.current - camera.position.z) > .001
      if (autoRotating || dragging || rotationMoving || zoomMoving) requestRender()
    }
    const requestRender = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(animate)
    }
    requestRenderRef.current = requestRender
    const down = (event: PointerEvent) => { focusLockedRef.current = false; dragging = true; px = event.clientX; py = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); requestRender() }
    const move = (event: PointerEvent) => {
      if (!dragging) return
      targetRotation.current.y += (event.clientX - px) * .006
      targetRotation.current.x += (event.clientY - py) * .006
      targetRotation.current.x = THREE.MathUtils.clamp(targetRotation.current.x, -1.35, 1.35)
      px = event.clientX; py = event.clientY
      requestRender()
    }
    const up = () => { dragging = false; requestRender() }
    const wheel = (event: WheelEvent) => { event.preventDefault(); zoomRef.current = THREE.MathUtils.clamp(zoomRef.current + event.deltaY * .004, 5.3, 9); requestRender() }
    renderer.domElement.addEventListener('pointerdown', down)
    renderer.domElement.addEventListener('pointermove', move)
    renderer.domElement.addEventListener('pointerup', up)
    renderer.domElement.addEventListener('pointercancel', up)
    renderer.domElement.addEventListener('wheel', wheel, { passive: false })

    const resize = () => {
      const width = host.clientWidth, height = host.clientHeight
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix()
      requestRender()
    }
    const observer = new ResizeObserver(resize); observer.observe(host); resize()
    const handleVisibilityChange = () => { previousTime = performance.now(); requestRender() }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    requestRender()

    return () => {
      aliveRef.current = false
      cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', handleVisibilityChange)
      requestRenderRef.current = () => {}
      renderer.dispose(); mapTexture.dispose(); elevationRef.current?.dispose()
      sphere.geometry.dispose(); sphereMaterial.dispose(); atmosphere.geometry.dispose(); atmosphere.material.dispose()
      markerTexture.dispose(); marker.material.dispose()
      globeRef.current = null
      markerRef.current = null
      materialRef.current = null
      baseCanvasRef.current = null
      renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointermove', move)
      renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('wheel', wheel)
      renderer.domElement.removeEventListener('pointercancel', up)
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost)
      host.removeChild(renderer.domElement)
    }
  }, [onReady])

  useEffect(() => {
    const canvas = mapCanvasRef.current, baseCanvas = baseCanvasRef.current, texture = textureRef.current
    if (!canvas || !baseCanvas || !texture) return
    currentTargetRef.current = target?.id
    if (baseElevationRef.current !== showElevation) {
      drawBaseMap(baseCanvas, countriesRef.current, showElevation ? heatmapRef.current : undefined)
      baseElevationRef.current = showElevation
    }
    composeMap(canvas, baseCanvas, countriesRef.current, target?.id)
    texture.needsUpdate = true
    if (materialRef.current) {
      materialRef.current.displacementScale = showElevation ? .052 : 0
      materialRef.current.bumpScale = showElevation ? .055 : 0
      materialRef.current.needsUpdate = true
    }
    if (showElevation && !heatmapRef.current) void loadElevationHeatmaps().then(({ equirectangular }) => {
      heatmapRef.current = equirectangular
      if (!aliveRef.current || !showElevationRef.current || !mapCanvasRef.current || !baseCanvasRef.current || !textureRef.current) return
      drawBaseMap(baseCanvasRef.current, countriesRef.current, equirectangular)
      baseElevationRef.current = true
      composeMap(mapCanvasRef.current, baseCanvasRef.current, countriesRef.current, currentTargetRef.current)
      textureRef.current.needsUpdate = true
    }).catch(() => {
      // The globe remains usable when the optional elevation texture fails.
    })
    if (showElevation && !elevationRef.current && materialRef.current) {
      const material = materialRef.current
      new THREE.TextureLoader().load(ELEVATION_TEXTURE_URL, (elevation) => {
        if (!aliveRef.current) { elevation.dispose(); return }
        elevation.colorSpace = THREE.NoColorSpace
        elevationRef.current = elevation
        material.displacementMap = elevation
        material.bumpMap = elevation
        material.displacementScale = showElevationRef.current ? .052 : 0
        material.bumpScale = showElevationRef.current ? .055 : 0
        material.needsUpdate = true
      }, undefined, () => {
        // The country map remains usable when the optional elevation texture fails.
      })
    }
    if (target) {
      const globe = globeRef.current
      const marker = markerRef.current
      const countryDirection = toVector(target.center, 1).normalize()
      if (globe) {
        const focus = new THREE.Quaternion().setFromUnitVectors(countryDirection, new THREE.Vector3(0, 0, 1))
        globe.quaternion.copy(focus)
        const focusedRotation = new THREE.Euler().setFromQuaternion(focus, 'XYZ')
        targetRotation.current = { x: focusedRotation.x, y: focusedRotation.y }
        focusLockedRef.current = true
      }
      if (marker) {
        marker.position.copy(toVector(target.center, RADIUS + .09))
        marker.visible = true
      }
      zoomRef.current = 5.65
    } else if (markerRef.current) {
      markerRef.current.visible = false
      focusLockedRef.current = false
    }
    requestRenderRef.current()
  }, [showElevation, target])

  useEffect(() => {
    if (!resetNorthSignal) return
    const globe = globeRef.current
    if (!globe) return
    const localFront = new THREE.Vector3(0, 0, 1).applyQuaternion(globe.quaternion.clone().invert())
    const longitude = THREE.MathUtils.radToDeg(Math.atan2(-localFront.z, localFront.x))
    const northUpRotation = { x: 0, y: THREE.MathUtils.degToRad(-90 - longitude) }
    globe.rotation.set(northUpRotation.x, northUpRotation.y, 0)
    targetRotation.current = northUpRotation
    focusLockedRef.current = false
    requestRenderRef.current()
  }, [resetNorthSignal])

  return <div className="globe-host" ref={hostRef} role="img" aria-label={webglUnavailable ? '3D地球儀を表示できません。世界地図表示を利用してください。' : '国境と標高を表示した操作可能な3D地球儀'}>
    {webglUnavailable && <div className="map-unavailable">3D地球儀を表示できません。世界地図表示を利用してください。</div>}
  </div>
}
