async function checkRoute(url: string) {
  console.log(`Checking ${url}...`);
  try {
    const response = await fetch(url);
    const status = response.status;
    const text = await response.text();
    
    if (status >= 400) {
      console.error(`❌ ${url} returned status ${status}`);
      return false;
    }
    
    if (text.includes('404: NOT_FOUND') || text.includes('Code: NOT_FOUND')) {
      console.error(`❌ ${url} contains 404 error text`);
      return false;
    }
    
    console.log(`✅ ${url} is OK (Status: ${status})`);
    return true;
  } catch (error) {
    console.error(`❌ Error checking ${url}:`, error);
    return false;
  }
}

async function run() {
  const baseUrl = 'https://checklistapp-wheat.vercel.app';
  const routes = ['/', '/login', '/dashboard', '/novo-checklist'];
  
  let allOk = true;
  for (const route of routes) {
    const ok = await checkRoute(`${baseUrl}${route}`);
    if (!ok) allOk = false;
  }
  
  if (!allOk) {
    process.exit(1);
  }
}

run();