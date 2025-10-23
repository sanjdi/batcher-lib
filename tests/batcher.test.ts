import { Batcher } from '../src/batcher';

describe('Batcher', () => {
  it('should add items to batch', () => {
    const batcher = new Batcher<number>();
    batcher.add(10);
    expect(batcher.getBatch()).toEqual([10]);
  });

  it('should handle multiple items', () => {
    const batcher = new Batcher<string>();
    batcher.add('A');
    batcher.add('B');
    expect(batcher.getBatch()).toEqual(['A', 'B']);
  });

  it('should start with an empty batch', () => {
    const batcher = new Batcher<boolean>();
    expect(batcher.getBatch()).toEqual([]);
  });

  it('should add many items at once', () => {
    const batcher = new Batcher<number>();
    batcher.addMany([1, 2, 3]);
    expect(batcher.getBatch()).toEqual([1, 2, 3]);
  });

  it('should support batches containing multiple types', () => {
    const batcher = new Batcher<number | string | object>();
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
    const batcher = new Batcher<number>();
    const handler = jest.fn();

    // Register the handler
    batcher.registerHandler(handler);

    // Add items and manually trigger flush
    batcher.addMany([1, 2, 3]);
    batcher.flush();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([1, 2, 3]);
  });
});

describe('Batcher Auto-Flush', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should automatically flush every 500ms', () => {
    const handler = jest.fn();

    // Create batcher
    const batcher = new Batcher<number>();
    batcher.registerHandler(handler);

    batcher.addMany([1, 2, 3]);

    // Fast-forward time by 500ms
    jest.advanceTimersByTime(500);

    // Expect handler to have been called with the batch
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([1, 2, 3]);

    // Add more items
    batcher.addMany([4, 5]);

    // Fast-forward another 500ms
    jest.advanceTimersByTime(500);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith([4, 5]);
  });
});
