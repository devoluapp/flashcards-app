/// <reference path="../pb_data/types.d.ts" />
// Exige e-mail confirmado para autenticar. Na v0.23+ isso é o "authRule" da
// coleção auth (não existe mais um bool "onlyVerified" solto) — é a regra
// aplicada DEPOIS da autenticação e ANTES de devolver o token, então uma conta
// com verified=false autentica com senha certa mas recebe 400 na resposta final
// em vez de token. Também troca o link do e-mail de verificação para apontar ao
// frontend web, na rota `/verify-email?token=...` (ver web/src/routes/verify-email),
// em vez da UI admin do PocketBase — mesmo padrão de 1721300500_reset_password_email.js.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const frontendUrl = ($os.getenv("PB_FRONTEND_URL") || "http://localhost:5173").replace(/\/+$/, "");

  users.authRule = "verified = true";

  users.verificationTemplate.subject = "Confirme seu e-mail — Flashcards";
  users.verificationTemplate.body = `<p>Olá,</p>
<p>Obrigado por criar sua conta no Flashcards. Confirme seu e-mail para poder entrar.</p>
<p>
  <a class="btn" href="${frontendUrl}/verify-email?token={TOKEN}" target="_blank" rel="noopener">Confirmar e-mail</a>
</p>
<p><i>Se você não criou essa conta, pode ignorar este e-mail.</i></p>
<p>
  Equipe Flashcards
</p>`;

  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");

  users.authRule = "";

  users.verificationTemplate.subject = "Verify your {APP_NAME} email";
  users.verificationTemplate.body = `<p>Hello,</p>
<p>Thank you for joining us at {APP_NAME}.</p>
<p>Click on the button below to verify your email address.</p>
<p>
  <a class="btn" href="{APP_URL}/_/#/auth/confirm-verification/{TOKEN}" target="_blank" rel="noopener">Verify</a>
</p>
<p><i>If you didn't ask to verify this address, you can ignore this email.</i></p>
<p>
  Thanks,<br/>
  {APP_NAME} team
</p>`;

  app.save(users);
});
