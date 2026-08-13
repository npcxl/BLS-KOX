use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const EPOCH_MS: u64 = 1_704_067_200_000;
const SEQUENCE_BITS: u64 = 12;
const WORKER_ID_BITS: u64 = 5;
const DATACENTER_ID_BITS: u64 = 5;
const SEQUENCE_MASK: u64 = (1 << SEQUENCE_BITS) - 1;

pub struct SnowflakeGenerator {
    worker_id: u64,
    datacenter_id: u64,
    last_timestamp: AtomicI64,
    sequence: AtomicU64,
}

impl SnowflakeGenerator {
    pub fn new(worker_id: u64, datacenter_id: u64) -> anyhow::Result<Self> {
        if worker_id >= (1 << WORKER_ID_BITS) || datacenter_id >= (1 << DATACENTER_ID_BITS) {
            anyhow::bail!("invalid snowflake worker/datacenter id");
        }
        Ok(Self {
            worker_id,
            datacenter_id,
            last_timestamp: AtomicI64::new(-1),
            sequence: AtomicU64::new(0),
        })
    }

    pub fn next_id(&self) -> anyhow::Result<String> {
        let mut timestamp = now_ms();
        let mut last = self.last_timestamp.load(Ordering::SeqCst);
        if timestamp < last {
            anyhow::bail!("clock moved backwards");
        }
        let sequence = if timestamp == last {
            let seq = self.sequence.fetch_add(1, Ordering::SeqCst) & SEQUENCE_MASK;
            if seq == 0 {
                timestamp = wait_next_ms(last);
                self.last_timestamp.store(timestamp, Ordering::SeqCst);
            }
            seq
        } else {
            self.sequence.store(0, Ordering::SeqCst);
            self.last_timestamp.store(timestamp, Ordering::SeqCst);
            0
        };

        let id = ((timestamp as u64 - EPOCH_MS)
            << (SEQUENCE_BITS + WORKER_ID_BITS + DATACENTER_ID_BITS))
            | (self.datacenter_id << (SEQUENCE_BITS + WORKER_ID_BITS))
            | (self.worker_id << SEQUENCE_BITS)
            | sequence;
        Ok(id.to_string())
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn wait_next_ms(last: i64) -> i64 {
    let mut ts = now_ms();
    while ts <= last {
        ts = now_ms();
    }
    ts
}
