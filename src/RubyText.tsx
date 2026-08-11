import type { Country } from './Globe'

const COUNTRY_NAMES_WITH_RUBY: Record<string, string> = {
  BO: 'ボリビア｜多民族国《たみんぞくこく》', CF: '｜中央《ちゅうおう》アフリカ｜共和国《きょうわこく》', CN: '｜中華人民共和国《ちゅうかじんみんきょうわこく》', CG: 'コンゴ｜共和国《きょうわこく》', CD: 'コンゴ｜民主共和国《みんしゅきょうわこく》', DM: 'ドミニカ｜国《こく》', DO: 'ドミニカ｜共和国《きょうわこく》', GQ: '｜赤道《せきどう》ギニア', VA: 'バチカン｜市国《しこく》', HK: '｜香港《ほんこん》', IR: 'イラン・イスラム｜共和国《きょうわこく》', JP: '｜日本《にほん》', KP: '｜朝鮮民主主義人民共和国《ちょうせんみんしゅしゅぎじんみんきょうわこく》', KR: '｜大韓民国《だいかんみんこく》', LA: 'ラオス｜人民民主共和国《じんみんみんしゅきょうわこく》', FM: 'ミクロネシア｜連邦《れんぽう》', MD: 'モルドバ｜共和国《きょうわこく》', MK: '｜北《きた》マケドニア', RU: 'ロシア｜連邦《れんぽう》', ZA: '｜南《みなみ》アフリカ', SY: 'シリア・アラブ｜共和国《きょうわこく》', TW: '｜台湾《たいわん》', TL: '｜東《ひがし》ティモール', AE: 'アラブ｜首長国連邦《しゅちょうこくれんぽう》', US: 'アメリカ｜合衆国《がっしゅうこく》', VE: 'ベネズエラ・ボリバル｜共和国《きょうわこく》', EH: '｜西《にし》サハラ', SS: '｜南《みなみ》スーダン',
}

export function RubyText({ text }: { text: string }) {
  return <span className="ruby-text">{text.split(/(｜[^《]+《[^》]+》)/g).filter(Boolean).map((part, index) => {
    const match = part.match(/^｜([^《]+)《([^》]+)》$/)
    return match ? <ruby key={index}>{match[1]}<rt>{match[2]}</rt></ruby> : <span key={index}>{part}</span>
  })}</span>
}

export function CountryName({ country }: { country: Pick<Country, 'code' | 'name'> }) {
  return <RubyText text={COUNTRY_NAMES_WITH_RUBY[country.code] ?? country.name} />
}
