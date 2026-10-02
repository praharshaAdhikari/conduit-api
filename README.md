# conduit-api

The backend of Conduit, a small blogging platform, on NestJS 11, TypeORM and MySQL 8. It implements the
[RealWorld](https://github.com/realworld-apps/realworld) API spec and adds roles and moderation, and paid
memberships and one-off tips through a payment provider.

It is one of three repos that make up a practice system for learning QA:

| Repo | What it is |
| --- | --- |
| `conduit-api` (this one) | The API |
| `conduit-web` | The React app that uses it |
| `conduit-qa` | Starts the whole system; the tests and the pipeline are built there |

**This repo has no tests yet, on purpose.** The test setup, the tests and the CI are added step by
step; `conduit-qa/ROADMAP.md` has the order.

## Run it

Needs Node 24 and Docker.

```sh
cp .env.example .env
npm ci
npm run db:start      # MySQL 8 in Docker, on 127.0.0.1:4306
npm run db:migrate    # creates the tables
npm run seed          # optional: demo users and articles
npm run start:dev     # http://localhost:4000/api
```

- API reference (Swagger): http://localhost:4000/api/docs
- Health check: http://localhost:4000/api/health
- Demo logins after `npm run seed`, all with the password `password123`:

  | Email | Who |
  | --- | --- |
  | `alice@example.com`, `bob@example.com`, `carol@example.com` | Ordinary users with articles |
  | `mod@example.com` | A moderator |
  | `admin@example.com` | An admin |
  | `dave@example.com` | A suspended user; his one article is hidden |
  | `erin@example.com` | A paying member (monthly) |

The seed also adds a paid 5.00 USD tip to alice from a guest (`reader@example.com`).

Payments work out of the box: the default provider is a fake one built into this API (see
"The fake payment provider" below). Email is written to the log unless `SMTP_HOST` is set.

`npm run db:stop` stops MySQL and keeps its data; `docker compose down -v` deletes the data.

## Commands

| Command | Does |
| --- | --- |
| `npm run start:dev` | Starts the API and restarts it when a file changes |
| `npm run build` | Compiles to `dist/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, without writing files |
| `npm run format` | Prettier |
| `npm run db:migrate` | Applies the SQL files in `migrations/` that have not been applied yet |
| `npm run seed` | Adds the demo data; skips whatever is already there |
| `npm run user:role -- <username> <role>` | Sets a user's role (`user`, `moderator` or `admin`); this is how the first admin is made |
| `npm run membership:reconcile` | Runs the reconcile job once and prints its report |

## Endpoints

All under `/api`. Send the token as `Authorization: Token <token>`.

| Method and path | Auth | Does |
| --- | --- | --- |
| `POST /users` | none | Register |
| `POST /users/login` | none | Log in |
| `GET /user` | required | The current user |
| `PUT /user` | required | Update the current user |
| `GET /profiles/:username` | optional | A user's profile |
| `POST /profiles/:username/follow` | required | Follow |
| `DELETE /profiles/:username/follow` | required | Unfollow |
| `GET /articles` | optional | List; filters `tag`, `author`, `favorited`; paging `limit`, `offset` |
| `GET /articles/feed` | required | Articles by the users you follow |
| `GET /articles/:slug` | optional | One article |
| `POST /articles` | required | Create |
| `PUT /articles/:slug` | required | Update (author only) |
| `DELETE /articles/:slug` | required | Delete (author only) |
| `POST /articles/:slug/favorite` | required | Favorite |
| `DELETE /articles/:slug/favorite` | required | Unfavorite |
| `GET /articles/:slug/comments` | optional | An article's comments |
| `POST /articles/:slug/comments` | required | Add a comment |
| `DELETE /articles/:slug/comments/:id` | required | Delete a comment (its author only) |
| `GET /tags` | none | Tags in use |
| `GET /admin/users` | moderator | All users; filter `search` (part of a username or email); paging |
| `POST /admin/users/:username/suspend` | moderator | Suspend; body `{ "moderation": { "reason": "..." } }` |
| `DELETE /admin/users/:username/suspend` | moderator | Lift a suspension |
| `PUT /admin/users/:username/role` | admin | Set a role; body `{ "user": { "role": "moderator" } }` |
| `GET /admin/articles` | moderator | All articles; filter `hidden` (`true` or `false`); paging |
| `POST /admin/articles/:slug/hide` | moderator | Hide; body `{ "moderation": { "reason": "..." } }` |
| `DELETE /admin/articles/:slug/hide` | moderator | Show again |
| `GET /admin/actions` | moderator | The moderation log, newest first; paging |
| `GET /membership/plans` | none | The plans and their prices |
| `GET /membership` | required | Your membership, or `null` |
| `POST /membership/checkout` | required | Start paying; body `{ "membership": { "plan": "monthly" } }`; returns `checkoutUrl` |
| `POST /membership/cancel` | required | Stop at the end of the paid period |
| `POST /membership/resume` | required | Take a cancellation back |
| `GET /membership/payments` | required | Your payments, newest first; paging |
| `GET /membership/history` | required | What happened to your membership, newest first; paging |
| `POST /tips` | optional | Start a tip; see "Tips" for the body |
| `GET /tips/:reference` | none | A tip, by its reference |
| `POST /tips/:reference/verify` | none | Confirm a guest's email; body `{ "verification": { "code": "123456" } }` |
| `POST /tips/:reference/resend` | none | Email a new code |
| `GET /user/tips` | required | Your tips; `direction` is `received` (the default) or `sent`; paging |
| `POST /payments/webhook` | signature | Where the payment provider reports what happened |
| `GET /admin/memberships` | moderator | All memberships; filter `status`; paging |
| `GET /admin/memberships/:username/history` | moderator | What happened to a user's membership; paging |
| `POST /admin/memberships/reconcile` | admin | Run the reconcile job now; returns its report |
| `GET /admin/reconcile-runs` | moderator | Earlier runs of the job and their reports, newest first; paging |
| `GET /admin/payments` | moderator | All payments; filters `kind`, `status`; paging |
| `POST /admin/payments/:id/refund` | admin | Give a payment back |
| `GET /admin/tips` | moderator | All tips, with the tipper's email; filter `status`; paging |
| `GET /health` | none | Whether the API can reach the database |

Errors always have the body `{ "errors": { "<field>": ["<message>"] } }`:

| Status | When |
| --- | --- |
| 400 | A webhook's signature is missing or wrong |
| 401 | The token is missing or invalid, or the login is wrong |
| 403 | The article or comment belongs to someone else, the account is suspended, or its role does not allow the action |
| 404 | The article, comment, profile or user does not exist, or the article is hidden from you |
| 409 | The username or email is already taken, or the reconcile job is already running |
| 422 | A field is missing, blank or malformed, or the action does not apply (for example, hiding an article that is already hidden) |
| 429 | Too many codes were sent to one email address |
| 503 | An email that the request depends on could not be sent |

## Rules the RealWorld spec leaves open

These are this implementation's choices:

- Passwords are 8 to 128 characters; usernames at most 64; titles at most 255; tags at most 64.
- Emails must look like an email address.
- `limit` is 1 to 100 (default 20); `offset` is 0 or more (default 0). Anything else is a 422.
- A user cannot follow themselves (422).
- Following or favoriting twice is not an error and counts once.
- Usernames and emails are unique regardless of letter case. Tags are case-sensitive.
- An article's slug comes from its title and changes when the title does. If the slug is already in
  use, a random suffix is added.
- Tags are trimmed, blanks and repeats are dropped, and their order is kept.
- Comments are listed newest first. `GET /tags` lists the most used tags first.
- Tokens expire after `JWT_EXPIRES_IN` (7 days by default).

## Roles and moderation

There are three roles: `user`, `moderator` and `admin`. Each can do everything the one before it can.
New accounts are users. The user object returned by the user endpoints includes `role`.

**Suspended accounts**

- A suspended user cannot log in, and every request that needs a login is refused with 403 and
  `{ "errors": { "account": ["is suspended"] } }`, including with a token issued before the suspension.
- On endpoints where login is optional, a suspended user's token is ignored: they see what an
  anonymous visitor sees.
- Their profile, articles and comments stay visible to everyone else.
- A moderator can suspend and unsuspend users. An admin can also suspend and unsuspend moderators.
  Nobody can suspend an admin (403), and nobody can suspend themselves (422).
- Suspending needs a reason of 1 to 255 characters. Suspending a suspended user, or unsuspending one
  who is not, is a 422.

**Hidden articles**

- A hidden article is left out of `GET /articles`, the feed and `GET /tags`, for everyone including
  its author.
- `GET /articles/:slug`, its comments and its favorite endpoints answer 404, except to the author and
  to moderators. They get the article with `hidden: true` and `hiddenReason`.
- The author can still edit and delete a hidden article, but cannot show it again.
- Hiding needs a reason of 1 to 255 characters. Hiding a hidden article, or showing one that is not
  hidden, is a 422.

**Roles**

- Only an admin can change a role. An admin cannot change their own role (422), so there is always at
  least one admin. A suspended user's role cannot be changed (422).
- Setting the role a user already has succeeds and changes nothing.
- A change of role or a suspension applies to the user's next request; they do not need a new token.

**The log**

- Every suspension, hiding and change of role is recorded with who did it, to what, and the reason.
  Setting a role the user already has is not recorded.

## Memberships and payments

A member can read members-only articles. There are two plans: `monthly` (5.00 USD a month) and `yearly`
(50.00 USD a year). Money is always an integer number of cents (`amountCents`).

**Members-only articles**

- Any user can mark their article `membersOnly` when creating or updating it.
- Members, the author and moderators get the article as usual. Everyone else gets it with
  `locked: true` and an empty `body`; the title, description and tags are not withheld.
- Lists show `membersOnly` on each article. Comments and favorites work as on any article.
- Profiles (and so the `author` of articles and comments) include `member`: whether that user is a
  member right now.

**A membership's status**

| Status | Means | Access |
| --- | --- | --- |
| `pending` | A checkout was started and is not paid yet | no |
| `active` | Paid | yes |
| `past_due` | A renewal payment failed | yes, until 7 days after the end of the paid period |
| `cancelled` | Ended because the member cancelled, or the payment was refunded | no |
| `lapsed` | Ended because a payment was never made: a renewal, or a checkout that was abandoned | no |

The user object includes `membership` (`null` until the user first starts a checkout), with `status`,
`plan`, `hasAccess`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `graceEndsAt`, `startedAt` and `endedAt`.

`hasAccess` is the answer to "can this user read members-only articles right now". It is not the same
as the status: a `past_due` membership whose 7 days have run out has no access, although it stays
`past_due` until the reconcile job ends it. `graceEndsAt` is that moment, and is `null` for every other
status.

**Paying**

- `POST /membership/checkout` returns a `checkoutUrl` at the payment provider. The membership becomes
  `active` when the provider's webhook says the payment went through, not when the user comes back.
- An `active` or `past_due` membership cannot start a checkout (422), because its subscription is still
  running at the provider. Anyone else can, including someone `pending`.
- Starting a checkout closes any earlier one that is still open, so a membership cannot be paid twice.
  The earlier payment is listed as `expired`.
- After paying, the provider sends the user to `WEB_URL/membership/success`; after cancelling, to
  `WEB_URL/membership/cancelled`.

**Renewing, cancelling, ending**

- Each renewal is a new payment and moves `currentPeriodEnd` on by one period.
- A failed renewal makes the membership `past_due`. A later successful payment makes it `active` again.
- Cancelling sets `cancelAtPeriodEnd`; the membership stays `active` until the provider ends it. Only an
  `active` membership can be cancelled, and only one that is set to end can be resumed (422 otherwise).
- When the provider ends the subscription, the membership becomes `cancelled` if it was set to end and
  `lapsed` if not.
- Joining again reuses the same membership: it goes `pending`, then `active` with a new start date.

**History and email**

- Every change of status, of `cancelAtPeriodEnd` or of the paid period is recorded with its reason and
  its source: `member`, `webhook`, `reconcile` or `admin`. A change that alters nothing is not recorded.
- The member is emailed when the membership starts, when a payment fails, when they cancel, and when
  the membership ends.

**The reconcile job**

Webhooks can be late or lost, and some things happen only because time passes. The job puts both right.
It runs every night (`RECONCILE_CRON`, 03:00 UTC by default), from `npm run membership:reconcile`, and
when an admin calls `POST /admin/memberships/reconcile`. Each run:

1. Asks the provider about every `active` and `past_due` membership's subscription and applies the
   difference, as the missing webhook would have: a failed payment, a renewal, a cancellation, an
   ending. A subscription the provider does not know counts as ended.
2. Ends `past_due` memberships whose 7 days are over (`lapsed`) and ends their subscriptions at the
   provider.
3. Closes checkouts that have been unpaid for 24 hours. The payment becomes `expired`; a tip waiting on
   it becomes `expired`; a `pending` membership becomes `lapsed`.
4. Expires guest tips that have waited 24 hours for their code.

- A problem with one membership is listed under `errors` in the report and the run carries on.
- Only one run happens at a time. A second one is refused with 409, whichever way it was started.
- Running it again straight away changes nothing.
- A renewal the job discovers moves the paid period on but adds no payment; the payment appears when
  the provider's webhook finally arrives.

**Webhooks**

- The provider's signature is checked against the exact bytes received. A missing or wrong signature is
  a 400, and nothing is recorded.
- Every event is recorded once, by the provider's event id. A repeated delivery answers 200 with
  `duplicate: true` and changes nothing.
- An event about something this API does not know (an unknown reference or subscription) is recorded as
  ignored and answered with 200.

**Refunds**

- Only an admin can refund, and only a payment that succeeded: one that is `pending` or `expired` is a
  422, and so is one already refunded.
- Refunding the latest payment of an `active` or `past_due` membership ends it at once (`cancelled`) and
  ends the subscription at the provider. Refunding an older payment only marks that payment.
- A refund is recorded in the moderation log.

## Tips

Anyone can send an author a single payment, with or without an account.

```json
{ "tip": { "author": "alice", "article": "welcome-to-conduit", "amountCents": 500,
           "name": "A reader", "message": "Thank you", "email": "reader@example.com" } }
```

- `author` (a username) and `amountCents` are required. `article` (a slug), `name` and `message` are
  optional. `email` is required from a guest and ignored from a logged-in user, whose own address is used.
- The amount is a whole number of cents from 100 to 50000 (1.00 to 500.00 USD). `name` is at most 64
  characters and `message` at most 280.
- The article, if given, must be by that author (422) and visible to the tipper (404 if it is hidden).
- Nobody can tip themselves: not when logged in as the author, and not as a guest using the author's
  email address (422). A suspended author cannot receive tips (422).

**A tip's status**

| Status | Means |
| --- | --- |
| `pending_verification` | A guest has been emailed a code and has not confirmed it yet |
| `pending_payment` | A checkout is open at the payment provider |
| `paid` | The provider's webhook said the payment went through |
| `expired` | The checkout was closed without being paid |
| `refunded` | An admin gave the payment back |

**Guests and codes**

- A guest's tip starts as `pending_verification` and `checkoutUrl` is `null`. A 6-digit code is emailed.
  `POST /tips/:reference/verify` with the right code returns the `checkoutUrl` and a `guestToken`.
- A code works for 10 minutes and once. After 5 wrong tries it stops working, even for the right code.
- `resend` emails a new code; earlier codes for that tip stop working.
- At most 5 codes are sent to one address in an hour, across all tips. The next request is a 429.
- A `guestToken` lasts 30 minutes. Sent as the header `X-Guest-Token` with `POST /tips`, it skips the code
  for a tip from the same email address. It is not a login and is refused everywhere a login is needed.
- A logged-in user's tip skips the code and starts as `pending_payment` with a `checkoutUrl`.

**What others can see**

- A tip is addressed by its `reference`, a random id, never by a number that can be counted up.
  `GET /tips/:reference` needs no login and does not include the tipper's email address.
- An author sees the tips they were paid (`paid` and `refunded` ones) with the name and message, not the
  email address. Moderators see the email address in `GET /admin/tips`.

**Paying**

- After the checkout the provider sends the tipper to `WEB_URL/tips/<reference>`, or to the same address
  with `?left=1` if they cancelled.
- When the payment goes through, the tipper is emailed a receipt and the author is told. Each is sent once,
  however many times the webhook is delivered.
- Refunding a tip's payment marks the tip `refunded`.

## The fake payment provider

With `PAYMENT_PROVIDER=fake` (the default) the provider is part of this API, so the whole system runs with
no account and no network. It behaves like a real one where it matters: the customer pays on a page the
provider serves, and the API only learns the result from a signed webhook sent over HTTP.

The checkout page has three buttons (pay, decline the card, cancel) and a choice of how the webhook is
delivered: straight away, 5 seconds after you are sent back, twice, or never.

The routes below stand in for what a real provider does on its own schedule. They need no login, because
they are the provider's side, not this API's. They do not exist when `PAYMENT_PROVIDER=stripe`.

| Method and path | Does |
| --- | --- |
| `GET /fake-pay/checkouts`, `/subscriptions`, `/events` | The newest 50 of each |
| `GET /fake-pay/checkouts/:id` | The checkout page |
| `POST /fake-pay/checkouts/:id/pay` | Pays a checkout without the page |
| `POST /fake-pay/checkouts/:id/expire` | Closes an unpaid checkout |
| `POST /fake-pay/subscriptions/:id/renew` | The next period is paid |
| `POST /fake-pay/subscriptions/:id/fail` | The renewal payment fails |
| `POST /fake-pay/subscriptions/:id/end` | The subscription is over |
| `POST /fake-pay/events/:id/resend` | Delivers an event again, unchanged |

The `pay`, `renew`, `fail` and `end` routes take an optional body `{ "delivery": "now" }`, where delivery
is `now` (the default), `later`, `twice` or `never`.

Webhooks carry the header `x-fake-pay-signature: t=<unix seconds>,v1=<hex>`, where the hex is the
HMAC-SHA256 of `<t>.<body>` under `FAKE_PAY_WEBHOOK_SECRET`. A signature older than five minutes is
rejected.

## Stripe test mode

To use Stripe instead, set in `.env`:

```sh
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...          # Stripe dashboard, test mode, API keys
STRIPE_WEBHOOK_SECRET=whsec_...        # printed by the command below
```

and forward Stripe's webhooks to the API while it runs:

```sh
stripe listen --forward-to localhost:4000/api/payments/webhook
```

Prices are sent with each checkout, so nothing has to be created in the Stripe dashboard.

## Layout

```
migrations/        numbered SQL files; the schema comes only from these
src/
  main.ts          starts the app: /api prefix, CORS, validation, error format, Swagger
  config/          reads environment variables
  database/        TypeORM connection, the migration runner, the seed, the role command
  common/          error format, validation, paging, money, the clock
  auth/            tokens, roles, and the guards that check them
  user/            register, log in, current user
  profile/         profiles, follow and unfollow
  article/         articles, tags, favorites
  comment/         comments
  tag/             the tag list
  admin/           suspending users, hiding articles, roles, the moderation log
  payment/         the payment provider: the interface, Stripe, and the fake one
  membership/      plans, a membership's status rules and history, checkout, cancel and resume
  billing/         the webhook, applying its events, refunds, the reconcile job, the admin lists
  tip/             tips, the emailed codes that confirm a guest's address
  mail/            sending email, or logging it when there is no mail server
  health/          health check
```
