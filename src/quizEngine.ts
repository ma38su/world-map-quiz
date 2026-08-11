import type { Country } from './Globe'
import { getCountryLevel, type QuizLevel } from './quizLevels'
import { QUESTION_META, type ConcreteQuestionKind } from './quizTypes'

const LEVEL_ORDER: Record<QuizLevel, number> = { elementary: 0, junior: 1, exam: 2, other: 3 }

type Region = 'south-america' | 'north-america' | 'africa' | 'europe' | 'asia' | 'oceania'

function regionFor(country: Country): Region {
  const [longitude, latitude] = country.center
  if (longitude >= -84 && longitude <= -32 && latitude < 14) return 'south-america'
  if (longitude >= -170 && longitude <= -25 && latitude >= 7) return 'north-america'
  if (longitude >= -26 && longitude <= 45 && latitude >= 35) return 'europe'
  if (longitude >= -22 && longitude <= 55 && latitude >= -38 && latitude < 38 && (longitude <= 35 || latitude <= 15)) return 'africa'
  if ((longitude >= 110 && latitude < -8) || longitude >= 155 || longitude <= -170) return 'oceania'
  return 'asia'
}

function geographicDistance(from: Country, to: Country) {
  const [targetLongitude, targetLatitude] = from.center
  const rawLongitudeDistance = Math.abs(to.center[0] - targetLongitude)
  const longitudeDistance = Math.min(rawLongitudeDistance, 360 - rawLongitudeDistance) * Math.cos(targetLatitude * Math.PI / 180)
  return Math.hypot(longitudeDistance, to.center[1] - targetLatitude)
}

export function shuffle<T>(items: readonly T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function isAtOrBelowLevel(country: Country, maximumLevel: QuizLevel) {
  return LEVEL_ORDER[getCountryLevel(country.code)] <= LEVEL_ORDER[maximumLevel]
}

export function createChoices(target: Country, countries: Country[], kind: ConcreteQuestionKind) {
  const targetLevel = getCountryLevel(target.code)
  const eligible = countries.filter((country) =>
    country.id !== target.id && isAtOrBelowLevel(country, targetLevel),
  )
  if (!QUESTION_META[kind].locationQuestion) return shuffle([target, ...shuffle(eligible).slice(0, 3)])

  const targetRegion = regionFor(target)
  const regionalCountries = countries.filter((country) => country.id !== target.id && regionFor(country) === targetRegion)
    .sort((a, b) => {
      const aLevelPenalty = isAtOrBelowLevel(a, targetLevel) ? 0 : 1
      const bLevelPenalty = isAtOrBelowLevel(b, targetLevel) ? 0 : 1
      return aLevelPenalty - bLevelPenalty || geographicDistance(target, a) - geographicDistance(target, b)
    })
  const selected = regionalCountries.slice(0, 3)
  if (selected.length < 3) {
    const selectedIds = new Set(selected.map((country) => country.id))
    const nearbyFallback = countries.filter((country) => country.id !== target.id && !selectedIds.has(country.id))
      .sort((a, b) => {
        const aLevelPenalty = isAtOrBelowLevel(a, targetLevel) ? 0 : 1
        const bLevelPenalty = isAtOrBelowLevel(b, targetLevel) ? 0 : 1
        return aLevelPenalty - bLevelPenalty || geographicDistance(target, a) - geographicDistance(target, b)
      })
    selected.push(...nearbyFallback.slice(0, 3 - selected.length))
  }
  return shuffle([target, ...selected])
}
