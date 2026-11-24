# ESP Web Tools

Allow flashing ESPHome or other ESP-based firmwares via the browser. Will automatically detect the board type and select a supported firmware. [See website for full documentation.](https://esphome.github.io/esp-web-tools/)

```html
<esp-web-install-button
  manifest="firmware_esphome/manifest.json"
></esp-web-install-button>
```

Example manifest:

The optional `serialType` field (`"cdc"` or `"uart"`) lets you ship separate firmware variants for chips that support both native USB CDC (built-in USB) and external USB-to-UART bridges. The correct variant is selected automatically based on the detected connection. Builds without a `serialType` are used as a fallback for any connection type.

```json
{
  "name": "ESPHome",
  "version": "2021.10.3",
  "home_assistant_domain": "esphome",
  "funding_url": "https://esphome.io/guides/supporters.html",
  "builds": [
    {
      "chipFamily": "ESP32",
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP32-C3",
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 0 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32-c3.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP32-S2",
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32-s2.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP32-S3",
      "serialType": "uart",
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32-s3.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP32-S3",
      "serialType": "cdc",
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32-s3-cdc.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP8266",
      "parts": [
        { "path": "esp8266.bin", "offset": 0 }
      ]
    }
  ]
}
```

### OTA updates

The manifest can also describe over-the-air (OTA) updates, so a device that is already installed can check the same manifest for a newer `version` and update itself. ESP Web Tools ignores these fields. They are for the firmware on the device, and any firmware can read them. ESPHome's [`http_request` update platform](https://esphome.io/components/update/http_request/) is one implementation.

```json
{
  "name": "My Firmware",
  "version": "1.2.0",
  "summary": "Bug fixes and a new sensor.",
  "release_url": "https://example.com/releases/1.2.0",
  "builds": [
    {
      "chipFamily": "ESP32",
      "parts": [{ "path": "esp32.factory.bin", "offset": 0 }],
      "ota": {
        "path": "esp32.ota.bin",
        "md5": "0123456789abcdef0123456789abcdef"
      }
    },
    {
      "chipFamily": "ESP32-C3",
      "parts": [{ "path": "esp32-c3.factory.bin", "offset": 0 }],
      "ota": {
        "path": "esp32-c3.ota.bin",
        "md5": "fedcba9876543210fedcba9876543210"
      }
    }
  ]
}
```

- `ota` (per build, optional): the OTA firmware for that build. A device updating over the air uses the build matching its chip, so that build needs an `ota` block. Builds without it still work for browser installs.
  - `path` (required): URL or path of the OTA firmware binary. A full `http(s)` URL is used as-is, a leading `/` is relative to the manifest's host, otherwise it is relative to the manifest's directory.
  - `md5` (required): MD5 hex digest of that binary.
  - `summary` (optional): release notes.
  - `release_url` (optional): link to the release page.
- `summary` and `release_url` (top level, optional): set once for every build, so a manifest with many chips does not repeat the release notes. A value inside a build's `ota` block overrides the top-level one. Firmware that predates the top-level form only reads `ota.summary` and `ota.release_url`, so it will not show the notes if they are only at the top level (the update itself still works). ESPHome reads the top-level form from 2026.12.0.

## Development

Run `script/develop`. This starts a server. Open it on http://localhost:5001.

The website is `index.html` and `404.html` with the assets in `static`.
`script/build_website` renders them into `website/dist`, which is what GitHub
Pages serves. That build is also where the analytics snippet in
`website/plausible-analytics.html` gets inlined, so it is not part of the pages
you see while developing.

[![ESPHome - A project from the Open Home Foundation](https://www.openhomefoundation.org/badges/esphome.png)](https://www.openhomefoundation.org/)
