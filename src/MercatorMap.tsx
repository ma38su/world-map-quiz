import { useEffect, useRef } from 'react'
import { buildCountries, type Country } from './countryData'
import { loadElevationHeatmaps } from './elevationHeatmap'
import { CHOICE_COLORS, MAP_COLORS } from './mapConstants'

type Props = { target: Country | null; choiceCountries?: Country[]; onReady: (countries: Country[]) => void; showElevation: boolean }

const MAX_LATITUDE = 85.051129
const MARKER_RADIUS = 11
const landBorderCache = new Map<string, boolean>()

type GeographicBounds = { minX: number; maxX: number; minY: number; maxY: number }

function normalizedMercatorY(latitude: number) {
  const clampedLatitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude))
  const radians = clampedLatitude * Math.PI / 180
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI)
}

function project(longitude: number, latitude: number, size: number, offsetX: number, offsetY: number) {
  return {
    x: offsetX + ((longitude + 180) / 360) * size,
    y: offsetY + normalizedMercatorY(latitude) * size,
  }
}

function boundsForPolygon(polygon: Country['polygons'][number], anchor: number): GeographicBounds | null {
  const points = polygon[0] ?? []
  if (!points.length) return null
  const unwrapped = points.map(([rawLongitude, latitude]) => {
    let longitude = rawLongitude
    while (longitude - anchor > 180) longitude -= 360
    while (longitude - anchor < -180) longitude += 360
    return [longitude, latitude] as const
  })
  return {
    minX: Math.min(...unwrapped.map(([longitude]) => longitude)),
    maxX: Math.max(...unwrapped.map(([longitude]) => longitude)),
    minY: Math.min(...unwrapped.map(([, latitude]) => latitude)),
    maxY: Math.max(...unwrapped.map(([, latitude]) => latitude)),
  }
}

function polygonArea(polygon: Country['polygons'][number], anchor: number) {
  const ring = polygon[0] ?? []
  if (ring.length < 3) return 0
  const points = ring.map(([rawLongitude, latitude]) => {
    let longitude = rawLongitude
    while (longitude - anchor > 180) longitude -= 360
    while (longitude - anchor < -180) longitude += 360
    return [longitude, latitude] as const
  })
  return Math.abs(points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length]
    return sum + x * nextY - nextX * y
  }, 0)) / 2
}

function primaryLandmass(country: Country) {
  return [...country.polygons].sort((a, b) => polygonArea(b, country.center[0]) - polygonArea(a, country.center[0]))[0]
}

/** Returns the geographic centroid of the country's largest contiguous landmass. */
function primaryLandmassCenter(country: Country): [number, number] {
  const ring = primaryLandmass(country)?.[0] ?? []
  if (ring.length < 3) return country.center
  const points = ring.map(([rawLongitude, latitude]) => {
    let longitude = rawLongitude
    while (longitude - country.center[0] > 180) longitude -= 360
    while (longitude - country.center[0] < -180) longitude += 360
    return [longitude, latitude] as const
  })
  let crossSum = 0
  let longitudeSum = 0
  let latitudeSum = 0
  points.forEach(([longitude, latitude], index) => {
    const [nextLongitude, nextLatitude] = points[(index + 1) % points.length]
    const cross = longitude * nextLatitude - nextLongitude * latitude
    crossSum += cross
    longitudeSum += (longitude + nextLongitude) * cross
    latitudeSum += (latitude + nextLatitude) * cross
  })
  if (Math.abs(crossSum) < 1e-8) return country.center
  let longitude = longitudeSum / (3 * crossSum)
  while (longitude > 180) longitude -= 360
  while (longitude < -180) longitude += 360
  return [longitude, latitudeSum / (3 * crossSum)]
}

function boundsGap(a: GeographicBounds, b: GeographicBounds) {
  const gapX = Math.max(0, a.minX - b.maxX, b.minX - a.maxX)
  const gapY = Math.max(0, a.minY - b.maxY, b.minY - a.maxY)
  return Math.hypot(gapX, gapY)
}

type Point = { x: number; y: number }
type Segment = { from: Point; to: Point }

function segmentsIntersect(a: Segment, b: Segment) {
  const cross = (origin: Point, first: Point, second: Point) =>
    (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
  const onSegment = (point: Point, segment: Segment) =>
    Math.abs(cross(segment.from, segment.to, point)) < .01 &&
    point.x >= Math.min(segment.from.x, segment.to.x) - .01 && point.x <= Math.max(segment.from.x, segment.to.x) + .01 &&
    point.y >= Math.min(segment.from.y, segment.to.y) - .01 && point.y <= Math.max(segment.from.y, segment.to.y) + .01
  const a1 = cross(a.from, a.to, b.from)
  const a2 = cross(a.from, a.to, b.to)
  const b1 = cross(b.from, b.to, a.from)
  const b2 = cross(b.from, b.to, a.to)
  return (a1 * a2 < 0 && b1 * b2 < 0) || onSegment(a.from, b) || onSegment(a.to, b) || onSegment(b.from, a) || onSegment(b.to, a)
}

function pointToSegmentDistance(point: Point, segment: Segment) {
  const dx = segment.to.x - segment.from.x
  const dy = segment.to.y - segment.from.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - segment.from.x, point.y - segment.from.y)
  const position = Math.max(0, Math.min(1, ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (segment.from.x + position * dx), point.y - (segment.from.y + position * dy))
}

type MarkerSpec = { index: number; point: Point; needsLeader: boolean }

function placeMarkerLabels(specs: MarkerSpec[], width: number, height: number) {
  const placements = new Map(specs.filter((spec) => !spec.needsLeader).map((spec) => [spec.index, spec.point]))
  const fixedLabels = [...placements.values()]
  const leaderSpecs = specs.filter((spec) => spec.needsLeader)
  type State = { score: number; labels: Point[]; leaders: Segment[]; placements: Map<number, Point> }
  let states: State[] = [{ score: 0, labels: fixedLabels, leaders: [], placements: new Map(placements) }]
  const offsets = [28, 42, 56].flatMap((distance) => [
    [0, -distance], [distance * .72, -distance * .72], [distance, 0], [distance * .72, distance * .72],
    [0, distance], [-distance * .72, distance * .72], [-distance, 0], [-distance * .72, -distance * .72],
  ])

  for (const spec of leaderSpecs) {
    const candidates = offsets.map(([x, y]) => ({
      x: Math.max(14, Math.min(width - 14, spec.point.x + x)),
      y: Math.max(14, Math.min(height - 14, spec.point.y + y)),
    })).filter((candidate, index, all) => all.findIndex((other) => Math.abs(other.x - candidate.x) < .1 && Math.abs(other.y - candidate.y) < .1) === index)
    states = states.flatMap((state) => candidates.map((candidate) => {
      const segment = { from: spec.point, to: candidate }
      const overlapPenalty = state.labels.reduce((sum, label) => {
        const distance = Math.hypot(candidate.x - label.x, candidate.y - label.y)
        return sum + (distance < 26 ? 100_000 + (26 - distance) ** 2 * 100 : 0)
      }, 0)
      const crossingPenalty = state.leaders.reduce((sum, leader) => sum + (segmentsIntersect(segment, leader) ? 1_000_000 : 0), 0)
      const obstructionPenalty = specs.reduce((sum, other) => {
        if (other.index === spec.index) return sum
        return sum + (pointToSegmentDistance(other.point, segment) < 10 ? 50_000 : 0)
      }, 0)
      const nextPlacements = new Map(state.placements)
      nextPlacements.set(spec.index, candidate)
      return {
        score: state.score + overlapPenalty + crossingPenalty + obstructionPenalty + Math.hypot(candidate.x - spec.point.x, candidate.y - spec.point.y),
        labels: [...state.labels, candidate],
        leaders: [...state.leaders, segment],
        placements: nextPlacements,
      }
    })).sort((a, b) => a.score - b.score).slice(0, 120)
  }
  return states[0]?.placements ?? placements
}

/**
 * Fit the recognizable local landmass, including nearby islands connected by
 * short sea gaps, while excluding remote overseas territories. This avoids
 * country-specific exceptions and keeps archipelagos useful at quiz scale.
 */
function fittingPolygonsForCountry(country: Country) {
  const metrics = country.polygons.flatMap((polygon) => {
    const bounds = boundsForPolygon(polygon, country.center[0])
    if (!bounds) return []
    const area = polygonArea(polygon, country.center[0])
    return [{ polygon, bounds, area }]
  }).sort((a, b) => b.area - a.area)
  if (!metrics.length) return []

  const primary = metrics[0]
  const primarySpan = Math.max(primary.bounds.maxX - primary.bounds.minX, primary.bounds.maxY - primary.bounds.minY)
  const maximumLocalGap = Math.max(2.5, Math.min(10, primarySpan * .4))
  const maximumPrimaryDistance = Math.max(4, Math.min(30, primarySpan * 6))
  const included = [primary]
  const pending = metrics.slice(1)
  let added = true
  while (added) {
    added = false
    for (let index = pending.length - 1; index >= 0; index--) {
      if (boundsGap(primary.bounds, pending[index].bounds) <= maximumPrimaryDistance &&
          included.some((landmass) => boundsGap(landmass.bounds, pending[index].bounds) <= maximumLocalGap)) {
        included.push(pending[index])
        pending.splice(index, 1)
        added = true
      }
    }
  }
  return included.map(({ polygon }) => polygon)
}

function hasLandBorder(target: Country, countries: Country[]) {
  const cached = landBorderCache.get(target.id)
  if (cached !== undefined) return cached
  const targetPoints = new Set(target.polygons.flatMap((polygon) => polygon.flatMap((ring) =>
    ring.map(([longitude, latitude]) => `${longitude.toFixed(4)},${latitude.toFixed(4)}`),
  )))
  const result = countries.some((country) => {
    if (country.id === target.id) return false
    let sharedPoints = 0
    for (const polygon of country.polygons) {
      for (const ring of polygon) {
        for (const [longitude, latitude] of ring) {
          if (targetPoints.has(`${longitude.toFixed(4)},${latitude.toFixed(4)}`) && ++sharedPoints >= 3) return true
        }
      }
    }
    return false
  })
  landBorderCache.set(target.id, result)
  return result
}

function viewForCountries(targets: Country[], allCountries: Country[]) {
  if (!targets.length) return { zoom: 1, centerX: .5, centerY: .5 }
  const anchor = targets[0].center[0]
  if (targets.length > 1) {
    const centers = targets.map((target) => {
      let longitude = target.center[0]
      while (longitude - anchor > 180) longitude -= 360
      while (longitude - anchor < -180) longitude += 360
      return { x: (longitude + 180) / 360, y: normalizedMercatorY(target.center[1]) }
    })
    const xs = centers.map((point) => point.x)
    const ys = centers.map((point) => point.y)
    const minimumX = Math.min(...xs), maximumX = Math.max(...xs)
    const minimumY = Math.min(...ys), maximumY = Math.max(...ys)
    // Location questions need the countries' marked positions, not every edge of a
    // very large country. Keeping a fixed margin makes Japan/Korea/China legible
    // without requiring the learner to zoom manually.
    const extent = Math.max(maximumX - minimumX + .045, maximumY - minimumY + .045)
    return {
      zoom: Math.min(18, Math.max(2, .68 / Math.max(extent, .025))),
      centerX: (minimumX + maximumX) / 2,
      centerY: (minimumY + maximumY) / 2,
    }
  }
  const points = targets.flatMap((target) => {
    return fittingPolygonsForCountry(target).flatMap((polygon) => (polygon[0] ?? []).map(([rawLongitude, latitude]) => {
      let longitude = rawLongitude
      while (longitude - anchor > 180) longitude -= 360
      while (longitude - anchor < -180) longitude += 360
      return { x: (longitude + 180) / 360, y: normalizedMercatorY(latitude) }
    }))
  })
  if (!points.length) return { zoom: 1, centerX: .5, centerY: .5 }
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minimumX = Math.min(...xs), maximumX = Math.max(...xs)
  const minimumY = Math.min(...ys), maximumY = Math.max(...ys)
  const extent = Math.max(maximumX - minimumX, maximumY - minimumY)
  // Large countries retain continental context; progressively smaller countries
  // receive more screen share before leader lines handle the tiniest states.
  const desiredMapShare = extent >= .045 ? .18 : extent >= .015 ? .23 : .3
  const zoom = Math.min(35, Math.max(1, desiredMapShare / Math.max(extent, .002)))
  const countryCenterY = (minimumY + maximumY) / 2
  // Countries connected to a continent benefit from seeing more regional
  // context. Island countries stay centered so their complete silhouette is
  // never sacrificed merely to show the equator-facing side of the map.
  const contextualCenterY = targets.length === 1 && zoom <= 6 && hasLandBorder(targets[0], allCountries)
    ? countryCenterY + (.5 - countryCenterY) * .32
    : countryCenterY
  return {
    zoom,
    centerX: (minimumX + maximumX) / 2,
    centerY: contextualCenterY,
  }
}

export default function MercatorMap({ target, choiceCountries = [], onReady, showElevation }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const countriesRef = useRef<Country[]>([])
  const heatmapRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef({ zoom: 1, centerX: .5, centerY: .5 })
  const focusKeyRef = useRef('')

  useEffect(() => {
    countriesRef.current = buildCountries()
    onReady(countriesRef.current)
  }, [onReady])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const context = canvas.getContext('2d')!
    const focusCountries = choiceCountries.length ? choiceCountries : target ? [target] : []
    const focusKey = focusCountries.map((country) => country.id).sort().join(',')
    if (focusKeyRef.current !== focusKey) {
      viewRef.current = viewForCountries(focusCountries, countriesRef.current)
      focusKeyRef.current = focusKey
    }

    const draw = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(devicePixelRatio, 2)
      const nextWidth = Math.round(bounds.width * pixelRatio)
      const nextHeight = Math.round(bounds.height * pixelRatio)
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      const width = bounds.width
      const height = bounds.height
      context.clearRect(0, 0, width, height)
      const ocean = context.createRadialGradient(width * .5, height * .43, 0, width * .5, height * .5, Math.max(width, height) * .65)
      ocean.addColorStop(0, MAP_COLORS.oceanCenter); ocean.addColorStop(1, MAP_COLORS.oceanEdge)
      context.fillStyle = ocean; context.fillRect(0, 0, width, height)

      const fittedSize = Math.min(width - 20, height - 20)
      const { zoom, centerX, centerY } = viewRef.current
      const size = fittedSize * zoom
      const offsetX = width / 2 - centerX * size
      const offsetY = height / 2 - centerY * size

      if (showElevation && heatmapRef.current) {
        context.globalAlpha = .72
        for (const copy of [-1, 0, 1]) context.drawImage(heatmapRef.current, offsetX + copy * size, offsetY, size, size)
        context.globalAlpha = 1
      }

      context.strokeStyle = MAP_COLORS.grid
      context.lineWidth = 1
      for (let longitude = -180; longitude <= 180; longitude += 30) {
        const from = project(longitude, -MAX_LATITUDE, size, offsetX, offsetY)
        const to = project(longitude, MAX_LATITUDE, size, offsetX, offsetY)
        context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke()
      }
      for (const latitude of [-60, -30, 0, 30, 60]) {
        const from = project(-180, latitude, size, offsetX, offsetY)
        const to = project(180, latitude, size, offsetX, offsetY)
        context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke()
      }

      for (const country of countriesRef.current) {
        const choiceIndex = choiceCountries.findIndex((choice) => choice.id === country.id)
        const choiceColor = choiceIndex >= 0 ? CHOICE_COLORS[choiceIndex].color : null
        context.fillStyle = choiceColor ?? (country.id === target?.id
          ? MAP_COLORS.target
          : showElevation ? MAP_COLORS.landWithElevation : MAP_COLORS.land)
        context.strokeStyle = choiceIndex >= 0 ? CHOICE_COLORS[choiceIndex].borderColor : country.id === target?.id ? MAP_COLORS.targetBorder : MAP_COLORS.border
        context.lineWidth = choiceColor || country.id === target?.id ? 2.15 : .85
        for (const polygon of country.polygons) {
          for (const copy of [-1, 0, 1]) {
            context.beginPath()
            for (const ring of polygon) {
              let previousLongitude = ring[0]?.[0] ?? 0
              ring.forEach(([rawLongitude, latitude], index) => {
                let longitude = rawLongitude
                while (longitude - previousLongitude > 180) longitude -= 360
                while (longitude - previousLongitude < -180) longitude += 360
                previousLongitude = longitude
                const point = project(longitude + copy * 360, latitude, size, offsetX, offsetY)
                if (index) context.lineTo(point.x, point.y)
                else context.moveTo(point.x, point.y)
              })
              context.closePath()
            }
            context.fill('evenodd')
            context.stroke()
          }
        }
      }

      // Country paths are initially painted one country at a time. A neighbour
      // drawn later can therefore cover the outer half of an earlier stroke,
      // which made parts of highlighted borders disappear (most noticeably on
      // small or narrow countries). Repaint quiz outlines last and clip each
      // stroke to its own country: shared borders then keep both countries'
      // inward half instead of whichever country happened to be drawn last.
      const outlinedCountries: { country: Country; color: string }[] = []
      for (const country of countriesRef.current) {
        const choiceIndex = choiceCountries.findIndex((choice) => choice.id === country.id)
        if (choiceIndex >= 0) outlinedCountries.push({ country, color: CHOICE_COLORS[choiceIndex].borderColor })
        else if (country.id === target?.id) outlinedCountries.push({ country, color: MAP_COLORS.targetBorder })
      }
      context.lineJoin = 'round'
      context.lineCap = 'round'
      for (const { country, color } of outlinedCountries) {
        for (const polygon of country.polygons) {
          for (const copy of [-1, 0, 1]) {
            context.beginPath()
            for (const ring of polygon) {
              let previousLongitude = ring[0]?.[0] ?? 0
              ring.forEach(([rawLongitude, latitude], index) => {
                let longitude = rawLongitude
                while (longitude - previousLongitude > 180) longitude -= 360
                while (longitude - previousLongitude < -180) longitude += 360
                previousLongitude = longitude
                const point = project(longitude + copy * 360, latitude, size, offsetX, offsetY)
                if (index) context.lineTo(point.x, point.y)
                else context.moveTo(point.x, point.y)
              })
              context.closePath()
            }
            context.save()
            context.clip('evenodd')
            context.strokeStyle = color
            context.lineWidth = 4.3
            context.stroke()
            context.restore()
          }
        }
      }

      const markerSpecs = choiceCountries.flatMap((country, index) => {
        const markerCenter = primaryLandmassCenter(country)
        const candidates = [-1, 0, 1].map((copy) => project(markerCenter[0] + copy * 360, markerCenter[1], size, offsetX, offsetY))
        const point = candidates.sort((a, b) => Math.abs(a.x - width / 2) - Math.abs(b.x - width / 2))[0]
        if (point.x < -20 || point.x > width + 20 || point.y < -20 || point.y > height + 20) return []
        const largestPolygon = primaryLandmass(country)
        const ring = largestPolygon?.[0] ?? []
        const projectedRing = ring.map(([rawLongitude, latitude]) => {
          let longitude = rawLongitude
          while (longitude - country.center[0] > 180) longitude -= 360
          while (longitude - country.center[0] < -180) longitude += 360
          const centerCopy = Math.round((point.x - project(markerCenter[0], markerCenter[1], size, offsetX, offsetY).x) / size)
          return project(longitude + centerCopy * 360, latitude, size, offsetX, offsetY)
        })
        const countryWidth = projectedRing.length ? Math.max(...projectedRing.map((item) => item.x)) - Math.min(...projectedRing.map((item) => item.x)) : 0
        const countryHeight = projectedRing.length ? Math.max(...projectedRing.map((item) => item.y)) - Math.min(...projectedRing.map((item) => item.y)) : 0
        const projectedArea = projectedRing.length >= 3 ? Math.abs(projectedRing.reduce((sum, item, ringIndex) => {
          const next = projectedRing[(ringIndex + 1) % projectedRing.length]
          return sum + item.x * next.y - next.x * item.y
        }, 0)) / 2 : 0
        const markerArea = Math.PI * MARKER_RADIUS ** 2
        const markerWouldObscureCountry = projectedArea < markerArea * 2.2
        const needsLeader = Math.max(countryWidth, countryHeight) < 25 || markerWouldObscureCountry
        return [{ index, point, needsLeader }]
      })
      const labelPlacements = placeMarkerLabels(markerSpecs, width, height)
      markerSpecs.forEach(({ index, point, needsLeader }) => {
        const labelPoint = labelPlacements.get(index) ?? point
        if (needsLeader) {
          // A restrained white halo keeps the leader visible over land and sea;
          // the dark, thin core distinguishes it from pale country borders.
          context.setLineDash([])
          context.beginPath()
          context.moveTo(point.x, point.y)
          context.lineTo(labelPoint.x, labelPoint.y)
          context.strokeStyle = MAP_COLORS.leaderHalo
          context.lineWidth = 3
          context.stroke()
          context.beginPath()
          context.moveTo(point.x, point.y)
          context.lineTo(labelPoint.x, labelPoint.y)
          context.strokeStyle = MAP_COLORS.leaderCore
          context.lineWidth = 1.35
          context.stroke()
          context.beginPath()
          context.arc(point.x, point.y, 3.5, 0, Math.PI * 2)
          context.fillStyle = CHOICE_COLORS[index].color
          context.fill()
          context.strokeStyle = '#ffffff'
          context.lineWidth = 1.5
          context.stroke()
        }
        context.beginPath()
        context.arc(labelPoint.x, labelPoint.y, MARKER_RADIUS, 0, Math.PI * 2)
        context.fillStyle = CHOICE_COLORS[index].color
        context.fill()
        context.strokeStyle = '#ffffff'
        context.lineWidth = 2
        context.stroke()
        context.fillStyle = CHOICE_COLORS[index].textColor
        context.font = '700 10px DM Sans, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(String.fromCharCode(65 + index), labelPoint.x, labelPoint.y + .5)
      })
    }

    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    draw()
    if (showElevation) void loadElevationHeatmaps().then(({ mercator }) => {
        if (cancelled) return
        heatmapRef.current = mercator
        draw()
      }).catch(() => {
        // The map remains usable when the optional elevation texture fails.
      })
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDistance = 0
    let pinchCenter = { x: 0, y: 0 }
    const fittedSize = () => {
      const bounds = canvas.getBoundingClientRect()
      return Math.min(bounds.width - 20, bounds.height - 20)
    }
    const zoomAt = (clientX: number, clientY: number, requestedZoom: number) => {
      const bounds = canvas.getBoundingClientRect()
      const localX = clientX - bounds.left
      const localY = clientY - bounds.top
      const oldView = viewRef.current
      const nextZoom = Math.max(1, Math.min(50, requestedZoom))
      const baseSize = fittedSize()
      const worldX = oldView.centerX + (localX - bounds.width / 2) / (baseSize * oldView.zoom)
      const worldY = oldView.centerY + (localY - bounds.height / 2) / (baseSize * oldView.zoom)
      viewRef.current = {
        zoom: nextZoom,
        centerX: worldX - (localX - bounds.width / 2) / (baseSize * nextZoom),
        centerY: Math.max(0, Math.min(1, worldY - (localY - bounds.height / 2) / (baseSize * nextZoom))),
      }
    }
    const pointerDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId)
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    const pointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const active = [...pointers.values()]
      if (active.length === 1) {
        const size = fittedSize() * viewRef.current.zoom
        viewRef.current.centerX -= (event.clientX - previous.x) / size
        viewRef.current.centerY = Math.max(0, Math.min(1, viewRef.current.centerY - (event.clientY - previous.y) / size))
      } else if (active.length >= 2) {
        const center = { x: (active[0].x + active[1].x) / 2, y: (active[0].y + active[1].y) / 2 }
        const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y)
        if (pinchDistance) {
          zoomAt(center.x, center.y, viewRef.current.zoom * distance / pinchDistance)
          const size = fittedSize() * viewRef.current.zoom
          viewRef.current.centerX -= (center.x - pinchCenter.x) / size
          viewRef.current.centerY = Math.max(0, Math.min(1, viewRef.current.centerY - (center.y - pinchCenter.y) / size))
        }
        pinchDistance = distance; pinchCenter = center
      }
      draw()
    }
    const pointerUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (pointers.size < 2) pinchDistance = 0
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomAt(event.clientX, event.clientY, viewRef.current.zoom * Math.exp(-event.deltaY * .0015))
      draw()
    }
    const doubleClick = (event: MouseEvent) => { zoomAt(event.clientX, event.clientY, viewRef.current.zoom * 1.8); draw() }
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', pointerUp)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('dblclick', doubleClick)
    return () => {
      cancelled = true
      observer.disconnect()
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('pointercancel', pointerUp)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('dblclick', doubleClick)
    }
  }, [choiceCountries, showElevation, target])

  return <canvas ref={canvasRef} className="mercator-map" role="img" aria-label="国境を表示したメルカトル図法の世界地図" />
}
