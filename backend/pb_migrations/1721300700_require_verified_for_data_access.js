/// <reference path="../pb_data/types.d.ts" />
// O authRule de 1721300600 só bloqueia a AUTENTICAÇÃO — não invalida um token já
// emitido antes da conta ser marcada como não-verificada nem impede que um token
// válido de conta não-verificada continue lendo/escrevendo decks/cards/etc., já que
// as API Rules dessas coleções não checavam @request.auth.verified. Este migration
// fecha essa brecha nas quatro coleções de dados do usuário.
migrate((app) => {
  const ownerVerified = "@request.auth.id != '' && user = @request.auth.id && @request.auth.verified = true";
  const createVerified = "@request.auth.id != '' && @request.auth.verified = true";

  const decks = app.findCollectionByNameOrId("decks");
  decks.listRule = ownerVerified;
  decks.viewRule = ownerVerified;
  decks.createRule = createVerified;
  decks.updateRule = ownerVerified;
  decks.deleteRule = ownerVerified;
  app.save(decks);

  const cards = app.findCollectionByNameOrId("cards");
  cards.listRule = ownerVerified;
  cards.viewRule = ownerVerified;
  cards.createRule = createVerified;
  cards.updateRule = ownerVerified;
  cards.deleteRule = ownerVerified;
  app.save(cards);

  const logs = app.findCollectionByNameOrId("review_logs");
  logs.listRule = ownerVerified;
  logs.viewRule = ownerVerified;
  logs.createRule = createVerified;
  // updateRule/deleteRule continuam null (imutável) — nada a fazer aqui.
  app.save(logs);

  const jobs = app.findCollectionByNameOrId("import_jobs");
  jobs.listRule = ownerVerified;
  jobs.viewRule = ownerVerified;
  jobs.createRule = createVerified;
  jobs.updateRule = ownerVerified; // o Worker atualiza como _superuser, ignora rules
  jobs.deleteRule = ownerVerified;
  app.save(jobs);
}, (app) => {
  const owner = "@request.auth.id != '' && user = @request.auth.id";
  const createRule = "@request.auth.id != ''";

  const decks = app.findCollectionByNameOrId("decks");
  decks.listRule = owner;
  decks.viewRule = owner;
  decks.createRule = createRule;
  decks.updateRule = owner;
  decks.deleteRule = owner;
  app.save(decks);

  const cards = app.findCollectionByNameOrId("cards");
  cards.listRule = owner;
  cards.viewRule = owner;
  cards.createRule = createRule;
  cards.updateRule = owner;
  cards.deleteRule = owner;
  app.save(cards);

  const logs = app.findCollectionByNameOrId("review_logs");
  logs.listRule = owner;
  logs.viewRule = owner;
  logs.createRule = createRule;
  app.save(logs);

  const jobs = app.findCollectionByNameOrId("import_jobs");
  jobs.listRule = owner;
  jobs.viewRule = owner;
  jobs.createRule = createRule;
  jobs.updateRule = owner;
  jobs.deleteRule = owner;
  app.save(jobs);
});
