import { describe, expect, it } from 'vitest'
import { buildCountries } from './countryData'
import { COUNTRY_FEATURES } from './countryFeatures'

describe('COUNTRY_FEATURES', () => {
  it('特徴問題の対象国ごとに1問以上ある', () => {
    for (const [code, features] of Object.entries(COUNTRY_FEATURES)) {
      expect(features.length, code).toBeGreaterThanOrEqual(1)
      expect(features.every((feature) => feature.trim().length > 0), code).toBe(true)
    }
  })

  it('旧国名のスワジランドではなくエスワティニと表示する', () => {
    expect(buildCountries().find((country) => country.code === 'SZ')?.name).toBe('エスワティニ')
  })
})
