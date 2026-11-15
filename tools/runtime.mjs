import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire(import.meta.url)
export const { chromium } = require(process.env.CITYOU_PLAYWRIGHT_MODULE || 'playwright')
const chrome = process.env.CITYOU_CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '')
export const browserOptions = { headless: true, ...(chrome && fs.existsSync(chrome) ? { executablePath: chrome } : {}) }
