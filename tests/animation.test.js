import assert from 'node:assert/strict'
import test from 'node:test'
import { animationPose, parallaxOffsets } from '../render.js'

const tau = 2 * Math.PI

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `expected ${actual} to be near ${expected}`)
}

function angleDelta(start, end) {
  return (((end - start) % tau) + tau) % tau
}

test('both wheels roll a full turn per wheel circumference of forward travel', () => {
  const origin = animationPose(0)
  assert.equal(animationPose(0, 35).wheelAngle, origin.wheelAngle)
  near(angleDelta(origin.wheelAngle, animationPose(12).wheelAngle), 1)
  near(Math.cos(animationPose(12 * tau).wheelAngle), Math.cos(origin.wheelAngle))
  near(Math.sin(animationPose(12 * tau).wheelAngle), Math.sin(origin.wheelAngle))
})

test('forward wheel travel moves the crank and keeps the pelican feet on opposite pedals', () => {
  const first = animationPose(0)
  const next = animationPose(24)
  assert.ok(angleDelta(first.crankAngle, next.crankAngle) > 0)
  assert.equal(first.feet.length, 2)
  assert.equal(next.feet.length, 2)
  const [left, right] = first.feet
  const [nextLeft, nextRight] = next.feet
  near(left.x + right.x, nextLeft.x + nextRight.x)
  near(left.y + right.y, nextLeft.y + nextRight.y)
  near(
    Math.hypot(left.x - right.x, left.y - right.y),
    Math.hypot(nextLeft.x - nextRight.x, nextLeft.y - nextRight.y)
  )
  assert.notDeepEqual(first.feet, next.feet)
})

test('distant scenery scrolls slower than shore and the boards follow world travel', () => {
  const origin = parallaxOffsets(0)
  const traveled = parallaxOffsets(24)
  const movement = (layer) => Math.abs(traveled[layer] - origin[layer])
  assert.ok(movement('clouds') > 0)
  assert.ok(movement('clouds') < movement('cliffs'))
  assert.ok(movement('cliffs') < movement('shore'))
  assert.ok(movement('water') < movement('shore'))
  near(movement('boards'), 24)
})
