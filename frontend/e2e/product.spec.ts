import { expect, test, type Page } from '@playwright/test'

const incident = {
  id: 'case-synthetic', title: 'Sender details need a closer look',
  summary: 'The selected message contains a mismatched reply-to address.',
  account_id: 'account-synthetic', severity: 'high', status: 'new', score: 0.7,
  first_seen_at: '2026-10-29T09:00:00Z', last_seen_at: '2026-10-29T09:00:00Z',
  findings: [{ id: 'finding-synthetic', rule_code: 'EMAIL-002', title: 'Reply-to mismatch', weight: 0.7, confidence: 0.8, evidence: { reply_to_mismatch: true } }],
  explanation: { source: 'template', what_happened: 'The reply-to address differs from the sender.', why_it_matters: 'A reply may go to a different person.', severity: 'High priority', next_step: 'Verify through a trusted contact.' },
  recommendations: [{ position: 1, action: 'Verify through a trusted contact.' }],
  signals: [{ id: 'signal-synthetic', signal_type: 'email', occurred_at: '2026-10-29T09:00:00Z', received_at: '2026-10-29T09:00:00Z', features: { sender: 'sender@example.test', subject: 'Synthetic review sample' } }],
  audit: [],
}

async function workspace(page: Page, signedIn = true) {
  // Browser-only synthetic responses. No application authentication bypass,
  // live provider calls, private mailbox content or real browser profile.
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    const responses: Record<string, unknown> = {
      '/auth/session': { mode: 'google', configured: true, invitation_only: false, environment: 'production', session_hours: 8, csrf_token: 'synthetic', mailbox_consent_separate: true, user: signedIn ? { id: 'synthetic-user', email: 'owner@example.test', workspace_id: 'synthetic-workspace' } : null },
      '/accounts': [{ id: 'account-synthetic', email: 'owner@example.test', display_name: 'Example workspace', provider: 'controlled' }],
      '/sources': [{ id: 'source-synthetic', account_id: 'account-synthetic', name: 'Selected messages', source_type: 'controlled', status: 'active', capabilities: ['email'] }],
      '/scan-jobs': [],
      '/capabilities': { service: 'SentinelSME', signal_types: ['email'], source_types: ['controlled'], live_connectors: [], controlled_ingestion: true, template_explanations: true, ai_explanations: false, correlation_window_minutes: 30, maximum_batch_size: 500, privacy: { stores_full_bodies: false, stores_attachments: false }, gmail: { implemented: true, configured: true, maximum_messages: 50, automatic_scanning: false, trial: false, evidence_retention_days: 30 } },
      '/overview': { incidents: { active: 1, critical: 0, under_review: 0, resolved: 0, false_positive: 0 }, accounts: 1, active_sources: 1, retained_signals: 7, source_activity: {}, latest_job: null, activity: Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${22 + i}`, signals: i + 1, incidents: i % 2 })) },
      '/incidents/page': { items: [incident], total: 1, limit: 25, offset: 0 },
      '/incidents/case-synthetic': incident,
      '/rules': [], '/trusted-senders': [],
      '/signals': { items: [], total: 0, limit: 25, offset: 0 },
      '/sources/source-synthetic/schedule': null,
    }
    if (!(path in responses)) throw new Error(`Unmocked synthetic browser request: ${path}`)
    await route.fulfill({ json: responses[path] })
  })
  await page.goto('/')
}

async function navigate(page: Page, name: string, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: name === 'Incidents' ? /^Incidents/ : name, exact: name !== 'Incidents' }).click()
}

for (const width of [375, 768, 1024, 1440]) {
  test(`workspace controls and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 })
    await workspace(page)
    await expect(page.getByRole('heading', { name: 'Security overview' })).toBeVisible()
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(await overflow()).toBe(false)
    await page.screenshot({ path: `../data/ui-review/overview-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'View critical priority' }).click()
    await expect(page.getByRole('combobox', { name: 'Severity', exact: true })).toHaveValue('critical')
    await page.getByRole('button', { name: 'Show all incident statuses' }).click()
    await navigate(page, 'Overview', width <= 900)
    for (const name of ['Evidence workspace', 'Accounts & sources', 'Protection coverage', 'Detection catalogue']) {
      await navigate(page, name, width <= 900)
      await expect(page.locator('main h1')).toBeVisible()
      expect(await overflow(), `${name} must fit ${width}px`).toBe(false)
    }
    if (width <= 900) {
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).not.toBeVisible()
    }

    await navigate(page, 'Incidents', width <= 900)
    await expect(page.getByRole('heading', { name: 'Incidents', exact: true })).toBeVisible()
    if (width <= 900) {
      const toggle = page.getByRole('button', { name: 'Toggle incident filters' })
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await toggle.click()
      await expect(page.getByRole('combobox', { name: 'Severity', exact: true })).toBeVisible()
      await toggle.click()
      await expect(page.getByRole('combobox', { name: 'Severity', exact: true })).not.toBeVisible()
    }
    await page.locator('.incident-row').first().click()
    await page.getByRole('tab', { name: /Evidence/ }).click()
    await expect(page.getByRole('tabpanel')).toContainText('Reply-to mismatch')
    expect(await overflow()).toBe(false)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `../data/ui-review/incident-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Analyse email', exact: true }).first().click()
    await expect(page.getByLabel('Selected message text')).toBeVisible()
    await page.getByRole('button', { name: /Gmail sample/ }).click()
    await expect(page.getByRole('button', { name: 'Connect Gmail', exact: true })).toBeDisabled()
    await page.getByRole('checkbox').first().check()
    await expect(page.getByRole('button', { name: 'Connect Gmail', exact: true })).toBeEnabled()
    expect(await overflow()).toBe(false)
    await page.getByRole('button', { name: 'Your account', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.getByRole('textbox', { name: 'Search incidents' }).fill('sender')
    await page.getByRole('button', { name: 'Search workspace' }).click()
    await expect(page.getByRole('heading', { name: 'Incidents', exact: true })).toBeVisible()
    await navigate(page, 'Overview', width <= 900)
    await page.getByRole('button', { name: 'Set up Gmail', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Gmail sample Connect and collect on demand' })).toHaveAttribute('aria-pressed', 'true')
  })
}

test('welcome page uses blue feedback and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await workspace(page, false)
  const button = page.getByRole('button', { name: 'Sign in with Google' })
  await expect(button).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const before = await button.evaluate(element => getComputedStyle(element).backgroundColor)
  await button.hover()
  await page.waitForTimeout(200)
  const after = await button.evaluate(element => getComputedStyle(element).backgroundColor)
  expect(before).not.toBe(after)
  expect(after).toBe('rgb(29, 78, 216)')
  await page.screenshot({ path: '../data/ui-review/welcome-mobile.png', fullPage: true })
})

test('drawer resize, keyboard focus and reduced motion remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await workspace(page)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.locator('.app-main')).toHaveAttribute('inert', '')
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(page.locator('.app-main')).not.toHaveAttribute('inert')
  await expect(page.locator('.sidebar-scrim')).toHaveCount(0)
  await navigate(page, 'Email analysis', false)
  await expect(page.getByLabel('Selected message text')).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const transitions = await page.getByRole('button', { name: 'Your account' }).evaluate(element => getComputedStyle(element).transitionDuration)
  expect(transitions.split(',').every(duration => parseFloat(duration) === 0)).toBe(true)
  await page.getByRole('button', { name: 'Your account' }).focus()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe('solid')
})
