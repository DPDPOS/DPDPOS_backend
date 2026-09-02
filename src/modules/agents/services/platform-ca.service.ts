import {
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { ValidationError } from "../../../shared/errors/app-error.js";

type CaMaterial = {
  privateKey: KeyObject;
  certPem: string;
  subjectDer: Buffer;
};

const ECDSA_SHA256 = oid("1.2.840.10045.4.3.2");
const COMMON_NAME = oid("2.5.4.3");

function length(value: number): Buffer {
  if (value < 128) return Buffer.from([value]);
  const bytes: number[] = [];
  for (let n = value; n > 0; n >>>= 8) bytes.unshift(n & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), length(body.length), body]);
}

function seq(...parts: Buffer[]): Buffer {
  return der(0x30, ...parts);
}

function oid(value: string): Buffer {
  const values = value.split(".").map(Number);
  const bytes = [values[0]! * 40 + values[1]!];
  for (const component of values.slice(2)) {
    const encoded = [component & 0x7f];
    for (let n = component >>> 7; n > 0; n >>>= 7) {
      encoded.unshift((n & 0x7f) | 0x80);
    }
    bytes.push(...encoded);
  }
  return der(0x06, Buffer.from(bytes));
}

function integer(bytes: Buffer): Buffer {
  let value = bytes;
  while (value.length > 1 && value[0] === 0) value = value.subarray(1);
  if ((value[0]! & 0x80) !== 0) value = Buffer.concat([Buffer.from([0]), value]);
  return der(0x02, value);
}

function algorithmIdentifier(): Buffer {
  return seq(ECDSA_SHA256);
}

function name(commonName: string): Buffer {
  return seq(der(0x31, seq(COMMON_NAME, der(0x0c, Buffer.from(commonName)))));
}

function generalizedTime(value: Date): Buffer {
  const stamp = value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return der(0x18, Buffer.from(stamp));
}

function pem(label: string, value: Buffer): string {
  const body = value.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

function decodePem(value: string): Buffer {
  const body = value.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  return Buffer.from(body, "base64");
}

function readTlv(buffer: Buffer, offset: number): { start: number; body: number; end: number } {
  const firstLength = buffer[offset + 1]!;
  if ((firstLength & 0x80) === 0) {
    return { start: offset, body: offset + 2, end: offset + 2 + firstLength };
  }
  const count = firstLength & 0x7f;
  let size = 0;
  for (let i = 0; i < count; i += 1) size = (size << 8) | buffer[offset + 2 + i]!;
  return { start: offset, body: offset + 2 + count, end: offset + 2 + count + size };
}

function csrSubjectAndSpki(csrPem: string): { subject: Buffer; spki: Buffer } {
  try {
    const csr = decodePem(csrPem);
    const outer = readTlv(csr, 0);
    const info = readTlv(csr, outer.body);
    let cursor = info.body;
    cursor = readTlv(csr, cursor).end; // version
    const subject = readTlv(csr, cursor);
    cursor = subject.end;
    const spki = readTlv(csr, cursor);
    return {
      subject: csr.subarray(subject.start, subject.end),
      spki: csr.subarray(spki.start, spki.end),
    };
  } catch {
    throw new ValidationError("Invalid PKCS#10 certificate signing request");
  }
}

function certificateSubject(certPem: string): Buffer {
  const certificateDer = decodePem(certPem);
  const outer = readTlv(certificateDer, 0);
  const tbs = readTlv(certificateDer, outer.body);
  let cursor = tbs.body;
  if (certificateDer[cursor] === 0xa0) cursor = readTlv(certificateDer, cursor).end;
  cursor = readTlv(certificateDer, cursor).end; // serial
  cursor = readTlv(certificateDer, cursor).end; // signature algorithm
  cursor = readTlv(certificateDer, cursor).end; // issuer
  cursor = readTlv(certificateDer, cursor).end; // validity
  const subject = readTlv(certificateDer, cursor);
  return certificateDer.subarray(subject.start, subject.end);
}

function certificate(params: {
  privateKey: KeyObject;
  issuer: Buffer;
  subject: Buffer;
  spki: Buffer;
  serial: Buffer;
  notBefore: Date;
  notAfter: Date;
  ca: boolean;
}): string {
  const extensions = params.ca
    ? der(
        0xa3,
        seq(
          seq(
            oid("2.5.29.19"),
            der(0x01, Buffer.from([0xff])),
            der(0x04, seq(der(0x01, Buffer.from([0xff])))),
          ),
        ),
      )
    : der(
        0xa3,
        seq(
          seq(
            oid("2.5.29.19"),
            der(0x01, Buffer.from([0xff])),
            der(0x04, seq()),
          ),
        ),
      );
  const tbs = seq(
    der(0xa0, integer(Buffer.from([2]))),
    integer(params.serial),
    algorithmIdentifier(),
    params.issuer,
    seq(generalizedTime(params.notBefore), generalizedTime(params.notAfter)),
    params.subject,
    params.spki,
    extensions,
  );
  const signature = sign("sha256", tbs, params.privateKey);
  return pem(
    "CERTIFICATE",
    seq(tbs, algorithmIdentifier(), der(0x03, Buffer.from([0]), signature)),
  );
}

export class PlatformCaService {
  private material?: CaMaterial;

  async ensureCa(): Promise<void> {
    if (this.material) return;
    const keyPath = process.env.PLATFORM_CA_KEY_PATH;
    const certPath = process.env.PLATFORM_CA_CERT_PATH;
    if (keyPath && certPath) {
      const [keyPem, certPem] = await Promise.all([
        readFile(keyPath, "utf8"),
        readFile(certPath, "utf8"),
      ]);
      this.material = {
        privateKey: createPrivateKey(keyPem),
        certPem,
        subjectDer: certificateSubject(certPem),
      };
      return;
    }

    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const subject = name("DPDPOS Ephemeral Platform CA");
    const now = new Date();
    this.material = {
      privateKey,
      subjectDer: subject,
      certPem: certificate({
        privateKey,
        issuer: subject,
        subject,
        spki: publicKey.export({ type: "spki", format: "der" }),
        serial: randomBytes(16),
        notBefore: new Date(now.getTime() - 60_000),
        notAfter: new Date(now.getTime() + 3650 * 86_400_000),
        ca: true,
      }),
    };
  }

  async signCsr(
    csrPem: string,
  ): Promise<{ certPem: string; serialNumber: string; expiresAt: Date }> {
    await this.ensureCa();
    const ca = this.material!;
    const { subject, spki } = csrSubjectAndSpki(csrPem);
    const serial = randomBytes(16);
    const ttlDays = Number(process.env.AGENT_CERT_TTL_DAYS ?? 30);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 86_400_000);
    return {
      certPem: certificate({
        privateKey: ca.privateKey,
        issuer: ca.subjectDer,
        subject,
        spki,
        serial,
        notBefore: new Date(now.getTime() - 60_000),
        notAfter: expiresAt,
        ca: false,
      }),
      serialNumber: serial.toString("hex").toUpperCase(),
      expiresAt,
    };
  }

  async getCaCertPem(): Promise<string> {
    await this.ensureCa();
    return this.material!.certPem;
  }
}

export const platformCaService = new PlatformCaService();
