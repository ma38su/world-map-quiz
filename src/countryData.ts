import * as THREE from 'three'
import { feature } from 'topojson-client'
import isoCountries from 'i18n-iso-countries'
import ja from 'i18n-iso-countries/langs/ja.json'
import world from 'world-atlas/countries-50m.json'

isoCountries.registerLocale(ja)

type Position = [number, number]
type Ring = Position[]
type Polygon = Ring[]

export type Country = { id: string; code: string; name: string; polygons: Polygon[]; center: Position }

let countryCache: Country[] | null = null

function centerOf(polygons: Polygon[]): Position {
  let largest = polygons[0]?.[0] ?? []
  for (const polygon of polygons) if ((polygon[0]?.length ?? 0) > largest.length) largest = polygon[0]
  if (!largest.length) return [0, 0]
  const sum = largest.reduce((current, [longitude, latitude]) => {
    const phi = THREE.MathUtils.degToRad(90 - latitude)
    const theta = THREE.MathUtils.degToRad(longitude + 180)
    return current.add(new THREE.Vector3(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)))
  }, new THREE.Vector3()).normalize()
  return [THREE.MathUtils.radToDeg(Math.atan2(-sum.z, sum.x)), THREE.MathUtils.radToDeg(Math.asin(sum.y))]
}

export function buildCountries(): Country[] {
  if (countryCache) return countryCache
  const collection = feature(world as never, (world as unknown as { objects: { countries: never } }).objects.countries) as unknown as {
    features: Array<{ id: string; properties: { name: string }; geometry: { type: string; coordinates: Polygon | Polygon[] } }>
  }
  countryCache = collection.features.flatMap((item) => {
    const code = isoCountries.numericToAlpha2(String(item.id).padStart(3, '0'))
    if (!code || code === 'AQ') return []
    const polygons = item.geometry.type === 'Polygon' ? [item.geometry.coordinates as Polygon] : item.geometry.coordinates as Polygon[]
    return [{ id: String(item.id), code, name: isoCountries.getName(code, 'ja') || item.properties.name, polygons, center: centerOf(polygons) }]
  })
  return countryCache
}
