import "source-map-support/register";
import opcodes from "./opcodes";
import { opcodeObject } from "typings";
const cbor = require("borc"); //importing this untyped, sorry!

export = {
  /**
   * parseCode - return a list of instructions given a 0x-prefixed code string.
   *
   * If numInstructions is not passed in, we attempt to strip contract
   * metadata.  This won't work very well if the code is for a constructor or a
   * contract that can create other contracts, but it's better than nothing.
   *
   * WARNING: Don't invoke the function that way if you're dealing with a
   * constructor with arguments attached!  Then you could get disaster!
   *
   * If you pass in numInstructions (hint: count the semicolons in the source
   * map, then add one) this is used to exclude metadata instead.
   *
   * @param  {String} hexString Hex string representing the code
   * @return Array               Array of instructions
   */
  parseCode(hexString: string, numInstructions: number = null) {
    // Convert to an array of bytes
    let code = new Uint8Array(
      (hexString.slice(2).match(/(..?)/g) || []).map(hex => parseInt(hex, 16))
    );

    const stripMetadata = numInstructions === null;

    if (stripMetadata && code.length >= 2) {
      // Remove the contract metadata; last two bytes encode its length (not
      // including those two bytes)
      const metadataLength =
        (code[code.length - 2] << 8) + code[code.length - 1];
      //check: is this actually valid CBOR?
      if (metadataLength + 2 <= code.length) {
        const metadata = code.subarray(-(metadataLength + 2), -2);
        if (isValidCBOR(metadata)) {
          code = code.subarray(0, -(metadataLength + 2));
        }
      }
    }

    let instructions = [];
    for (
      let pc = 0;
      pc < code.length &&
      (stripMetadata || instructions.length < numInstructions);
      pc++
    ) {
      let opcode: opcodeObject = {};
      opcode.pc = pc;
      opcode.name = opcodes(code[pc]);
      if (opcode.name.slice(0, 4) === "PUSH") {
        const length = code[pc] - 0x60 + 1; //0x60 is code for PUSH1
        opcode.pushData = Array.from(code.slice(pc + 1, pc + length + 1));
        if (opcode.pushData.length < length) {
          opcode.pushData = opcode.pushData.concat(
            new Array(length - opcode.pushData.length).fill(0)
          );
        }

        // convert pushData to hex
        opcode.pushData = `0x${Buffer.from(opcode.pushData).toString("hex")}`;

        pc += length;
      }
      instructions.push(opcode);
    }
    return instructions;
  }
};

function isValidCBOR(metadata: Uint8Array) {
  let decodedMultiple: any[];
  try {
    decodedMultiple = cbor.decodeAll(metadata);
  } catch (_) {
    return false;
  }
  return decodedMultiple.length === 1; //should be CBOR for one thing, not multiple
}
