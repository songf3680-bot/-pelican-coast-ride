import { changeSpeed, createGame, meters, PIXELS_PER_METER, start, togglePause, update } from './game.js?v=hold-boost'
import { render } from './render.js?v=hold-boost'

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
const speed = byId('speed')
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
const boostInputs = new Set()
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
  showSpeed()
}

function showSpeed() {
  showText(speed, (state.speed / PIXELS_PER_METER).toFixed(1))
}

function showStatus() {
  const running = state.status === 'running'
  const paused = state.status === 'paused'
  overlay.hidden = running
  canvas.classList.toggle('can-jump', running)
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
    ready: ['沿海骑一程', '点击画面跳过沙堡，沿途收集小鱼。', '开始骑行'],
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
  jumpRequested = false
  boostInputs.clear()
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
  }
}

function rideAction(action, inputId) {
  if (state.status !== 'running') return
  if (action === 'boost' && inputId !== undefined) {
    boostInputs.add(inputId)
    return
  }
  if (jumpRequested) return
  if (action === 'jump') {
    jumpRequested = state.jumpStart === null
  } else {
    state = changeSpeed(state, action === 'boost' ? 1 : -1)
    showSpeed()
  }
}

primary.addEventListener('click', mainAction)
pause.addEventListener('click', pauseAction)
canvas.addEventListener('pointerdown', (event) => {
  if (event.button === 0) {
    rideAction('jump')
  }
})

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
  if (event.code === 'Space' && event.target === pause) {
    return
  }
  event.preventDefault()
  if (!event.repeat) rideAction(action, event.code)
})
window.addEventListener('keyup', (event) => boostInputs.delete(event.code))
window.addEventListener('blur', pauseForInactivity)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseForInactivity()
  }
})

for (const [action, control] of Object.entries(controls)) {
  control.addEventListener('pointerdown', (event) => {
    if (event.button === 0 && state.status === 'running') {
      event.preventDefault()
      canvas.focus({ preventScroll: true })
      if (action === 'boost') {
        control.setPointerCapture(event.pointerId)
      }
      rideAction(action, event.pointerId)
    }
  })
  control.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) rideAction(action, event.code)
    }
  })
  control.addEventListener('click', (event) => {
    if (event.detail === 0) rideAction(action)
  })
}

for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  controls.boost.addEventListener(event, ({ pointerId }) => boostInputs.delete(pointerId))
}
controls.boost.addEventListener('blur', () => {
  boostInputs.delete('Space')
  boostInputs.delete('Enter')
})

function frame(now) {
  if (state.status === 'running' && previousFrame !== null) {
    const next = update(state, (now - previousFrame) / 1000, {
      boost: boostInputs.size > 0,
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
