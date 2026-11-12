/* eslint-disable @typescript-eslint/no-require-imports */

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

if (!process.env.BR_PROTOCOL_BUILD_DIR) {
  throw new Error('BR_PROTOCOL_BUILD_DIR is required')
}

const { getControllerState, getControllerBattery } = require(
  path.join(process.env.BR_PROTOCOL_BUILD_DIR, 'protocol.js')
)

function makeResponse({
  buttons = 0,
  axes = [0, 0, 0, 0, 0, 0],
  valid = 0,
} = {}) {
  const buffer = new ArrayBuffer(17)
  const view = new DataView(buffer)

  view.setUint32(0, buttons, true)

  axes.forEach((value, index) => {
    view.setInt16(4 + index * 2, value, true)
  })

  view.setUint8(16, valid)

  return view
}

function makeBle(response) {
  const writes = []
  const reads = []

  return {
    writes,
    reads,

    async write(index, data) {
      writes.push({
        index,
        bytes: Array.from(data),
      })
    },

    async read(index) {
      reads.push(index)
      return response
    },
  }
}

test('decodes 17-byte controller response and sends correct BLE request', async () => {
  const ble = makeBle(makeResponse({
    buttons: 0x89ABCDEF,
    axes: [-32768, 32767, -12345, 12345, -1, 2048],
    valid: 1,
  }))

  const state = await getControllerState(ble, 11)

  assert.deepEqual(state, {
    btns: 0x89ABCDEF,
    lx: -32768,
    ly: 32767,
    rx: -12345,
    ry: 12345,
    l2: -1,
    r2: 2048,
    valid: true,
  })

  assert.deepEqual(ble.writes, [{
    index: 7,
    bytes: [0x18, 11],
  }])

  assert.deepEqual(ble.reads, [7])
})

test('preserves valid=false from firmware response', async () => {
  const ble = makeBle(makeResponse({
    buttons: 0,
    axes: [0, 0, 0, 0, 0, 0],
    valid: 0,
  }))

  const state = await getControllerState(ble, 0)

  assert.equal(state.valid, false)
  assert.equal(state.btns, 0)
  assert.deepEqual(
    [state.lx, state.ly, state.rx, state.ry, state.l2, state.r2],
    [0, 0, 0, 0, 0, 0]
  )
})

test('rejects responses shorter or longer than 17 bytes', async (t) => {
  for (const length of [16, 18]) {
    await t.test(`rejects ${length}-byte response`, async () => {
      const ble = makeBle(new DataView(new ArrayBuffer(length)))

      await assert.rejects(
        getControllerState(ble, 0),
        { message: 'CONTROLLER_STATE_UNSUPPORTED' }
      )
    })
  }
})

test('rejects invalid ports without sending BLE commands', async (t) => {
  for (const port of [-1, 12, 1.5, NaN]) {
    await t.test(`rejects port ${String(port)}`, async () => {
      const ble = makeBle(makeResponse())

      await assert.rejects(
        getControllerState(ble, port),
        { message: 'CONTROLLER_PORT_INVALID' }
      )

      assert.equal(ble.writes.length, 0)
      assert.equal(ble.reads.length, 0)
    })
  }
})


test('decodes controller battery percentage and charging status', async () => {
  const response = new DataView(new Uint8Array([75, 2]).buffer)
  const ble = makeBle(response)

  const battery = await getControllerBattery(ble, 1)

  assert.deepEqual(battery, { percent: 75, status: 'charging' })
  assert.deepEqual(ble.writes, [{ index: 7, bytes: [0x19, 1] }])
  assert.deepEqual(ble.reads, [7])
})

test('decodes unknown battery level without displaying zero percent', async () => {
  const response = new DataView(new Uint8Array([0xFF, 0]).buffer)
  const ble = makeBle(response)

  const battery = await getControllerBattery(ble, 0)

  assert.deepEqual(battery, { percent: null, status: 'unknown' })
})

test('rejects unsupported battery response sizes and invalid ports', async (t) => {
  const shortBle = makeBle(new DataView(new ArrayBuffer(1)))
  await assert.rejects(
    getControllerBattery(shortBle, 0),
    { message: 'CONTROLLER_BATTERY_UNSUPPORTED' }
  )

  for (const port of [-1, 12, 1.5, NaN]) {
    await t.test(`rejects battery port ${String(port)}`, async () => {
      const ble = makeBle(new DataView(new Uint8Array([50, 1]).buffer))
      await assert.rejects(
        getControllerBattery(ble, port),
        { message: 'CONTROLLER_PORT_INVALID' }
      )
      assert.equal(ble.writes.length, 0)
      assert.equal(ble.reads.length, 0)
    })
  }
})
