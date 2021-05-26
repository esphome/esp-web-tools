import {
  CHIP_FAMILY_ESP32,
  CHIP_FAMILY_ESP32S2,
  CHIP_FAMILY_ESP8266,
  MAX_TIMEOUT,
  Logger,
  DEFAULT_TIMEOUT,
  ERASE_REGION_TIMEOUT_PER_MB,
  ESP32S2_DATAREGVALUE,
  ESP32S2_FLASH_WRITE_SIZE,
  ESP32_DATAREGVALUE,
  ESP8266_DATAREGVALUE,
  ESP_CHANGE_BAUDRATE,
  ESP_CHECKSUM_MAGIC,
  ESP_FLASH_BEGIN,
  ESP_FLASH_DATA,
  ESP_FLASH_END,
  ESP_MEM_BEGIN,
  ESP_MEM_DATA,
  ESP_MEM_END,
  ESP_READ_REG,
  ESP_SPI_ATTACH,
  ESP_SPI_SET_PARAMS,
  ESP_SYNC,
  FLASH_SECTOR_SIZE,
  FLASH_WRITE_SIZE,
  MEM_END_ROM_TIMEOUT,
  ROM_INVALID_RECV_MSG,
  SYNC_PACKET,
  SYNC_TIMEOUT,
  USB_RAM_BLOCK,
  ChipFamily,
  ESP_ERASE_FLASH,
  CHIP_ERASE_TIMEOUT,
  timeoutPerMb,
} from "./const";
import { getStubCode } from "./stubs";
import { pack, sleep, slipEncode, toHex, unpack } from "./util";

export class ESPLoader extends EventTarget {
  chipFamily!: ChipFamily;
  chipName: string | null = null;
  _efuses = new Array(4).fill(0);
  _flashsize = 4 * 1024 * 1024;
  debug = false;
  IS_STUB = false;
  connected = true;

  __inputBuffer?: number[];
  private _reader?: ReadableStreamDefaultReader<Uint8Array>;

  constructor(
    public port: SerialPort,
    public logger: Logger,
    private _parent?: ESPLoader
  ) {
    super();
  }

  private get _inputBuffer(): number[] {
    return this._parent ? this._parent._inputBuffer : this.__inputBuffer!;
  }

  /**
   * @name chipType
   * ESP32 or ESP8266 based on which chip type we're talking to
   */
  async initialize() {
    await this.softReset();

    if (!this._parent) {
      this.__inputBuffer = [];
      // Don't await this promise so it doesn't block rest of method.
      this.readLoop();
    }
    await this.sync();

    // Determine chip family
    let datareg = await this.readRegister(0x60000078);
    if (datareg == ESP32_DATAREGVALUE) {
      this.chipFamily = CHIP_FAMILY_ESP32;
    } else if (datareg == ESP8266_DATAREGVALUE) {
      this.chipFamily = CHIP_FAMILY_ESP8266;
    } else if (datareg == ESP32S2_DATAREGVALUE) {
      this.chipFamily = CHIP_FAMILY_ESP32S2;
    } else {
      throw "Unknown Chip.";
    }

    // Read the OTP data for this chip and store into this.efuses array
    let baseAddr: number;
    if (this.chipFamily == CHIP_FAMILY_ESP8266) {
      baseAddr = 0x3ff00050;
    } else if (this.chipFamily == CHIP_FAMILY_ESP32) {
      baseAddr = 0x6001a000;
    } else if (this.chipFamily == CHIP_FAMILY_ESP32S2) {
      baseAddr = 0x6001a000;
    }
    for (let i = 0; i < 4; i++) {
      this._efuses[i] = await this.readRegister(baseAddr! + 4 * i);
    }

    // The specific name of the chip, e.g. ESP8266EX, to the best
    // of our ability to determine without a stub bootloader.
    if (this.chipFamily == CHIP_FAMILY_ESP32) {
      this.chipName = "ESP32";
    }
    if (this.chipFamily == CHIP_FAMILY_ESP32S2) {
      this.chipName = "ESP32-S2";
    }
    if (this.chipFamily == CHIP_FAMILY_ESP8266) {
      if (this._efuses[0] & (1 << 4) || this._efuses[2] & (1 << 16)) {
        this.chipName = "ESP8285";
      } else {
        this.chipName = "ESP8266EX";
      }
    }
  }

  /**
   * @name readLoop
   * Reads data from the input stream and places it in the inputBuffer
   */
  async readLoop() {
    this._reader = this.port.readable!.getReader();

    try {
      while (true) {
        const { value, done } = await this._reader.read();
        if (done) {
          this._reader.releaseLock();
          break;
        }
        if (!value || value.length === 0) {
          continue;
        }
        this._inputBuffer.push(...Array.from(value));
      }
    } catch (err) {
      // Disconnected!
      this.connected = false;
      this.dispatchEvent(new Event("disconnect"));
    }
  }

  async softReset() {
    this.logger.log("Try soft reset.");
    await this.port.setSignals({
      dataTerminalReady: false,
      requestToSend: true,
    });
    await this.port.setSignals({
      dataTerminalReady: true,
      requestToSend: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * @name macAddr
   * The MAC address burned into the OTP memory of the ESP chip
   */
  macAddr() {
    let macAddr = new Array(6).fill(0);
    let mac0 = this._efuses[0];
    let mac1 = this._efuses[1];
    let mac2 = this._efuses[2];
    let mac3 = this._efuses[3];
    let oui;
    if (this.chipFamily == CHIP_FAMILY_ESP8266) {
      if (mac3 != 0) {
        oui = [(mac3 >> 16) & 0xff, (mac3 >> 8) & 0xff, mac3 & 0xff];
      } else if (((mac1 >> 16) & 0xff) == 0) {
        oui = [0x18, 0xfe, 0x34];
      } else if (((mac1 >> 16) & 0xff) == 1) {
        oui = [0xac, 0xd0, 0x74];
      } else {
        throw "Couldnt determine OUI";
      }

      macAddr[0] = oui[0];
      macAddr[1] = oui[1];
      macAddr[2] = oui[2];
      macAddr[3] = (mac1 >> 8) & 0xff;
      macAddr[4] = mac1 & 0xff;
      macAddr[5] = (mac0 >> 24) & 0xff;
    } else if (this.chipFamily == CHIP_FAMILY_ESP32) {
      macAddr[0] = (mac2 >> 8) & 0xff;
      macAddr[1] = mac2 & 0xff;
      macAddr[2] = (mac1 >> 24) & 0xff;
      macAddr[3] = (mac1 >> 16) & 0xff;
      macAddr[4] = (mac1 >> 8) & 0xff;
      macAddr[5] = mac1 & 0xff;
    } else if (this.chipFamily == CHIP_FAMILY_ESP32S2) {
      macAddr[0] = (mac2 >> 8) & 0xff;
      macAddr[1] = mac2 & 0xff;
      macAddr[2] = (mac1 >> 24) & 0xff;
      macAddr[3] = (mac1 >> 16) & 0xff;
      macAddr[4] = (mac1 >> 8) & 0xff;
      macAddr[5] = mac1 & 0xff;
    } else {
      throw "Unknown chip family";
    }
    return macAddr;
  }

  /**
   * @name readRegister
   * Read a register within the ESP chip RAM, returns a 4-element list
   */
  async readRegister(reg: number) {
    if (this.debug) {
      this.logger.debug("Reading Register", reg);
    }
    let packet = pack("I", reg);
    let register = (await this.checkCommand(ESP_READ_REG, packet))[0];
    return unpack("I", register!)[0];
  }

  /**
   * @name checkCommand
   * Send a command packet, check that the command succeeded and
   * return a tuple with the value and data.
   * See the ESP Serial Protocol for more details on what value/data are
   */
  async checkCommand(
    opcode: number,
    buffer: number[],
    checksum = 0,
    timeout = DEFAULT_TIMEOUT
  ) {
    timeout = Math.min(timeout, MAX_TIMEOUT);
    await this.sendCommand(opcode, buffer, checksum);
    let [value, data] = await this.getResponse(opcode, timeout);

    if (data === null) {
      throw "Didn't get enough status bytes";
    }

    let statusLen = 0;

    if (this.IS_STUB || this.chipFamily == CHIP_FAMILY_ESP8266) {
      statusLen = 2;
    } else if (
      [CHIP_FAMILY_ESP32, CHIP_FAMILY_ESP32S2].includes(this.chipFamily)
    ) {
      statusLen = 4;
    } else {
      if ([2, 4].includes(data.length)) {
        statusLen = data.length;
      }
    }

    if (data.length < statusLen) {
      throw "Didn't get enough status bytes";
    }
    let status = data.slice(-statusLen, data.length);
    data = data.slice(0, -statusLen);
    if (this.debug) {
      this.logger.debug("status", status);
      this.logger.debug("value", value);
      this.logger.debug("data", data);
    }
    if (status[0] == 1) {
      if (status[1] == ROM_INVALID_RECV_MSG) {
        throw "Invalid (unsupported) command " + toHex(opcode);
      } else {
        throw "Command failure error code " + toHex(status[1]);
      }
    }
    return [value, data];
  }

  /**
   * @name sendCommand
   * Send a slip-encoded, checksummed command over the UART,
   * does not check response
   */
  async sendCommand(opcode: number, buffer: number[], checksum = 0) {
    //debugMsg("Running Send Command");
    this._inputBuffer.length = 0; // Reset input buffer
    let packet = [0xc0, 0x00]; // direction
    packet.push(opcode);
    packet = packet.concat(pack("H", buffer.length));
    packet = packet.concat(slipEncode(pack("I", checksum)));
    packet = packet.concat(slipEncode(buffer));
    packet.push(0xc0);
    if (this.debug) {
      this.logger.debug(
        "Writing " +
          packet.length +
          " byte" +
          (packet.length == 1 ? "" : "s") +
          ":",
        packet
      );
    }
    await this.writeToStream(packet);
  }

  /**
   * @name getResponse
   * Read response data and decodes the slip packet, then parses
   * out the value/data and returns as a tuple of (value, data) where
   * each is a list of bytes
   */
  async getResponse(opcode: number, timeout = DEFAULT_TIMEOUT) {
    let reply: number[] = [];
    let packetLength = 0;
    let escapedByte = false;
    let stamp = Date.now();
    while (Date.now() - stamp < timeout) {
      if (this._inputBuffer.length > 0) {
        let c = this._inputBuffer.shift()!;
        if (c == 0xdb) {
          escapedByte = true;
        } else if (escapedByte) {
          if (c == 0xdd) {
            reply.push(0xdc);
          } else if (c == 0xdc) {
            reply.push(0xc0);
          } else {
            reply = reply.concat([0xdb, c]);
          }
          escapedByte = false;
        } else {
          reply.push(c);
        }
      } else {
        await sleep(10);
      }
      if (reply.length > 0 && reply[0] != 0xc0) {
        // packets must start with 0xC0
        reply.shift();
      }
      if (reply.length > 1 && reply[1] != 0x01) {
        reply.shift();
      }
      if (reply.length > 2 && reply[2] != opcode) {
        reply.shift();
      }
      if (reply.length > 4) {
        // get the length
        packetLength = reply[3] + (reply[4] << 8);
      }
      if (reply.length == packetLength + 10) {
        break;
      }
    }

    // Check to see if we have a complete packet. If not, we timed out.
    if (reply.length != packetLength + 10) {
      this.logger.log("Timed out after " + timeout + " milliseconds");
      return [null, null];
    }
    if (this.debug) {
      this.logger.debug(
        "Reading " +
          reply.length +
          " byte" +
          (reply.length == 1 ? "" : "s") +
          ":",
        reply
      );
    }
    let value = reply.slice(5, 9);
    let data = reply.slice(9, -1);
    if (this.debug) {
      this.logger.debug("value:", value, "data:", data);
    }
    return [value, data];
  }

  /**
   * @name read
   * Read response data and decodes the slip packet.
   * Keeps reading until we hit the timeout or get
   * a packet closing byte
   */
  async readBuffer(timeout = DEFAULT_TIMEOUT) {
    let reply: number[] = [];
    // let packetLength = 0;
    let escapedByte = false;
    let stamp = Date.now();
    while (Date.now() - stamp < timeout) {
      if (this._inputBuffer.length > 0) {
        let c = this._inputBuffer.shift()!;
        if (c == 0xdb) {
          escapedByte = true;
        } else if (escapedByte) {
          if (c == 0xdd) {
            reply.push(0xdc);
          } else if (c == 0xdc) {
            reply.push(0xc0);
          } else {
            reply = reply.concat([0xdb, c]);
          }
          escapedByte = false;
        } else {
          reply.push(c);
        }
      } else {
        await sleep(10);
      }
      if (reply.length > 0 && reply[0] != 0xc0) {
        // packets must start with 0xC0
        reply.shift();
      }
      if (reply.length > 1 && reply[reply.length - 1] == 0xc0) {
        break;
      }
    }

    // Check to see if we have a complete packet. If not, we timed out.
    if (reply.length < 2) {
      this.logger.log("Timed out after " + timeout + " milliseconds");
      return null;
    }
    if (this.debug) {
      this.logger.debug(
        "Reading " +
          reply.length +
          " byte" +
          (reply.length == 1 ? "" : "s") +
          ":",
        reply
      );
    }
    let data = reply.slice(1, -1);
    if (this.debug) {
      this.logger.debug("data:", data);
    }
    return data;
  }

  /**
   * @name checksum
   * Calculate checksum of a blob, as it is defined by the ROM
   */
  checksum(data: number[], state = ESP_CHECKSUM_MAGIC) {
    for (let b of data) {
      state ^= b;
    }
    return state;
  }

  async setBaudrate(baud: number) {
    if (this.chipFamily == CHIP_FAMILY_ESP8266) {
      this.logger.log("Baud rate can only change on ESP32 and ESP32-S2");
    } else {
      this.logger.log("Attempting to change baud rate to " + baud + "...");
      try {
        let buffer = pack("<II", baud, 0);
        await this.checkCommand(ESP_CHANGE_BAUDRATE, buffer);
        // this.port.baudRate = baud;
        await sleep(50);
        await this.checkCommand(ESP_CHANGE_BAUDRATE, buffer);
        this.logger.log("Changed baud rate to " + baud);
      } catch (e) {
        throw (
          "Unable to change the baud rate, please try setting the connection speed from " +
          baud +
          " to 115200 and reconnecting."
        );
      }
    }
  }

  /**
   * @name sync
   * Put into ROM bootload mode & attempt to synchronize with the
   * ESP ROM bootloader, we will retry a few times
   */
  async sync() {
    for (let i = 0; i < 5; i++) {
      let response = await this._sync();
      if (response) {
        await sleep(100);
        return true;
      }
      await sleep(100);
    }

    throw "Couldn't sync to ESP. Try resetting.";
  }

  /**
   * @name _sync
   * Perform a soft-sync using AT sync packets, does not perform
   * any hardware resetting
   */
  async _sync() {
    await this.sendCommand(ESP_SYNC, SYNC_PACKET);
    for (let i = 0; i < 8; i++) {
      let [_reply, data] = await this.getResponse(ESP_SYNC, SYNC_TIMEOUT);
      if (data === null) {
        continue;
      }
      if (data.length > 1 && data[0] == 0 && data[1] == 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * @name getFlashWriteSize
   * Get the Flash write size based on the chip
   */
  getFlashWriteSize() {
    if (this.chipFamily == CHIP_FAMILY_ESP32S2) {
      return ESP32S2_FLASH_WRITE_SIZE;
    }
    return FLASH_WRITE_SIZE;
  }

  /**
   * @name flashData
   * Program a full, uncompressed binary file into SPI Flash at
   *   a given offset. If an ESP32 and md5 string is passed in, will also
   *   verify memory. ESP8266 does not have checksum memory verification in
   *   ROM
   */
  async flashData(
    binaryData: ArrayBuffer,
    updateProgress: (bytesWritten: number) => void,
    offset = 0
  ) {
    let filesize = binaryData.byteLength;
    this.logger.log("\nWriting data with filesize:" + filesize);
    await this.flashBegin(filesize, offset);
    let block = [];
    let seq = 0;
    let written = 0;
    // let address = offset;
    let position = 0;
    let stamp = Date.now();
    let flashWriteSize = this.getFlashWriteSize();

    while (filesize - position > 0) {
      /*logMsg(
          "Writing at " + toHex(address + seq * flashWriteSize, 8) + "... (" + percentage + " %)"
      );*/
      if (filesize - position >= flashWriteSize) {
        block = Array.from(
          new Uint8Array(binaryData, position, flashWriteSize)
        );
      } else {
        // Pad the last block
        block = Array.from(
          new Uint8Array(binaryData, position, filesize - position)
        );
        block = block.concat(
          new Array(flashWriteSize - block.length).fill(0xff)
        );
      }
      await this.flashBlock(block, seq, 2000);
      seq += 1;
      written += block.length;
      position += flashWriteSize;
      updateProgress(written);
    }
    this.logger.log(
      "Took " + (Date.now() - stamp) + "ms to write " + filesize + " bytes"
    );
  }

  /**
   * @name flashBlock
   * Send one block of data to program into SPI Flash memory
   */
  async flashBlock(data: number[], seq: number, timeout = 100) {
    await this.checkCommand(
      ESP_FLASH_DATA,
      pack("<IIII", data.length, seq, 0, 0).concat(data),
      this.checksum(data),
      timeout
    );
  }

  /**
   * @name flashBegin
   * Prepare for flashing by attaching SPI chip and erasing the
   *   number of blocks requred.
   */
  async flashBegin(size = 0, offset = 0, encrypted = false) {
    let eraseSize;
    let buffer;
    let flashWriteSize = this.getFlashWriteSize();
    if ([CHIP_FAMILY_ESP32, CHIP_FAMILY_ESP32S2].includes(this.chipFamily)) {
      await this.checkCommand(ESP_SPI_ATTACH, new Array(8).fill(0));
    }
    if (this.chipFamily == CHIP_FAMILY_ESP32) {
      // We are hardcoded for 4MB flash on ESP32
      buffer = pack("<IIIIII", 0, this._flashsize, 0x10000, 4096, 256, 0xffff);
      await this.checkCommand(ESP_SPI_SET_PARAMS, buffer);
    }
    let numBlocks = Math.floor((size + flashWriteSize - 1) / flashWriteSize);
    if (this.chipFamily == CHIP_FAMILY_ESP8266) {
      eraseSize = this.getEraseSize(offset, size);
    } else {
      eraseSize = size;
    }

    let timeout;
    if (this.IS_STUB) {
      timeout = DEFAULT_TIMEOUT;
    } else {
      timeout = timeoutPerMb(ERASE_REGION_TIMEOUT_PER_MB, size);
    }

    let stamp = Date.now();
    buffer = pack("<IIII", eraseSize, numBlocks, flashWriteSize, offset);
    if (this.chipFamily == CHIP_FAMILY_ESP32S2) {
      buffer = buffer.concat(pack("<I", encrypted ? 1 : 0));
    }
    this.logger.log(
      "Erase size " +
        eraseSize +
        ", blocks " +
        numBlocks +
        ", block size " +
        flashWriteSize +
        ", offset " +
        toHex(offset, 4) +
        ", encrypted " +
        (encrypted ? "yes" : "no")
    );
    await this.checkCommand(ESP_FLASH_BEGIN, buffer, 0, timeout);
    if (size != 0 && !this.IS_STUB) {
      this.logger.log(
        "Took " + (Date.now() - stamp) + "ms to erase " + numBlocks + " bytes"
      );
    }
    return numBlocks;
  }

  async flashFinish() {
    let buffer = pack("<I", 1);
    await this.checkCommand(ESP_FLASH_END, buffer);
  }

  /**
   * @name getEraseSize
   * Calculate an erase size given a specific size in bytes.
   *   Provides a workaround for the bootloader erase bug on ESP8266.
   */
  getEraseSize(offset: number, size: number) {
    let sectorsPerBlock = 16;
    let sectorSize = FLASH_SECTOR_SIZE;
    let numSectors = Math.floor((size + sectorSize - 1) / sectorSize);
    let startSector = Math.floor(offset / sectorSize);

    let headSectors = sectorsPerBlock - (startSector % sectorsPerBlock);
    if (numSectors < headSectors) {
      headSectors = numSectors;
    }

    if (numSectors < 2 * headSectors) {
      return Math.floor(((numSectors + 1) / 2) * sectorSize);
    }

    return (numSectors - headSectors) * sectorSize;
  }

  /**
   * @name memBegin (592)
   * Start downloading an application image to RAM
   */
  async memBegin(
    size: number,
    blocks: number,
    blocksize: number,
    offset: number
  ) {
    return await this.checkCommand(
      ESP_MEM_BEGIN,
      pack("<IIII", size, blocks, blocksize, offset)
    );
  }

  /**
   * @name memBlock (609)
   * Send a block of an image to RAM
   */
  async memBlock(data: number[], seq: number) {
    return await this.checkCommand(
      ESP_MEM_DATA,
      pack("<IIII", data.length, seq, 0, 0).concat(data),
      this.checksum(data)
    );
  }

  /**
   * @name memFinish (615)
   * Leave download mode and run the application
   *
   * Sending ESP_MEM_END usually sends a correct response back, however sometimes
   * (with ROM loader) the executed code may reset the UART or change the baud rate
   * before the transmit FIFO is empty. So in these cases we set a short timeout and
   * ignore errors.
   */
  async memFinish(entrypoint = 0) {
    let timeout = this.IS_STUB ? DEFAULT_TIMEOUT : MEM_END_ROM_TIMEOUT;
    let data = pack("<II", entrypoint == 0 ? 1 : 0, entrypoint);
    // try {
    return await this.checkCommand(ESP_MEM_END, data, 0, timeout);
    // } catch (err) {
    //   console.error("Error in memFinish", err);
    //   if (this.IS_STUB) {
    //     //  raise
    //   }
    //   // pass
    // }
  }

  // ESPTool Line 706
  async runStub(): Promise<EspStubLoader> {
    const stub = await getStubCode(this.chipFamily);

    // We're transferring over USB, right?
    let ramBlock = USB_RAM_BLOCK;

    // Upload
    this.logger.log("Uploading stub...");
    for (let field of ["text", "data"]) {
      if (Object.keys(stub).includes(field)) {
        let offset = stub[field + "_start"];
        let length = stub[field].length;
        let blocks = Math.floor((length + ramBlock - 1) / ramBlock);
        await this.memBegin(length, blocks, ramBlock, offset);
        for (let seq of Array(blocks).keys()) {
          let fromOffs = seq * ramBlock;
          let toOffs = fromOffs + ramBlock;
          if (toOffs > length) {
            toOffs = length;
          }
          await this.memBlock(stub[field].slice(fromOffs, toOffs), seq);
        }
      }
    }
    this.logger.log("Running stub...");
    await this.memFinish(stub["entry"]);

    const p = await this.readBuffer(100);
    const pChar = String.fromCharCode(...p!);

    if (pChar != "OHAI") {
      throw "Failed to start stub. Unexpected response: " + pChar;
    }
    this.logger.log("Stub is now running...");
    const espStubLoader = new EspStubLoader(this.port, this.logger, this);
    return espStubLoader;
  }

  async writeToStream(data: number[]) {
    const writer = this.port.writable!.getWriter();
    await writer.write(new Uint8Array(data));
    try {
      writer.releaseLock();
    } catch (err) {
      console.error("Ignoring release lock error", err);
    }
  }

  async disconnect() {
    if (this._parent) {
      await this._parent.disconnect();
      return;
    }
    if (this._reader) {
      await this._reader.cancel();
    }
    await this.port.writable!.getWriter().close();
    await this.port.close();
  }
}

class EspStubLoader extends ESPLoader {
  /*
    The Stubloader has commands that run on the uploaded Stub Code in RAM
    rather than built in commands.
  */
  IS_STUB = true;

  /**
   * @name memBegin (592)
   * Start downloading an application image to RAM
   */
  async memBegin(
    size: number,
    blocks: number,
    blocksize: number,
    offset: number
  ): Promise<any> {
    let stub = await getStubCode(this.chipFamily);
    let load_start = offset;
    let load_end = offset + size;
    console.log(load_start, load_end);
    console.log(
      stub.data_start,
      stub.data.length,
      stub.text_start,
      stub.text.length
    );
    for (let [start, end] of [
      [stub.data_start, stub.data_start + stub.data.length],
      [stub.text_start, stub.text_start + stub.text.length],
    ]) {
      if (load_start < end && load_end > start) {
        throw (
          "Software loader is resident at " +
          toHex(start, 8) +
          "-" +
          toHex(end, 8) +
          ". " +
          "Can't load binary at overlapping address range " +
          toHex(load_start, 8) +
          "-" +
          toHex(load_end, 8) +
          ". " +
          "Try changing the binary loading address."
        );
      }
    }
  }

  /**
   * @name getEraseSize
   * depending on flash chip model the erase may take this long (maybe longer!)
   */
  async eraseFlash() {
    await this.checkCommand(ESP_ERASE_FLASH, [], 0, CHIP_ERASE_TIMEOUT);
  }
}
