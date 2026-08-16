export const mapAuthError = (message: string): string => {
  const msg = (message || "").toLowerCase();
  
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials") || msg.includes("invalid password")) {
    return "E-mail ou senha incorretos. Verifique seus dados e tente novamente.";
  }
  if (msg.includes("email logins are disabled") || msg.includes("email_provider_disabled")) {
    return "O login por e-mail está desativado.";
  }
  if (msg.includes("email signups are disabled") || msg.includes("signup_disabled")) {
    return "O cadastro de novos usuários está temporariamente desativado.";
  }
  if (msg.includes("user not found") || msg.includes("invalid user")) {
    return "Este e-mail não está cadastrado.";
  }
  if (msg.includes("password is known to be weak") || msg.includes("weak_password")) {
    return "A senha escolhida é muito fraca. Por favor, use uma senha mais complexa.";
  }
  if (msg.includes("user already registered") || msg.includes("user already exists")) {
    return "Este e-mail já está sendo utilizado por outra conta.";
  }
  if (msg.includes("password should be")) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }
  if (msg.includes("email not confirmed")) {
    return "Por favor, confirme seu e-mail antes de fazer login.";
  }
  if (msg.includes("otp has expired") || msg.includes("token has expired")) {
    return "O código expirou. Por favor, solicite um novo.";
  }
  if (msg.includes("invalid token") || msg.includes("invalid otp") || msg.includes("code is invalid")) {
    return "Código de verificação inválido. Verifique o e-mail e tente novamente.";
  }
  if (msg.includes("too many requests") || msg.includes("over_email_send_rate_limit")) {
    return "Muitas tentativas. Por favor, aguarde alguns minutos antes de tentar novamente.";
  }
  if (msg.includes("network error") || msg.includes("failed to fetch")) {
    return "Erro de conexão. Verifique sua internet e tente novamente.";
  }
  
  // Fail-safe: generic Portuguese message for anything else, hiding internal details
  return "Não foi possível completar a operação. Tente novamente em instantes.";
};
