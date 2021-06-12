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

### Attributes

The following attributes are automatically added to `<esp-web-install-button>`:

| Attribute | Description |
| -- | -- |
| `install-supported` | Added if installing firmware is supported
| `install-unsupported` | Added if installing firmware is not supported
| `active` | Added when flashing is active

You can add the following attributes or properties to change the UI elements:

| Attribute | Property | Description |
| -- | -- | -- |
| `show-log` | `showLog` | Show a log style view of the progress instead of a progress bar
| `hide-progress` | `hideProgress` | Hides all progress UI elements

### CSS custom properties (variables)

The following variables can be used to change the colors of the default UI elements:

- `--esp-tools-button-color`
- `--esp-tools-button-text-color`
- `--esp-tools-success-color`
- `--esp-tools-error-color`
- `--esp-tools-progress-color`
- `--esp-tools-log-background`
- `--esp-tools-log-text-color`

### Slots

The following slots are available:

| Slot name | Description |
| -- | -- |
| `activate` | Button to start the flash progress
| `unsupported` | Message to show when the browser is not supported
| `not-allowed` | Message to show when not a secure context

## Events

When the state of flashing changes, a `state-changed` event is fired.

A `state-changed` event contains the following information:

Field | Description
-- | --
state | The current [state](https://github.com/esphome/esp-web-tools/blob/main/src/const.ts)
message | A description of the current state
manifest | The loaded manifest
build | The manifest's build that was selected 
chipFamily | The chip that was detected;&nbsp;"ESP32" \| "ESP8266" \| "ESP32-S2" \| "Unknown Chip"
details | An optional extra field that is different [per state](https://github.com/esphome/esp-web-tools/blob/main/src/const.ts)

## Development

Run `script/develop`. This starts a server. Open it on http://localhost:5000.
