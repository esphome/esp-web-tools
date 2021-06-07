# ESP Web Tools

Allow flashing ESPHome or other ESP-based firmwares via the browser. Will automatically detect the board type and select a supported firmware.

```html
<esp-web-install-button
  manifest="firmware_esphome/manifest.json"
></esp-web-install-button>
```

Manifest definition:

```json
{
  "name": "ESPHome",
  "builds": [
    {
      "chipFamily": "ESP32",
      "improv": true,
      "parts": [
        { "filename": "bootloader.bin", "offset": 4096 },
        { "filename": "partitions.bin", "offset": 32768 },
        { "filename": "ota.bin", "offset": 57344 },
        { "filename": "firmware.bin", "offset": 65536 }
      ]
    },
    {
      "chipFamily": "ESP8266",
      "parts": [
        { "filename": "esp8266.bin", "offset": 0 },
      ]
    }
  ]
}
```

Allows for optionally passing an attribute to trigger an erase before installation.

```html
<esp-web-install-button
  manifest="firmware_esphome/manifest.json"
  erase-first
></esp-web-install-button>
```

All attributes can also be set via properties (`manifest`, `eraseFirst`)

## Styling

The following attributes are automatically added to `<esp-web-install-button>`:

| Attribute | Description |
| -- | -- |
| `install-supported` | Added if installing firmware is supported
| `install-unsupported` | Added if installing firmware is not supported

## Development

Run `script/develop`. This starts a server. Open it on http://localhost:5000.
