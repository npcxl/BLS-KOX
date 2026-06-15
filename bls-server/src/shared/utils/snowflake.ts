//雪花算法生成ID

const EPOCH = 1704067200000n; // 2024-01-01 00:00:00 UTC
const WORKER_ID_BITS = 5n;
const DATACENTER_ID_BITS = 5n;
const SEQUENCE_BITS = 12n;

const MAX_WORKER_ID = (1n << WORKER_ID_BITS) - 1n;
const MAX_DATACENTER_ID = (1n << DATACENTER_ID_BITS) - 1n;
const SEQUENCE_MASK = (1n << SEQUENCE_BITS) - 1n;

const WORKER_ID_SHIFT = SEQUENCE_BITS;
const DATACENTER_ID_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS;
const TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS + DATACENTER_ID_BITS;

let sequence = 0n;
let lastTimestamp = -1n;

const workerId = 1n;
const datacenterId = 1n;

function currentTimestamp(): bigint {
  return BigInt(Date.now());
}

function waitNextMillis(lastTs: bigint): bigint {
  let ts = currentTimestamp();
  while (ts <= lastTs) {
    ts = currentTimestamp();
  }
  return ts;
}

export function generateSnowflakeId(): string {
  let timestamp = currentTimestamp();

  if (timestamp < lastTimestamp) {
    throw new Error('系统时钟回拨，无法生成雪花ID');
  }

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1n) & SEQUENCE_MASK;
    if (sequence === 0n) {
      timestamp = waitNextMillis(lastTimestamp);
    }
  } else {
    sequence = 0n;
  }

  lastTimestamp = timestamp;

  const id = ((timestamp - EPOCH) << TIMESTAMP_SHIFT)
    | (datacenterId << DATACENTER_ID_SHIFT)
    | (workerId << WORKER_ID_SHIFT)
    | sequence;

  return id.toString();
}

export function generatePlatformTenantId(): string {
  return '000000';
}
