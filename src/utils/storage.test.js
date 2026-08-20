import { describe, it, expect, vi, beforeEach } from 'vitest'

// The native (Capacitor) branches matter here: Android WebView silently
// ignores anchor downloads, so Export must route through the share sheet.

const writeFile = vi.fn(async () => ({ uri: 'file:///cache/backup.json' }))
const share = vi.fn(async () => {})
let native = false

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native },
}))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: (...a) => writeFile(...a) },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}))
vi.mock('@capacitor/share', () => ({
  Share: { share: (...a) => share(...a) },
}))

const { exportData, importData } = await import('./storage.js')

const data = { pages: [{ id: 'p1', items: [{ id: 'b1', type: 'bookmark', name: 'One', url: 'https://one.test' }] }] }

beforeEach(() => {
  native = false
  writeFile.mockClear()
  share.mockClear()
})

describe('exportData on Android (native shell)', () => {
  it('writes the backup to cache and opens the system share sheet', async () => {
    native = true
    await exportData(data)
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringMatching(/^webtop-backup-\d{4}-\d{2}-\d{2}\.json$/),
      directory: 'CACHE',
      encoding: 'utf8',
    }))
    expect(JSON.parse(writeFile.mock.calls[0][0].data)).toEqual(data)
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/backup.json'] }))
  })

  it('a dismissed share sheet is not an error', async () => {
    native = true
    share.mockRejectedValueOnce(new Error('Share canceled'))
    await expect(exportData(data)).resolves.toBeUndefined()
  })

  it('the web path never touches the native plugins', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await exportData(data)
    expect(writeFile).not.toHaveBeenCalled()
    expect(share).not.toHaveBeenCalled()
  })
})

describe('importData file-type gate', () => {
  const json = JSON.stringify(data)

  it('accepts Android picker realities: empty or octet-stream MIME with a .json name', async () => {
    await expect(importData(new File([json], 'backup.json', { type: '' }))).resolves.toEqual(data)
    await expect(importData(new File([json], 'backup.json', { type: 'application/octet-stream' }))).resolves.toEqual(data)
  })

  it('still rejects files that are neither JSON-typed nor .json-named', async () => {
    await expect(importData(new File([json], 'backup.exe', { type: 'application/x-msdownload' }))).rejects.toThrow()
  })

  it('content is the real gate: a .json file with junk inside rejects', async () => {
    await expect(importData(new File(['not json'], 'backup.json', { type: 'application/json' }))).rejects.toThrow()
  })
})
