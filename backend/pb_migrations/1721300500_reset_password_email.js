/// <reference path="../pb_data/types.d.ts" />
// Customiza o e-mail de "esqueci a senha" da coleção "users".
// Por padrão o PocketBase manda o link de reset para a UI ADMIN do painel
// (`{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}`), que não existe para
// usuários finais. Aqui trocamos para apontar ao frontend web, na rota
// `/reset-password?token=...` (ver flashcards-web/src/routes/reset-password).
//
// A URL base do frontend vem da env PB_FRONTEND_URL (definida no Coolify via
// docker-compose.yml, ou no docker-compose-local.yml para dev). Sem a env,
// cai para a porta padrão do `npm run dev` do SvelteKit.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const frontendUrl = ($os.getenv("PB_FRONTEND_URL") || "http://localhost:5173").replace(/\/+$/, "");

  users.resetPasswordTemplate.subject = "Redefina sua senha — Flashcards";
  users.resetPasswordTemplate.body = `<p>Olá,</p>
<p>Recebemos um pedido para redefinir a senha da sua conta no Flashcards.</p>
<p>
  <a class="btn" href="${frontendUrl}/reset-password?token={TOKEN}" target="_blank" rel="noopener">Redefinir senha</a>
</p>
<p><i>Se você não pediu essa alteração, pode ignorar este e-mail — sua senha continua a mesma.</i></p>
<p>
  Equipe Flashcards
</p>`;

  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");

  users.resetPasswordTemplate.subject = "Reset your {APP_NAME} password";
  users.resetPasswordTemplate.body = `<p>Hello,</p>
<p>Click on the button below to reset your password.</p>
<p>
  <a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a>
</p>
<p><i>If you didn't ask to reset your password, please ignore this email.</i></p>
<p>
  Thanks,<br/>
  {APP_NAME} team
</p>`;

  app.save(users);
});
