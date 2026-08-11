export const CHOICE_COLORS = [
  { color: '#ed6048', borderColor: '#9f3829', textColor: '#ffffff', label: '赤', rubyLabel: '｜赤《あか》' },
  { color: '#e9b72e', borderColor: '#846414', textColor: '#173341', label: '黄', rubyLabel: '｜黄《き》' },
  { color: '#209b80', borderColor: '#116856', textColor: '#ffffff', label: '緑', rubyLabel: '｜緑《みどり》' },
  { color: '#6e66ca', borderColor: '#413b8c', textColor: '#ffffff', label: '紫', rubyLabel: '｜紫《むらさき》' },
] as const

export const MAP_COLORS = {
  oceanCenter: '#648b96',
  oceanEdge: '#365f70',
  land: '#879f95',
  landWithElevation: 'rgba(111, 142, 115, .48)',
  border: 'rgba(224, 238, 232, .74)',
  grid: 'rgba(220, 235, 234, .12)',
  target: 'rgba(246, 190, 39, .96)',
  targetBorder: '#fff8d4',
  leaderCore: '#173341',
  leaderHalo: 'rgba(255, 255, 255, .94)',
} as const
