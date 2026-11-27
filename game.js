export const PLAYER_X = 108
export const GROUND_Y = 214
export const WHEEL_AXLE_OFFSET = 17
export const WHEEL_RADIUS = 12
export const WHEEL_RADIUS_Y = WHEEL_RADIUS + 1
export const FISH_RADIUS_X = 10
export const FISH_RADIUS_Y = 7
export const FISH_TAIL_X = -9
export const FISH_TAIL_HALF_HEIGHT = 5

const PIXELS_PER_METER = 10
const FIRST_CASTLE = 360
const FIRST_SEGMENT = FIRST_CASTLE + 96
const SEGMENT_LENGTH = 400
const LOOKAHEAD = 520
const MAX_FRAME = 0.05
const STEP = 1 / 120
const MIN_JUMP_DISTANCE = 180
const MIN_JUMP_TIME = 1.05
const JUMP_APEX = 0.55
const JUMP_HEIGHT = 48
const JUMP_EDGE_HEIGHT = 10
const JUMP_EDGE_DISTANCE = 10
const COAST_SPEED = 172
const BRAKE_SPEED = 144
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
    jumpStart: null,
    time: 0,
    score: 0,
    best: record,
    objects: [fish(132), fish(176), castle(FIRST_CASTLE), fish(FIRST_CASTLE, 73)],
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

export function fishHeight(fish, time) {
  return fish.height - Math.round(2 * Math.sin(time * 5 + fish.x * 0.035))
}

function collectsFish(fish, gap, state) {
  if (Math.abs(gap) <= 21 && Math.abs(fish.height - state.y - 37) <= 14) {
    return true
  }
  // Compare rounded sprite centers against the combined fish and tire radii.
  const fishX = Math.round(gap)
  const dx = Math.abs(fishX) - WHEEL_AXLE_OFFSET
  const wheelY = Math.round(GROUND_Y - state.y) - WHEEL_RADIUS
  const dy = GROUND_Y - fishHeight(fish, state.time) - wheelY
  const rx = WHEEL_RADIUS + FISH_RADIUS_X
  const ry = WHEEL_RADIUS_Y + FISH_RADIUS_Y
  if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1) {
    return true
  }

  // The fin sticks out of the oval. Its rasterized bottom vertex is exclusive.
  const tailDx = Math.abs(fishX + FISH_TAIL_X) - WHEEL_AXLE_OFFSET
  const tailDy = Math.max(0, dy - FISH_TAIL_HALF_HEIGHT, -dy - (FISH_TAIL_HALF_HEIGHT - 1))
  return (tailDx / WHEEL_RADIUS) ** 2 + (tailDy / WHEEL_RADIUS_Y) ** 2 <= 1
}

function adjustGroundSpeed(state, dt, input) {
  const cruise = COAST_SPEED + Math.min(20, state.distance / 145)
  const target = input.brake ? BRAKE_SPEED : input.boost ? cruise + 44 : cruise
  const change = target - state.speed
  state.speed += Math.sign(change) * Math.min(Math.abs(change), ACCELERATION * dt)
}

function updateJumpHeight(state) {
  const length = Math.max(MIN_JUMP_DISTANCE, state.speed * MIN_JUMP_TIME)
  const travelled = state.distance - state.jumpStart
  if (travelled >= length) {
    state.y = 0
    state.jumpStart = null
    return
  }

  // Rise briskly off the ground so a late jump can still clear the obstacle.
  const progress = travelled / length
  const edge = Math.min(1, travelled / JUMP_EDGE_DISTANCE, (length - travelled) / JUMP_EDGE_DISTANCE)
  // A narrow, rounded crest keeps the bike moving through the top pixel rows.
  const half = progress < JUMP_APEX ? JUMP_APEX : 1 - JUMP_APEX
  const fromPeak = Math.abs(progress - JUMP_APEX) / half
  const arch = (JUMP_HEIGHT - JUMP_EDGE_HEIGHT) * (1 - fromPeak ** 1.25)
  state.y = arch + JUMP_EDGE_HEIGHT * edge * (2 - edge)
}

function step(state, dt, input) {
  const airborne = state.jumpStart !== null
  if (!airborne) {
    adjustGroundSpeed(state, dt, input)
  }
  state.distance += state.speed * dt
  state.time += dt
  if (airborne) {
    updateJumpHeight(state)
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
    if (object.kind === 'fish' && collectsFish(object, gap, state)) {
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
  if (input.jump && next.jumpStart === null) {
    next.jumpStart = next.distance
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
