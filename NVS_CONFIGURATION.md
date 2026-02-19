# NVS Configuration Feature

This feature allows projects to define a form structure for collecting user configuration options (like WiFi SSID/password) that are used to build an NVS (Non-Volatile Storage) partition for ESP32 devices. The NVS partition is built entirely in the browser and flashed alongside the application firmware.

## Overview

The NVS partition builder enables:
- Collecting user input via a configuration form
- Building ESP32 NVS partitions in the browser
- Flashing configuration data alongside firmware
- Secure handling of credentials (never leaves the browser)

## Manifest Configuration

### Custom Fields

Define form fields in your manifest using the `customFields` array:

```json
{
  "name": "My Firmware",
  "version": "1.0.0",
  "customFields": [
    {
      "name": "wifi_ssid",
      "label": "WiFi SSID",
      "type": "text",
      "required": true,
      "placeholder": "Enter your WiFi network name"
    },
    {
      "name": "wifi_password",
      "label": "WiFi Password",
      "type": "password",
      "required": true
    },
    {
      "name": "device_name",
      "label": "Device Name",
      "type": "text",
      "defaultValue": "my-device"
    },
    {
      "name": "enable_feature",
      "label": "Enable Feature",
      "type": "checkbox",
      "defaultValue": true
    }
  ]
}
```

#### Field Properties

- `name` (required): Unique identifier for the field
- `label` (required): Display label shown to the user
- `type` (required): Field type - "text", "password", "number", or "checkbox"
- `required` (optional): Whether the field must be filled (default: false)
- `defaultValue` (optional): Default value for the field
- `placeholder` (optional): Placeholder text for text/number inputs

### NVS Partition Configuration

There are two ways to store configuration in NVS:

#### 1. Struct-Based Storage (ESPHome Compatible)

For compatibility with ESPHome's preferences system, use struct-based storage with a numeric key:

```json
{
  "nvsPartition": {
    "offset": 36864,
    "size": 16384,
    "namespace": "esphome",
    "struct": {
      "key": 88491487,
      "fields": [
        {
          "name": "wifi_ssid",
          "type": "string",
          "maxLength": 33
        },
        {
          "name": "wifi_password",
          "type": "string",
          "maxLength": 65
        }
      ]
    }
  }
}
```

This packs multiple form fields into a single binary blob stored under a numeric key, matching how ESPHome's `global_preferences->make_preference<T>(hash)` works.

**Struct Properties:**
- `key` (required): Numeric key (hash) - ESPHome uses App.get_config_version_hash()
- `fields` (required): Array of fields to pack into the struct
  - `name` (required): Form field name to include
  - `type` (required): Data type - "u8", "u16", "u32", or "string"
  - `maxLength` (required for strings): Fixed buffer size in bytes

#### 2. Individual Field Storage

For individual key-value pairs, use the `fields` array:

```json
{
  "nvsPartition": {
    "offset": 36864,
    "size": 16384,
    "namespace": "esphome",
    "fields": [
      {
        "name": "wifi_ssid",
        "key": "ssid",
        "type": "string"
      },
      {
        "name": "wifi_password",
        "key": "password",
        "type": "string"
      },
      {
        "name": "enable_feature",
        "key": "feature_enabled",
        "type": "u8"
      }
    ]
  }
}
```

#### NVS Partition Properties

- `offset` (required): Flash offset where NVS partition will be written (in bytes)
- `size` (optional): Size of the NVS partition in bytes (default: 12288 = 3 pages)
- `namespace` (required): NVS namespace for storing values
- `fields` (required): Array mapping form fields to NVS keys

#### Field Mapping Properties

- `name` (required): Name of the customField to map
- `key` (required): NVS key name for storing the value
- `type` (required): NVS data type - "u8", "u16", "u32", or "string"

## NVS Data Types

The NVS partition builder supports the following data types:

- `string`: Null-terminated string values
- `u8`: Unsigned 8-bit integer (0-255)
- `u16`: Unsigned 16-bit integer (0-65535)
- `u32`: Unsigned 32-bit integer (0-4294967295)

## Partition Offset Selection

The NVS partition offset must:
1. Not overlap with other firmware parts (bootloader, partitions table, app, etc.)
2. Be aligned to 4096 bytes (page boundary)
3. Match the offset defined in your partition table

### Common Offsets

For ESP32 with standard partition table:
- Application starts at: 0x10000 (65536)
- NVS partition typically at: 0x9000 (36864) - **if using factory partition table**
- OTA partition locations vary

**Important**: Ensure your firmware's partition table reserves space at the offset you specify!

## ESPHome WiFi Integration

ESPHome stores preferences using a numeric hash key and packs data into binary structs. The WiFi component stores credentials like this:

```cpp
// ESPHome WiFi credentials storage
struct SavedWifiSettings {
  char ssid[33];
  char password[65];
} PACKED;

// Stored in NVS as:
// namespace: "esphome"
// key: hash (numeric, e.g., 88491487)
// value: binary blob of SavedWifiSettings struct
```

**Correct manifest for ESPHome WiFi:**

```json
{
  "customFields": [
    {
      "name": "wifi_ssid",
      "label": "WiFi SSID",
      "type": "text",
      "required": true
    },
    {
      "name": "wifi_password",
      "label": "WiFi Password",
      "type": "password",
      "required": true
    }
  ],
  "nvsPartition": {
    "offset": 36864,
    "namespace": "esphome",
    "struct": {
      "key": 88491487,
      "fields": [
        {
          "name": "wifi_ssid",
          "type": "string",
          "maxLength": 33
        },
        {
          "name": "wifi_password",
          "type": "string",
          "maxLength": 65
        }
      ]
    }
  }
}
```

**Key Details:**
- Use `struct` instead of `fields` for ESPHome compatibility
- The numeric `key` (88491487) is the default hash ESPHome uses for WiFi settings
- `maxLength` must match the C struct field sizes exactly (33 for SSID, 65 for password)
- Fields are packed in order with no padding

### Finding the Correct Hash

The hash value is calculated by ESPHome based on `App.get_config_version_hash()`. For WiFi credentials:
- Default hash when `has_sta()` is true: `App.get_config_version_hash()`
- Default hash when no STA configured: `88491487`

You can find the hash in your ESPHome firmware logs or source code where `make_preference` is called.

### Legacy Individual Field Storage (Not ESPHome Compatible)

The following approach does NOT work with ESPHome's actual implementation:

```json
{
  "nvsPartition": {
    "offset": 36864,
    "namespace": "esphome",
    "fields": [
      {
        "name": "wifi_ssid",
        "key": "ssid",
        "type": "string"
      },
      {
        "name": "wifi_password",
        "key": "password",
        "type": "string"
      }
    ]
  }
}
```

This stores SSID and password as separate NVS entries, which is simpler but does NOT match ESPHome's actual implementation.

## User Flow

When a manifest includes `customFields`:

1. User clicks "Install" button
2. Configuration form is displayed
3. User fills in configuration values
4. User clicks "Next"
5. (Optional) Erase confirmation if `new_install_prompt_erase` is true
6. Installation confirmation
7. NVS partition is built from form values
8. Firmware and NVS partition are flashed together

## Security Considerations

- All data entry and NVS partition building happens in the browser
- No configuration data is sent to any server
- Credentials never leave the user's device
- The NVS partition is written directly to the ESP32 via Web Serial

## Example

See `static/example-manifest-with-config.json` for a complete working example.

## Browser Compatibility

This feature requires:
- Web Serial API support (Chrome, Edge, Opera)
- Modern JavaScript features (same as base esp-web-tools)

## Troubleshooting

### NVS partition not being read by firmware

1. Verify the partition offset matches your partition table
2. Ensure the namespace matches your firmware's NVS namespace
3. Check that key names match what your firmware expects
4. Verify data types are compatible with your firmware

### "Failed to build configuration" error

1. Check that all required fields are filled
2. Verify field types are valid
3. Ensure the partition size is sufficient for your data

### Values not persisting after flash

1. Confirm you're not erasing the device after initial configuration
2. Verify the NVS partition offset is in non-volatile storage region
3. Check that your partition table doesn't overlap with the NVS partition
