import { describe, expect, it } from 'vitest'
import { buildCountries } from './countryData'
import { createChoices, isAtOrBelowLevel, shuffle } from './quizEngine'
import { getCountryLevel } from './quizLevels'
import { CONCRETE_QUESTION_KINDS, QUESTION_META } from './quizTypes'

const countries = buildCountries()

describe('shuffle', () => {
  it('入力を変更せず、同じ要素を保持する', () => {
    const input = ['a', 'b', 'c', 'd']
    const result = shuffle(input)

    expect(input).toEqual(['a', 'b', 'c', 'd'])
    expect([...result].sort()).toEqual([...input].sort())
  })
})

describe('createChoices', () => {
  it.each(CONCRETE_QUESTION_KINDS)('%sでは全収録国に重複のない4択を生成する', (kind) => {
    for (const target of countries) {
      const choices = createChoices(target, countries, kind)

      expect(choices).toHaveLength(4)
      expect(new Set(choices.map((country) => country.id)).size, `${target.code}: ${target.name} -> ${choices.map((country) => `${country.code}:${country.id}`).join(', ')}`).toBe(4)
      expect(choices.filter((country) => country.id === target.id)).toHaveLength(1)
    }
  })

  it.each(CONCRETE_QUESTION_KINDS.filter((kind) => !QUESTION_META[kind].locationQuestion))(
    '%sの誤答候補は対象国以下の難易度に限定する',
    (kind) => {
      for (const target of countries) {
        const choices = createChoices(target, countries, kind)
        for (const choice of choices.filter((country) => country.id !== target.id)) {
          expect(isAtOrBelowLevel(choice, getCountryLevel(target.code))).toBe(true)
        }
      }
    },
  )
})
