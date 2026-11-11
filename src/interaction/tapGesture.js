const maxTravel = 8
const maxDuration = 650

export function createTapGesture(now = () => performance.now()) {
  const pointers = new Set()
  let start

  return {
    get active() { return pointers.size > 0 },
    down(event, target) {
      pointers.add(event.pointerId)
      if (pointers.size !== 1) {
        start = null
        return
      }
      start = { id: event.pointerId, x: event.clientX, y: event.clientY, target, time: now() }
    },
    move(event) {
      if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= maxTravel) start = null
    },
    up(event, target) {
      pointers.delete(event.pointerId)
      if (start?.id !== event.pointerId) return false
      const origin = start
      start = null
      return origin.target === target && now() - origin.time < maxDuration &&
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < maxTravel
    },
    cancel(event) {
      pointers.delete(event.pointerId)
      start = null
    },
  }
}
