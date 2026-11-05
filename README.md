# BlueRetro PS2 Bridge

An ESP32-based BlueRetro firmware project configured for PlayStation 1 / PlayStation 2, with a companion browser-based configuration WebApp.

## Repository contents

- `main/` — ESP-IDF firmware source
- `configs/hw2/playstation` — HW2 PlayStation configuration
- `webapp/` — Web Bluetooth configuration application (version 4.4.0)
- `shared/protocol.yaml` — shared protocol definitions, including the controller monitor and MAC configuration extensions
- `docs/` — project and upstream documentation

## Firmware configuration

The checked-in `sdkconfig.defaults` and `configs/hw2/playstation` target ESP32, HW2, and PSX / PS2, with a 4 MB flash profile. The firmware project version is `mx-v6`.

The firmware version string is retained for identification and compatibility; it is not the repository name. Always verify that the selected hardware configuration matches the actual board.

## Added WebApp / firmware features

- Controller Test reads live button, stick, and trigger snapshots from BLE command `0x18`.
- MAC Address Spoof stores a custom Bluetooth BR/EDR address in MX config slot `8`; the ESP32 base MAC is adjusted before Bluetooth controller startup. A power cycle is required after saving.

These extensions require the matching updated firmware and WebApp. Older firmware reports the corresponding feature as unsupported; no existing command IDs or the four-byte global configuration are repurposed.

## Run the WebApp

```bash
cd webapp
npm install
npm run dev
```

Open `http://localhost:3000` in a supported browser. Web Bluetooth requires a secure context; localhost is suitable for local development.

See [the Persian WebApp guide](webapp/README-WebApp-FA.md).

## Documentation

- [Firmware features (Persian)](docs/FIRMWARE-FEATURES-FA.md)
- [WebApp guide (Persian)](webapp/README-WebApp-FA.md)
- [Upstream BlueRetro background](docs/UPSTREAM-BASE.md)
- [Legacy firmware fix-pack guide](docs/LEGACY-FIRMWARE-FIXPACK-V6.md) — historical reference only; its old copy instructions are not for the current repository.

## Source and license

Based on [BlueRetro](https://github.com/darthcloud/BlueRetro). See [LICENSE](LICENSE) and the license notices accompanying third-party components.
