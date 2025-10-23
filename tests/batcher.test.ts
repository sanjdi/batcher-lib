import { Batcher } from '../src/batcher';

// ---- Test Helpers ----
jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });

async function tick(ms = 500) {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

describe('Batcher', () => {
  let batcher: Batcher<any>;

  afterEach(() => {
    batcher?.stopAutoFlush?.();
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  // ---- Basic Functionality ----
  it('should start empty and allow adding items', () => {
    batcher = new Batcher<number>();
    expect(batcher.getBatch()).toEqual([]);
    batcher.add(1);
    batcher.addMany([2, 3]);
    expect(batcher.getBatch()).toEqual([1, 2, 3]);
  });

  it('should handle multiple data types', () => {
    batcher = new Batcher<number | string | { reading: number }>();
    const timestamp = Date.now();

    batcher.add(42);
    batcher.addMany(['temp', { reading: 102, time: timestamp }]);

    expect(batcher.getBatch()).toEqual([
      42,
      'temp',
      { reading: 102, time: timestamp },
    ]);
  });

  // ---- Handler Registration and Manual Flush ----
  it('should invoke handler manually when flush() is called', async () => {
    const handler = jest.fn();
    batcher = new Batcher<number>();
    batcher.registerHandler(handler);
    batcher.addMany([1, 2, 3]);

    await batcher.flush();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([1, 2, 3]);
    expect(batcher.getBatch()).toEqual([]);
  });

  // ---- Auto Flush ----
  it('should automatically flush every 500 ms', async () => {
    const handler = jest.fn();
    batcher = new Batcher<number>();
    batcher.registerHandler(handler);

    batcher.addMany([1, 2, 3]);
    await tick(500);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([1, 2, 3]);

    batcher.addMany([4, 5]);
    await tick(500);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith([4, 5]);
  });

  // ---- Error Handling ----
  it('should call onError if handler throws', async () => {
    const error = new Error('Handler failed');
    const onError = jest.fn();
    const handler = jest.fn(() => {
      throw error;
    });

    batcher = new Batcher<number>({ onError });
    batcher.registerHandler(handler);
    batcher.add(1);

    await batcher.flush();
    expect(onError).toHaveBeenCalledWith(error);

    // Also check auto-flush
    batcher.add(2);
    await tick(500);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  // ---- Async Handler Sequencing ----
  it('should await async handler before next flush and handle async errors', async () => {
    jest.useRealTimers();

    const results: string[] = [];
    const onError = jest.fn();

    const handler = jest.fn(async (batch: number[]) => {
      results.push(`start-${batch[0]}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      results.push(`end-${batch[0]}`);
    });

    batcher = new Batcher<number>({ onError });
    batcher.registerHandler(handler);

    batcher.addMany([1]);
    await new Promise((r) => setTimeout(r, 900));

    batcher.addMany([2]);
    await new Promise((r) => setTimeout(r, 900));

    batcher.stopAutoFlush();

    expect(results).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);

    // Async error handling
    const failingHandler = jest.fn(async () => {
      throw new Error('Async fail');
    });
    const batcherWithError = new Batcher<number>({ onError });
    batcherWithError.registerHandler(failingHandler);
    batcherWithError.addMany([99]);

    await new Promise((r) => setTimeout(r, 600));
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    batcherWithError.stopAutoFlush();
  });

  // ---- Concurrency / Queued Flush Behavior ----
  it('should queue new batches while async handler is still running', async () => {
    jest.useRealTimers();

    const results: string[] = [];
    const handler = jest.fn(async (batch: number[]) => {
      results.push(`start-${batch[0]}`);
      await new Promise((resolve) => setTimeout(resolve, 600));
      results.push(`end-${batch[0]}`);
    });

    batcher = new Batcher<number>();
    batcher.registerHandler(handler);

    // First batch triggers flush at 500ms
    batcher.addMany([1]);
    await new Promise((r) => setTimeout(r, 550)); // flush triggered but not finished

    // Add while first async handler is still running
    batcher.addMany([2]);
    await new Promise((r) => setTimeout(r, 1300));

    batcher.stopAutoFlush();

    expect(results).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  // ---- Batch Size Limiting ----
  it('should flush items in fixed-size batches when batchSize is set', async () => {
    const handler = jest.fn();
    batcher = new Batcher<number>({ batchSize: 3 });
    batcher.registerHandler(handler);

    batcher.addMany([1, 2, 3, 4, 5, 6, 7]);
    await batcher.flush();

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls[0][0]).toEqual([1, 2, 3]);
    expect(handler.mock.calls[1][0]).toEqual([4, 5, 6]);
    expect(handler.mock.calls[2][0]).toEqual([7]);
  });

  // ---- Continuous Draining ----
  it('should immediately drain remaining items if new data arrives mid-flush', async () => {
    const results: number[][] = [];
    const handler = jest.fn(async (batch: number[]) => {
      results.push(batch);
      await new Promise((r) => setTimeout(r, 300));
    });

    batcher = new Batcher<number>();
    batcher.registerHandler(handler);

    batcher.addMany([1, 2]);
    await new Promise((r) => setTimeout(r, 100)); // before flush
    batcher.addMany([3, 4, 5]); // mid-cycle add
    await new Promise((r) => setTimeout(r, 1000));

    batcher.stopAutoFlush();

    // Expect all data eventually processed
    const flattened = results.flat();
    expect(flattened.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
