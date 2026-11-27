import assert from 'node:assert/strict'
import test from 'node:test'
import { changeSpeed, createGame, start, togglePause, update } from '../game.js'

const frame = 1 / 60
const physicsStep = frame / 2
const landingTimeout = 3.2

function ride(overrides = {}) {
  return { ...start(createGame()), objects: [], nextSegment: Number.POSITIVE_INFINITY, ...overrides }
}

function tapSpeed(state, taps) {
  for (let i = 0; i < Math.abs(taps); i++) {
    state = changeSpeed(state, Math.sign(taps))
  }
  return state
}

function advance(state, seconds) {
  for (let elapsed = 0; elapsed < seconds && state.status === 'running'; elapsed += frame) {
    state = update(state, frame)
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
  assert.equal(changeSpeed(ready, 1), ready)
  assert.deepEqual(update(ready, frame, { jump: true }), ready)

  const running = advance(changeSpeed(start(ready), 1), 0.3)
  assert.equal(running.status, 'running')
  assert.ok(running.distance > 0)
  const paused = togglePause(running)
  assert.equal(paused.status, 'paused')
  assert.equal(changeSpeed(paused, -1), paused)
  assert.deepEqual(update(paused, 1, { jump: true }), paused)
  const resumed = advance(togglePause(paused), 0.3)
  assert.equal(resumed.status, 'running')
  assert.ok(resumed.distance > running.distance)
  assert.equal(resumed.speed, 202)
  assert.equal(resumed.best, 12)
})

test('each ground tap changes speed by one step and riding preserves the selected speed', () => {
  const initial = ride()
  const faster = changeSpeed(initial, 1)
  const twice = changeSpeed(faster, 1)
  const fastest = changeSpeed(twice, 1)
  const slower = changeSpeed(twice, -1)
  assert.deepEqual([initial.speed, faster.speed, twice.speed, fastest.speed], [172, 202, 232, 236])
  assert.equal(slower.speed, 202)
  for (const selected of [initial, twice, changeSpeed(initial, -1)]) {
    const cruising = advance(selected, 3)
    assert.equal(cruising.speed, selected.speed)
    assert.ok(Math.abs(cruising.distance - selected.speed * cruising.time) < 1e-8)
  }
})

test('repeated taps stop at each speed limit and a reverse tap takes effect immediately', () => {
  const fastest = tapSpeed(ride(), 4)
  const slowest = tapSpeed(ride(), -2)
  assert.equal(fastest.speed, 236)
  assert.equal(slowest.speed, 144)
  assert.equal(changeSpeed(fastest, -1).speed, 206)
  assert.equal(changeSpeed(slowest, 1).speed, 174)
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
  const takeoff = changeSpeed(ride(), 1)
  let airborne = update(takeoff, physicsStep, { jump: true })
  assert.ok(airborne.y > 0)
  assert.equal(airborne.speed, takeoff.speed)
  assert.ok(Math.abs(airborne.distance - takeoff.distance - takeoff.speed * physicsStep) < 1e-8)

  for (let step = 0; step * physicsStep < landingTimeout && airborne.y > 0; step += 1) {
    const tapped = changeSpeed(airborne, step % 2 === 0 ? 1 : -1)
    const next = update(tapped, physicsStep)
    assert.equal(next.speed, takeoff.speed)
    const travel = next.distance - airborne.distance
    assert.ok(Math.abs(travel - takeoff.speed * physicsStep) < 1e-8)
    airborne = next
  }
  assert.equal(airborne.status, 'running')
  assert.equal(airborne.y, 0)
  assert.equal(advance(airborne, 0.5).speed, takeoff.speed)
  assert.equal(changeSpeed(airborne, 1).speed, takeoff.speed + 30)
  assert.equal(changeSpeed(airborne, -1).speed, takeoff.speed - 30)
})

for (const [speed, taps, expectedAirtime, expectedRange] of [
  ['minimum', -1, 1.25, 180],
  ['starting', 0, 1.05, 181],
  ['maximum', 3, 1.05, 248]
]) {
  test(`a jump keeps its flight time and horizontal range at ${speed} speed`, () => {
    const takeoff = tapSpeed(ride(), taps)
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

for (const [speed, taps, maxNearPeak] of [['starting', 0, 0.105], ['minimum', -1, 0.12]]) {
  test(`at ${speed} speed the bike crests halfway through the jump and promptly drops`, () => {
    const takeoff = tapSpeed(ride(), taps)
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
  for (const taps of [-1, 0, 3]) {
    let state = tapSpeed(ride(), taps)
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
  const crash = advance(changeSpeed(initial, -1), 0.9)
  assert.equal(crash.status, 'over')
  assert.equal(crash.speed, 144)
  assert.equal(changeSpeed(crash, 1), crash)
  assert.equal(crash.best, Math.floor(crash.distance / 10))
  assert.ok(crash.best > previousBest)

  const restarted = start(crash)
  assert.equal(restarted.status, 'running')
  assert.equal(restarted.best, crash.best)
  assert.equal(restarted.distance, 0)
  assert.equal(restarted.score, 0)
  assert.equal(restarted.y, 0)
  assert.equal(restarted.speed, 172)

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
  const faster = tapSpeed(initial, 2)
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
    let state = changeSpeed(start(createGame()), -1)
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
  let state = tapSpeed(start(createGame()), 3)
  let fullSpeedJumps = 0
  for (let elapsed = 0; elapsed < 50 && state.distance < finish; elapsed += frame) {
    const castle = state.objects.find(({ kind, x }) => kind === 'castle' && x > state.distance)
    const jump = state.y === 0 && !!castle && castle.x - state.distance <= 40
    if (jump && state.speed === 236) {
      fullSpeedJumps += 1
    }
    state = update(state, frame, { jump })
    assert.equal(state.status, 'running', `crashed at ${state.distance.toFixed(1)}px`)
  }
  assert.ok(state.distance >= finish)
  assert.ok(fullSpeedJumps >= 2)
})

test('the rear wheel collides only if it lands before clearing the sandcastle', () => {
  const castle = { x: 264, kind: 'castle', height: 0 }
  const braking = changeSpeed(ride({ objects: [castle] }), -1)
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
