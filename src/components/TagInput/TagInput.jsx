import React, { useState, useCallback, useId } from 'react'
import { normalizeTag } from '../../utils/tags.js'
import './TagInput.css'

// Editable pill list. `suggestions` takes either the allTags() shape
// ({ tag, count }) or a plain string array, so callers don't have to map.
export default function TagInput({ tags, onChange, suggestions = [] }) {
  const [draft, setDraft] = useState('')
  // useId() emits colons, which are legal in an id but awkward in selectors
  const listId = `tag-suggestions-${useId().replace(/:/g, '')}`

  const options = suggestions
    .map((s) => (typeof s === 'string' ? s : s.tag))
    .filter((tag) => !tags.includes(tag))

  const commit = useCallback((raw) => {
    const tag = normalizeTag(raw)
    setDraft('')
    if (!tag || tags.includes(tag)) return
    onChange([...tags, tag])
  }, [tags, onChange])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
      return
    }
    if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }, [draft, tags, commit, onChange])

  // Picking from the datalist fires change, not keydown — commit whole values
  const handleChange = useCallback((e) => {
    const value = e.target.value
    if (value.includes(',')) {
      commit(value.replace(/,/g, ''))
      return
    }
    setDraft(value)
  }, [commit])

  const handleRemove = useCallback((tag) => {
    onChange(tags.filter((t) => t !== tag))
  }, [tags, onChange])

  return (
    <div className="tag-input">
      {tags.map((tag) => (
        <span key={tag} className="tag-input-pill">
          {tag}
          <button
            className="tag-input-pill-remove"
            onClick={() => handleRemove(tag)}
            aria-label={`Remove tag ${tag}`}
          >
            &times;
          </button>
        </span>
      ))}
      <input
        className="tag-input-field"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
        placeholder={tags.length === 0 ? 'Add a tag…' : ''}
        list={listId}
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id={listId}>
        {options.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  )
}
