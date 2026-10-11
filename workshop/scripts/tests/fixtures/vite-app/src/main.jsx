import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import checkIcon from './icon.svg'

// A data-URI asset reference the review pipeline must inline.
const logoUrl = new URL('./logo.svg', import.meta.url).href

// String.replace replacement tokens; a naive HTML insertion would corrupt
// the bundle around these.
const replacementTokens = "$` $& $'"

const storageKey = 'workshop-fixture-notes'

// Plain Web Storage access, no defensive wrapper: the review artifact's
// in-memory fallback (not the app) is responsible for sandbox tolerance.
function loadNotes() {
  const stored = window.localStorage.getItem(storageKey)
  if (!stored) return ['Welcome to the fixture']
  try {
    return JSON.parse(stored)
  } catch {
    window.localStorage.removeItem(storageKey)
    return ['Welcome to the fixture']
  }
}

function App() {
  const [notes, setNotes] = useState(loadNotes)

  function addNote() {
    const next = [...notes, `Note ${notes.length + 1}`]
    setNotes(next)
    window.localStorage.setItem(storageKey, JSON.stringify(next))
  }

  return (
    <div className="app">
      <h1>
        <img src={logoUrl} alt="" width="32" height="32" /> Workshop Fixture App
      </h1>
      <p data-testid="tokens">Tokens survive: {replacementTokens}</p>
      <button type="button" className="add-note" onClick={addNote}>
        Add note
      </button>
      {notes.map((note, index) => (
        <div className="card" key={index}>
          <img src={checkIcon} alt="" width="16" height="16" /> {note}
        </div>
      ))}
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
