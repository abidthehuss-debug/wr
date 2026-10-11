import { useState } from 'react'
import { loadEvents, saveEvents } from './events.js'

const emptyForm = { title: '', date: '', location: '', category: 'Community' }

export default function App() {
  const [events, setEvents] = useState(loadEvents)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')

  function update(events) {
    setEvents(events)
    saveEvents(events)
  }

  function submit(event) {
    event.preventDefault()
    if (!form.title.trim() || !form.date || !form.location.trim()) {
      setError('Title, date, and location are all required.')
      return
    }
    setError('')
    if (editingId) {
      update(events.map((item) => (item.id === editingId ? { ...item, ...form } : item)))
      setEditingId(null)
    } else {
      update([...events, { ...form, id: `event-${Date.now()}` }])
    }
    setForm(emptyForm)
  }

  function startEdit(item) {
    setEditingId(item.id)
    setForm({ title: item.title, date: item.date, location: item.location, category: item.category })
  }

  function remove(id) {
    update(events.filter((item) => item.id !== id))
    if (editingId === id) {
      setEditingId(null)
      setForm(emptyForm)
    }
  }

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="app">
      <h1>Community Events</h1>
      <p className="tagline">What's on nearby, kept in your browser.</p>

      <form onSubmit={submit}>
        <input
          placeholder="Event title"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <input
          type="date"
          value={form.date}
          onChange={(event) => setForm({ ...form, date: event.target.value })}
        />
        <input
          placeholder="Location"
          value={form.location}
          onChange={(event) => setForm({ ...form, location: event.target.value })}
        />
        <select
          value={form.category}
          onChange={(event) => setForm({ ...form, category: event.target.value })}
        >
          <option>Community</option>
          <option>Sport</option>
          <option>Workshop</option>
          <option>Music</option>
        </select>
        {error && <p className="error">{error}</p>}
        <button type="submit">{editingId ? 'Save changes' : 'Add event'}</button>
      </form>

      {sorted.map((item) => (
        <div className="event-card" key={item.id}>
          <div>
            <strong>{item.title}</strong>
            <div className="event-meta">
              {item.date} · {item.location} · {item.category}
            </div>
          </div>
          <div className="event-actions">
            <button type="button" className="secondary" onClick={() => startEdit(item)}>
              Edit
            </button>
            <button type="button" className="secondary" onClick={() => remove(item.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
