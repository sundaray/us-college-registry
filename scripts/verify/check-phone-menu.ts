// The phone menu's check, run by `pnpm verify-site` on the preview server.
//
// Below md the site header's links move into a menu: a button at the right end
// of the bar opens them in a sheet from the left, under the header, over 80%
// of the width, and dims the rest of the page. This check uses it in Chrome at
// a phone's width: the button's names, where the sheet and its overlay sit,
// each way it closes (the button, the dimmed page, a link, Escape), and that
// a link in it changes the page in place. It also checks that the links stay
// in the bar on wider screens and on the "not found" page, which has none of
// the app's scripts to open a menu.

import puppeteer from 'puppeteer-core'
import type { Page } from 'puppeteer-core'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }
const LINKS = 'Programs|Schools|Careers|Compare programs'

export async function checkPhoneMenu(origin: string) {
  const problems: string[] = []
  let checked = 0
  const same = (what: string, shown: unknown, expected: unknown) => {
    checked += 1
    if (shown !== expected) problems.push(`${what}: shown ${JSON.stringify(shown)}, expected ${JSON.stringify(expected)}`)
  }
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true })
  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  try {
    await page.setViewport(PHONE)
    await page.goto(`${origin}/programs`, { waitUntil: 'networkidle0' })
    let now = await readMenu(page)
    same('phone: no links in the bar', now.barLinks, '')
    same('phone: the menu button is named', now.buttonLabel, 'Open menu')
    same('phone: the menu button is 44px and 20px from the right edge', `${now.button?.width} ${now.viewportWidth - (now.button?.right ?? 0)}`, '44 20')
    same('phone: Search is a 44px icon', now.searchWidth, 44)

    await pressMenuButton(page)
    now = await readMenu(page)
    same('open: the button is named for closing', now.buttonLabel, 'Close menu')
    same('open: the sheet starts under the header, at the left edge', `${now.sheet?.top} ${now.sheet?.left}`, `${now.headerBottom} 0`)
    same('open: the sheet reaches the bottom', now.sheet?.bottom, PHONE.height)
    same('open: the sheet is 80% wide', now.sheet?.width, Math.round(PHONE.width * 0.8))
    same('open: the overlay starts under the header, full width', `${now.overlay?.top} ${now.overlay?.width}`, `${now.headerBottom} ${PHONE.width}`)
    same('open: the links in the sheet', now.sheetLinks, LINKS)
    same('open: no close button inside the sheet', now.closeInSheet, false)

    await pressMenuButton(page)
    same('the button closes the menu', (await readMenu(page)).sheet, null)

    await pressMenuButton(page)
    await page.mouse.click(Math.round(PHONE.width * 0.9), Math.round(PHONE.height * 0.6))
    await pause(450)
    same('a tap on the dimmed page closes the menu', (await readMenu(page)).sheet, null)

    await pressMenuButton(page)
    await page.keyboard.press('Escape')
    await pause(450)
    same('Escape closes the menu', (await readMenu(page)).sheet, null)

    await pressMenuButton(page)
    await page.evaluate(() => Object.assign(window, { stayedOnPage: true }))
    const schoolsLink = (await (await page.$('[data-slot="sheet-content"] a[href="/schools"]'))!.boundingBox())!
    await page.mouse.click(schoolsLink.x + schoolsLink.width / 2, schoolsLink.y + schoolsLink.height / 2)
    await page.waitForFunction(() => location.pathname === '/schools', { timeout: 10000 }).catch(() => undefined)
    await pause(450)
    same('a link in the menu goes to its page in place', await page.evaluate(() => `${location.pathname} ${(window as unknown as { stayedOnPage?: boolean }).stayedOnPage === true}`), '/schools true')
    same('a link in the menu closes it', (await readMenu(page)).sheet, null)

    await page.setViewport(DESKTOP)
    await page.goto(`${origin}/programs`, { waitUntil: 'networkidle0' })
    now = await readMenu(page)
    same('desktop: the links are in the bar', now.barLinks, LINKS)
    same('desktop: no menu button', now.button, null)

    // The "not found" page keeps its links in the bar at a phone's width.
    await page.setViewport(PHONE)
    await page.goto(`${origin}/no-such-page`, { waitUntil: 'networkidle0' })
    now = await readMenu(page)
    same('not found page: no menu button', now.button, null)
    same('not found page: the links are in the bar', now.barLinks, LINKS)

    same('page errors', pageErrors.join(' | '), '')
  } finally {
    await browser.close()
  }
  return { checked, problems }
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function pressMenuButton(page: Page) {
  const box = (await (await page.$('header [data-slot="sheet-trigger"]'))!.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await pause(450)
}

// Where the header's parts and the menu are, in the window's pixels. The code
// that runs in the page defines no named functions: the script runner wraps
// those in a helper the page does not have.
function readMenu(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('header')!
    const shownButton = [header.querySelector('[data-slot="sheet-trigger"]')].find((element) => element && element.getBoundingClientRect().width > 0) ?? null
    const [button, sheet, overlay] = [shownButton, document.querySelector('[data-slot="sheet-content"]'), document.querySelector('[data-slot="sheet-overlay"]')].map((element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { top: Math.round(rect.top), left: Math.round(rect.left), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width) }
    })
    return {
      viewportWidth: window.innerWidth,
      headerBottom: Math.round(header.getBoundingClientRect().bottom),
      barLinks: [...header.querySelectorAll('nav a')].filter((link) => link.getBoundingClientRect().width > 0).map((link) => link.textContent).join('|'),
      button,
      buttonLabel: shownButton?.getAttribute('aria-label') ?? null,
      searchWidth: Math.round(header.querySelector('button[aria-haspopup="dialog"]:not([data-slot])')?.getBoundingClientRect().width ?? 0),
      sheet,
      overlay,
      sheetLinks: [...document.querySelectorAll('[data-slot="sheet-content"] a')].map((link) => link.textContent).join('|'),
      closeInSheet: Boolean(document.querySelector('[data-slot="sheet-content"] [data-slot="sheet-close"]')),
    }
  })
}
