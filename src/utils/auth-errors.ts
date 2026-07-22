export const mapAuthError = (message: string): string => {
  const msg = message.toLowerCase();
  
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "E-mail ou senha incorretos. Verifique seus dados e tente novamente.";
  }
  if (msg.includes("email logins are disabled") || msg.includes("email_provider_disabled")) {
    return "O login por e-mail está desativado no servidor. Verifique as configurações de autenticação do backend.";
  }
  if (msg.includes("email signups are disabled") || msg.includes("signup_disabled")) {
    return "O cadastro de novos usuários está temporariamente desativado no servidor.";
  }
  if (msg.includes("user not found") || msg.includes("invalid user")) {
    return "Este e-mail não está cadastrado em nossa plataforma.";
  }
  if (msg.includes("password is known to be weak") || msg.includes("weak_password")) {
    return "A senha escolhida é muito fraca. Por favor, use uma senha mais complexa.";
  }
  if (msg.includes("user already registered")) {
    return "Este e-mail já está sendo utilizado por outra conta.";
  }
  if (msg.includes("password should be")) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }
  if (msg.includes("email not confirmed")) {
    return "Por favor, confirme seu e-mail antes de fazer login.";
  }
  
  return "Ocorreu um erro inesperado: " + message;
};
