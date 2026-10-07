/** Build a synthetic stream: list of [seconds, pace sec/km] segments sampled every second. */
export function synthStream(segments: [number, number][]): { time: number[]; distance: number[] } {
  const time = [0]
  const distance = [0]
  let t = 0
  let d = 0
  for (const [secs, pace] of segments) {
    for (let i = 0; i < secs; i++) {
      t += 1
      d += 1000 / pace
      time.push(t)
      distance.push(d)
    }
  }
  return { time, distance }
}
