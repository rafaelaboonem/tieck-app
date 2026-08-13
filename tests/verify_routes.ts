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
  const baseUrl = process.env.DEPLOY_URL || 'https://tieck.com.br';
  const routes = ['/', '/login', '/cadastro', '/inicio'];
  
  let allOk = true;
  for (const route of routes) {
    // Ensure no double slashes
    const fullUrl = `${baseUrl.replace(/\/$/, '')}${route}`;
    const ok = await checkRoute(fullUrl);
    if (!ok) allOk = false;
  }
  
  if (!allOk) {
    process.exit(1);
  }
}

run();
