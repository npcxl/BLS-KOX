import { randomBytes } from 'crypto';

let seq = 0;
const machineId = randomBytes(3).readUIntBE(0, 3) & 0xFFFFFF;

export function generateSnowflakeId(): string {
  const ts = BigInt(Date.now());
  seq = (seq + 1) & 0xFFF;
  const id = (ts << 22n) | (BigInt(machineId) << 12n) | BigInt(seq);
  return id.toString();
}
