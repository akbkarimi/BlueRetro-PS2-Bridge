/**
 * Web Bluetooth shim — injects the virtual ESP32 (MethyleneX sim) as a
 * BluetoothDevice so the WebApp speaks the exact same GATT protocol it
 * would speak to real hardware (Chrome). If real Web Bluetooth is
 * available, it stays untouched for "real device" connections.
 */
import { BR_SERVICE_UUID, BR_UUID, DEVICE_NAME_PREFIX, VIRTUAL_API_VERSION, VIRTUAL_FW_VERSION } from './constants'
import type { VirtualBlueRetroDevice } from './device'

class VirtualCharacteristic {
  constructor(
    private device: VirtualBlueRetroDevice,
    public uuid: string,
    private idx: number,
  ) { }

  async readValue(): Promise<DataView> {
    return this.device.readCharacteristic(this.idx)
  }

  async writeValue(value: ArrayBuffer | number[]): Promise<void> {
    return this.device.writeCharacteristic(this.idx, value)
  }

  async startNotifications() { /* virtual: no-op */ }
  async stopNotifications() { /* no-op */ }
  addEventListener() { /* no-op */ }
  removeEventListener() { /* no-op */ }
}

class VirtualService {
  constructor(
    private device: VirtualBlueRetroDevice,
    public uuid: string,
  ) { }

  async getCharacteristic(uuid: string | number): Promise<VirtualCharacteristic> {
    const idx = BR_UUID.findIndex((u) => u.toLowerCase() === String(uuid).toLowerCase())
    if (idx <= 0) throw new Error(`characteristic ${String(uuid)} not found`)
    return new VirtualCharacteristic(this.device, BR_UUID[idx], idx)
  }

  async getCharacteristics(): Promise<VirtualCharacteristic[]> {
    return BR_UUID.slice(1).map((u, i) => new VirtualCharacteristic(this.device, u, i + 1))
  }
}

class VirtualGatt {
  connected = false
  private service: VirtualService | null = null
  private listeners: ((ev: Event) => void)[] = []

  constructor(private device: VirtualBlueRetroDevice) { }

  async connect(): Promise<VirtualGatt> {
    await new Promise((r) => setTimeout(r, 500)) // realistic pairing delay
    this.connected = true
    this.service = new VirtualService(this.device, BR_SERVICE_UUID)
    return this
  }

  async getPrimaryService(uuid: string | number): Promise<VirtualService> {
    if (String(uuid).toLowerCase() !== BR_SERVICE_UUID) throw new Error('service not found')
    return this.service ?? new VirtualService(this.device, BR_SERVICE_UUID)
  }

  disconnect() {
    this.connected = false
    this.listeners.forEach((l) => l(new Event('gattserverdisconnected')))
  }

  addEventListener(_: string, cb: (ev: Event) => void) {
    this.listeners.push(cb)
  }
}

export interface VirtualBluetoothDeviceLike {
  name?: string
  id: string
  gatt: VirtualGatt
  addEventListener: (ev: string, cb: () => void) => void
}

/** Create a BluetoothDevice-shaped object backed by the virtual firmware */
export function createVirtualBluetoothDevice(device: VirtualBlueRetroDevice): VirtualBluetoothDeviceLike {
  const gatt = new VirtualGatt(device)
  return {
    name: `${DEVICE_NAME_PREFIX} MethyleneX`,
    id: 'virtual-esp32-methylenex',
    gatt,
    addEventListener(ev, cb) {
      if (ev === 'gattserverdisconnected') gatt.addEventListener(ev, cb as (ev: Event) => void)
    },
  }
}

export { VIRTUAL_API_VERSION, VIRTUAL_FW_VERSION }
