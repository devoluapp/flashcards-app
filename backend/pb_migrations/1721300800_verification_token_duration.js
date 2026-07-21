/// <reference path="../pb_data/types.d.ts" />
// Fixa a validade do token de confirmação de e-mail em 24h. O default do
// PocketBase já é 86400s (1 dia), mas deixamos explícito aqui pra não depender
// de um default implícito que pode mudar em versão futura — mesmo raciocínio
// de 1721300600_require_email_verification.js pros templates de e-mail.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  users.verificationToken.duration = 86400; // 24h

  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");

  // 86400 (24h) já é o default do PocketBase pra esse token, então a "reversão"
  // aqui é só deixar de novo no valor default.
  users.verificationToken.duration = 86400;

  app.save(users);
});
