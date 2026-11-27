// The export's one archive (#410): a plain POSIX tar, so that if the kit is ever lost Nikhil can still open an export
// by hand with `gpg --decrypt <archive> | tar -x`. ustar headers, with a pax header for a path longer than ustar
// holds. Only regular files and folders are written or read: anything else, or a path that would land outside the
// folder it is unpacked into, is refused.
import { closeSync, fstatSync, mkdirSync, openSync, readSync, writeSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";

const BLOCK = 512;
const CHUNK = 1 << 20;

function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

function header(name: string, size: number, type: "0" | "x"): Buffer {
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, 100, "utf8");
  block.write(octal(0o600, 8), 100, "ascii");
  block.write(octal(0, 8), 108, "ascii");
  block.write(octal(0, 8), 116, "ascii");
  block.write(octal(size, 12), 124, "ascii");
  block.write(octal(0, 12), 136, "ascii");
  block.write(" ".repeat(8), 148, "ascii");
  block.write(type, 156, "ascii");
  block.write("ustar\0", 257, "ascii");
  block.write("00", 263, "ascii");
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return block;
}

function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 1;
  while (String(length).length + Buffer.byteLength(body) !== length) length = String(length).length + Buffer.byteLength(body);
  return `${length}${body}`;
}

function padding(size: number): Buffer {
  return Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK);
}

function safeName(name: string): string {
  const parts = name.split("/");
  if (!name || name.startsWith("/") || parts.some((part) => part === ".." || part === "")) throw new Error(`The archive holds an unsafe path: ${name}`);
  return name;
}

/** Writes `entries` (archive name → file on disk) into the tar file `file`, copying each in chunks. */
export function writeTar(file: string, entries: ReadonlyArray<Readonly<{ name: string; source: string }>>): void {
  const out = openSync(file, "wx", 0o600);
  try {
    const buffer = Buffer.alloc(CHUNK);
    for (const { name, source } of entries) {
      safeName(name);
      const input = openSync(source, "r");
      try {
        const { size } = fstatSync(input);
        if (Buffer.byteLength(name) > 100) {
          const pax = Buffer.from(paxRecord("path", name));
          writeSync(out, header("PaxHeader", pax.length, "x"));
          writeSync(out, Buffer.concat([pax, padding(pax.length)]));
        }
        writeSync(out, header(Buffer.byteLength(name) > 100 ? "long-path" : name, size, "0"));
        let copied = 0;
        for (let read; (read = readSync(input, buffer, 0, CHUNK, copied)) > 0; copied += read) writeSync(out, buffer, 0, read);
        if (copied !== size) throw new Error(`${source} changed while it was archived.`);
        writeSync(out, padding(size));
      } finally {
        closeSync(input);
      }
    }
    writeSync(out, Buffer.alloc(BLOCK * 2));
  } finally {
    closeSync(out);
  }
}

/** Reads exactly the bytes asked for from a stream, across its chunks. */
class StreamReader {
  private chunk: Buffer = Buffer.alloc(0);
  private readonly chunks: AsyncIterator<Buffer>;

  constructor(stream: Readable) {
    this.chunks = stream[Symbol.asyncIterator]();
  }

  private async fill(): Promise<void> {
    while (!this.chunk.length) {
      const next = await this.chunks.next();
      if (next.done) throw new Error("The archive ends before its last file does.");
      this.chunk = next.value;
    }
  }

  /** Hands `size` bytes to `consume` as they come. */
  async each(size: number, consume: (part: Buffer) => void): Promise<void> {
    for (let left = size; left > 0; ) {
      await this.fill();
      const part = this.chunk.subarray(0, left);
      this.chunk = this.chunk.subarray(part.length);
      left -= part.length;
      consume(part);
    }
  }

  async take(size: number): Promise<Buffer> {
    const parts: Buffer[] = [];
    await this.each(size, (part) => parts.push(part));
    return Buffer.concat(parts);
  }

  /** Reads to the end, so the writer (gpg) can finish and report on the archive's integrity. */
  async drain(): Promise<void> {
    while (!(await this.chunks.next()).done);
  }
}

function field(block: Buffer, start: number, length: number): string {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? length : end).toString("utf8");
}

/** Unpacks a tar arriving on `stream` into `folder`, and gives back the name of every file in it. */
export async function extractTar(stream: Readable, folder: string): Promise<string[]> {
  const reader = new StreamReader(stream);
  const names: string[] = [];
  let longName: string | undefined;
  for (;;) {
    const block = await reader.take(BLOCK);
    if (block.every((byte) => byte === 0)) break;
    const size = parseInt(field(block, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(block[156] || 48);
    const ustarName = [field(block, 345, 155), field(block, 0, 100)].filter(Boolean).join("/");
    const padded = size + padding(size).length;
    if (type === "x" || type === "L") {
      const body = (await reader.take(padded)).subarray(0, size).toString("utf8");
      longName = type === "L" ? body.replace(/\0+$/, "") : /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body)?.[1] ?? longName;
      continue;
    }
    const name = (longName ?? ustarName).replace(/^\.\//, "").replace(/\/$/, "");
    longName = undefined;
    if (type === "g" || type === "5" || name === "" || name === ".") {
      await reader.each(padded, () => {});
      continue;
    }
    if (type !== "0") throw new Error(`The archive holds something other than a file or folder: ${name}`);
    const target = path.join(folder, safeName(name));
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const out = openSync(target, "wx", 0o600);
    try {
      let written = 0;
      await reader.each(padded, (part) => {
        const useful = part.subarray(0, Math.max(0, Math.min(part.length, size - written)));
        if (useful.length) writeSync(out, useful);
        written += part.length;
      });
    } finally {
      closeSync(out);
    }
    names.push(name);
  }
  await reader.drain();
  return names.sort();
}
