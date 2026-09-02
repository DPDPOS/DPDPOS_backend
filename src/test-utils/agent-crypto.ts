import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

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

function pem(label: string, value: Buffer): string {
  const body = value.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

const ECDSA_SHA256 = oid("1.2.840.10045.4.3.2");
const COMMON_NAME = oid("2.5.4.3");

/** Build a PKCS#10 CSR (EC P-256) for agent enrollment tests. */
export function generateTestCsr(commonName = "dpdpos-test-agent"): {
  csrPem: string;
  privateKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const subject = seq(
    der(0x31, seq(COMMON_NAME, der(0x0c, Buffer.from(commonName)))),
  );
  const spki = publicKey.export({ type: "spki", format: "der" });
  const certificationRequestInfo = seq(
    integer(Buffer.from([0])),
    subject,
    spki,
    der(0xa0),
  );
  const signature = sign("sha256", certificationRequestInfo, privateKey);
  const csrDer = seq(
    certificationRequestInfo,
    seq(ECDSA_SHA256),
    der(0x03, Buffer.from([0]), signature),
  );
  return {
    csrPem: pem("CERTIFICATE REQUEST", csrDer),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
  };
}

export function fingerprintKey(privateKeyPem: string): KeyObject {
  return createPrivateKey(privateKeyPem);
}

export function publicKeyFromPrivate(privateKeyPem: string): KeyObject {
  return createPublicKey(privateKeyPem);
}
