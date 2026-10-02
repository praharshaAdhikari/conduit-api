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
- Demo logins after `npm run seed`: `alice@example.com`, `bob@example.com`, `carol@example.com`,
  all with the password `password123`

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
| `npm run seed` | Adds the demo data; does nothing if it is already there |

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
| `GET /health` | none | Whether the API can reach the database |

Errors always have the body `{ "errors": { "<field>": ["<message>"] } }`:

| Status | When |
| --- | --- |
| 401 | The token is missing or invalid, or the login is wrong |
| 403 | The article or comment belongs to someone else |
| 404 | The article, comment or profile does not exist |
| 409 | The username or email is already taken |
| 422 | A field is missing, blank or malformed |

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

## Layout

```
migrations/        numbered SQL files; the schema comes only from these
src/
  main.ts          starts the app: /api prefix, CORS, validation, error format, Swagger
  config/          reads environment variables
  database/        TypeORM connection, the migration runner, the seed
  common/          error format, validation, paging
  auth/            tokens and the guards that check them
  user/            register, log in, current user
  profile/         profiles, follow and unfollow
  article/         articles, tags, favorites
  comment/         comments
  tag/             the tag list
  health/          health check
```
