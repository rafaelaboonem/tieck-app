async function checkRoute(url: string) {
  console.log(`Checking ${url}...`);
  try {
    const response = await fetch(url, {
      redirect: 'follow'
    });
    
    const status = response.status;
    const finalUrl = response.url;
    const text = await response.text();
    
    // O teste deve rejeitar status 5xx, página de erro da Vercel e rota inexistente.
    // Redirect legítimo de autenticação não deve ser considerado falha.
    if (status >= 500) {
      console.error(`❌ ${url} returned status ${status}`);
      return false;
    }

    if (text.includes('Vercel Error') || text.includes('DEPLOYMENT_NOT_FOUND') || text.includes('404: NOT_FOUND') || text.includes('Code: NOT_FOUND')) {
      console.error(`❌ ${url} contains error text (Vercel or 404)`);
      return false;
    }
    
    if (status === 404) {
      console.error(`❌ ${url} is 404`);
      return false;
    }

    console.log(`✅ ${url} is OK (Status: ${status}, Final URL: ${finalUrl})`);
    return true;
  } catch (error) {
    console.error(`❌ Error checking ${url}:`, error);
    return false;
  }
}

async function run() {
  const baseUrl = process.env.DEPLOY_URL || "https://tieck.com.br";
  const routes = ['/', '/login', '/cadastro', '/inicio'];
  
  console.log(`Starting route verification for: ${baseUrl}`);
  
  let allOk = true;
  for (const route of routes) {
    const ok = await checkRoute(`${baseUrl}${route}`);
    if (!ok) allOk = false;
  }
  
  if (!allOk) {
    process.exit(1);
  }
  
  console.log("All essential routes verified.");
}

run();
