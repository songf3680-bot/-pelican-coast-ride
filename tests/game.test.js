import assert from 'node:assert/strict'
import test from 'node:test'
import { brake, createGame, start, togglePause, update } from '../game.js'

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

function advanceToLanding(state) {
  const deadline = state.time + landingTimeout
  while (state.status === 'running' && state.y > 0 && state.time < deadline) {
    state = update(state, physicsStep)
  }
  return state
}

test('a ride advances only after starting and does not drift while paused', () => {
  const ready = createGame(12)
  assert.equal(ready.status, 'ready')
  assert.equal(ready.best, 12)
  assert.equal(brake(ready), ready)
  assert.deepEqual(update(ready, frame, { jump: true }), ready)

  const running = advance(start(ready), 0.3, { boost: true })
  assert.equal(running.status, 'running')
  assert.ok(running.distance > 0)
  const paused = togglePause(running)
  assert.equal(paused.status, 'paused')
  assert.equal(brake(paused), paused)
  assert.deepEqual(update(paused, 1, { jump: true }), paused)
  const resumed = advance(togglePause(paused), 0.3)
  assert.equal(resumed.status, 'running')
  assert.ok(resumed.distance > running.distance)
  assert.equal(resumed.speed, 170)
  assert.equal(resumed.best, 12)
})

test('a brake tap reduces ground speed down to the minimum and keeps the lower speed', () => {
  const fastest = advance(ride(), 0.8, { boost: true })
  assert.equal(brake(fastest, true).speed, 206)
  const slowest = brake(fastest)
  assert.equal(slowest.speed, 144)
  assert.equal(brake(slowest).speed, 144)
  assert.equal(advance(slowest, 0.5).speed, 144)
})

test('holding boost accelerates over time and releasing it restores 17 m/s', () => {
  const initial = ride()
  const shortHold = advance(initial, 0.2, { boost: true })
  const longerHold = advance(initial, 0.4, { boost: true })
  assert.ok(shortHold.speed > initial.speed)
  assert.ok(longerHold.speed > shortHold.speed && longerHold.speed < 236)
  const fastest = advance(longerHold, 0.4, { boost: true })
  assert.equal(fastest.speed, 236)
  for (const boosted of [shortHold, fastest]) {
    const released = update(boosted, physicsStep)
    assert.equal(released.speed, 170)
    assert.ok(Math.abs(released.distance - boosted.distance - 170 * physicsStep) < 1e-8)
    assert.equal(advance(released, 0.5).speed, 170)
    assert.equal(update(boosted, physicsStep, { jump: true }).speed, 170)
  }
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

test('releasing boost during a jump keeps takeoff speed until touchdown', () => {
  const takeoff = advance(ride(), 0.25, { boost: true })
  let airborne = update(takeoff, physicsStep, { jump: true, boost: true })
  assert.ok(airborne.y > 0)
  assert.equal(airborne.speed, takeoff.speed)
  assert.ok(Math.abs(airborne.distance - takeoff.distance - takeoff.speed * physicsStep) < 1e-8)

  for (let step = 0; step * physicsStep < landingTimeout && airborne.y > 0; step += 1) {
    assert.equal(brake(airborne), airborne)
    const next = update(airborne, physicsStep)
    assert.equal(next.speed, next.y > 0 ? takeoff.speed : 170)
    const travel = next.distance - airborne.distance
    assert.ok(Math.abs(travel - takeoff.speed * physicsStep) < 1e-8)
    airborne = next
  }
  assert.equal(airborne.status, 'running')
  assert.equal(airborne.y, 0)
  assert.equal(advance(airborne, 0.5).speed, 170)
  assert.equal(brake(airborne).speed, 144)
})

for (const [label, speed, expectedAirtime, expectedRange] of [
  ['minimum', 144, 1.25, 180],
  ['starting', 170, 180 / 170, 180],
  ['maximum', 236, 1.05, 248]
]) {
  test(`a jump keeps its flight time and horizontal range at ${label} speed`, () => {
    const takeoff = ride({ speed })
    const airborne = update(takeoff, physicsStep, { jump: true })
    assert.ok(airborne.y > 0)
    const landed = advanceToLanding(airborne)
    assert.equal(landed.status, 'running')
    assert.equal(landed.y, 0)
    const travel = landed.distance - takeoff.distance
    const airtime = landed.time - takeoff.time
    assert.ok(Math.abs(airtime - expectedAirtime) <= physicsStep + 1e-8, `airtime: ${airtime}s`)
    assert.ok(Math.abs(travel - expectedRange) < 3, `horizontal travel: ${travel}px`)
  })
}

for (const [label, speed, maxNearPeak] of [['starting', 170, 0.105], ['minimum', 144, 0.12]]) {
  test(`at ${label} speed the bike crests halfway through the jump and promptly drops`, () => {
    const takeoff = ride({ speed })
    let state = update(takeoff, physicsStep, { jump: true })
    let peakHeight = 0
    let peakTime = 0
    let timeNearPeak = 0
    while (state.jumpStart !== null && state.time < landingTimeout) {
      if (state.y >= 45) {
        timeNearPeak += physicsStep
      }
      if (state.y > peakHeight) {
        peakHeight = state.y
        peakTime = state.time
      }
      state = update(state, physicsStep)
    }
    assert.equal(state.jumpStart, null)
    assert.equal(Math.round(peakHeight), 48)
    assert.ok(Math.abs(peakTime - state.time / 2) <= physicsStep, `crest came at ${peakTime}s`)
    assert.ok(timeNearPeak <= maxNearPeak, `spent ${timeNearPeak.toFixed(3)}s within 3px of the apex`)
  })
}

test('the crest changes direction gradually and no descending frame drops the bike abruptly', () => {
  for (const speed of [144, 170, 236]) {
    let state = ride({ speed })
    let previousRise = 0
    let crestAcceleration = 0
    let largestDrop = 0
    do {
      const next = update(state, frame, { jump: state.time === 0 })
      const rise = next.y - state.y
      if (state.y >= 45) {
        crestAcceleration = Math.max(crestAcceleration, Math.abs(rise - previousRise))
      }
      largestDrop = Math.max(largestDrop, -rise)
      previousRise = rise
      state = next
    } while (state.jumpStart !== null && state.time < landingTimeout)
    assert.equal(state.jumpStart, null)
    assert.ok(crestAcceleration < 0.8, `crest speed changed by ${crestAcceleration.toFixed(2)}px/frame`)
    assert.ok(largestDrop < 4.5, `single-frame drop: ${largestDrop.toFixed(2)}px at ${state.speed}px/s`)
  }
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
  const initial = ride({
    distance,
    score: 4,
    best: previousBest,
    objects: [{ x: distance + 32, kind: 'castle', height: 0 }]
  })
  const crash = advance(brake(initial), 0.9)
  assert.equal(crash.status, 'over')
  assert.equal(crash.speed, 144)
  assert.equal(brake(crash), crash)
  assert.equal(crash.best, Math.floor(crash.distance / 10))
  assert.ok(crash.best > previousBest)

  const restarted = start(crash)
  assert.equal(restarted.status, 'running')
  assert.equal(restarted.best, crash.best)
  assert.equal(restarted.distance, 0)
  assert.equal(restarted.score, 0)
  assert.equal(restarted.y, 0)
  assert.equal(restarted.speed, 170)

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
  state = advance(update(state, frame, { jump: true }), 0.5)
  assert.equal(state.status, 'running')
  assert.equal(state.score, 3)
  assert.ok(state.distance > firstCastle.x)
})

test('the trailing wheel picks up a low fish after clearing the sandcastle', () => {
  const castle = { kind: 'castle', x: 616, height: 0 }
  const fish = { kind: 'fish', x: 714, height: 38 }
  const initial = ride({ distance: castle.x - 35, objects: [castle, fish] })
  const slower = { ...initial, speed: 216 }
  const faster = { ...initial, speed: 232 }
  // At 232px/s the front tire clears the fish by the time the bike is 6px past it.
  for (const [takeoff, checkpoint] of [[slower, fish.x], [faster, fish.x + 6]]) {
    let state = update(takeoff, physicsStep, { jump: true })
    while (state.status === 'running' && state.distance < checkpoint) {
      state = update(state, physicsStep)
    }
    assert.equal(state.status, 'running')
    assert.ok(state.y > 0 && state.objects.includes(fish))
    const landed = advanceToLanding(state)
    assert.equal(landed.status, 'running')
    assert.equal(landed.score, 1)
    assert.ok(!landed.objects.includes(fish))
  }
})

test('both outer tire edges collect touching fish while a separated fish stays put', () => {
  const rear = { kind: 'fish', x: 63, height: 12 }
  // Only the tail of the fish ahead overlaps the upper-right edge of the front tire.
  const front = { ...rear, x: 137, height: 21 }
  const missed = { ...rear, x: 56 }
  const caught = update(ride({ distance: 100, objects: [rear, front, missed] }), physicsStep)
  assert.equal(caught.score, 2)
  assert.deepEqual(caught.objects, [missed])
})

for (const takeoffGap of [31, 44, 100]) {
  test(`a low-speed jump from ${takeoffGap}px clears the sandcastle and lands safely`, () => {
    let state = brake(start(createGame()))
    const firstCastle = state.objects.find(({ kind }) => kind === 'castle')
    const takeoffDistance = firstCastle.x - takeoffGap
    while (state.status === 'running' && state.distance < takeoffDistance) {
      const timeToTakeoff = (takeoffDistance - state.distance) / state.speed
      // At the late boundary, sample the exact input time instead of crossing it in one frame.
      if (takeoffGap === 31 && timeToTakeoff < frame) {
        state = update(state, timeToTakeoff)
        break
      }
      state = update(state, frame)
    }
    assert.equal(state.status, 'running')
    if (takeoffGap === 31) {
      assert.ok(Math.abs(state.distance - takeoffDistance) < 1e-8)
    }
    state = update(state, frame, { jump: true })
    assert.ok(state.y > 0)
    state = advanceToLanding(state)
    assert.equal(state.status, 'running')
    assert.equal(state.y, 0)
    assert.ok(state.distance > firstCastle.x + 33)
  })
}

test('maximum speed leaves time to land and jump again between closely spaced sandcastles', () => {
  const finish = 7200
  let state = start(createGame())
  let fullSpeedJumps = 0
  for (let elapsed = 0; elapsed < 50 && state.distance < finish; elapsed += frame) {
    const castle = state.objects.find(({ kind, x }) => kind === 'castle' && x > state.distance)
    const jump = state.y === 0 && !!castle && castle.x - state.distance <= 40
    if (jump && state.speed === 236) {
      fullSpeedJumps += 1
    }
    state = update(state, frame, { jump, boost: true })
    assert.equal(state.status, 'running', `crashed at ${state.distance.toFixed(1)}px`)
  }
  assert.ok(state.distance >= finish)
  assert.ok(fullSpeedJumps >= 2)
})

test('the rear wheel collides only if it lands before clearing the sandcastle', () => {
  const castle = { x: 264, kind: 'castle', height: 0 }
  const braking = brake(ride({ objects: [castle] }))
  const jumpFrom = (gap) => {
    const takeoff = { ...braking, distance: castle.x - gap }
    return advanceToLanding(update(takeoff, physicsStep, { jump: true }))
  }

  const overlap = jumpFrom(165)
  assert.equal(overlap.status, 'over')
  assert.ok(overlap.distance > castle.x)

  const clear = jumpFrom(147)
  assert.equal(clear.status, 'running')
  assert.equal(clear.y, 0)
  assert.ok(clear.distance > castle.x + 30)
})
