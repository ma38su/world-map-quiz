import { feature } from 'topojson-client'
import world from 'world-atlas/countries-50m.json'

type ElevationHeatmaps = { equirectangular: HTMLCanvasElement; mercator: HTMLCanvasElement }

let cachedHeatmaps: Promise<ElevationHeatmaps> | null = null

function terrainColor(value: number, isLand: boolean) {
  if (!isLand) {
    if (value < 55) return [2, 15, 38]
    if (value < 90) return [4, 31, 61]
    if (value < 120) return [7, 49, 78]
    return [10, 68, 96]
  }
  if (value < 130) return [42, 102, 68]
  if (value < 155) return [78, 126, 71]
  if (value < 180) return [145, 139, 72]
  if (value < 205) return [168, 119, 76]
  if (value < 230) return [181, 157, 126]
  return [239, 236, 220]
}

type Position = [number, number]
type Polygon = Position[][]

function createLandMask(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = canvas.getContext('2d')!
  const landResult = feature(
    world as never,
    (world as unknown as { objects: { land: never } }).objects.land,
  ) as unknown as {
    geometry?: { type: string; coordinates: Polygon | Polygon[] }
    features?: Array<{ geometry: { type: string; coordinates: Polygon | Polygon[] } }>
  }
  const geometry = landResult.geometry ?? landResult.features?.[0]?.geometry
  if (!geometry) return context.getImageData(0, 0, width, height).data
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates as Polygon]
    : geometry.coordinates as Polygon[]
  context.fillStyle = '#fff'
  for (const polygon of polygons) {
    for (const copy of [-1, 0, 1]) {
      context.beginPath()
      for (const ring of polygon) {
        let previousLongitude = ring[0]?.[0] ?? 0
        ring.forEach(([rawLongitude, latitude], index) => {
          let longitude = rawLongitude
          while (longitude - previousLongitude > 180) longitude -= 360
          while (longitude - previousLongitude < -180) longitude += 360
          previousLongitude = longitude
          const x = ((longitude + 180) / 360 + copy) * width
          const y = ((90 - latitude) / 180) * height
          if (index) context.lineTo(x, y)
          else context.moveTo(x, y)
        })
        context.closePath()
      }
      context.fill('evenodd')
    }
  }
  return context.getImageData(0, 0, width, height).data
}

export function loadElevationHeatmaps(): Promise<ElevationHeatmaps> {
  if (cachedHeatmaps) return cachedHeatmaps
  cachedHeatmaps = new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const equirectangular = document.createElement('canvas')
      equirectangular.width = image.naturalWidth
      equirectangular.height = image.naturalHeight
      const context = equirectangular.getContext('2d', { willReadFrequently: true })!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, equirectangular.width, equirectangular.height)
      const landMask = createLandMask(equirectangular.width, equirectangular.height)
      for (let index = 0; index < pixels.data.length; index += 4) {
        const value = pixels.data[index]
        const [red, green, blue] = terrainColor(value, landMask[index] > 0)
        pixels.data[index] = red; pixels.data[index + 1] = green; pixels.data[index + 2] = blue
      }
      context.putImageData(pixels, 0, 0)

      const mercator = document.createElement('canvas')
      mercator.width = 1024; mercator.height = 1024
      const mercatorContext = mercator.getContext('2d')!
      for (let y = 0; y < mercator.height; y++) {
        const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + .5) / mercator.height))) * 180 / Math.PI
        const sourceY = ((90 - latitude) / 180) * equirectangular.height
        mercatorContext.drawImage(equirectangular, 0, sourceY, equirectangular.width, 1, 0, y, mercator.width, 1)
      }
      resolve({ equirectangular, mercator })
    }
    image.onerror = () => reject(new Error('Elevation texture could not be loaded'))
    image.src = '/textures/earth-elevation.png'
  })
  return cachedHeatmaps
}
