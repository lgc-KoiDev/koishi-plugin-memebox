export function randomRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randomItem<T>(array: T[]): T {
  return array[randomRange(0, array.length - 1)]
}
