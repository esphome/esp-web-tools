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
  "version": "2021.10.3",
  "home_assistant_domain": "esphome",
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
      "chipFamily": "ESP8266",
      "parts": [
        { "path": "esp8266.bin", "offset": 0 }
      ]
    }
  ]
}
```

## Styling

### Attributes

The following attributes are automatically added to `<esp-web-install-button>` and can be used for styling:

| Attribute | Description |
| -- | -- |
| `install-supported` | Added if installing firmware is supported
| `install-unsupported` | Added if installing firmware is not supported

### CSS custom properties (variables)

The following variables can be used to change the colors of the default UI elements:

- `--esp-tools-button-color`
- `--esp-tools-button-text-color`

### Slots

The following slots are available:

| Slot name | Description |
| -- | -- |
| `activate` | Button to start the flash progress
| `unsupported` | Message to show when the browser is not supported
| `not-allowed` | Message to show when not a secure context

## Development

Run `script/develop`. This starts a server. Open it on http://localhost:5001.
