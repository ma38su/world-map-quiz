import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, Crosshair, Mountain, RotateCcw, Settings2, Trophy, XCircle } from 'lucide-react'
import { CHOICE_COLORS } from './mapConstants'
import type { Country } from './countryData'
import { LEVELS, getCountryLevel, type QuizLevel } from './quizLevels'
import { COUNTRY_FEATURES, randomCountryFeature } from './countryFeatures'
import { createChoices, shuffle } from './quizEngine'
import { CountryName, RubyText } from './RubyText'
import { CONCRETE_QUESTION_KINDS, QUESTION_KINDS, QUESTION_META, type ConcreteQuestionKind, type QuestionKind } from './quizTypes'
import './App.css'

const Globe = lazy(() => import('./Globe'))
const MercatorMap = lazy(() => import('./MercatorMap'))
const CountryFlag = lazy(() => import('./CountryFlag'))

type Result = 'idle' | 'correct' | 'wrong'
type QuizMode = 'choice'
type View = 'home' | 'quiz' | 'scoreboard'
type MapProjection = 'mercator' | 'globe'
type Score = { correct: number; total: number }
type Scores = Record<QuizLevel, Score>
type MistakeRecord = { code: string; name: string; wrongCount: number; lastWrongAt: string }

const STORAGE_KEY = 'geo-sphere-quiz-progress-v1'
const EMPTY_SCORES: Scores = {
  elementary: { correct: 0, total: 0 },
  junior: { correct: 0, total: 0 },
  exam: { correct: 0, total: 0 },
  other: { correct: 0, total: 0 },
}

function loadProgress(): { level: QuizLevel; mode: QuizMode; questionKind: QuestionKind; mapProjection: MapProjection; scores: Scores; mistakes: MistakeRecord[] } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      level?: string
      mode?: string
      questionKind?: string
      mapProjection?: string
      scores?: Partial<Scores>
      mistakes?: MistakeRecord[]
    }
    const level = Object.hasOwn(LEVELS, saved.level ?? '') ? saved.level as QuizLevel : 'elementary'
    const mode: QuizMode = 'choice'
    const questionKind = QUESTION_KINDS.includes(saved.questionKind as QuestionKind)
      ? saved.questionKind as QuestionKind
      : 'mix'
    const mapProjection: MapProjection = saved.mapProjection === 'globe' ? 'globe' : 'mercator'
    const scores = structuredClone(EMPTY_SCORES)
    for (const key of Object.keys(LEVELS) as QuizLevel[]) {
      const score = saved.scores?.[key]
      if (!score) continue
      const total = Number.isInteger(score.total) && score.total >= 0 ? score.total : 0
      const correct = Number.isInteger(score.correct) && score.correct >= 0
        ? Math.min(score.correct, total)
        : 0
      scores[key] = { correct, total }
    }
    const mistakes = Array.isArray(saved.mistakes)
      ? saved.mistakes.filter((item) => item && typeof item.code === 'string' &&
          typeof item.name === 'string' && Number.isInteger(item.wrongCount) && item.wrongCount > 0 &&
          typeof item.lastWrongAt === 'string')
      : []
    return { level, mode, questionKind, mapProjection, scores, mistakes }
  } catch {
    return { level: 'elementary', mode: 'choice', questionKind: 'mix', mapProjection: 'mercator', scores: structuredClone(EMPTY_SCORES), mistakes: [] }
  }
}

const ANSWER_ALIASES: Record<string, string[]> = {
  US: ['アメリカ', '米国'], GB: ['イギリス', '英国'], KR: ['韓国'], KP: ['北朝鮮'],
  CN: ['中国'], RU: ['ロシア'], CZ: ['チェコ'], CI: ['コートジボワール'],
  CD: ['コンゴ民主共和国'], CG: ['コンゴ共和国'], LA: ['ラオス'], VN: ['ベトナム'],
  BO: ['ボリビア'], VE: ['ベネズエラ'], TZ: ['タンザニア'], SY: ['シリア'],
  IR: ['イラン'], BN: ['ブルネイ'], MD: ['モルドバ'], TW: ['台湾'],
}

function App() {
  const [initialProgress] = useState(loadProgress)
  const [view, setView] = useState<View>('home')
  const [countries, setCountries] = useState<Country[]>([])
  const [level, setLevel] = useState<QuizLevel>(initialProgress.level)
  const mode: QuizMode = 'choice'
  const [questionKind, setQuestionKind] = useState<QuestionKind>(initialProgress.questionKind)
  const [activeQuestionKind, setActiveQuestionKind] = useState<ConcreteQuestionKind>('map')
  const [mapProjection, setMapProjection] = useState<MapProjection>(initialProgress.mapProjection)
  const [showElevation, setShowElevation] = useState(false)
  const [resetNorthSignal, setResetNorthSignal] = useState(0)
  const [target, setTarget] = useState<Country | null>(null)
  const [choices, setChoices] = useState<Country[]>([])
  const [featureText, setFeatureText] = useState('')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<Result>('idle')
  const [scores, setScores] = useState<Scores>(initialProgress.scores)
  const [mistakes, setMistakes] = useState<MistakeRecord[]>(initialProgress.mistakes)
  const [reviewMode, setReviewMode] = useState(false)
  const [levelChosen, setLevelChosen] = useState(false)
  const [round, setRound] = useState({ answered: 0, correct: 0, usedIds: [] as string[], limit: 10 })
  const [roundComplete, setRoundComplete] = useState(false)
  const answerLockedRef = useRef(false)
  const resultMessageRef = useRef<HTMLDivElement>(null)
  const currentKind: QuestionKind = target ? activeQuestionKind : questionKind
  const totalScore = useMemo(() => Object.values(scores).reduce(
    (sum, item) => ({ correct: sum.correct + item.correct, total: sum.total + item.total }),
    { correct: 0, total: 0 },
  ), [scores])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, mode, questionKind, mapProjection, scores, mistakes }))
    } catch {
      // Storage can be unavailable in strict privacy modes; the quiz still works in memory.
    }
  }, [level, mode, questionKind, mapProjection, scores, mistakes])

  useEffect(() => {
    if (result === 'idle') return
    resultMessageRef.current?.focus()
  }, [result])

  const pool = useMemo(
    () => (reviewMode
      ? countries.filter((country) => mistakes.some((mistake) => mistake.code === country.code))
      : countries.filter((country) => getCountryLevel(country.code) === level))
      .filter((country) => !QUESTION_META[questionKind].usesFeature || COUNTRY_FEATURES[country.code]),
    [countries, level, mistakes, questionKind, reviewMode],
  )

  const resetQuestion = useCallback(() => {
    setTarget(null)
    setChoices([])
    setFeatureText('')
    setAnswer('')
    setSelectedCode(null)
    setResult('idle')
    setRound({ answered: 0, correct: 0, usedIds: [], limit: 10 })
    setRoundComplete(false)
    answerLockedRef.current = false
  }, [])

  const nextQuestion = useCallback(() => {
    if (target && (round.answered >= round.limit || round.usedIds.length >= round.limit)) {
      setTarget(null)
      setChoices([])
      setRoundComplete(true)
      return
    }
    const startingRound = !target
    if (startingRound && !pool.length) return
    const usedIds = startingRound ? [] : round.usedIds
    const candidates = pool.filter((country) => !usedIds.includes(country.id))
    if (!candidates.length) {
      setTarget(null)
      setChoices([])
      setRoundComplete(true)
      return
    }
    const next = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]
    const availableKinds = CONCRETE_QUESTION_KINDS.filter((kind) => !QUESTION_META[kind].usesFeature || COUNTRY_FEATURES[next.code])
    const nextKind = questionKind === 'mix'
      ? shuffle(availableKinds.filter((kind) => kind !== activeQuestionKind)).at(0) ?? availableKinds[0]
      : questionKind
    setActiveQuestionKind(nextKind)
    if (!QUESTION_META[nextKind].highlightedCountry) setMapProjection('mercator')
    setChoices(createChoices(next, countries, nextKind))
    setFeatureText(QUESTION_META[nextKind].usesFeature ? randomCountryFeature(next.code) ?? '' : '')
    setTarget(next)
    setRound((current) => startingRound
      ? { answered: 0, correct: 0, usedIds: [next.id], limit: Math.min(10, pool.length) }
      : { ...current, usedIds: [...current.usedIds, next.id] })
    setRoundComplete(false)
    setAnswer('')
    setSelectedCode(null)
    setResult('idle')
    answerLockedRef.current = false
  }, [activeQuestionKind, countries, pool, questionKind, round, target])

  const changeLevel = (next: QuizLevel) => {
    setLevel(next)
    setLevelChosen(true)
    setReviewMode(false)
    resetQuestion()
  }

  const openQuiz = () => {
    setReviewMode(false)
    setLevelChosen(false)
    resetQuestion()
    setMapProjection('mercator')
    setShowElevation(false)
    setView('quiz')
  }

  const startLevelQuiz = (nextLevel: QuizLevel, nextKind: QuestionKind = questionKind) => {
    const questionPool = countries.filter((country) =>
      getCountryLevel(country.code) === nextLevel &&
      (!QUESTION_META[nextKind].usesFeature || COUNTRY_FEATURES[country.code]),
    )
    const next = shuffle(questionPool)[0]
    if (!next) return
    setLevel(nextLevel)
    setQuestionKind(nextKind)
    setLevelChosen(true)
    setReviewMode(false)
    setMapProjection('mercator')
    setShowElevation(false)
    const availableKinds = CONCRETE_QUESTION_KINDS.filter((kind) => !QUESTION_META[kind].usesFeature || COUNTRY_FEATURES[next.code])
    const resolvedKind = nextKind === 'mix' ? shuffle(availableKinds)[0] : nextKind
    setActiveQuestionKind(resolvedKind)
    if (!QUESTION_META[resolvedKind].highlightedCountry) setMapProjection('mercator')
    setTarget(next)
    setRound({ answered: 0, correct: 0, usedIds: [next.id], limit: Math.min(10, questionPool.length) })
    setRoundComplete(false)
    setChoices(createChoices(next, countries, resolvedKind))
    setFeatureText(QUESTION_META[resolvedKind].usesFeature ? randomCountryFeature(next.code) ?? '' : '')
    setAnswer('')
    setSelectedCode(null)
    setResult('idle')
    answerLockedRef.current = false
    setView('quiz')
  }

  const checkAnswer = (selected?: Country) => {
    const submittedAnswer = selected?.name ?? answer.trim()
    if (!target || !submittedAnswer || result !== 'idle' || answerLockedRef.current) return
    answerLockedRef.current = true
    const normalize = (value: string) =>
      value.normalize('NFKC').replace(/[\s・･\-ー共和国連邦国]/g, '').toLowerCase()
    const accepted = [target.name, ...(ANSWER_ALIASES[target.code] ?? [])]
    const isCorrect = selected
      ? selected.id === target.id
      : accepted.some((name) => normalize(submittedAnswer) === normalize(name))
    setAnswer(submittedAnswer)
    setSelectedCode(selected?.code ?? null)
    setResult(isCorrect ? 'correct' : 'wrong')
    setRound((current) => ({
      ...current,
      answered: current.answered + 1,
      correct: current.correct + (isCorrect ? 1 : 0),
    }))
    if (!isCorrect) {
      setMistakes((current) => {
        const previous = current.find((item) => item.code === target.code)
        const updated: MistakeRecord = {
          code: target.code,
          name: target.name,
          wrongCount: (previous?.wrongCount ?? 0) + 1,
          lastWrongAt: new Date().toISOString(),
        }
        return [updated, ...current.filter((item) => item.code !== target.code)]
      })
    } else if (reviewMode) {
      setMistakes((current) => current.filter((item) => item.code !== target.code))
    }
    const scoreLevel = getCountryLevel(target.code)
    setScores((current) => ({
      ...current,
      [scoreLevel]: {
        correct: current[scoreLevel].correct + (isCorrect ? 1 : 0),
        total: current[scoreLevel].total + 1,
      },
    }))
  }

  return (
    <main className="app-shell">
      {view === 'scoreboard' && <header className="topbar">
        <button type="button" className="brand" onClick={() => setView('home')} aria-label="世界地図クイズ ホーム">
          <span className="brand-mark">G</span>
          <span><RubyText text="｜世界地図《せかいちず》クイズ" /></span>
        </button>
        <nav className="main-nav" aria-label="メインメニュー">
          <button onClick={() => setView('home')}>ホーム</button>
          <button onClick={openQuiz}>クイズ</button>
          <button className="active" onClick={() => setView('scoreboard')}>スコア</button>
        </nav>
        <button type="button" className="score-card" onClick={() => setView('scoreboard')} aria-label={`総合スコア ${totalScore.correct} / ${totalScore.total}`}>
          <Trophy size={16} />
          <span><RubyText text="｜得点《とくてん》" /></span>
          <strong>{totalScore.correct}<i>/</i>{totalScore.total}</strong>
        </button>
      </header>}

      {view === 'home' ? (
        <section className="home-page" id="top">
          <div className="home-copy">
            <div className="eyebrow"><RubyText text="｜見《み》つける・｜学《まな》ぶ・｜覚《おぼ》える" /></div>
            <h1 className="home-title"><RubyText text="｜世界地図《せかいちず》" /><br /><em>クイズ</em></h1>
            <p><RubyText text="｜地図《ちず》・｜国旗《こっき》・｜国《くに》の｜特徴《とくちょう》から、｜世界《せかい》の｜国々《くにぐに》を4｜択《たく》で｜学《まな》ぶ｜地理《ちり》クイズ。｜地球儀《ちきゅうぎ》にも｜切《き》り｜替《か》えられます。" /></p>
            <div className="home-quiz-setup">
              <div className="home-setup-label"><span className="step-number">1</span><RubyText text="まず、｜挑戦《ちょうせん》するレベルを｜選《えら》ぶ" /></div>
              <div className="quick-start">
                {(Object.keys(LEVELS) as QuizLevel[]).map((key) => <button type="button" key={key} className={level === key ? 'active' : ''} onClick={() => setLevel(key)} disabled={!countries.length}>
                  <small>{LEVELS[key].short}</small><RubyText text={LEVELS[key].rubyLabel} />
                </button>)}
              </div>
              <div className="home-setup-label"><span className="step-number">2</span><RubyText text="つぎに、｜問題《もんだい》のタイプを｜選《えら》んでスタート" /></div>
              <div className="home-kind-selector" role="group" aria-label="問題のタイプを選ぶとクイズが始まります">
                {QUESTION_KINDS.map((kind) => <button type="button" key={kind} onClick={() => startLevelQuiz(level, kind)} disabled={!countries.length}>
                  <RubyText text={QUESTION_META[kind].tab} /><b>→</b>
                </button>)}
              </div>
            </div>
            <button type="button" className="home-score-link" onClick={() => setView('scoreboard')}>スコアを<RubyText text="｜見《み》る" /></button>
            <dl className="home-stats">
              <div><dt>{countries.length || '190+'}</dt><dd><RubyText text="｜収録《しゅうろく》された｜国《くに》" /></dd></div>
              <div><dt>4</dt><dd><RubyText text="｜学習《がくしゅう》レベル" /></dd></div>
              <div><dt>4</dt><dd><RubyText text="｜選択肢《せんたくし》から｜回答《かいとう》" /></dd></div>
            </dl>
          </div>
          <div className="home-globe">
            <Suspense fallback={<div className="map-loading"><RubyText text="｜地球儀《ちきゅうぎ》を｜読《よ》み｜込《こ》んでいます…" /></div>}>
              <Globe target={null} onReady={setCountries} showElevation={false} autoRotate />
            </Suspense>
          </div>
          <div className="feature-strip">
            <div><span>01</span><b><RubyText text="レベル｜別出題《べつしゅつだい》" /></b><small><RubyText text="｜小学校《しょうがっこう》から｜大学入試《だいがくにゅうし》まで" /></small></div>
            <div><span>02</span><b><RubyText text="｜迷《まよ》わない4｜択式《たくしき》" /></b><small><RubyText text="スマホでも｜選《えら》びやすい｜回答形式《かいとうけいしき》" /></small></div>
            <div><span>03</span><b><RubyText text="｜苦手《にがて》を｜集中復習《しゅうちゅうふくしゅう》" /></b><small><RubyText text="｜間違《まちが》えた｜国《くに》を｜自動《じどう》で｜記録《きろく》" /></small></div>
          </div>
        </section>
      ) : view === 'scoreboard' ? (
        <section className="scoreboard-page">
          <div className="scoreboard-heading">
            <div><div className="eyebrow"><RubyText text="｜学習《がくしゅう》の｜記録《きろく》" /></div><h2>スコアボード</h2><p><RubyText text="この｜端末《たんまつ》に｜保存《ほぞん》された｜学習状況《がくしゅうじょうきょう》です。" /></p></div>
            <button type="button" className="primary compact" onClick={openQuiz}><RubyText text="クイズに｜挑戦《ちょうせん》" /> <ArrowRight size={18} /></button>
          </div>
          <div className="score-overview">
            <div className="score-ring" style={{ '--score': `${totalScore.total ? totalScore.correct / totalScore.total * 100 : 0}%` } as CSSProperties}>
              <strong>{totalScore.total ? Math.round(totalScore.correct / totalScore.total * 100) : 0}<small>%</small></strong>
              <span><RubyText text="｜総合正解率《そうごうせいかいりつ》" /></span>
            </div>
            <div className="score-numbers"><div><strong>{totalScore.correct}</strong><span><RubyText text="｜正解《せいかい》" /></span></div><div><strong>{totalScore.total}</strong><span><RubyText text="｜回答《かいとう》" /></span></div><div><strong>{mistakes.length}</strong><span><RubyText text="｜苦手《にがて》な｜国《くに》" /></span></div></div>
          </div>
          <div className="level-scores">
            {(Object.keys(LEVELS) as QuizLevel[]).map((key) => {
              const item = scores[key]
              const rate = item.total ? Math.round(item.correct / item.total * 100) : 0
              return <article key={key}>
                <header><small>{LEVELS[key].short}</small><b><RubyText text={LEVELS[key].rubyLabel} /></b><strong>{rate}%</strong></header>
                <div className="progress-track"><i style={{ width: `${rate}%` }} /></div>
                <footer><span>{item.correct} <RubyText text="｜正解《せいかい》" /></span><span>{item.total} <RubyText text="｜回答《かいとう》" /></span></footer>
              </article>
            })}
          </div>
          <div className="mistake-board">
            <div><div className="eyebrow"><RubyText text="｜復習《ふくしゅう》リスト" /></div><h3><RubyText text="｜苦手《にがて》な｜国《くに》" /></h3><p><RubyText text={mistakes.length ? '｜間違《まちが》えた｜回数《かいすう》が｜多《おお》い｜国《くに》から｜復習《ふくしゅう》しましょう。' : 'まだ｜苦手《にがて》な｜国《くに》はありません。クイズに｜挑戦《ちょうせん》してみましょう。'} /></p></div>
            <div className="mistake-chips">{[...mistakes].sort((a, b) => b.wrongCount - a.wrongCount).slice(0, 12).map((item) => <span key={item.code}><CountryName country={item} /><b>{item.wrongCount}<RubyText text="｜回《かい》" /></b></span>)}</div>
            {mistakes.length > 0 && <button type="button" className="secondary" onClick={() => { setReviewMode(true); setLevelChosen(true); setMapProjection('mercator'); setShowElevation(false); setView('quiz'); resetQuestion() }}><RotateCcw size={16} /><RubyText text="｜苦手復習《にがてふくしゅう》をはじめる" /></button>}
          </div>
        </section>
      ) : (
      <section className="workspace" id="top">
        <div className="globe-panel">
          <button type="button" className="quiz-back" onClick={() => setView('home')} aria-label="ホームへ戻る"><ArrowLeft size={18} /></button>
          <div className="map-projection" role="group" aria-label="地図表示">
            <button type="button" className={mapProjection === 'mercator' ? 'active' : ''} onClick={() => setMapProjection('mercator')}><RubyText text="｜世界地図《せかいちず》" /></button>
            {QUESTION_META[currentKind].highlightedCountry && <button type="button" className={mapProjection === 'globe' ? 'active' : ''} onClick={() => setMapProjection('globe')}>3D<RubyText text="｜地球儀《ちきゅうぎ》" /></button>}
            <button type="button" className={showElevation ? 'elevation-active' : ''} onClick={() => setShowElevation((current) => !current)}><Mountain size={13} /><RubyText text="｜標高《ひょうこう》" /> {showElevation ? 'ON' : 'OFF'}</button>
            {mapProjection === 'globe' && <button type="button" onClick={() => setResetNorthSignal((current) => current + 1)}><Compass size={13} /><RubyText text="｜北《きた》を｜上《うえ》へ" /></button>}
          </div>
          <Suspense fallback={<div className="map-loading"><RubyText text="｜地図《ちず》を｜読《よ》み｜込《こ》んでいます…" /></div>}>
            {mapProjection === 'mercator'
              ? <MercatorMap target={QUESTION_META[currentKind].highlightedCountry ? target : null} choiceCountries={QUESTION_META[currentKind].locationQuestion ? choices : []} onReady={setCountries} showElevation={showElevation} />
              : <Globe target={QUESTION_META[currentKind].highlightedCountry ? target : null} onReady={setCountries} showElevation={showElevation} resetNorthSignal={resetNorthSignal} />}
          </Suspense>
        </div>

        <aside className="quiz-panel">
          <div className="eyebrow"><RubyText text="｜世界《せかい》の｜国《くに》クイズ" /></div>
          <h1><RubyText text={QUESTION_META[currentKind].title.main} /><br /><em><RubyText text={QUESTION_META[currentKind].title.accent} /></em></h1>
          <p className="lead"><RubyText text={!target && !roundComplete
            ? '｜問題形式《もんだいけいしき》とレベルを｜選《えら》んでスタートしてください。'
            : target ? `${QUESTION_META[currentKind].lead}を4｜択《たく》から｜選《えら》んでください。`
              : `${round.answered}｜問《もん》の｜結果《けっか》を｜確認《かくにん》しましょう。`} /></p>

          {!target && !roundComplete ? <>
            <div className="setup-label"><span className="setup-step">1</span><RubyText text="｜問題形式《もんだいけいしき》" /></div>
            <div className="question-kind" role="group" aria-label="問題形式">
              {QUESTION_KINDS.map((kind) => <button type="button" key={kind} className={questionKind === kind ? 'active' : ''} onClick={() => {
                setQuestionKind(kind)
                if (QUESTION_META[kind].locationQuestion) setMapProjection('mercator')
                resetQuestion()
              }}><RubyText text={QUESTION_META[kind].tab} /></button>)}
            </div>

            <div className="setup-label"><span className="setup-step">2</span><RubyText text="｜学習《がくしゅう》レベル" /></div>
            <div className="level-tabs" role="group" aria-label="難易度">
              {(Object.keys(LEVELS) as QuizLevel[]).map((key) => (
                <button type="button" key={key} className={!reviewMode && levelChosen && level === key ? 'active' : ''} onClick={() => changeLevel(key)}>
                  <small>{LEVELS[key].short}</small><RubyText text={LEVELS[key].rubyLabel} />
                </button>
              ))}
            </div>

            <button type="button" className={`review-toggle ${reviewMode ? 'active' : ''}`} onClick={() => { setReviewMode((current) => !current); setLevelChosen(true); resetQuestion() }}>
              <span><RotateCcw size={15} /></span>
              <b><RubyText text="｜苦手《にがて》な｜国《くに》を｜復習《ふくしゅう》" /></b>
              <small>{mistakes.length}か<RubyText text="｜国《こく》" /></small>
            </button>
          </> : <div className="session-context">
            <div><span><RubyText text={questionKind === 'mix' ? `ミックス：${QUESTION_META[activeQuestionKind].tab}` : QUESTION_META[activeQuestionKind].tab} /></span><span><RubyText text={reviewMode ? '｜苦手復習《にがてふくしゅう》' : LEVELS[level].rubyLabel} /></span></div>
            {target && <strong><RubyText text="｜問題《もんだい》" /> {result === 'idle' ? Math.min(round.answered + 1, round.limit) : round.answered} / {round.limit}</strong>}
            <button type="button" onClick={resetQuestion}><Settings2 size={14} /><RubyText text="｜設定《せってい》を｜変更《へんこう》" /></button>
          </div>}

          <div className="question-card">
            {!target ? (
              <div className="start-state">
                <span className="crosshair"><Crosshair size={18} /></span>
                <p><RubyText text={roundComplete ? reviewMode ? '｜復習《ふくしゅう》クイズが｜終了《しゅうりょう》しました。' : 'クイズが｜終了《しゅうりょう》しました。' : reviewMode ? '｜以前《いぜん》に｜間違《まちが》えた｜国《くに》だけを｜出題《しゅつだい》します。' : levelChosen ? LEVELS[level].rubyDescription : '｜上《うえ》の4つから｜挑戦《ちょうせん》するレベルを｜選《えら》んでください。'} /></p>
                {roundComplete ? <div className="round-result" aria-label={`正答率 ${round.answered ? Math.round(round.correct / round.answered * 100) : 0}パーセント`}>
                  <div><span><RubyText text="｜正答率《せいとうりつ》" /></span><strong>{round.answered ? Math.round(round.correct / round.answered * 100) : 0}<small>%</small></strong></div>
                  <div><span><RubyText text="｜正解数《せいかいすう》" /></span><b>{round.correct} / {round.answered}</b></div>
                  <div><span><RubyText text={reviewMode ? '｜復習待《ふくしゅうま》ち' : '｜不正解《ふせいかい》'} /></span><b>{reviewMode ? pool.length : round.answered - round.correct}<small><RubyText text="か｜国《こく》" /></small></b></div>
                </div> : <strong><RubyText text={levelChosen || reviewMode ? `${Math.min(10, pool.length) || '—'}｜問《もん》・｜同《おな》じ｜国《くに》は｜出題《しゅつだい》されません` : 'レベルを｜選択《せんたく》'} /></strong>}
                <div className="start-actions">
                  <button type="button" className="primary" onClick={nextQuestion} disabled={roundComplete ? !pool.length : (!levelChosen && !reviewMode) || !pool.length}>
                    <RubyText text={roundComplete ? reviewMode ? (pool.length ? '｜同《おな》じ｜設定《せってい》で｜復習《ふくしゅう》を｜続《つづ》ける' : '｜苦手《にがて》な｜国《くに》はすべて｜復習済《ふくしゅうず》み') : '｜同《おな》じ｜設定《せってい》でもう｜一度《いちど》' : reviewMode ? (pool.length ? '｜復習《ふくしゅう》をはじめる' : '｜間違《まちが》えた｜国《くに》はありません') : levelChosen ? 'クイズをはじめる' : 'レベルを｜選《えら》んでください'} /> <ArrowRight size={18} />
                  </button>
                  {roundComplete && <button type="button" className="change-settings" onClick={resetQuestion}><Settings2 size={14} /><RubyText text="｜出題形式《しゅつだいけいしき》・レベルを｜変更《へんこう》" /></button>}
                </div>
              </div>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); if (result === 'idle') checkAnswer(); else nextQuestion() }}>
                {QUESTION_META[activeQuestionKind].usesFeature && <div className="feature-question"><RubyText text={featureText || COUNTRY_FEATURES[target.code]?.[0] || ''} /></div>}
                {activeQuestionKind === 'flag-to-map' && <div className="flag-question"><Suspense fallback={<span className="flag-placeholder" />}><CountryFlag code={target.code} /></Suspense><b><RubyText text="この｜国旗《こっき》の｜国《くに》はどこ？" /></b><span className="visually-hidden">スクリーンリーダー向け問題: <CountryName country={target} /></span></div>}
                <label><RubyText text={QUESTION_META[activeQuestionKind].answerType === 'location' ? '｜地図《ちず》の｜色《いろ》を｜選択《せんたく》' : QUESTION_META[activeQuestionKind].answerType === 'flag' ? '｜国旗《こっき》を｜選択《せんたく》' : '｜国名《こくめい》を｜選択《せんたく》'} /></label>
                <div className="choice-grid">
                  {choices.map((country, index) => {
                    const isTarget = country.id === target.id
                    const isSelected = country.code === selectedCode
                    const state = result !== 'idle' && isTarget ? 'correct' : result !== 'idle' && isSelected ? 'wrong' : ''
                    return <button
                      type="button"
                      key={country.id}
                      className={state}
                      aria-label={QUESTION_META[activeQuestionKind].locationQuestion || QUESTION_META[activeQuestionKind].answerType === 'flag'
                        ? `選択肢 ${String.fromCharCode(65 + index)}: ${country.name}`
                        : undefined}
                      onClick={() => checkAnswer(country)}
                      disabled={result !== 'idle'}
                    ><span className="choice-letter" style={QUESTION_META[activeQuestionKind].locationQuestion ? { background: CHOICE_COLORS[index].color, color: CHOICE_COLORS[index].textColor } : undefined}>{String.fromCharCode(65 + index)}</span>
                      <span className="choice-label">{QUESTION_META[activeQuestionKind].locationQuestion
                        ? <span className="map-choice-content">
                            <RubyText text={`${CHOICE_COLORS[index].rubyLabel}の｜国《くに》`} />
                            {result !== 'idle' && <span className="revealed-country-name"><CountryName country={country} /></span>}
                          </span>
                        : QUESTION_META[activeQuestionKind].answerType === 'flag'
                          ? <span className="flag-choice-content">
                              <Suspense fallback={<span className="flag-placeholder flag-option" />}><CountryFlag code={country.code} className="flag-option" /></Suspense>
                              {result !== 'idle' && <span className="flag-country-name"><CountryName country={country} /></span>}
                            </span>
                          : <CountryName country={country} />}</span>
                    </button>
                  })}
                </div>
                {result !== 'idle' && (
                  <div ref={resultMessageRef} className={`result-message ${result}`} role="status" aria-live="assertive" tabIndex={-1}>
                    <b>{result === 'correct' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}{result === 'correct' ? <RubyText text="｜正解《せいかい》！" /> : <RubyText text="｜不正解《ふせいかい》" />}</b>
                    <span className="result-details">
                      {result === 'wrong' && QUESTION_META[activeQuestionKind].answerType === 'flag' && selectedCode && (
                        <span><RubyText text="｜選《えら》んだ｜国旗《こっき》は" />「<CountryName country={choices.find((country) => country.code === selectedCode) ?? target} />」</span>
                      )}
                      <span><RubyText text={result === 'wrong' && QUESTION_META[activeQuestionKind].answerType === 'flag' ? '｜正解《せいかい》は' : '｜答《こた》えは'} />「<CountryName country={target} />」</span>
                    </span>
                  </div>
                )}
                {result !== 'idle' && <button className="primary next-action" type="submit"><RubyText text={round.answered >= round.limit ? '｜結果《けっか》を｜見《み》る' : '｜次《つぎ》の｜問題《もんだい》へ'} /><ArrowRight size={16} /></button>}
              </form>
            )}
          </div>

          <p className="level-note"><b><RubyText text={reviewMode ? '｜苦手復習《にがてふくしゅう》' : levelChosen ? LEVELS[level].rubyLabel : 'レベル｜未選択《みせんたく》'} /></b> — <RubyText text={reviewMode ? '｜復習《ふくしゅう》で｜正解《せいかい》すると｜苦手《にがて》リストから｜外《はず》れます。' : levelChosen ? LEVELS[level].rubyDescription : '｜挑戦《ちょうせん》する｜学習《がくしゅう》レベルを｜選択《せんたく》してください。'} /><br />
            <span className="storage-note">✓ <RubyText text="スコアと｜苦手《にがて》な｜国《くに》はこの｜端末《たんまつ》に｜自動保存《じどうほぞん》されます" /></span>
          </p>

        </aside>
      </section>
      )}
    </main>
  )
}

export default App
