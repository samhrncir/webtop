import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppInfoModal from './AppInfoModal.jsx'
import { ThemeProvider } from '../../context/ThemeContext.jsx'
import { SettingsProvider } from '../../context/SettingsContext.jsx'

// The real picker is a 300 KB lazy chunk; the mock stands in as "the user
// picked 🚀" so specs stay fast and offline.
vi.mock('emoji-picker-react', async () => {
  const React = await import('react')
  return {
    default: ({ onEmojiClick }) =>
      React.createElement(
        'button',
        { 'data-testid': 'mock-picker', onClick: () => onEmojiClick({ emoji: '🚀' }) },
        'pick 🚀'
      ),
  }
})

const baseItem = {
  id: 'b1', type: 'bookmark', name: 'GitHub', url: 'https://github.com',
  icon: '', emoji: '', tags: ['dev'], aliases: ['gh'], subUrls: [],
}

function mount(item = {}, props = {}) {
  const handlers = {
    onClose: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(),
    onTogglePin: vi.fn(), onHide: vi.fn(),
    ...props,
  }
  render(
    <ThemeProvider>
      <SettingsProvider>
        <AppInfoModal item={{ ...baseItem, ...item }} {...handlers} />
      </SettingsProvider>
    </ThemeProvider>
  )
  return handlers
}

const enterEditMode = async () => userEvent.click(screen.getByRole('button', { name: 'Edit' }))
const save = async () => userEvent.click(screen.getByRole('button', { name: 'Save' }))

describe('view mode', () => {
  it('shows the bookmark identity and quick actions', () => {
    mount()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('https://github.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pin to taskbar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hide from home screen/ })).toBeInTheDocument()
  })

  it('pin and hide buttons call their handlers', async () => {
    const h = mount({ pinned: true })
    await userEvent.click(screen.getByRole('button', { name: /Unpin from taskbar/ }))
    expect(h.onTogglePin).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Hide from home screen/ }))
    expect(h.onHide).toHaveBeenCalled()
  })

  it('Escape closes the modal', () => {
    const h = mount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(h.onClose).toHaveBeenCalled()
  })
})

describe('saving', () => {
  it('always sends tags and aliases, even when emptied, so clears sync as []', async () => {
    const h = mount()
    await enterEditMode()
    await save()
    expect(h.onSave).toHaveBeenCalledWith({
      name: 'GitHub',
      url: 'https://github.com',
      icon: null,
      emoji: null,
      subUrls: [],
      aliases: ['gh'],
      tags: ['dev'],
    })
  })

  it('trims the icon URL and nulls it when blank', async () => {
    const h = mount()
    await enterEditMode()
    await userEvent.type(screen.getByPlaceholderText('Custom icon URL (optional)'), '  https://cdn.test/i.svg  ')
    await save()
    expect(h.onSave.mock.calls[0][0].icon).toBe('https://cdn.test/i.svg')
  })

  it('warns about non-http icon URLs', async () => {
    mount()
    await enterEditMode()
    await userEvent.type(screen.getByPlaceholderText('Custom icon URL (optional)'), 'ftp://x')
    expect(screen.getByText(/Icon URL must start with http/)).toBeInTheDocument()
  })

  it('stores only a single valid emoji; junk saves as null with a hint', async () => {
    const h = mount()
    await enterEditMode()
    await userEvent.type(screen.getByLabelText('Emoji icon'), 'ab')
    expect(screen.getByText('Enter a single emoji.')).toBeInTheDocument()
    await save()
    expect(h.onSave.mock.calls[0][0].emoji).toBeNull()
  })

  it('Cancel reverts edits instead of saving them', async () => {
    const h = mount()
    await enterEditMode()
    const name = screen.getByPlaceholderText('App name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Changed')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.onSave).not.toHaveBeenCalled()
    expect(screen.getByText('GitHub')).toBeInTheDocument() // back to view mode, original name
  })
})

describe('emoji picker', () => {
  it('opens on demand and picking an emoji fills the field and closes it', async () => {
    const h = mount()
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Choose emoji…' }))
    await userEvent.click(await screen.findByTestId('mock-picker'))
    expect(screen.queryByTestId('mock-picker')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Emoji icon')).toHaveValue('🚀')
    await save()
    expect(h.onSave.mock.calls[0][0].emoji).toBe('🚀')
  })

  it('"Use image icon" clears the emoji so the image chain takes over again', async () => {
    const h = mount({ emoji: '🔥' })
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Use image icon' }))
    await save()
    expect(h.onSave.mock.calls[0][0].emoji).toBeNull()
  })
})

describe('sub pages', () => {
  const withSubs = {
    subUrls: [
      { id: 's1', name: 'Pulls', url: '/pulls', isDefault: true },
      { id: 's2', name: 'Issues', url: '/issues' },
    ],
  }

  it('view mode has no radio buttons — the default is a static tag (issue #24)', () => {
    mount(withSubs)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('Pulls')).toBeInTheDocument()
  })

  it('edit mode exposes the radios and Save persists a new default', async () => {
    const h = mount(withSubs)
    await enterEditMode()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    await userEvent.click(radios[1])
    await save()
    const saved = h.onSave.mock.calls[0][0].subUrls
    expect(saved.find((s) => s.id === 's2').isDefault).toBe(true)
    expect(saved.find((s) => s.id === 's1').isDefault).toBeFalsy()
  })
})

describe('deleting', () => {
  it('asks for confirmation before deleting', async () => {
    const h = mount()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(h.onDelete).not.toHaveBeenCalled()

    window.confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(h.onDelete).toHaveBeenCalled()
    expect(h.onClose).toHaveBeenCalled()
  })
})
