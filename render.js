import { GROUND_Y as GROUND, PLAYER_X } from './game.js'

const WIDTH = 480
const WHEEL_RADIUS = 12
const CRANK = { x: -2, y: -14, radius: 4.5 }

const SKY = [
  '#242d53',
  '#303a60',
  '#414367',
  '#59496b',
  '#754f6d',
  '#965a70',
  '#b46e76',
  '#cf8176',
  '#e39378',
  '#f6ac84',
  '#f9bd90',
  '#ffd3a3'
]
const SEA = ['#b27986', '#956b85', '#796283', '#616183', '#50647e', '#415d77']
const INK = '#203047'

function pixel(ctx, color, x, y, width, height = 1) {
  ctx.fillStyle = color
  ctx.fillRect(Math.floor(x), Math.floor(y), width, height)
}

function line(ctx, color, x0, y0, x1, y1, thickness = 1) {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  x1 = Math.round(x1)
  y1 = Math.round(y1)
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  const inset = Math.floor(thickness / 2)
  let error = dx + dy
  ctx.fillStyle = color
  while (true) {
    ctx.fillRect(x0 - inset, y0 - inset, thickness, thickness)
    if (x0 === x1 && y0 === y1) {
      break
    }
    const step = 2 * error
    if (step >= dy) {
      error += dy
      x0 += sx
    }
    if (step <= dx) {
      error += dx
      y0 += sy
    }
  }
}

function ellipse(ctx, color, x, y, rx, ry) {
  ctx.fillStyle = color
  for (let row = -ry + 1; row < ry; row++) {
    const half = Math.floor(rx * Math.sqrt(1 - (row / ry) ** 2))
    ctx.fillRect(Math.round(x) - half, Math.round(y) + row, half * 2 + 1, 1)
  }
}

function polygon(ctx, color, points) {
  const ys = points.map((point) => point[1])
  ctx.fillStyle = color
  for (let row = Math.floor(Math.min(...ys)); row < Math.ceil(Math.max(...ys)); row++) {
    const sample = row + 0.5
    const intersections = []
    for (let index = 0; index < points.length; index++) {
      const [ax, ay] = points[index]
      const [bx, by] = points[(index + 1) % points.length]
      if ((ay <= sample && sample < by) || (by <= sample && sample < ay)) {
        intersections.push(ax + ((bx - ax) * (sample - ay)) / (by - ay))
      }
    }
    intersections.sort((first, second) => first - second)
    for (let index = 0; index < intersections.length; index += 2) {
      const left = Math.ceil(intersections[index] - 0.5)
      const right = Math.ceil(intersections[index + 1] - 0.5)
      ctx.fillRect(left, row, right - left, 1)
    }
  }
}

function hash(index) {
  const mixed = Math.imul(index ^ 0xc1aa6347, 0x45d9f3b)
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296
}

function wrap(value, size) {
  return ((value % size) + size) % size
}

function repeat(period, offset, draw) {
  const origin = -Math.floor(wrap(offset, period))
  for (let x = origin - period; x < WIDTH; x += period) {
    draw(x)
  }
}

export function parallaxOffsets(distance) {
  return {
    clouds: distance * 0.07,
    cliffs: distance * 0.19,
    water: distance * 0.32,
    shore: distance * 0.66,
    boards: distance
  }
}

export function animationPose(distance, height = 0) {
  const wheelAngle = distance / WHEEL_RADIUS
  const crankAngle = wheelAngle * 0.65
  const foot = (phase) => ({
    x: CRANK.x + Math.cos(crankAngle + phase) * CRANK.radius,
    y: CRANK.y + Math.sin(crankAngle + phase) * CRANK.radius
  })
  return {
    wheelAngle,
    crankAngle,
    feet: [foot(0), foot(Math.PI)],
    tuck: Math.min(5, Math.max(0, height / 9))
  }
}

function drawCloud(ctx, x, y, scale, colors) {
  const rows = [
    [15, 9, 22],
    [9, 16, 32],
    [6, 21, 39],
    [2, 26, 48],
    [0, 24, 49],
    [5, 22, 44],
    [16, 20, 39]
  ]
  rows.forEach(([left, middle, right], row) => {
    pixel(
      ctx,
      colors[row < 3 ? 0 : 1],
      x + left * scale,
      y + row * scale,
      (right - left) * scale,
      scale
    )
    if (row < 4) {
      pixel(ctx, colors[2], x + left * scale, y + row * scale, (middle - left) * scale, scale)
    }
  })
  pixel(ctx, colors[1], x + 11 * scale, y + 8 * scale, 23 * scale, scale)
}

function drawSky(ctx, offset) {
  SKY.forEach((color, index) => {
    pixel(ctx, color, 0, index * 13, WIDTH, 13)
  })
  ellipse(ctx, '#f9a484', 333, 105, 43, 41)
  ellipse(ctx, '#ffca90', 333, 105, 33, 33)
  ellipse(ctx, '#ffe4ad', 333, 105, 30, 30)
  pixel(ctx, '#ffce9d', 305, 114, 56, 2)
  pixel(ctx, '#ffc28e', 307, 121, 52, 2)
  pixel(ctx, '#ffbc8a', 311, 128, 44, 2)

  repeat(534, offset * 0.58, (origin) => {
    drawCloud(ctx, origin + 38, 48, 2, ['#8a607d', '#865471', '#af7486'])
    drawCloud(ctx, origin + 294, 25, 1, ['#5f506f', '#644b6a', '#785775'])
    drawCloud(ctx, origin + 431, 80, 2, ['#d08786', '#bd7380', '#e4968a'])
    pixel(ctx, '#a3687e', origin + 8, 75, 21, 2)
    pixel(ctx, '#b27481', origin + 36, 76, 38, 1)
    pixel(ctx, '#b77782', origin + 353, 63, 31, 2)
  })
  repeat(613, offset, (origin) => {
    drawCloud(ctx, origin + 69, 95, 2, ['#db8b81', '#c77a7c', '#f4a68d'])
    drawCloud(ctx, origin + 260, 69, 1, ['#be7580', '#ae6a7b', '#db8d8a'])
    pixel(ctx, '#f3aa8d', origin + 183, 114, 29, 2)
    pixel(ctx, '#db9086', origin + 215, 116, 12, 1)
  })
}

function drawCliffs(ctx, offset) {
  repeat(578, offset * 0.72, (origin) => {
    polygon(ctx, '#ac7483', [
      [origin, 139],
      [origin, 133],
      [origin + 24, 131],
      [origin + 38, 127],
      [origin + 58, 127],
      [origin + 69, 123],
      [origin + 82, 124],
      [origin + 92, 121],
      [origin + 104, 125],
      [origin + 118, 125],
      [origin + 139, 134],
      [origin + 160, 137],
      [origin + 210, 137],
      [origin + 210, 141],
      [origin, 141]
    ])
    polygon(ctx, '#b87a83', [
      [origin + 354, 140],
      [origin + 377, 130],
      [origin + 388, 127],
      [origin + 405, 129],
      [origin + 412, 126],
      [origin + 430, 132],
      [origin + 451, 136],
      [origin + 469, 140]
    ])
  })
  repeat(641, offset, (origin) => {
    polygon(ctx, '#645775', [
      [origin, 143],
      [origin, 119],
      [origin + 22, 116],
      [origin + 31, 113],
      [origin + 44, 113],
      [origin + 53, 117],
      [origin + 59, 117],
      [origin + 68, 126],
      [origin + 90, 130],
      [origin + 103, 130],
      [origin + 113, 136],
      [origin + 137, 141],
      [origin + 137, 143]
    ])
    polygon(ctx, '#79617b', [
      [origin, 119],
      [origin + 30, 113],
      [origin + 44, 113],
      [origin + 54, 117],
      [origin + 61, 118],
      [origin + 65, 122],
      [origin + 56, 122],
      [origin + 48, 118],
      [origin + 34, 116],
      [origin, 125]
    ])
    pixel(ctx, '#524e6d', origin + 4, 135, 78, 3)
    pixel(ctx, '#7e6580', origin + 64, 131, 38, 2)
    polygon(ctx, '#76617c', [
      [origin + 230, 141],
      [origin + 238, 137],
      [origin + 243, 131],
      [origin + 253, 129],
      [origin + 260, 131],
      [origin + 265, 137],
      [origin + 272, 141]
    ])
    polygon(ctx, '#6e5e79', [
      [origin + 456, 142],
      [origin + 468, 136],
      [origin + 475, 126],
      [origin + 490, 123],
      [origin + 502, 126],
      [origin + 509, 135],
      [origin + 535, 139],
      [origin + 547, 142]
    ])
  })
}

function drawWater(ctx, offset, time) {
  SEA.forEach((color, index) => {
    pixel(ctx, color, 0, 141 + index * 9, WIDTH, 9)
  })
  pixel(ctx, '#ffd3a2', 280, 141, 98, 1)
  for (let index = 0; index < 54; index++) {
    const band = index % 13
    const y = 145 + band * 3
    const x = wrap(hash(index + 1) * 528 - offset + time * 2, 528) - 42
    const shade = ['#d39395', '#887998', '#74809b', '#57728a'][Math.min(3, Math.floor(band / 3))]
    pixel(ctx, shade, x, y, Math.floor(5 + hash(index + 70) * (9 + band * 2)))
  }
  for (let index = 0; index < 13; index++) {
    const y = 144 + index * 3
    const spread = 20 + index * 4
    const x = 327 + hash(index + 20) * spread - spread / 2 + Math.sin(time * 1.6 + index) * 4
    pixel(ctx, index < 5 ? '#efaf98' : '#b48d99', x, y + 1, Math.max(2, 18 - index))
  }
}

function drawBeach(ctx, offset) {
  pixel(ctx, '#624b60', 0, 195, WIDTH, 19)
  repeat(179, offset, (origin) => {
    polygon(ctx, '#7f5967', [
      [origin, 194],
      [origin + 26, 194],
      [origin + 41, 191],
      [origin + 62, 191],
      [origin + 80, 185],
      [origin + 105, 185],
      [origin + 134, 192],
      [origin + 158, 193],
      [origin + 179, 194],
      [origin + 179, 211],
      [origin, 211]
    ])
    polygon(ctx, '#b77e7e', [
      [origin, 194],
      [origin + 26, 194],
      [origin + 41, 191],
      [origin + 62, 191],
      [origin + 80, 185],
      [origin + 105, 185],
      [origin + 134, 192],
      [origin + 158, 193],
      [origin + 179, 194],
      [origin + 179, 196],
      [origin + 129, 196],
      [origin + 98, 190],
      [origin + 78, 191],
      [origin + 57, 197],
      [origin, 197]
    ])
    pixel(ctx, '#a46d72', origin + 15, 201, 31, 1)
    pixel(ctx, '#a46d72', origin + 95, 195, 16, 1)
    pixel(ctx, '#533e55', origin + 119, 204, 39, 2)
    pixel(ctx, '#745363', origin + 50, 207, 39, 1)
  })
}

function drawGrass(ctx, x, y, color, tip, seed) {
  for (let blade = 0; blade < 7; blade++) {
    const dx = Math.round((hash(seed + blade) - 0.5) * 28)
    const dy = 5 + Math.floor(hash(seed + blade + 17) * 16)
    line(ctx, color, x + dx / 4, y, x + dx / 2, y - dy / 2, 2)
    line(ctx, color, x + dx / 2, y - dy / 2, x + dx, y - dy, 2)
    if (blade % 2 === 0) {
      pixel(ctx, tip, x + dx, y - dy - 1, 2, 3)
    }
  }
}

function drawBoards(ctx, offset) {
  pixel(ctx, '#3f3347', 0, 210, WIDTH, 60)
  pixel(ctx, '#f8bc86', 0, GROUND, WIDTH, 2)
  pixel(ctx, '#d69a7c', 0, 216, WIDTH, 2)
  pixel(ctx, '#9a6468', 0, 218, WIDTH, 9)
  pixel(ctx, '#8c595f', 0, 227, WIDTH, 18)
  pixel(ctx, '#684755', 0, 245, WIDTH, 10)
  pixel(ctx, '#553d50', 0, 255, WIDTH, 15)
  repeat(35, offset, (origin) => {
    line(ctx, '#624452', origin, 218, origin + 3, 244)
    line(ctx, '#a36b6e', origin + 1, 219, origin + 4, 242)
    pixel(ctx, '#bd8480', origin + 6, 224, 13)
    pixel(ctx, '#a66d71', origin + 16, 238, 11)
    pixel(ctx, '#754d5a', origin + 9, 233, 12)
    pixel(ctx, '#4f394d', origin + 28, 228, 2, 2)
  })
  pixel(ctx, '#402f45', 0, 244, WIDTH, 2)
  pixel(ctx, '#89606a', 0, 246, WIDTH, 2)
  pixel(ctx, '#49354b', 0, 255, WIDTH, 2)
  repeat(237, offset * 1.16, (origin) => {
    drawGrass(ctx, origin + 17, 269, '#3f394e', '#9a756f', 25)
    drawGrass(ctx, origin + 40, 274, '#45394d', '#775663', 179)
    drawGrass(ctx, origin + 191, 269, '#3e374d', '#9e746c', 40)
    drawGrass(ctx, origin + 211, 273, '#483951', '#755d6a', 58)
  })
}

function drawFish(ctx, x, y, time, distance) {
  const bob = Math.round(2 * Math.sin(time * 5 + distance * 0.035))
  y += bob
  ellipse(ctx, '#523d5e', x, y, 10, 7)
  ellipse(ctx, '#f0b162', x + 1, y, 7, 5)
  polygon(ctx, '#ffcd7e', [
    [x - 3, y],
    [x - 9, y - 5],
    [x - 9, y + 5]
  ])
  pixel(ctx, '#fff2b6', x - 2, y - 3, 6, 2)
  pixel(ctx, '#453c54', x + 4, y - 1, 2, 2)
  pixel(ctx, '#e3875b', x, y + 3, 5, 1)
  const sparkle = Math.floor(time * 3 + distance) % 2
  if (sparkle) {
    pixel(ctx, '#fff0ad', x + 12, y - 7, 1, 5)
    pixel(ctx, '#fff0ad', x + 10, y - 5, 5)
  }
}

function drawCastle(ctx, x) {
  const y = GROUND
  ellipse(ctx, '#65464e', x, y + 1, 11, 3)
  polygon(ctx, '#392d46', [
    [x - 11, y],
    [x - 7, y - 7],
    [x - 7, y - 15],
    [x - 4, y - 15],
    [x - 4, y - 12],
    [x - 2, y - 12],
    [x - 2, y - 17],
    [x + 2, y - 17],
    [x + 2, y - 12],
    [x + 4, y - 12],
    [x + 4, y - 15],
    [x + 7, y - 15],
    [x + 7, y - 7],
    [x + 11, y]
  ])
  polygon(ctx, '#ffcd85', [
    [x - 8, y - 2],
    [x - 5, y - 8],
    [x - 5, y - 13],
    [x - 3, y - 11],
    [x - 1, y - 11],
    [x - 1, y - 15],
    [x + 1, y - 15],
    [x + 1, y - 11],
    [x + 4, y - 11],
    [x + 5, y - 13],
    [x + 5, y - 8],
    [x + 8, y - 2]
  ])
  pixel(ctx, '#dc926b', x + 3, y - 8, 2, 6)
  pixel(ctx, '#754653', x - 2, y - 6, 4, 4)
  pixel(ctx, '#754653', x - 1, y - 7, 2)
  pixel(ctx, '#fff0b6', x - 5, y - 12, 2)
  pixel(ctx, '#fff0b6', x - 4, y - 9, 8)
  pixel(ctx, '#fff0b6', x - 7, y - 3, 4)
  pixel(ctx, '#392d46', x + 1, y - 21, 8, 4)
  pixel(ctx, '#392d46', x + 1, y - 21, 1, 6)
  pixel(ctx, '#a9f1cb', x + 2, y - 20, 6, 2)
}

function drawWheel(ctx, x, y, angle) {
  ellipse(ctx, '#1b2537', x, y, WHEEL_RADIUS, WHEEL_RADIUS + 1)
  ellipse(ctx, '#a8b4ae', x, y, 9, 9)
  ellipse(ctx, '#313e51', x, y, 8, 8)
  for (let spoke = 0; spoke < 6; spoke++) {
    const phase = angle + (spoke * Math.PI) / 3
    const color = spoke === 0 ? '#f2ceb2' : '#80959d'
    line(ctx, color, x, y, x + Math.cos(phase) * 8, y + Math.sin(phase) * 8)
  }
  ellipse(ctx, '#e4dfc9', x, y, 2, 2)
}

function drawBike(ctx, angle) {
  drawWheel(ctx, -17, -12, angle)
  drawWheel(ctx, 17, -12, angle)
  const tubes = [
    [-17, -12, -7, -28],
    [-17, -12, -2, -14],
    [-2, -14, -7, -28],
    [-2, -14, 12, -31],
    [-7, -27, 12, -30],
    [17, -12, 12, -32]
  ]
  for (const tube of tubes) {
    line(ctx, '#612d44', ...tube, 4)
  }
  for (const tube of tubes) {
    line(ctx, '#ec6157', ...tube, 2)
  }
  line(ctx, '#ff9980', -6, -28, 10, -30)
  line(ctx, '#d7d4bc', 12, -33, 12, -40, 2)
  line(ctx, '#d7d4bc', 12, -40, 17, -41, 2)
  pixel(ctx, '#27324a', 15, -42, 6, 3)
  pixel(ctx, '#292f44', -12, -31, 12, 3)
  ellipse(ctx, '#604050', CRANK.x, CRANK.y, 4, 4)
  ellipse(ctx, '#ead1b3', CRANK.x, CRANK.y, 2, 2)
}

// The feet sit on opposite pedals. The knees bend toward the front of the bike.
function bendKnee(hip, foot) {
  const dx = foot.x - hip.x
  const dy = foot.y - hip.y
  const length = Math.hypot(dx, dy)
  const half = length / 2
  const bend = Math.sqrt(Math.max(0, 14.5 ** 2 - half ** 2))
  return {
    x: hip.x + dx / 2 + (dy / length) * bend,
    y: hip.y + dy / 2 - (dx / length) * bend
  }
}

function drawLeg(ctx, foot, tuck, front) {
  const hip = { x: front ? -5 : -8, y: -36 + tuck }
  const knee = bendKnee(hip, foot)
  const color = front ? '#f5a16d' : '#bc735d'
  line(ctx, '#723f4b', hip.x, hip.y, knee.x, knee.y, 4)
  line(ctx, '#723f4b', knee.x, knee.y, foot.x, foot.y, 4)
  line(ctx, color, hip.x, hip.y, knee.x, knee.y, 2)
  line(ctx, color, knee.x, knee.y, foot.x, foot.y, 2)
  pixel(ctx, '#26334b', foot.x - 2, Math.round(foot.y) + 2, 6, 2)
  pixel(ctx, color, foot.x - 1, Math.round(foot.y), 6, 2)
}

function drawPelican(ctx, x, y, state) {
  const pose = animationPose(state.distance, state.y)
  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))

  drawLeg(ctx, pose.feet[1], pose.tuck, false)
  drawBike(ctx, pose.wheelAngle)
  line(ctx, '#dac3ae', CRANK.x, CRANK.y, pose.feet[0].x, pose.feet[0].y, 2)

  ctx.save()
  ctx.translate(Math.round(pose.tuck / 2), Math.round(pose.tuck))
  polygon(ctx, INK, [
    [-27, -48],
    [-16, -46],
    [-7, -52],
    [-4, -62],
    [-6, -68],
    [-4, -76],
    [0, -80],
    [4, -80],
    [4, -83],
    [8, -81],
    [14, -81],
    [20, -77],
    [22, -69],
    [18, -64],
    [13, -57],
    [10, -45],
    [7, -38],
    [1, -34],
    [-12, -34],
    [-19, -38],
    [-23, -42],
    [-27, -43]
  ])
  polygon(ctx, '#f9edce', [
    [-23, -46],
    [-15, -44],
    [-5, -51],
    [-2, -61],
    [-4, -69],
    [-2, -75],
    [2, -78],
    [14, -79],
    [18, -75],
    [20, -69],
    [16, -65],
    [11, -57],
    [8, -46],
    [5, -40],
    [0, -36],
    [-11, -36],
    [-17, -39],
    [-20, -44]
  ])
  polygon(ctx, '#c4cac5', [
    [-22, -45],
    [-13, -43],
    [-7, -44],
    [2, -48],
    [5, -50],
    [5, -45],
    [1, -38],
    [-10, -37],
    [-17, -40]
  ])
  polygon(ctx, '#a8b3b7', [
    [-17, -41],
    [-10, -39],
    [0, -43],
    [3, -46],
    [3, -42],
    [-2, -37],
    [-12, -37]
  ])
  pixel(ctx, '#fff8e2', 0, -76, 11, 2)
  pixel(ctx, '#fff8e2', -1, -74, 5, 3)
  pixel(ctx, '#d38b77', 9, -69, 4, 2)
  pixel(ctx, INK, 11, -74, 3, 3)
  pixel(ctx, '#fff7da', 11, -74, 1, 1)

  polygon(ctx, '#703e4c', [
    [16, -71],
    [30, -71],
    [45, -68],
    [49, -66],
    [48, -63],
    [42, -63],
    [36, -57],
    [29, -54],
    [23, -54],
    [18, -57],
    [14, -65]
  ])
  polygon(ctx, '#f5a26e', [
    [16, -66],
    [35, -65],
    [44, -65],
    [35, -59],
    [28, -56],
    [23, -56],
    [19, -58]
  ])
  polygon(ctx, '#ffc285', [
    [16, -70],
    [30, -70],
    [44, -67],
    [48, -65],
    [31, -65],
    [16, -67]
  ])
  pixel(ctx, '#ffe0a0', 19, -70, 12)
  pixel(ctx, '#db775d', 21, -59, 13, 2)
  pixel(ctx, '#965a54', 22, -68, 3)
  ctx.restore()

  drawLeg(ctx, pose.feet[0], pose.tuck, true)
  // The wing tip follows the fixed handlebar as the bird tucks on a jump.
  const shoulderX = -6 + Math.round(pose.tuck / 2)
  const shoulderY = -47 + Math.round(pose.tuck)
  line(ctx, '#435268', shoulderX, shoulderY, 5, -43, 6)
  line(ctx, '#435268', 5, -43, 17, -41, 5)
  line(ctx, '#e7dfc9', shoulderX, shoulderY - 1, 5, -44, 4)
  line(ctx, '#f9edce', 5, -44, 17, -42, 3)
  pixel(ctx, '#a4adb0', 13, -42, 4, 2)

  ctx.restore()
}

export function render(ctx, state) {
  const distance = state.distance
  const time = state.time ?? 0
  const offsets = parallaxOffsets(distance)
  ctx.imageSmoothingEnabled = false
  drawSky(ctx, offsets.clouds)
  drawWater(ctx, offsets.water, time)
  drawCliffs(ctx, offsets.cliffs)
  drawBeach(ctx, offsets.shore)
  drawBoards(ctx, offsets.boards)
  for (const object of state.objects) {
    const x = Math.round(PLAYER_X + object.x - distance)
    if (x < -24 || x > WIDTH + 24) {
      continue
    }
    if (object.kind === 'fish') {
      drawFish(ctx, x, GROUND - object.height, time, object.x)
    }
    if (object.kind === 'castle') {
      drawCastle(ctx, x)
    }
  }
  const shadowWidth = Math.max(13, 32 - Math.round(state.y / 3))
  ellipse(ctx, state.y > 2 ? '#8b646a' : '#634553', PLAYER_X, GROUND + 3, shadowWidth, 3)
  drawPelican(ctx, PLAYER_X, GROUND - state.y, state)
}
