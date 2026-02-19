/**
 * ESP32 NVS Partition Builder
 * 
 * This module builds ESP32 NVS (Non-Volatile Storage) partitions in the browser.
 * Based on the ESP-IDF NVS partition format specification.
 * 
 * References:
 * - https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/storage/nvs_flash.html
 * - ESPHome WiFi credentials storage format
 */

const NVS_VERSION = 0xfe; // NVS version 1
const NVS_PAGE_SIZE = 4096;
const NVS_ENTRY_SIZE = 32;

enum NVSEntryType {
  U8 = 0x01,
  I8 = 0x11,
  U16 = 0x02,
  I16 = 0x12,
  U32 = 0x04,
  I32 = 0x14,
  U64 = 0x08,
  I64 = 0x18,
  STRING = 0x21,
  BLOB = 0x42,
  BLOB_DATA = 0x41,
  BLOB_IDX = 0x48,
}

enum NVSPageState {
  ACTIVE = 0xfffffffe,
  FULL = 0xfffffffc,
  FREEING = 0xfffffffb,
  CORRUPT = 0xffffffff,
}

export interface NVSEntry {
  namespace: string;
  key: string;
  type: 'u8' | 'u16' | 'u32' | 'string';
  value: number | string;
}

/**
 * Calculate CRC32 checksum
 */
function crc32(data: Uint8Array): number {
  const polynomial = 0xEDB88320;
  let crc = 0xFFFFFFFF;
  
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? polynomial : 0);
    }
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Build an NVS entry
 */
function buildNVSEntry(
  namespace: number,
  type: NVSEntryType,
  span: number,
  key: string,
  value: number | string | Uint8Array
): Uint8Array {
  const entry = new Uint8Array(NVS_ENTRY_SIZE);
  const view = new DataView(entry.buffer);
  
  // Namespace index (1 byte)
  entry[0] = namespace;
  
  // Type (1 byte)
  entry[1] = type;
  
  // Span (1 byte) - number of entries this item spans
  entry[2] = span;
  
  // Reserved (1 byte)
  entry[3] = 0xff;
  
  // CRC32 of entry excluding this field (4 bytes) - will be filled later
  view.setUint32(4, 0xffffffff, true);
  
  // Key (16 bytes, null-terminated, max 15 chars)
  const keyBytes = new TextEncoder().encode(key);
  const keyLength = Math.min(keyBytes.length, 15);
  entry.set(keyBytes.slice(0, keyLength), 8);
  // Ensure null termination and fill rest with zeros
  for (let i = keyLength; i < 16; i++) {
    entry[8 + i] = 0;
  }
  
  // Data (8 bytes)
  if (typeof value === 'number') {
    // Numeric value
    if (type === NVSEntryType.U8 || type === NVSEntryType.I8) {
      view.setUint8(24, value);
    } else if (type === NVSEntryType.U16 || type === NVSEntryType.I16) {
      view.setUint16(24, value, true);
    } else if (type === NVSEntryType.U32 || type === NVSEntryType.I32) {
      view.setUint32(24, value, true);
    }
    // Fill remaining bytes with 0xff
    for (let i = 4; i < 8; i++) {
      entry[24 + i] = 0xff;
    }
  } else if (typeof value === 'string') {
    // String value - store size in data field
    view.setUint16(24, value.length + 1, true); // +1 for null terminator
    // Fill remaining bytes with 0xff
    for (let i = 2; i < 8; i++) {
      entry[24 + i] = 0xff;
    }
  } else {
    // Blob - store size in data field
    view.setUint16(24, value.length, true);
    // Fill remaining bytes with 0xff
    for (let i = 2; i < 8; i++) {
      entry[24 + i] = 0xff;
    }
  }
  
  // Calculate and set CRC32 for the entry (excluding CRC field itself)
  const crcData = new Uint8Array(28);
  crcData.set(entry.slice(0, 4), 0);
  crcData.set(entry.slice(8, 32), 4);
  const entryCrc = crc32(crcData);
  view.setUint32(4, entryCrc, true);
  
  return entry;
}

/**
 * Build string data entries
 */
function buildStringData(value: string): Uint8Array[] {
  const strBytes = new TextEncoder().encode(value + '\0'); // Add null terminator
  const entries: Uint8Array[] = [];
  
  // Each entry can hold 32 bytes
  for (let i = 0; i < strBytes.length; i += NVS_ENTRY_SIZE) {
    const entry = new Uint8Array(NVS_ENTRY_SIZE);
    entry.fill(0xff);
    const chunk = strBytes.slice(i, i + NVS_ENTRY_SIZE);
    entry.set(chunk, 0);
    entries.push(entry);
  }
  
  return entries;
}

/**
 * Build a namespace entry
 */
function buildNamespaceEntry(namespaceIndex: number, namespaceName: string): Uint8Array {
  return buildNVSEntry(0, NVSEntryType.U8, 1, namespaceName, namespaceIndex);
}

/**
 * Build NVS page header
 */
function buildPageHeader(state: NVSPageState, seqNumber: number): Uint8Array {
  const header = new Uint8Array(32);
  const view = new DataView(header.buffer);
  
  // State (4 bytes)
  view.setUint32(0, state, true);
  
  // Sequence number (4 bytes)
  view.setUint32(4, seqNumber, true);
  
  // Version (1 byte)
  header[8] = NVS_VERSION;
  
  // Unused (19 bytes) - fill with 0xff
  for (let i = 9; i < 28; i++) {
    header[i] = 0xff;
  }
  
  // CRC32 of header (4 bytes)
  const headerCrc = crc32(header.slice(0, 28));
  view.setUint32(28, headerCrc, true);
  
  return header;
}

/**
 * Build an NVS partition from entries
 */
export function buildNVSPartition(entries: NVSEntry[], partitionSize: number = NVS_PAGE_SIZE * 3): Uint8Array {
  const partition = new Uint8Array(partitionSize);
  partition.fill(0xff);
  
  // Track namespaces
  const namespaces = new Map<string, number>();
  let nextNamespaceIndex = 1; // 0 is reserved
  
  // First pass: collect all namespaces
  for (const entry of entries) {
    if (!namespaces.has(entry.namespace)) {
      namespaces.set(entry.namespace, nextNamespaceIndex++);
    }
  }
  
  let pageOffset = 0;
  let entryOffset = 32; // Skip page header
  let seqNumber = 0;
  
  // Write first page header
  const pageHeader = buildPageHeader(NVSPageState.ACTIVE, seqNumber);
  partition.set(pageHeader, pageOffset);
  
  // Write namespace entries first
  for (const [namespaceName, namespaceIndex] of namespaces) {
    const namespaceEntry = buildNamespaceEntry(namespaceIndex, namespaceName);
    partition.set(namespaceEntry, pageOffset + entryOffset);
    entryOffset += NVS_ENTRY_SIZE;
  }
  
  // Write data entries
  for (const entry of entries) {
    const namespaceIndex = namespaces.get(entry.namespace)!;
    
    let entryType: NVSEntryType;
    let span = 1;
    
    if (entry.type === 'u8') {
      entryType = NVSEntryType.U8;
    } else if (entry.type === 'u16') {
      entryType = NVSEntryType.U16;
    } else if (entry.type === 'u32') {
      entryType = NVSEntryType.U32;
    } else if (entry.type === 'string') {
      entryType = NVSEntryType.STRING;
      const strValue = entry.value as string;
      // Calculate span needed for string data
      span = 1 + Math.ceil((strValue.length + 1) / NVS_ENTRY_SIZE);
    } else {
      throw new Error(`Unsupported type: ${entry.type}`);
    }
    
    // Check if we need a new page
    if (entryOffset + span * NVS_ENTRY_SIZE > NVS_PAGE_SIZE) {
      // Mark current page as full
      const fullState = buildPageHeader(NVSPageState.FULL, seqNumber);
      partition.set(fullState, pageOffset);
      
      // Start new page
      pageOffset += NVS_PAGE_SIZE;
      seqNumber++;
      entryOffset = 32;
      
      if (pageOffset + NVS_PAGE_SIZE > partitionSize) {
        throw new Error('NVS partition size exceeded');
      }
      
      const newPageHeader = buildPageHeader(NVSPageState.ACTIVE, seqNumber);
      partition.set(newPageHeader, pageOffset);
    }
    
    // Write entry
    const nvsEntry = buildNVSEntry(
      namespaceIndex,
      entryType,
      span,
      entry.key,
      entry.value
    );
    partition.set(nvsEntry, pageOffset + entryOffset);
    entryOffset += NVS_ENTRY_SIZE;
    
    // Write string/blob data if needed
    if (entry.type === 'string') {
      const dataEntries = buildStringData(entry.value as string);
      for (const dataEntry of dataEntries) {
        partition.set(dataEntry, pageOffset + entryOffset);
        entryOffset += NVS_ENTRY_SIZE;
      }
    }
  }
  
  return partition;
}

/**
 * Build NVS partition for ESPHome WiFi credentials
 */
export function buildESPHomeWiFiNVS(ssid: string, password: string): Uint8Array {
  const entries: NVSEntry[] = [
    {
      namespace: 'esphome',
      key: 'ssid',
      type: 'string',
      value: ssid,
    },
    {
      namespace: 'esphome',
      key: 'password',
      type: 'string',
      value: password,
    },
  ];
  
  return buildNVSPartition(entries);
}
