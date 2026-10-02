import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { ArticleService } from '../article/article.service';
import { CommentService } from '../comment/comment.service';
import { databaseSettings } from '../config/env';
import { ProfileService } from '../profile/profile.service';
import { User } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { loadEnvFile } from './load-env';

// Demo data for a local database: three users who follow, favorite and comment
// on each other's articles. Running it again changes nothing.

export const DEMO_PASSWORD = 'password123';
const USERS = ['alice', 'bob', 'carol'];

const ARTICLES = [
  {
    author: 'alice',
    title: 'Welcome to Conduit',
    description: 'What this demo site is for',
    body: 'Conduit is a small blogging platform. This copy of it exists to practise testing on.',
    tagList: ['welcome', 'conduit'],
  },
  {
    author: 'alice',
    title: 'Writing a useful bug report',
    description: 'Steps, expected, actual',
    body: 'A report someone can act on says what you did, what you expected and what happened instead.',
    tagList: ['testing', 'bugs'],
  },
  {
    author: 'bob',
    title: 'Why tests go at different levels',
    description: 'Unit, integration and end-to-end',
    body: 'Fast tests for logic, slower ones for the database, and a few for the whole system.',
    tagList: ['testing', 'strategy'],
  },
  {
    author: 'carol',
    title: 'Notes on pagination',
    description: 'Limits, offsets and off-by-one errors',
    body: 'The first page and the last page are where list endpoints usually go wrong.',
    tagList: ['api'],
  },
];

/** The seed only writes to this machine, or to the one host named in SEED_DB_HOST. */
export function mayBeSeeded(host: string, allowedHost?: string): boolean {
  return (
    ['localhost', '127.0.0.1', '::1'].includes(host) || host === allowedHost
  );
}

async function seed(): Promise<void> {
  loadEnvFile();
  const { host } = databaseSettings();
  if (!mayBeSeeded(host, process.env.SEED_DB_HOST)) {
    throw new Error(
      `Refusing to seed the database on "${host}": it is not this machine. ` +
        'Set SEED_DB_HOST to that host name if it really is a throwaway database.',
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const users = app.get<Repository<User>>(getRepositoryToken(User));
    if (await users.existsBy({ username: USERS[0] })) {
      console.log('demo data is already there');
      return;
    }

    const userService = app.get(UserService);
    const articles = app.get(ArticleService);
    const comments = app.get(CommentService);
    const profiles = app.get(ProfileService);

    const ids = new Map<string, number>();
    for (const username of USERS) {
      await userService.register({
        username,
        email: `${username}@example.com`,
        password: DEMO_PASSWORD,
      });
      const user = await users.findOneByOrFail({ username });
      ids.set(username, user.id);
    }
    const id = (username: string) => ids.get(username)!;

    const slugs: string[] = [];
    for (const { author, ...article } of ARTICLES) {
      slugs.push((await articles.create(article, id(author))).slug);
    }

    await profiles.follow('alice', id('bob'));
    await profiles.follow('alice', id('carol'));
    await profiles.follow('bob', id('alice'));

    await articles.favorite(slugs[0], id('bob'));
    await articles.favorite(slugs[0], id('carol'));
    await articles.favorite(slugs[2], id('alice'));

    await comments.add(slugs[0], { body: 'Glad to be here.' }, id('bob'));
    await comments.add(
      slugs[2],
      { body: 'Which level do you start with?' },
      id('carol'),
    );
    await comments.add(
      slugs[2],
      { body: 'Whichever finds the bug cheapest.' },
      id('bob'),
    );

    console.log(
      `seeded ${USERS.length} users (${USERS.join(', ')}; password "${DEMO_PASSWORD}") and ${ARTICLES.length} articles`,
    );
  } finally {
    await app.close();
  }
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
