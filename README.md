# JavaScript SDK for ESPHome

Allow flashing ESPHome or other ESP-based firmwares via the browser.

Defined using a manifest.

```json
{
  "name": "ESPHome",
  "builds": [
    {
      "chipFamily": "ESP32",
      "parts": [
        { "filename": "bootloader.bin", "offset": 4096, "size": 15872 },
        { "filename": "partitions.bin", "offset": 32768, "size": 3072 },
        { "filename": "ota.bin", "offset": 57344, "size": 8192 },
        { "filename": "firmware.bin", "offset": 65536, "size": 1531904 }
      ]
    }
  ]
}
```
