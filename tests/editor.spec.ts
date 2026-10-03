import { test, expect, type Page } from '@playwright/test'

async function ready(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('symbolize.introSeen.v1', '1')
    localStorage.setItem('symbolize.ui.v1', JSON.stringify({ tutorialSeen: true }))
  })
  await page.goto('./')
  await page.waitForFunction(() => (window as any).__editor?.getState().image)
}

async function enterBoot(page: Page) {
  await expect(page.locator('#boot-prompt')).toHaveClass('on')
  // The gate intentionally ignores the key/click that revealed the prompt for 150ms.
  await page.waitForTimeout(180)
  await page.locator('#boot').click()
  await expect(page.locator('#boot')).toHaveCount(0)
}

test('first visit shows boot and tour; reload skips both; replay preserves work', async ({ page }) => {
  await page.goto('./')
  await enterBoot(page)
  await expect(page.locator('.tutorial-card')).toBeVisible()
  await page.getByRole('button', { name: 'Close tour' }).click()
  expect(await page.evaluate(() => localStorage.getItem('symbolize.introSeen.v1'))).toBe('1')
  await page.reload()
  await expect(page.getByRole('button', { name: 'HELP', exact: true })).toBeVisible()
  await expect(page.locator('#boot, .intro-wave, .tutorial-card')).toHaveCount(0)
  await page.evaluate(() => (window as any).__editor.getState().setParam('random.seed', 12345))
  await page.getByRole('button', { name: 'HELP', exact: true }).click()
  await page.getByRole('menuitem', { name: 'REPLAY INTRO' }).click()
  await expect(page.locator('#boot-prompt')).toHaveClass('on')
  await page.waitForTimeout(180)
  // R normally randomizes the artwork; dismissing boot must not edit it.
  await page.keyboard.press('r')
  await expect(page.locator('#boot')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__editor.getState().settings.random.seed)).toBe(12345)
  await expect(page.locator('.tutorial-card')).toHaveCount(0)
})

test('boot and tour still work when browser storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  await page.goto('./')
  await enterBoot(page)
  await expect(page.locator('.tutorial-card')).toBeVisible()
})

test('search finds bilingual advanced controls and restores the basic panel', async ({ page }) => {
  await ready(page)
  const search = page.getByRole('searchbox', { name: 'SEARCH PARAMETERS' })
  const jitter = page.getByRole('slider', { name: 'JITTER X', exact: true })
  await expect(jitter).toBeHidden()
  await search.fill('разброс x')
  await expect(jitter).toBeVisible()
  await search.fill('source.gamma')
  await expect(page.getByRole('slider', { name: 'GAMMA', exact: true })).toBeVisible()
  await search.fill('no-such-setting-123')
  await expect(page.getByText('NO PARAMETERS FOUND', { exact: true })).toBeVisible()
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(jitter).toBeHidden()
  await expect(page.getByRole('radio', { name: 'BASIC' })).toBeChecked()
  await expect(page.locator('.control-section').filter({ has: page.getByRole('button', { name: '[-] GRID', exact: true }) })).toBeVisible()
})

test('mobile help offers replay and parameter search stays usable', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173/symbolize/', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await ready(page)
  await page.locator('[data-tour="dock-help"]').tap()
  await page.getByRole('button', { name: 'REPLAY INTRO', exact: true }).tap()
  await enterBoot(page)
  await page.locator('[data-tour="dock-params"]').tap()
  await page.getByRole('searchbox').fill('jitter x')
  await expect(page.getByRole('slider', { name: 'JITTER X', exact: true })).toBeVisible()
  await page.getByRole('searchbox').press('Escape')
  await expect(page.locator('#mobile-editor-panel')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await context.close()
})

test('history groups slider edits, ignores playback, supports keyboard undo and redo branches', async ({ page }) => {
  await ready(page)
  await page.evaluate(async () => {
    const base = '/symbolize/src/store/'
    const { useHistory } = await import(base + 'historyStore.ts')
    useHistory.getState().reset()
    const editor = (window as any).__editor.getState()
    editor.setParamLive('grid.cellSize', 20)
    editor.setParamLive('grid.cellSize', 30)
    editor.endInteract()
  })
  await page.keyboard.press('Control+z')
  expect(await page.evaluate(() => (window as any).__editor.getState().settings.grid.cellSize)).toBe(16)
  await expect(page.getByRole('button', { name: 'UNDO', exact: true })).toBeDisabled()
  await page.keyboard.press('Control+Shift+z')
  expect(await page.evaluate(() => (window as any).__editor.getState().settings.grid.cellSize)).toBe(30)
  await page.keyboard.press('Control+z')
  await page.evaluate(() => (window as any).__editor.getState().setParam('grid.cellSize', 25))
  await expect(page.getByRole('button', { name: 'REDO', exact: true })).toBeDisabled()
})

test('a compound keyframe edit is undone once and transport does not add history', async ({ page }) => {
  await ready(page)
  const result = await page.evaluate(async () => {
    const base = '/symbolize/src/store/'
    const { useHistory } = await import(base + 'historyStore.ts')
    const { useAnim } = await import(base + 'animStore.ts')
    useHistory.getState().reset()
    useAnim.getState().putKeyAt('grid.cellSize', 0, 16)
    useAnim.getState().putKeyAt('grid.cellSize', 10, 32)
    useHistory.getState().undo()
    const afterUndo = useAnim.getState().project.tracks.length
    useHistory.getState().redo()
    const afterRedo = useAnim.getState().project.tracks[0]?.keys.length
    useHistory.getState().reset()
    useAnim.getState().stepFrame(1)
    useAnim.getState().play()
    useAnim.getState().pause()
    return { afterUndo, afterRedo, transportUndo: useHistory.getState().canUndo }
  })
  expect(result).toEqual({ afterUndo: 0, afterRedo: 2, transportUndo: false })
})
