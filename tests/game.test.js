import assert from 'node:assert/strict'
import test from 'node:test'
import { createGame, start, togglePause, update } from '../game.js'

const frame = 1 / 60
const physicsStep = frame / 2
const landingTimeout = 3.2

function ride(overrides = {}) {
  return { ...start(createGame()), objects: [], nextSegment: Number.POSITIVE_INFINITY, ...overrides }
}

function advance(state, seconds, input) {
  for (let elapsed = 0; elapsed < seconds && state.status === 'running'; elapsed += frame) {
    state = update(state, frame, input)
  }
  return state
}

function advanceToLanding(state, input) {
  const deadline = state.time + landingTimeout
  while (state.status === 'running' && state.y > 0 && state.time < deadline) {
    state = update(state, physicsStep, input)
  }
  return state
}

test('a ride advances only after starting and does not drift while paused', () => {
  const ready = createGame(12)
  assert.equal(ready.status, 'ready')
  assert.equal(ready.best, 12)
  assert.deepEqual(update(ready, frame, { jump: true }), ready)

  const running = advance(start(ready), 0.3)
  assert.equal(running.status, 'running')
  assert.ok(running.distance > 0)
  const paused = togglePause(running)
  assert.equal(paused.status, 'paused')
  assert.deepEqual(update(paused, 1, { boost: true, jump: true }), paused)
  const resumed = advance(togglePause(paused), 0.3)
  assert.equal(resumed.status, 'running')
  assert.ok(resumed.distance > running.distance)
  assert.equal(resumed.best, 12)
})

test('pedaling and braking change riding speed and the brake wins when both are held', () => {
  const initial = ride()
  const coast = advance(initial, 0.5)
  const boost = advance(initial, 0.5, { boost: true })
  const brake = advance(initial, 0.5, { brake: true })
  const both = advance(initial, 0.5, { boost: true, brake: true })
  assert.ok(boost.speed > coast.speed)
  assert.ok(brake.speed < coast.speed)
  assert.ok(boost.distance > coast.distance && coast.distance > brake.distance)
  assert.deepEqual(both, brake)
  assert.equal(initial.distance, 0)
})

test('a jump rises, ignores a second airborne impulse, and returns to the ground', () => {
  const rising = update(ride(), frame, { jump: true })
  assert.ok(rising.y > 0)
  assert.deepEqual(update(rising, frame, { jump: true }), update(rising, frame))
  const landed = advance(rising, 2)
  assert.equal(landed.y, 0)
  assert.equal(landed.jumpStart, null)
  assert.ok(update(landed, frame, { jump: true }).y > 0)
})

test('a jump holds its takeoff speed through midair control changes until touchdown', () => {
  const takeoff = ride()
  let airborne = update(takeoff, physicsStep, { jump: true, boost: true })
  assert.ok(airborne.y > 0)
  assert.equal(airborne.speed, takeoff.speed)
  assert.ok(Math.abs(airborne.distance - takeoff.distance - takeoff.speed * physicsStep) < 1e-8)

  for (let step = 0; step * physicsStep < landingTimeout && airborne.y > 0; step += 1) {
    const input = step % 2 === 0 ? { boost: true } : { brake: true }
    const next = update(airborne, physicsStep, input)
    if (next.y > 0) {
      assert.equal(next.speed, takeoff.speed)
      const travel = next.distance - airborne.distance
      assert.ok(Math.abs(travel - takeoff.speed * physicsStep) < 1e-8)
    }
    airborne = next
  }
  assert.equal(airborne.status, 'running')
  assert.equal(airborne.y, 0)
  assert.ok(update(airborne, frame, { boost: true }).speed > airborne.speed)
  assert.ok(update(airborne, frame, { brake: true }).speed < airborne.speed)
})

for (const [control, input, minTravel, maxAirtime, initialDistance] of [
  ['braking', { brake: true }, 155, 1.27, 0],
  ['coasting', {}, 155, 1.12, 0],
  ['boosting at top speed', { boost: true }, 235, 1.4, 6000]
]) {
  test(`a jump stays brisk and covers at least ${minTravel}px while ${control}`, () => {
    const takeoff = advance(ride({ distance: initialDistance }), 0.8, input)
    const airborne = update(takeoff, physicsStep, { ...input, jump: true })
    assert.ok(airborne.y > 0)
    const landed = advanceToLanding(airborne, input)
    assert.equal(landed.status, 'running')
    assert.equal(landed.y, 0)
    const travel = landed.distance - takeoff.distance
    const airtime = landed.time - takeoff.time
    assert.ok(travel >= minTravel, `jump covered only ${travel.toFixed(1)}px`)
    assert.ok(airtime <= maxAirtime, `jump took ${airtime.toFixed(2)}s (limit ${maxAirtime}s)`)
  })
}

test('even at braking speed, the bike passes the highest pixel row without hovering', () => {
  const takeoff = advance(ride(), 0.8, { brake: true })
  let state = update(takeoff, physicsStep, { jump: true })
  let peakRow = 0
  let timeAtPeak = 0
  while (state.jumpStart !== null && state.time - takeoff.time < landingTimeout) {
    const row = Math.round(state.y)
    if (row > peakRow) {
      peakRow = row
      timeAtPeak = 0
    }
    if (row === peakRow) {
      timeAtPeak += physicsStep
    }
    state = update(state, physicsStep)
  }
  assert.ok(peakRow > 0 && state.jumpStart === null)
  assert.ok(timeAtPeak < 0.13, `stayed at the highest pixel row for ${timeAtPeak.toFixed(2)}s`)
})

test('a collected fish only adds one point and leaves the next frame collectible-free', () => {
  const fish = Object.freeze({ x: 32, kind: 'fish', height: 38 })
  const initial = Object.freeze(ride({ objects: Object.freeze([fish]) }))
  const caught = advance(initial, 0.9)
  assert.equal(caught.status, 'running')
  assert.equal(caught.score, 1)
  assert.equal(advance(caught, 0.3).score, 1)
  assert.deepEqual(initial.objects, [fish])
  assert.equal(initial.score, 0)
})

test('a low rider hits a sandcastle while a correctly timed jump clears it', () => {
  const castle = { x: 40, kind: 'castle', height: 0 }
  const initial = ride({ objects: [castle] })
  const collision = advance(initial, 0.9)
  assert.equal(collision.status, 'over')
  assert.ok(collision.distance < advance(ride(), 0.9).distance)
  assert.deepEqual(update(collision, frame, { jump: true }), collision)

  const jumped = advance(update(initial, frame, { jump: true }), 0.9)
  assert.equal(jumped.status, 'running')
  assert.ok(jumped.distance > castle.x)
})

test('a crash saves the longest distance and restarting resets the ride', () => {
  const distance = 600
  const previousBest = 25
  const crash = advance(
    ride({
      distance,
      score: 4,
      best: previousBest,
      objects: [{ x: distance + 32, kind: 'castle', height: 0 }]
    }),
    0.9
  )
  assert.equal(crash.status, 'over')
  assert.equal(crash.best, Math.floor(crash.distance / 10))
  assert.ok(crash.best > previousBest)

  const restarted = start(crash)
  assert.equal(restarted.status, 'running')
  assert.equal(restarted.best, crash.best)
  assert.equal(restarted.distance, 0)
  assert.equal(restarted.score, 0)
  assert.equal(restarted.y, 0)

  const shorter = advance(
    ride({
      best: crash.best,
      objects: [{ x: 32, kind: 'castle', height: 0 }]
    }),
    0.9
  )
  assert.equal(shorter.status, 'over')
  assert.equal(shorter.best, crash.best)
})

test('a stalled frame limits its travel to the maximum simulation step', () => {
  const initial = ride()
  assert.deepEqual(update(initial, 2), update(initial, 0.05))
})

test('the opening route introduces ground fish before the first jump and its high fish reward', () => {
  let state = start(createGame())
  const firstCastle = state.objects.find(({ kind }) => kind === 'castle')
  while (state.status === 'running' && state.distance < firstCastle.x - 42) {
    state = update(state, frame)
  }
  assert.equal(state.status, 'running')
  assert.equal(state.score, 2)
  state = advance(update(state, frame, { jump: true }), 0.9)
  assert.equal(state.status, 'running')
  assert.equal(state.score, 3)
  assert.ok(state.distance > firstCastle.x)
})

for (const takeoffGap of [31, 44, 100]) {
  test(`a low-speed jump from ${takeoffGap}px clears the sandcastle and lands safely`, () => {
    let state = start(createGame())
    const firstCastle = state.objects.find(({ kind }) => kind === 'castle')
    const input = { brake: true }
    const takeoffDistance = firstCastle.x - takeoffGap
    while (state.status === 'running' && state.distance < takeoffDistance) {
      const timeToTakeoff = (takeoffDistance - state.distance) / state.speed
      // At the late boundary, sample the exact input time instead of crossing it in one frame.
      if (takeoffGap === 31 && timeToTakeoff < frame) {
        state = update(state, timeToTakeoff, input)
        break
      }
      state = update(state, frame, input)
    }
    assert.equal(state.status, 'running')
    if (takeoffGap === 31) {
      assert.ok(Math.abs(state.distance - takeoffDistance) < 1e-8)
    }
    state = update(state, frame, { ...input, jump: true })
    assert.ok(state.y > 0)
    state = advanceToLanding(state, input)
    assert.equal(state.status, 'running')
    assert.equal(state.y, 0)
    assert.ok(state.distance > firstCastle.x + 33)
  })
}

test('boosting leaves time to land and jump again between closely spaced sandcastles', () => {
  const finish = 7200
  const topSpeed = advance(ride({ distance: 6000 }), 0.8, { boost: true }).speed
  let state = start(createGame())
  let fullSpeedJumps = 0
  for (let elapsed = 0; elapsed < 50 && state.distance < finish; elapsed += frame) {
    const castle = state.objects.find(({ kind, x }) => kind === 'castle' && x > state.distance)
    const jump = state.y === 0 && !!castle && castle.x - state.distance <= 40
    if (jump && state.speed >= topSpeed - 1) {
      fullSpeedJumps += 1
    }
    state = update(state, frame, { boost: true, jump })
    assert.equal(state.status, 'running', `crashed at ${state.distance.toFixed(1)}px`)
  }
  assert.ok(state.distance >= finish)
  assert.ok(fullSpeedJumps >= 2)
})

test('the rear wheel collides only if it lands before clearing the sandcastle', () => {
  const castle = { x: 264, kind: 'castle', height: 0 }
  const input = { brake: true }
  const braking = advance(ride({ objects: [castle] }), 0.8, input)
  const jumpFrom = (gap) => {
    const takeoff = { ...braking, distance: castle.x - gap }
    return advanceToLanding(update(takeoff, physicsStep, { ...input, jump: true }), input)
  }

  const overlap = jumpFrom(165)
  assert.equal(overlap.status, 'over')
  assert.ok(overlap.distance > castle.x)

  const clear = jumpFrom(147)
  assert.equal(clear.status, 'running')
  assert.equal(clear.y, 0)
  assert.ok(clear.distance > castle.x + 30)
})
