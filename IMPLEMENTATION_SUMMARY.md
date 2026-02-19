# Implementation Summary: NVS Partition Builder Feature

## Overview
This implementation adds the ability for ESP Web Tools to collect user configuration via forms and build NVS (Non-Volatile Storage) partitions that are flashed alongside firmware. The entire process happens in the browser for maximum security.

## Key Components

### 1. NVS Partition Builder (`src/nvs-partition-builder.ts`)
- **Purpose**: Builds ESP32 NVS binary partitions from key-value pairs
- **Format**: Implements ESP-IDF NVS partition format specification
- **Features**:
  - CRC32 checksum calculation for data integrity
  - Support for multiple data types (u8, u16, u32, string)
  - Page-aligned output (4096-byte pages)
  - Namespace support for organizing entries
  - Multi-page support for larger datasets

**Key Functions**:
- `buildNVSPartition(entries, size)` - Main builder function
- `buildESPHomeWiFiNVS(ssid, password)` - Convenience function for ESPHome WiFi credentials

### 2. Manifest Extensions (`src/const.ts`)
New TypeScript interfaces added:

```typescript
interface CustomFormField {
  name: string;           // Unique field identifier
  label: string;          // Display label
  type: "text" | "password" | "number" | "checkbox";
  required?: boolean;     // Validation flag
  defaultValue?: string | number | boolean;
  placeholder?: string;
}

interface NVSPartitionConfig {
  offset: number;         // Flash address for partition
  size?: number;          // Partition size (default: 12288)
  namespace: string;      // NVS namespace
  fields: Array<{
    name: string;         // Form field name to map
    key: string;          // NVS key name
    type: "u8" | "u16" | "u32" | "string";
  }>;
}
```

### 3. Configuration UI (`src/install-dialog.ts`)
- **New State**: `CONFIGURATION` - Shows configuration form
- **Flow Integration**: Seamlessly integrates with existing install flow
- **Validation**: Required field validation with error messages
- **Form Rendering**: Uses existing Material Design components

**User Flow**:
1. User clicks "Install" from dashboard
2. If `customFields` defined → Show configuration form
3. User fills in configuration values
4. (Optional) Erase confirmation if `new_install_prompt_erase` is true
5. Confirmation dialog
6. NVS partition built from form values
7. Firmware + NVS flashed together

### 4. Flash Integration (`src/flash.ts`)
- Modified `flash()` function to accept optional `nvsData` parameter
- NVS partition added to file array at specified offset
- Flashed using same esptool-js process as firmware

## Security Features
✅ **No server communication**: All processing happens in browser
✅ **No credential exposure**: Data never leaves user's device
✅ **Direct device write**: NVS written via Web Serial API
✅ **No intermediate storage**: Form data cleared after flash
✅ **CodeQL validated**: No security vulnerabilities detected

## Compatibility

### Browser Support
- Chrome 89+
- Edge 89+
- Opera 76+
- (Requires Web Serial API support)

### ESP32 Support
- ESP32
- ESP32-S2
- ESP32-S3
- ESP32-C3
- ESP32-C6
- Other ESP32 variants with NVS support

## Usage Example

### Manifest Configuration
```json
{
  "name": "My Device",
  "version": "1.0.0",
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
    "fields": [
      { "name": "wifi_ssid", "key": "ssid", "type": "string" },
      { "name": "wifi_password", "key": "password", "type": "string" }
    ]
  },
  "builds": [...]
}
```

### Firmware Integration (ESPHome Example)
```cpp
// Firmware reads from NVS:
#include "esphome/core/preferences.h"

SavedWifiSettings settings;
if (global_preferences->make_preference<SavedWifiSettings>(hash, true).load(&settings)) {
  // Use settings.ssid and settings.password
}
```

## Testing

### Unit Tests (test-nvs.html)
- Test 1: Simple NVS partition with basic types
- Test 2: ESPHome WiFi credentials
- Test 3: Multi-field configuration
- Test 4: Interactive form with manifest

### Integration Testing
Requires physical ESP32 device:
1. Run `script/develop`
2. Open http://localhost:5001/test-nvs.html
3. Click interactive test
4. Connect ESP32 device
5. Fill configuration form
6. Flash and verify device boots with configuration

## Technical Details

### NVS Format Specification
- **Page Size**: 4096 bytes
- **Entry Size**: 32 bytes
- **Header**: 32 bytes per page
- **Entries per Page**: 126 max
- **Endianness**: Little-endian
- **CRC**: CRC32 for integrity checking

### Memory Layout
```
Page 0:
  [0-31]    Header (state, seq, version, CRC)
  [32-63]   Namespace entry
  [64-95]   Data entry 1
  [96-127]  Data entry 2
  ...
```

### Data Type Mappings
- `u8` → 8-bit unsigned (0-255)
- `u16` → 16-bit unsigned (0-65535)
- `u32` → 32-bit unsigned (0-4294967295)
- `string` → Null-terminated UTF-8 string

## Limitations & Considerations

1. **Partition Offset**: Must not overlap with firmware
2. **Size Limits**: String values should be reasonable (<1KB)
3. **Key Names**: Max 15 characters
4. **Namespace**: Single namespace per partition
5. **Firmware Compatibility**: Firmware must expect data at configured namespace/keys

## Future Enhancements (Not Implemented)

- [ ] Support for blob data type
- [ ] Multiple namespace support
- [ ] Partition encryption
- [ ] Import/export configuration
- [ ] Template-based manifests
- [ ] Advanced validation (regex, ranges)

## Files Modified

### Core Implementation
- `src/nvs-partition-builder.ts` (NEW) - NVS builder
- `src/const.ts` - Type definitions
- `src/flash.ts` - Flash integration
- `src/install-dialog.ts` - UI implementation

### Documentation
- `NVS_CONFIGURATION.md` (NEW) - User guide
- `README.md` - Feature overview
- `static/example-manifest-with-config.json` (NEW) - Example
- `test-nvs.html` (NEW) - Test page

### Generated
- `src/version.ts` - Auto-generated by build
- `dist/*` - Compiled output

## Validation

✅ TypeScript compilation successful
✅ Build process successful
✅ Code review passed
✅ CodeQL security scan passed (0 vulnerabilities)
✅ No breaking changes to existing functionality
✅ Backward compatible (customFields is optional)

## Support

For questions or issues:
1. See `NVS_CONFIGURATION.md` for detailed documentation
2. Check `static/example-manifest-with-config.json` for example
3. Use `test-nvs.html` to verify implementation
4. Report issues on GitHub

---

**Implementation Date**: February 2026
**PR**: copilot/add-form-structure-for-nvs
**Status**: Ready for review and testing
