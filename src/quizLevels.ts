export type QuizLevel = 'elementary' | 'junior' | 'exam' | 'other'

export const LEVELS: Record<QuizLevel, { label: string; rubyLabel: string; short: string; description: string; rubyDescription: string }> = {
  elementary: { label: '小学校', rubyLabel: '｜小学校《しょうがっこう》', short: 'レベル 1', description: '日本と関わりの深い国、主要な大国を中心に出題します。', rubyDescription: '｜日本《にほん》と｜関《かか》わりの｜深《ふか》い｜国《くに》、｜主要《しゅよう》な｜大国《たいこく》を｜中心《ちゅうしん》に｜出題《しゅつだい》します。' },
  junior: { label: '中学校', rubyLabel: '｜中学校《ちゅうがっこう》', short: 'レベル 2', description: '各州の代表国や、地理の授業で扱う国を出題します。', rubyDescription: '｜各州《かくしゅう》の｜代表国《だいひょうこく》や、｜地理《ちり》の｜授業《じゅぎょう》で｜扱《あつか》う｜国《くに》を｜出題《しゅつだい》します。' },
  exam: { label: '大学入試', rubyLabel: '｜大学入試《だいがくにゅうし》', short: 'レベル 3', description: '入試地理で統計・産業・地域問題に登場する国を出題します。', rubyDescription: '｜入試地理《にゅうしちり》で｜統計《とうけい》・｜産業《さんぎょう》・｜地域問題《ちいきもんだい》に｜登場《とうじょう》する｜国《くに》を｜出題《しゅつだい》します。' },
  other: { label: 'その他', rubyLabel: 'その｜他《た》', short: 'レベル 4', description: '島国や小国を含む、世界の国々から出題します。', rubyDescription: '｜島国《しまぐに》や｜小国《しょうこく》を｜含《ふく》む、｜世界《せかい》の｜国々《くにぐに》から｜出題《しゅつだい》します。' },
}

const elementary = new Set('JP US CN KR KP RU AU NZ IN BR CA GB FR DE IT EG ZA SA'.split(' '))
const junior = new Set('ES PT NL BE CH AT NO SE FI DK PL GR TR ID PH TH VN MY SG MX AR CL PE CO NG ET KE TZ MA DZ IR IQ IL PK BD LK NP MN KZ UA'.split(' '))
const exam = new Set('IE IS CZ SK HU RO BG RS HR SI BA AL MK BY LT LV EE GE AM AZ UZ TM KG TJ AF MM KH LA BN TL PG FJ CU VE EC BO PY UY GH CI SN SD SS CD CG AO ZM ZW MZ MG MU TN LY JO SY LB AE QA KW OM YE'.split(' '))

export function getCountryLevel(code: string): QuizLevel {
  if (elementary.has(code)) return 'elementary'
  if (junior.has(code)) return 'junior'
  if (exam.has(code)) return 'exam'
  return 'other'
}
