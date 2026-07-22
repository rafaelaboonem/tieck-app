import { test, expect } from '@playwright/test';

const routes = [
  '/',
  '/login',
  '/dashboard',
  '/novo-checklist',
];

test.describe('Vercel Deploy Route Validation', () => {
  for (const route of routes) {
    test(`should load ${route} without 404`, async ({ page }) => {
      const response = await page.goto(route);
      
      // Check HTTP status code
      expect(response?.status()).toBeLessThan(400);
      
      // Check for common 404 indicators in the body just in case of soft 404s
      const content = await page.content();
      expect(content).not.toContain('404: NOT_FOUND');
      expect(content).not.toContain('Code: NOT_FOUND');
      
      // Additional check for app-specific content (optional but recommended)
      if (route === '/') {
        await expect(page).toHaveTitle(/ChecklistApp/);
      }
    });
  }
});