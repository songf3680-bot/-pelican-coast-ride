import assert from 'node:assert/strict'
import test from 'node:test'
import { createGame, start, togglePause, update } from '../game.js'

const frame = 1 / 60

function ride(overrides = {}) {
  return { ...start(createGame()), objects: [], nextSegment: 1000, ...overrides }
}

function advance(state, seconds, input) {
  for (let elapsed = 0; elapsed < seconds && state.status === 'running'; elapsed += frame) {
    state = update(state, frame, input)
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
  assert.equal(landed.velocityY, 0)
  assert.ok(update(landed, frame, { jump: true }).y > 0)
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

test('braking still lets the rider clear the first sandcastle', () => {
  let state = start(createGame())
  const firstCastle = state.objects.find(({ kind }) => kind === 'castle')
  const input = { brake: true }
  while (state.status === 'running' && state.distance < firstCastle.x - 31) {
    state = update(state, frame, input)
  }
  assert.equal(state.status, 'running')
  state = advance(update(state, frame, { ...input, jump: true }), 0.9, input)
  assert.equal(state.status, 'running')
  assert.ok(state.distance > firstCastle.x)
})
