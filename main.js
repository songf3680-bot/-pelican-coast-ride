import { createGame, meters, start, togglePause, update } from './game.js'
import { render } from './render.js'

const byId = (id) => document.getElementById(id)
const canvas = byId('game')
const ctx = canvas.getContext('2d')
const overlay = byId('overlay')
const title = byId('overlay-title')
const message = byId('overlay-message')
const primary = byId('primary-action')
const pause = byId('pause')
const pauseLabel = byId('pause-label')
const distance = byId('distance')
const score = byId('score')
const best = byId('best')
const status = byId('status')

const BEST_KEY = 'orca-pelican-coast-best'
const controls = {
  boost: byId('boost'),
  brake: byId('brake'),
  jump: byId('jump')
}
const keys = new Map([
  ['ArrowRight', 'boost'],
  ['KeyD', 'boost'],
  ['ArrowLeft', 'brake'],
  ['KeyA', 'brake'],
  ['ArrowUp', 'jump'],
  ['Space', 'jump'],
  ['KeyW', 'jump']
])
const heldKeys = new Set()
const pointers = new Map()
let jumpRequested = false
let previousFrame = null
let state = createGame(loadBest())

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) ?? 0)
  } catch {
    return 0
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value))
  } catch {
    // The current session still keeps the record.
  }
}

function showText(element, value) {
  const text = String(value)
  if (element.textContent !== text) {
    element.textContent = text
  }
}

function draw() {
  render(ctx, state)
  showText(distance, meters(state.distance))
  showText(score, state.score)
  showText(best, state.best)
}

function resetInput() {
  heldKeys.clear()
  pointers.clear()
  jumpRequested = false
}

function showStatus() {
  const running = state.status === 'running'
  const paused = state.status === 'paused'
  overlay.hidden = running
  pause.disabled = state.status === 'ready' || state.status === 'over'
  pause.setAttribute('aria-label', paused ? '继续骑行' : '暂停骑行')
  pause.setAttribute('aria-pressed', String(paused))
  if (pauseLabel) {
    showText(pauseLabel, paused ? '继续' : '暂停')
  }
  if (running) {
    if (status) {
      showText(status, '骑行中')
    }
    return
  }

  const copy = {
    ready: ['沿着海岸骑一程', '骑上单车，收集小鱼，跃过沙堡。', '开始骑行'],
    paused: ['骑行暂停', '准备好后，接着沿海往前骑。', '继续骑行'],
    over: [
      '撞到沙堡了！',
      `本次骑行 ${meters(state.distance)} 米，收获 ${state.score} 条鱼。`,
      '再骑一次'
    ]
  }
  const [heading, description, action] = copy[state.status]
  showText(title, heading)
  showText(message, description)
  showText(primary, action)
  if (status) {
    showText(status, state.status === 'over' ? `${heading} ${description}` : heading)
  }
}

function transition(next, moveFocus = true) {
  if (state === next) {
    return
  }
  state = next
  previousFrame = null
  resetInput()
  showStatus()
  draw()
  if (!moveFocus) {
    return
  }
  if (state.status === 'running') {
    canvas.focus({ preventScroll: true })
  } else {
    primary.focus({ preventScroll: true })
  }
}

function mainAction() {
  transition(start(state))
}

function pauseAction() {
  transition(togglePause(state))
}

function pauseForInactivity() {
  if (state.status === 'running') {
    transition(togglePause(state), false)
  } else {
    resetInput()
  }
}

function isHeld(action) {
  for (const key of heldKeys) {
    if (keys.get(key) === action) {
      return true
    }
  }
  for (const pointerAction of pointers.values()) {
    if (pointerAction === action) {
      return true
    }
  }
  return false
}

primary.addEventListener('click', mainAction)
pause.addEventListener('click', pauseAction)

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return
  }
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (!event.repeat && (state.status === 'running' || state.status === 'paused')) {
      event.preventDefault()
      pauseAction()
    }
    return
  }
  const action = keys.get(event.code)
  if (!action || state.status !== 'running') {
    return
  }
  if (event.code === 'Space' && (event.target === pause || event.target === controls.jump)) {
    return
  }
  event.preventDefault()
  if (action === 'jump' && !event.repeat && !heldKeys.has(event.code)) {
    jumpRequested = true
  }
  heldKeys.add(event.code)
})
window.addEventListener('keyup', (event) => heldKeys.delete(event.code))
window.addEventListener('blur', pauseForInactivity)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseForInactivity()
  }
})

for (const [action, control] of Object.entries(controls)) {
  control.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || state.status !== 'running') {
      return
    }
    control.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, action)
    if (action === 'jump') {
      jumpRequested = true
    }
  })
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    control.addEventListener(event, ({ pointerId }) => pointers.delete(pointerId))
  }
  if (action === 'jump') {
    control.addEventListener('click', (event) => {
      if (event.detail === 0 && state.status === 'running') {
        jumpRequested = true
      }
    })
  } else {
    for (const code of ['Space', 'Enter']) {
      const virtualId = action + code
      control.addEventListener('keydown', (event) => {
        if (event.code !== code || state.status !== 'running') {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        pointers.set(virtualId, action)
      })
      control.addEventListener('keyup', (event) => {
        if (event.code === code) {
          pointers.delete(virtualId)
        }
      })
      control.addEventListener('blur', () => pointers.delete(virtualId))
    }
  }
}

function frame(now) {
  if (state.status === 'running' && previousFrame !== null) {
    const next = update(state, (now - previousFrame) / 1000, {
      boost: isHeld('boost'),
      brake: isHeld('brake'),
      jump: jumpRequested
    })
    if (next !== state) {
      jumpRequested = false
    }
    if (next.status === 'over') {
      saveBest(next.best)
      transition(next)
    } else {
      state = next
      draw()
    }
  }
  previousFrame = state.status === 'running' ? now : null
  requestAnimationFrame(frame)
}

showStatus()
draw()
requestAnimationFrame(frame)
