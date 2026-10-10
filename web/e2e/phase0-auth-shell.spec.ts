import { expect, test } from '@playwright/test';

const OWNER = { email: 'teacher@school.edu', first: 'Grace', last: 'Hopper', password: 'Forge2026' };

// One serial story: fresh install → owner setup → shell → sign out → sign in.
test.describe.configure({ mode: 'serial' });

test('fresh install redirects to owner setup and validates the form', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Set up owner account' })).toBeVisible();

  // Sign-in is not reachable before setup.
  await page.goto('/signin');
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
  await expect(page.getByText('First name is required')).toBeVisible();
  const rules = page.getByRole('list', { name: 'Password rules' });
  await expect(rules.locator('li.text-danger')).toHaveCount(3);

  // Errors clear live as the user fixes them; nothing was submitted to the server.
  await page.getByLabel('Email').fill('teacher@school.edu');
  await expect(page.getByText('Enter a valid email address')).toHaveCount(0);
  await page.getByLabel('Password', { exact: true }).fill('forge1');
  await expect(rules.locator('li.text-success')).toHaveCount(1);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await expect(rules.locator('li.text-success')).toHaveCount(3);
  await expect(page).toHaveURL(/\/setup$/);
});

test('owner setup signs in and shows the app shell with a live connection', async ({ page }) => {
  await page.goto('/setup');
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('First name').fill(OWNER.first);
  await page.getByLabel('Last name').fill(OWNER.last);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText(`Welcome, ${OWNER.first}.`)).toBeVisible();
  await expect(page.getByTestId('user-name')).toHaveText(`${OWNER.first} ${OWNER.last}`);
  await expect(page.getByTestId('server-status')).toContainText('Running');
  await expect(page.getByTestId('ws-status')).toHaveAttribute('data-status', 'open');
  await expect(page.getByTestId('public-url')).toContainText('http://');

  // Every sidebar entry opens a page.
  for (const [label, heading] of [
    ['Workflows', 'Workflows'],
    ['Templates', 'Templates'],
    ['Executions', 'Executions'],
    ['Credentials', 'Credentials'],
    ['Variables', 'Variables'],
    ['Settings', 'Settings'],
  ]) {
    await page.locator('aside').getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  }
  await expect(page.getByText('Phase 3B')).toHaveCount(0); // we are on Settings now
  await page.locator('aside').getByRole('link', { name: 'Credentials', exact: true }).click();
  await expect(page.getByText('Phase 3B')).toBeVisible();

  // Unknown pages show a 404 inside the shell.
  await page.goto('/does-not-exist');
  await expect(page.getByText('Page not found')).toBeVisible();

  // Session survives a reload; the sidebar collapse state is remembered.
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
});

test('sign out, wrong password, sign in with redirect back', async ({ page }) => {
  await page.goto('/home');
  // Previous test's cookies are not shared, so we start signed out.
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // Setup page is no longer reachable.
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/signin$/);

  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill('Wrong1234');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong email or password.');

  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/home$/);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin$/);

  // Deep link while signed out → sign in → back to the deep link.
  await page.goto('/credentials');
  await expect(page).toHaveURL(/\/signin\?redirect=%2Fcredentials$/);
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password', { exact: true }).fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/credentials$/);
});
