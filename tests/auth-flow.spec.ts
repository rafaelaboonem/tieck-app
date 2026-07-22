import { test, expect } from '@playwright/test';

test('auth flow and publishing', async ({ page }) => {
  // 1. Go to the new checklist page
  await page.goto('/novo-checklist');
  
  // 2. Click to start from scratch
  await page.click('text=Pressione Enter para começar do zero');
  
  // 3. Type a title
  await page.fill('placeholder="Título do checklist"', 'Test Checklist ' + Date.now());
  
  // 4. Add some content to the first block
  await page.locator('[data-workspace] [contenteditable]').first().fill('Hello World content');
  
  // 5. Click Publish
  await page.click('button:has-text("Publicar")');
  
  // 6. Check if auth modal is visible
  await expect(page.locator('h2:has-text("Cadastrar"), h2:has-text("Entrar")')).toBeVisible();
  
  // 7. Toggle to Sign Up if not already there
  const toggleBtn = page.locator('button:has-text("Não tem conta? Cadastre-se gratuitamente")');
  if (await toggleBtn.isVisible()) {
    await toggleBtn.click();
  }
  
  await expect(page.locator('button[type="submit"]:has-text("Cadastrar")')).toBeVisible();
  
  // 8. Try to submit without filling (should show browser validation or keep modal)
  await page.click('button[type="submit"]:has-text("Cadastrar")');
  
  // Check console for errors during this
});
