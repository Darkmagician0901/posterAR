import { describe, it, expect, beforeEach } from 'vitest'
import { getDeviceToken } from './deviceToken'
import { STORAGE_KEYS } from './constants'

describe('getDeviceToken', () => {
  beforeEach(() => localStorage.clear())

  it('generates and persists a token', () => {
    const t = getDeviceToken()
    expect(t).toMatch(/[0-9a-f-]{36}/)
    expect(localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN)).toBe(t)
  })

  it('returns the same token across calls', () => {
    expect(getDeviceToken()).toBe(getDeviceToken())
  })
})
