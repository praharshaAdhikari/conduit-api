import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminService } from '../admin/admin.service';
import { AppModule } from '../app.module';
import { ArticleService } from '../article/article.service';
import { Role } from '../auth/roles';
import { CommentService } from '../comment/comment.service';
import { databaseSettings } from '../config/env';
import { ProfileService } from '../profile/profile.service';
import { User } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { loadEnvFile } from './load-env';

// Demo data for a local database. It is added in steps, and each step is
// skipped when its data is already there, so running the seed again changes
// nothing and running it after an upgrade adds only what is new.

export const DEMO_PASSWORD = 'password123';
const USERS = ['alice', 'bob', 'carol'];
const STAFF: { username: string; role: Role }[] = [
  { username: 'mod', role: 'moderator' },
  { username: 'admin', role: 'admin' },
];

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

class Seeder {
  private readonly users: Repository<User>;
  private readonly userService: UserService;

  constructor(private readonly app: INestApplicationContext) {
    this.users = app.get<Repository<User>>(getRepositoryToken(User));
    this.userService = app.get(UserService);
  }

  private exists(username: string): Promise<boolean> {
    return this.users.existsBy({ username });
  }

  private async register(username: string): Promise<User> {
    await this.userService.register({
      username,
      email: `${username}@example.com`,
      password: DEMO_PASSWORD,
    });
    return this.users.findOneByOrFail({ username });
  }

  /** Three users who follow, favorite and comment on each other's articles. */
  async writers(): Promise<string | null> {
    if (await this.exists(USERS[0])) return null;
    const articles = this.app.get(ArticleService);
    const comments = this.app.get(CommentService);
    const profiles = this.app.get(ProfileService);

    const ids = new Map<string, number>();
    for (const username of USERS) {
      ids.set(username, (await this.register(username)).id);
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

    return `${USERS.length} users (${USERS.join(', ')}) and ${ARTICLES.length} articles`;
  }

  /** A moderator and an admin. */
  async staff(): Promise<string | null> {
    if (await this.exists(STAFF[0].username)) return null;
    for (const { username, role } of STAFF) {
      const user = await this.register(username);
      await this.users.update(user.id, { role });
    }
    return STAFF.map(({ username, role }) => `${username} (${role})`).join(
      ' and ',
    );
  }

  /** A suspended user whose one article a moderator has hidden. */
  async moderated(): Promise<string | null> {
    if (await this.exists('dave')) return null;
    const articles = this.app.get(ArticleService);
    const admin = this.app.get(AdminService);
    const moderator = await this.users.findOneByOrFail({
      username: STAFF[0].username,
    });

    const dave = await this.register('dave');
    const { slug } = await articles.create(
      {
        title: 'Ten thousand followers overnight',
        description: 'Limited offer',
        body: 'Visit my site and pay now. This offer ends today.',
        tagList: ['offer'],
      },
      dave.id,
    );
    await admin.hide(slug, 'Advertising', moderator);
    await admin.suspend('dave', 'Posted advertising', moderator);
    return 'dave (suspended) and his hidden article';
  }
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
    const seeder = new Seeder(app);
    const added = [
      await seeder.writers(),
      await seeder.staff(),
      await seeder.moderated(),
    ].filter((step) => step !== null);

    if (added.length === 0) {
      console.log('demo data is already there');
    } else {
      added.forEach((step) => console.log(`seeded ${step}`));
      console.log(`every demo account has the password "${DEMO_PASSWORD}"`);
    }
  } finally {
    await app.close();
  }
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
