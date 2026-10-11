const storageKey = 'community-events'

export const sampleEvents = [
  { id: 'sample-1', title: 'Repair Café', date: '2026-09-05', location: 'Library Hall', category: 'Community' },
  { id: 'sample-2', title: 'Five-a-side Football', date: '2026-09-12', location: 'Riverside Pitch', category: 'Sport' },
  { id: 'sample-3', title: 'Intro to Watercolours', date: '2026-09-19', location: 'Arts Centre', category: 'Workshop' },
]

export function loadEvents() {
  const stored = window.localStorage.getItem(storageKey)
  if (!stored) return sampleEvents
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : sampleEvents
  } catch {
    window.localStorage.removeItem(storageKey)
    return sampleEvents
  }
}

export function saveEvents(events) {
  window.localStorage.setItem(storageKey, JSON.stringify(events))
}
