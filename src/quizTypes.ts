export type ConcreteQuestionKind = 'map' | 'feature' | 'feature-to-name' | 'feature-to-flag' | 'flag-to-map' | 'map-to-flag'
export type QuestionKind = ConcreteQuestionKind | 'mix'

export const CONCRETE_QUESTION_KINDS: ConcreteQuestionKind[] = ['map', 'feature', 'feature-to-name', 'feature-to-flag', 'flag-to-map', 'map-to-flag']
export const QUESTION_KINDS: QuestionKind[] = ['mix', ...CONCRETE_QUESTION_KINDS]

export const QUESTION_META: Record<QuestionKind, {
  tab: string
  homeLabel: string
  title: { main: string; accent: string }
  lead: string
  locationQuestion: boolean
  highlightedCountry: boolean
  usesFeature: boolean
  answerType: 'name' | 'location' | 'flag' | 'mixed'
}> = {
  mix: { tab: 'おまかせミックス', homeLabel: 'おまかせミックス', title: { main: 'いろいろな｜問題《もんだい》で', accent: '｜世界《せかい》に｜挑戦《ちょうせん》' }, lead: '｜問題《もんだい》の｜答《こた》え', locationQuestion: false, highlightedCountry: false, usesFeature: false, answerType: 'mixed' },
  map: { tab: '｜地図《ちず》→｜国名《こくめい》', homeLabel: '地図 → 国名', title: { main: '｜光《ひか》っている｜国《くに》は', accent: 'どこ？' }, lead: '｜光《ひか》っている｜国《くに》の｜名前《なまえ》', locationQuestion: false, highlightedCountry: true, usesFeature: false, answerType: 'name' },
  feature: { tab: '｜特徴《とくちょう》→｜場所《ばしょ》', homeLabel: '特徴 → 場所', title: { main: 'この｜特徴《とくちょう》にあう', accent: '｜国《くに》は？' }, lead: '｜特徴《とくちょう》にあてはまる｜場所《ばしょ》', locationQuestion: true, highlightedCountry: false, usesFeature: true, answerType: 'location' },
  'feature-to-name': { tab: '｜特徴《とくちょう》→｜国名《こくめい》', homeLabel: '特徴 → 国名', title: { main: 'この｜特徴《とくちょう》にあう', accent: '｜国名《こくめい》は？' }, lead: '｜特徴《とくちょう》にあてはまる｜国名《こくめい》', locationQuestion: false, highlightedCountry: false, usesFeature: true, answerType: 'name' },
  'feature-to-flag': { tab: '｜特徴《とくちょう》→｜国旗《こっき》', homeLabel: '特徴 → 国旗', title: { main: 'この｜特徴《とくちょう》にあう', accent: '｜国旗《こっき》は？' }, lead: '｜特徴《とくちょう》にあてはまる｜国旗《こっき》', locationQuestion: false, highlightedCountry: false, usesFeature: true, answerType: 'flag' },
  'flag-to-map': { tab: '｜国旗《こっき》→｜場所《ばしょ》', homeLabel: '国旗 → 場所', title: { main: 'この｜国旗《こっき》の｜国《くに》は', accent: 'どこ？' }, lead: '｜国旗《こっき》にあてはまる｜場所《ばしょ》', locationQuestion: true, highlightedCountry: false, usesFeature: false, answerType: 'location' },
  'map-to-flag': { tab: '｜地図《ちず》→｜国旗《こっき》', homeLabel: '地図 → 国旗', title: { main: '｜光《ひか》っている｜国《くに》の', accent: '｜国旗《こっき》は？' }, lead: '｜光《ひか》っている｜国《くに》の｜国旗《こっき》', locationQuestion: false, highlightedCountry: true, usesFeature: false, answerType: 'flag' },
}
