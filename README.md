# conduit-api

The backend of Conduit, a small blogging platform: an implementation of the
[RealWorld](https://github.com/realworld-apps/realworld) API spec on NestJS 11, TypeORM and MySQL 8.

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
| `GET /health` | none | Whether the API can reach the database |

Errors always have the body `{ "errors": { "<field>": ["<message>"] } }`:

| Status | When |
| --- | --- |
| 401 | The token is missing or invalid, or the login is wrong |
| 403 | The article or comment belongs to someone else, the account is suspended, or its role does not allow the action |
| 404 | The article, comment, profile or user does not exist, or the article is hidden from you |
| 409 | The username or email is already taken |
| 422 | A field is missing, blank or malformed, or the action does not apply (for example, hiding an article that is already hidden) |

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

## Layout

```
migrations/        numbered SQL files; the schema comes only from these
src/
  main.ts          starts the app: /api prefix, CORS, validation, error format, Swagger
  config/          reads environment variables
  database/        TypeORM connection, the migration runner, the seed, the role command
  common/          error format, validation, paging
  auth/            tokens, roles, and the guards that check them
  user/            register, log in, current user
  profile/         profiles, follow and unfollow
  article/         articles, tags, favorites
  comment/         comments
  tag/             the tag list
  admin/           suspending users, hiding articles, roles, the moderation log
  health/          health check
```
