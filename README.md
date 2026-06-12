# ESP Web Tools

Allow flashing ESPHome or other ESP-based firmwares via the browser. Will automatically detect the board type and select a supported firmware. [See website for full documentation.](https://esphome.github.io/esp-web-tools/)

```html
<esp-web-install-button
  manifest="firmware_esphome/manifest.json"
></esp-web-install-button>
```

Example manifest:

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
      "parts": [
        { "path": "bootloader_dout_40m.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "esp32-s3.bin", "offset": 65536 }
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

Builds can optionally include `flashSizeMB` and `psramSizeMB` to target specific hardware variants. When multiple builds share the same `chipFamily`, the most specific match wins:

```json
{
  "builds": [
    {
      "chipFamily": "ESP32-S3",
      "flashSizeMB": 16,
      "psramSizeMB": 8,
      "parts": [{ "path": "s3-16mb-8psram.bin", "offset": 0 }]
    },
    {
      "chipFamily": "ESP32-S3",
      "flashSizeMB": 4,
      "parts": [{ "path": "s3-4mb.bin", "offset": 0 }]
    },
    {
      "chipFamily": "ESP32-S3",
      "parts": [{ "path": "s3-generic.bin", "offset": 0 }]
    }
  ]
}
```

A build with no qualifiers acts as a fallback for that chip family.

## Diagnostics

ESP Web Tools includes a diagnostics button that reads hardware information from a connected ESP device without installing any firmware:

```html
<esp-web-diagnostics-button></esp-web-diagnostics-button>
```

This displays the chip description, features, crystal frequency, MAC address, flash size, and PSRAM size. Like the install button, it supports `activate`, `unsupported`, and `not-allowed` slots for customization, and uses the same CSS custom properties for styling.

## Development

Run `script/develop`. This starts a server. Open it on http://localhost:5001.

[![ESPHome - A project from the Open Home Foundation](https://www.openhomefoundation.org/badges/esphome.png)](https://www.openhomefoundation.org/)
