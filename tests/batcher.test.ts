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
});
