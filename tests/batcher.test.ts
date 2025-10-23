import { Batcher } from '../src/batcher';

describe('Batcher', () => {
  let batcher: Batcher<any>;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    batcher?.stopAutoFlush?.();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should add items to batch', () => {
    batcher = new Batcher<number>();
    batcher.add(10);
    expect(batcher.getBatch()).toEqual([10]);
  });

  it('should handle multiple items', () => {
    batcher = new Batcher<string>();
    batcher.add('A');
    batcher.add('B');
    expect(batcher.getBatch()).toEqual(['A', 'B']);
  });

  it('should start with an empty batch', () => {
    batcher = new Batcher<boolean>();
    expect(batcher.getBatch()).toEqual([]);
  });

  it('should add many items at once', () => {
    batcher = new Batcher<number>();
    batcher.addMany([1, 2, 3]);
    expect(batcher.getBatch()).toEqual([1, 2, 3]);
  });

  it('should support batches containing multiple types', () => {
    batcher = new Batcher<number | string | object>();
    const timestamp = Date.now();

    batcher.add(42);
    batcher.addMany(['temp', 100, { reading: 102, time: timestamp }]);

    expect(batcher.getBatch()).toEqual([
      42,
      'temp',
      100,
      { reading: 102, time: timestamp },
    ]);
  });

  it('should allow registering an anonymous handler and invoke it on flush', () => {
    batcher = new Batcher<number>();
    const handler = jest.fn();

    batcher.registerHandler(handler);
    batcher.addMany([1, 2, 3]);
    batcher.flush();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('should automatically flush every 500 ms', () => {
    const handler = jest.fn();
    batcher = new Batcher<number>();
    batcher.registerHandler(handler);
    batcher.addMany([1, 2, 3]);

    // First flush
    jest.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([1, 2, 3]);

    // Second flush
    batcher.addMany([4, 5]);
    jest.advanceTimersByTime(500);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith([4, 5]);
  });

  it('should invoke onError callback if handler throws an error', () => {
    const error = new Error('Handler failed');
    const failingHandler = jest.fn(() => {
      throw error;
    });
    const onError = jest.fn();

    batcher = new Batcher<number>({ onError });
    batcher.registerHandler(failingHandler);
    batcher.add(1);

    // Trigger manual flush
    batcher.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    jest.runOnlyPendingTimers();
    expect(onError).toHaveBeenCalledWith(error);

    // Verify it also works during auto-flush
    batcher.add(2);
    jest.advanceTimersByTime(500);

    expect(onError).toHaveBeenCalledTimes(2);
    jest.runOnlyPendingTimers();
    expect(onError).toHaveBeenLastCalledWith(error);
  });

  it('should await async handler before next flush and handle async errors', async () => {
    const results: string[] = [];
    const onError = jest.fn();

    // Async handler simulates a slow API call (300ms)
    const handler = jest.fn(async (batch: number[]) => {
      results.push(`start-${batch[0]}`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      results.push(`end-${batch[0]}`);
    });

    batcher = new Batcher<number>({ onError });
    batcher.registerHandler(handler);

    // Add first batch and trigger first flush
    batcher.addMany([1]);
    jest.advanceTimersByTime(500);
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    // Add second batch while first async flush is still pending
    batcher.addMany([2]);
    jest.advanceTimersByTime(500);
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    batcher.stopAutoFlush();

    // The second flush should start only after the first async handler resolves
    expect(results).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);

    // Now test async error handling
    const failingHandler = jest.fn(async () => {
      throw new Error('Async fail');
    });

    const batcherWithError = new Batcher<number>({ onError });
    batcherWithError.registerHandler(failingHandler);

    batcherWithError.addMany([99]);
    jest.advanceTimersByTime(500);
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));

    batcherWithError.stopAutoFlush();
  });
});
