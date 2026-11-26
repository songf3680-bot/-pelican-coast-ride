export const PLAYER_X = 108
export const GROUND_Y = 214
export const WHEEL_AXLE_OFFSET = 17
export const WHEEL_RADIUS = 12

const PIXELS_PER_METER = 10
const FIRST_SEGMENT = 360
const SEGMENT_LENGTH = 400
const LOOKAHEAD = 520
const MAX_FRAME = 0.05
const STEP = 1 / 120
const GRAVITY = 320
const JUMP_SPEED = 176
const JUMP_DURATION = (2 * JUMP_SPEED) / GRAVITY
const MIN_AIR_SPEED = 174
const AIR_SPEED_SCALE = 1.25
const TAKEOFF_RAMP = 0.14
const LANDING_RAMP = 0.16
const COAST_SPEED = 96
const BRAKE_SPEED = 68
const ACCELERATION = 180
const CASTLE_HALF_WIDTH = 5
const CASTLE_TOP = 12
const TIRE_HIT_RADIUS = 8

const fish = (x, height = 38) => ({ kind: 'fish', x, height })
const castle = (x) => ({ kind: 'castle', x, height: 0 })

const routes = [
  (x) => [fish(x), castle(x + 160), fish(x + 164, 73), fish(x + 258)],
  (x) => [fish(x + 14), fish(x + 48), fish(x + 163, 73), castle(x + 165)],
  (x) => [castle(x + 76), fish(x + 80, 72), fish(x + 224), castle(x + 376)],
  (x) => [fish(x + 28), fish(x + 156), fish(x + 274, 73), castle(x + 276)]
]

export function meters(distance) {
  return Math.floor(distance / PIXELS_PER_METER)
}

export function createGame(best = 0) {
  const record = Number.isFinite(best) && best >= 0 ? Math.floor(best) : 0
  return {
    status: 'ready',
    distance: 0,
    speed: COAST_SPEED,
    y: 0,
    velocityY: 0,
    time: 0,
    score: 0,
    best: record,
    objects: [fish(132), fish(176), castle(264), fish(264, 73)],
    nextSegment: FIRST_SEGMENT
  }
}

export function start(state) {
  if (state.status === 'running') {
    return state
  }
  if (state.status === 'paused') {
    return { ...state, status: 'running' }
  }
  return { ...createGame(state.best), status: 'running' }
}

export function togglePause(state) {
  if (state.status === 'running') {
    return { ...state, status: 'paused' }
  }
  if (state.status === 'paused') {
    return { ...state, status: 'running' }
  }
  return state
}

function extendRoute(state) {
  if (state.nextSegment < state.distance + LOOKAHEAD) {
    const index = (state.nextSegment - FIRST_SEGMENT) / SEGMENT_LENGTH
    state.objects = state.objects.concat(routes[index % routes.length](state.nextSegment))
    state.nextSegment += SEGMENT_LENGTH
  }
}

function wheelHitsCastle(wheelGap, verticalGap) {
  const horizontalGap = Math.max(0, Math.abs(wheelGap) - CASTLE_HALF_WIDTH)
  return horizontalGap ** 2 + verticalGap ** 2 < TIRE_HIT_RADIUS ** 2
}

function hitsCastle(gap, y) {
  // Inset the tire and sandcastle hit areas so grazing their pixel outlines is safe.
  const verticalGap = Math.max(0, y + WHEEL_RADIUS - CASTLE_TOP)
  return (
    wheelHitsCastle(gap - WHEEL_AXLE_OFFSET, verticalGap) ||
    wheelHitsCastle(gap + WHEEL_AXLE_OFFSET, verticalGap)
  )
}

function travelSpeed(state) {
  if (state.y === 0 && state.velocityY <= 0) {
    return state.speed
  }
  // Use the vertical arc as a clock so the forward boost ends at touchdown.
  const airtime = (JUMP_SPEED - state.velocityY) / GRAVITY
  const ramp = Math.max(
    0,
    Math.min(1, airtime / TAKEOFF_RAMP, (JUMP_DURATION - airtime) / LANDING_RAMP)
  )
  const airSpeed = Math.max(MIN_AIR_SPEED, state.speed * AIR_SPEED_SCALE)
  return state.speed + (airSpeed - state.speed) * ramp
}

function step(state, dt, input) {
  const cruise = COAST_SPEED + Math.min(38, state.distance / 145)
  const target = input.brake ? BRAKE_SPEED : input.boost ? cruise + 52 : cruise
  const change = target - state.speed
  state.speed += Math.sign(change) * Math.min(Math.abs(change), ACCELERATION * dt)
  state.distance += travelSpeed(state) * dt
  state.time += dt

  state.y += state.velocityY * dt - (GRAVITY * dt * dt) / 2
  state.velocityY -= GRAVITY * dt
  if (state.y <= 0) {
    state.y = 0
    state.velocityY = 0
  }

  state.objects = state.objects.filter((object) => {
    const gap = object.x - state.distance
    if (gap < -PLAYER_X - 15) {
      return false
    }
    if (object.kind === 'castle' && hitsCastle(gap, state.y)) {
      state.status = 'over'
      state.best = Math.max(state.best, meters(state.distance))
    }
    if (
      object.kind === 'fish' &&
      Math.abs(gap) <= 21 &&
      Math.abs(object.height - state.y - 37) <= 14
    ) {
      state.score += 1
      return false
    }
    return true
  })
}

export function update(state, deltaSeconds, input = {}) {
  if (state.status !== 'running' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return state
  }
  const next = { ...state }
  if (input.jump && next.y === 0) {
    next.velocityY = JUMP_SPEED
  }
  extendRoute(next)
  let remaining = Math.min(deltaSeconds, MAX_FRAME)
  while (remaining > 0 && next.status === 'running') {
    const dt = Math.min(remaining, STEP)
    step(next, dt, input)
    remaining -= dt
  }
  return next
}
