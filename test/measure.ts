/** Mediana, em ms, de `runs` execuções de `fn` (com aquecimento). */
export function medianMs(fn: () => void, runs = 15): number {
  for (let i = 0; i < 3; i += 1) fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}
