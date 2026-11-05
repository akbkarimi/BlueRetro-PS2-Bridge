/**
 * OTA transfer adapted from the official BlueRetroWebCfg implementation.
 * GATT command channel: a07
 * GATT OTA data channel: a08
 */
import { CH, CMD } from './constants'
import { commandRead, commandWrite, type BleLike } from './protocol'

const OTA_CHUNK_SIZE = 244
const OTA_MAX_IMAGE_SIZE = 1024 * 1024

export async function getFirmwareName(ble: BleLike): Promise<string> {
  const response = await commandRead(ble, CMD.GET_FW_NAME)
  const bytes = new Uint8Array(
    response.buffer,
    response.byteOffset,
    response.byteLength,
  )

  return new TextDecoder('utf-8')
    .decode(bytes)
    .replace(/\0.*$/, '')
    .trim()
}


export async function getHardwareId(
  ble: BleLike,
): Promise<'BRHW1' | 'BRHW2' | 'LEGACY_ABI_2'> {
  const response = await commandRead(ble, CMD.GET_HW_ID)
  const bytes = new Uint8Array(
    response.buffer,
    response.byteOffset,
    response.byteLength,
  )

  // Older firmware does not know command 0x08. Its default read
  // response is the one-byte ABI version. ABI 2 is our legacy marker.
  if (bytes.byteLength === 1 && bytes[0] === 2) {
    return 'LEGACY_ABI_2'
  }

  if (bytes.byteLength !== 5) {
    throw new Error('OTA_HARDWARE_MISMATCH')
  }

  const hardwareId = Array.from(
    bytes,
    byte => String.fromCharCode(byte),
  ).join('')

  if (hardwareId !== 'BRHW1' && hardwareId !== 'BRHW2') {
    throw new Error('OTA_HARDWARE_MISMATCH')
  }

  return hardwareId
}

function imageContainsHardwareMarker(
  image: ArrayBuffer,
  hardwareId: 'BRHW1' | 'BRHW2',
): boolean {
  const bytes = new Uint8Array(image)
  const marker = new TextEncoder().encode(hardwareId)

  for (let offset = 0; offset <= bytes.length - marker.length; offset++) {
    let matched = true

    for (let i = 0; i < marker.length; i++) {
      if (bytes[offset + i] !== marker[i]) {
        matched = false
        break
      }
    }

    if (matched) return true
  }

  return false
}

export async function updateFirmware(
  ble: BleLike,
  file: File,
  onProgress: (percent: number) => void = () => {},
  signal?: AbortSignal,
  legacyHardwareId?: 'BRHW1' | 'BRHW2',
): Promise<void> {
  if (!file.name.toLowerCase().endsWith('.bin')) {
    throw new Error('OTA_INVALID_FILE_FORMAT')
  }

  if (file.size === 0 || file.size > OTA_MAX_IMAGE_SIZE) {
    throw new Error('OTA_INVALID_FILE_SIZE')
  }

  if (signal?.aborted) {
    throw new Error('OTA_CANCELLED')
  }

  const image = await file.arrayBuffer()

  // New firmware reports an explicit hardware ID. Older firmware
  // falls back to ABI 2 and requires an explicit user hardware choice.
  const detectedHwId = await getHardwareId(ble)

  const expectedHwId =
    detectedHwId === 'LEGACY_ABI_2'
      ? legacyHardwareId
      : detectedHwId

  if (!expectedHwId) {
    throw new Error('OTA_HARDWARE_SELECTION_REQUIRED')
  }

  if (!imageContainsHardwareMarker(image, expectedHwId)) {
    throw new Error('OTA_HARDWARE_MISMATCH')
  }

  // Do not start OTA if cancellation happened during preflight.
  if (signal?.aborted) {
    throw new Error('OTA_CANCELLED')
  }

  try {
    onProgress(0)

    // Start OTA on the command channel (a07).
    await commandWrite(ble, CMD.OTA_START)

    // Send image sequentially on the OTA data channel (a08).
    for (let offset = 0; offset < image.byteLength; offset += OTA_CHUNK_SIZE) {
      if (signal?.aborted) {
        throw new Error('OTA_CANCELLED')
      }

      const length = Math.min(
        OTA_CHUNK_SIZE,
        image.byteLength - offset,
      )

      const chunk = new Uint8Array(image, offset, length)

      await ble.write(CH.OTA_DATA, chunk)

      onProgress(
        Math.round(((offset + length) / image.byteLength) * 100),
      )
    }

    // Commit only after every data chunk has been acknowledged.
    if (signal?.aborted) {
      throw new Error('OTA_CANCELLED')
    }

    await commandWrite(ble, CMD.OTA_END)
    onProgress(100)
  } catch (error) {
    // Match the official implementation: attempt abort even if the
    // START write failed, since the device may have received it.
    try {
      await commandWrite(ble, CMD.OTA_ABORT)
    } catch {
      // Preserve the original transfer error.
    }

    throw error
  }
}
