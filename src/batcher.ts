export class Batcher<T> {
  private batch: T[] = [];

  add(item: T): void {
    this.batch.push(item);
  }

  getBatch(): T[] {
    return this.batch;
  }
}
