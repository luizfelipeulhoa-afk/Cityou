import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
export const { chromium } = require(process.env.CITYOU_PLAYWRIGHT_MODULE || 'playwright')
const localPython = path.resolve('.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
export const python = process.env.CITYOU_PYTHON || (fs.existsSync(localPython) ? localPython : 'python')
const chrome = process.env.CITYOU_CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '')
export const browserOptions = { headless: true, ...(chrome && fs.existsSync(chrome) ? { executablePath: chrome } : {}) }
