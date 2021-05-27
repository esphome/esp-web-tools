# JavaScript SDK for ESPHome

Allow flashing ESPHome or other ESP-based firmwares via the browser.

Defined using a manifest.

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
    }
  ]
}
```

## Development

Run `script/develop`. This starts a server. Open it on http://localhost:5000.
