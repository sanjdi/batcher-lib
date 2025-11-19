## Batcher Utility

### Overview

The **Batcher** utility is a lightweight, framework-agnostic batching engine for scenarios such as data ingestion, IoT telemetry, or event-driven systems. It efficiently collects items, batches them for processing, and supports both synchronous and asynchronous handlers with strict sequencing guarantees.

#### Requirements
The Batcher utility should be able to;
1. Add one or more generic _types_ to a batch.
2. Register an anonymous handler function with the batching library.
3. Automatically send the batch to the handler function at a given interval (default: every 500ms).
4. Manually send the batch to the handler, when needed.
5. Provide a way for the user to respond to errors.
6. Unit test.
---

### Problem Context

In the original system, each temperature reading was sent to the API individually:

```
export async function sendTemperature(reading: number): Promise<void> {
  await fetch('/api/temperatures', {
    method: 'POST',
    body: JSON.stringify([reading]),
  });
}
```

Each API call takes roughly 50 ms, so sending 100 readings sequentially results in:

```
100 × 50 ms ≈ 5 seconds total latency
```

—even though the API can handle arrays of readings.

The `Batcher` utility fixes this by **collecting readings for 500 ms** and sending them in a single batch, reducing total time from seconds to **tens of milliseconds** while preserving order and reliability.

---

### Core Design Choices

#### 1. **Queue-Based Buffer**

- Items are stored internally in a FIFO queue to preserve order.
- Prevents race conditions between producers (`add`, `addMany`) and the asynchronous flush cycle.
- Enables safe draining and sequential flushing under high concurrency.

#### 2. **Async-Safe Sequential Flushing**

- Only **one flush** runs at any given time.
- If a new flush is triggered while the previous one is still running, it is **queued** and executed immediately afterward.
- Guarantees deterministic, ordered processing even with async handlers or slow network operations.

#### 3. **Error Isolation**

- All handler errors (sync or async) are caught and forwarded to an optional `onError` callback.
- If `onError` is not provided, errors are logged but do not halt further processing.
- Prevents unhandled promise rejections and ensures continuous operation.

#### 4. **Auto-Flush Interval**

- Configurable via `intervalMs` (default: 500 ms).
- Automatically triggers batch flushes at consistent intervals.
- Suitable for real-time or near-real-time streaming data pipelines.

#### 5. **Batch Size Trigger (future extension)**

- Flushes can also be triggered by **batch size thresholds** to control memory usage or optimize throughput.
- Especially useful for IoT or event ingestion systems. **(Not implemented in this version.)**

#### 6. **No External Dependencies**

- Pure TypeScript implementation with zero runtime dependencies.
- Works in Node.js, browsers, and edge runtimes (e.g., AWS Lambda, Cloudflare Workers).

---

### Assumptions Made

| Category              | Assumption                                                     | Rationale                                                       |
| --------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| **Concurrency Model** | Single-threaded event loop (Node.js / browser)                 | Simplifies synchronization; no locks required                   |
| **Handler Contract**  | The handler may be sync or async and is idempotent             | Ensures safe retries and consistency                            |
| **Batch Lifecycle**   | Items are cleared only **after** successful handler completion | Prevents accidental data loss                                   |
| **Timer Granularity** | Auto-flush interval need not be perfectly accurate             | Timers are approximate in JS; acceptable for batching workloads |
| **Data Volume**       | Moderate batch sizes (hundreds to low thousands per interval)  | Designed for ingestion, not bulk ETL jobs                       |
| **Persistence**       | In-memory only                                                 | Persistence or retries can be layered externally if needed      |
| **Error Handling**    | Non-blocking — errors do not stop future flushes               | Ensures long-running reliability                                |

---

### Testing Approach

1. **Unit + Behavior Coverage**

   - Tests cover synchronous, asynchronous, and queued flushing.
   - Verifies correct sequencing, error propagation, and handler order.

2. **Timer Control**

   - Uses **fake timers** (`jest.useFakeTimers`) for deterministic time-based behavior.
   - Falls back to **real timers** for async sequencing tests (e.g., IoT-like async handlers).

3. **Realistic IoT Scenarios**

   - Simulates delayed async handlers, queued flushes, and continuous data arrival mid-flush.

4. **Reliability Focus**
   - Ensures no race conditions, missed batches, or overlapping flushes occur.

---

### API Summary

```
class Batcher<T> {
  constructor(options?: {
    intervalMs?: number;                // default: 500
    onError?: (error: unknown) => void; // optional error handler
  });

  add(item: T): void;        // Add a single item
  addMany(items: T[]): void; // Add multiple items
  registerHandler(handler: (batch: T[]) => void | Promise<void>): void;
  flush(): Promise<void>;    // Manually flush
  stopAutoFlush(): void;     // Stop the interval timer
}
```

---

## Usage Examples

#### Migrating from Per-Reading Calls to Batching

**Before (inefficient):**

```
export async function sendTemperature(reading: number): Promise<void> {
  await fetch('/api/temperatures', {
    method: 'POST',
    body: JSON.stringify([reading]),
  });
}
```

**After (batched every 500 ms):**

```
const temperatureBatcher = new Batcher<number>({
  intervalMs: 500,
  onError: (err) => console.error('Temperature batch failed:', err),
});

temperatureBatcher.registerHandler(async (batch) => {
  await fetch('/api/temperatures', {
    method: 'POST',
    body: JSON.stringify(batch),
  });
});

export function sendTemperature(reading: number): void {
  temperatureBatcher.add(reading); // non-blocking
}
```

✅ 100 readings → one API call → ~50 ms total.

---

### IoT Example (Real-World)

Simulate an IoT gateway batching temperature readings before sending to the cloud.

```ts
interface SensorReading {
  id: string;
  temperature: number;
  timestamp: number;
}

const readings = new Batcher<SensorReading>({
  onError: (err) => console.error('Transmission failed:', err),
});

readings.registerHandler(async (batch) => {
  await fetch('/api/temperatures', {
    method: 'POST',
    body: JSON.stringify(batch),
  });
});

setInterval(() => {
  readings.add({
    id: `sensor-${Math.floor(Math.random() * 10)}`,
    temperature: 20 + Math.random() * 5,
    timestamp: Date.now(),
  });
}, 300);
```

#### Highlights:

- Each batch contains all readings collected over 500 miliseconds by default.
- Automatically retries next interval if an error occurs.
- Perfect for **IoT, telemetry, or streaming ingestion** use cases.

---

### Basic Example

```ts
import { Batcher } from './batcher';

// Create a batcher that flushes every 500ms
const batcher = new Batcher<number>();

// Register a handler that processes the batch
batcher.registerHandler((batch) => {
  console.log('Flushed batch:', batch);
});

// Add items continuously
batcher.add(1);
batcher.add(2);
batcher.addMany([3, 4, 5]);

// The handler will automatically be called every 500ms with the collected items
```

#### Output:

```less
Flushed batch: [1, 2, 3, 4, 5]
```

---

### Async Handler Example

You can use an **async handler** (for example, to send data to an API or database).

```ts
const asyncBatcher = new Batcher<string>({ intervalMs: 1000 });

asyncBatcher.registerHandler(async (batch) => {
  console.log('Sending batch:', batch);
  // Simulate async API call
  await new Promise((resolve) => setTimeout(resolve, 300));
  console.log('Sent successfully');
});

asyncBatcher.add('sensor-1');
asyncBatcher.add('sensor-2');
```

This ensures:

- Only one async flush runs at a time.
- If new items arrive mid-flush, they’re queued for the next one.

---

### Error Handling Example

Use the optional `onError` callback to capture handler exceptions without interrupting future flushes.

```ts
const batcherWithError = new Batcher<number>({
  intervalMs: 500,
  onError: (err) => console.error('Handler error:', err),
});

batcherWithError.registerHandler((batch) => {
  throw new Error('Something went wrong!');
});

batcherWithError.addMany([1, 2, 3]);
// The error will be caught and passed to onError()
```

#### Output:

```less
Handler error: Error: Something went wrong!
```

---

### Manual Flush Example

```ts
const manualBatcher = new Batcher<string>();
manualBatcher.registerHandler((batch) =>
  console.log('Manually flushed:', batch)
);

manualBatcher.addMany(['a', 'b', 'c']);
await manualBatcher.flush();
```

#### Output:

```less
Manually flushed: ['a', 'b', 'c']
```

---

### Intended Use Cases

- **IoT gateways** aggregating sensor readings before sending to the cloud
- **Log collectors** or telemetry pipelines
- **API rate-limiting buffers**
- **Streaming or event-driven systems** where bursts must be smoothed out

---

### Key Guarantees

| Property               | Guarantee                                             |
| ---------------------- | ----------------------------------------------------- |
| **FIFO order**         | Items are processed in the same order they were added |
| **Async-safe**         | Sequential flush execution prevents race conditions   |
| **Error-resilient**    | Handler failures do not stop future flushes           |
| **Lightweight**        | Minimal CPU & memory footprint                        |
| **Framework-agnostic** | Works anywhere JavaScript runs                        |

---

✅ Result:
100 temperature readings now send in **one batched request** every 500 ms — reducing total time from **5 seconds** to **~50 milliseconds**, with clean error handling and deterministic order.



