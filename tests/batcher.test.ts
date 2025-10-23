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
});
