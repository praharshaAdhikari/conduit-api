import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Article } from '../article/article.entity';
import { Role } from '../auth/roles';
import { forbidden, invalid, notFound } from '../common/api-error';
import { PaginationQuery } from '../common/pagination.dto';
import { User } from '../user/user.entity';
import {
  AdminArticlesQuery,
  AdminArticleView,
  AdminUsersQuery,
  AdminUserView,
  ModerationActionView,
} from './admin.dto';
import {
  ModerationAction,
  ModerationActionName,
  ModerationTargetType,
} from './moderation-action.entity';

export interface ActionTarget {
  type: ModerationTargetType;
  id: number;
  label: string;
  note: string | null;
}

/** Makes % and _ in a search term match themselves in a LIKE pattern. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

/**
 * Whether `actor` may suspend or unsuspend `target`: moderators act on
 * ordinary users only, admins on moderators too, and nobody on an admin.
 */
export function maySuspend(actor: Role, target: Role): boolean {
  if (target === 'admin') return false;
  return target === 'user' || actor === 'admin';
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectRepository(ModerationAction)
    private readonly actions: Repository<ModerationAction>,
    private readonly dataSource: DataSource,
  ) {}

  async listUsers({ search, limit, offset }: AdminUsersQuery) {
    const qb = this.users
      .createQueryBuilder('user')
      .orderBy('user.username', 'ASC');
    if (search) {
      qb.where('user.username LIKE :term OR user.email LIKE :term', {
        term: `%${escapeLike(search)}%`,
      });
    }
    const usersCount = await qb.getCount();
    const rows = await qb.limit(limit).offset(offset).getMany();
    return { users: rows.map(toUserView), usersCount };
  }

  async suspend(
    username: string,
    reason: string,
    actor: User,
  ): Promise<AdminUserView> {
    const user = await this.getUser(username);
    if (user.id === actor.id) {
      throw invalid({ user: ["can't suspend yourself"] });
    }
    if (!maySuspend(actor.role, user.role)) throw forbidden('user');
    if (user.suspendedAt !== null) {
      throw invalid({ user: ['is already suspended'] });
    }

    user.suspendedAt = new Date();
    user.suspendedReason = reason;
    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, user.id, {
        suspendedAt: user.suspendedAt,
        suspendedReason: reason,
      });
      await this.log(manager, actor, 'suspend', user, reason);
    });
    return toUserView(user);
  }

  async unsuspend(username: string, actor: User): Promise<AdminUserView> {
    const user = await this.getUser(username);
    if (!maySuspend(actor.role, user.role)) throw forbidden('user');
    if (user.suspendedAt === null) {
      throw invalid({ user: ['is not suspended'] });
    }

    user.suspendedAt = null;
    user.suspendedReason = null;
    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, user.id, {
        suspendedAt: null,
        suspendedReason: null,
      });
      await this.log(manager, actor, 'unsuspend', user, null);
    });
    return toUserView(user);
  }

  async setRole(
    username: string,
    role: Role,
    actor: User,
  ): Promise<AdminUserView> {
    const user = await this.getUser(username);
    // This also keeps at least one admin: the one making the change.
    if (user.id === actor.id) {
      throw invalid({ user: ["can't change your own role"] });
    }
    if (user.suspendedAt !== null) {
      throw invalid({ user: ['is suspended'] });
    }
    // Setting the role a user already has changes nothing and is not logged.
    if (user.role === role) return toUserView(user);

    const note = `${user.role} to ${role}`;
    user.role = role;
    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, user.id, { role });
      await this.log(manager, actor, 'set_role', user, note);
    });
    return toUserView(user);
  }

  async listArticles({ hidden, limit, offset }: AdminArticlesQuery) {
    const qb = this.articleQuery()
      .orderBy('article.createdAt', 'DESC')
      .addOrderBy('article.id', 'DESC');
    if (hidden === 'true') qb.where('article.hiddenAt IS NOT NULL');
    if (hidden === 'false') qb.where('article.hiddenAt IS NULL');

    const articlesCount = await qb.getCount();
    const rows = await qb.limit(limit).offset(offset).getMany();
    return { articles: rows.map(toArticleView), articlesCount };
  }

  async hide(
    slug: string,
    reason: string,
    actor: User,
  ): Promise<AdminArticleView> {
    const article = await this.getArticle(slug);
    if (article.hiddenAt !== null) {
      throw invalid({ article: ['is already hidden'] });
    }

    const hiddenAt = new Date();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Article, article.id, {
        hiddenAt,
        hiddenBy: actor.id,
        hiddenReason: reason,
      });
      await this.log(manager, actor, 'hide', article, reason);
    });
    return toArticleView(await this.getArticle(slug));
  }

  async unhide(slug: string, actor: User): Promise<AdminArticleView> {
    const article = await this.getArticle(slug);
    if (article.hiddenAt === null) {
      throw invalid({ article: ['is not hidden'] });
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Article, article.id, {
        hiddenAt: null,
        hiddenBy: null,
        hiddenReason: null,
      });
      await this.log(manager, actor, 'unhide', article, null);
    });
    return toArticleView(await this.getArticle(slug));
  }

  /** The moderation log, newest first. */
  async listActions({ limit, offset }: PaginationQuery) {
    const [rows, actionsCount] = await this.actions.findAndCount({
      relations: { moderator: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
    const actions = rows.map((row): ModerationActionView => ({
      id: row.id,
      action: row.action,
      moderator: row.moderator.username,
      targetType: row.targetType,
      target: row.targetLabel,
      note: row.note,
      createdAt: row.createdAt,
    }));
    return { actions, actionsCount };
  }

  /** Adds an entry to the moderation log, inside the caller's transaction. */
  async record(
    manager: EntityManager,
    actor: User,
    action: ModerationActionName,
    target: ActionTarget,
  ): Promise<void> {
    await manager.insert(ModerationAction, {
      moderatorId: actor.id,
      action,
      targetType: target.type,
      targetId: target.id,
      targetLabel: target.label,
      note: target.note,
      createdAt: new Date(),
    });
  }

  private log(
    manager: EntityManager,
    actor: User,
    action: ModerationActionName,
    target: User | Article,
    note: string | null,
  ): Promise<void> {
    const isUser = target instanceof User;
    return this.record(manager, actor, action, {
      type: isUser ? 'user' : 'article',
      id: target.id,
      label: isUser ? target.username : target.slug,
      note,
    });
  }

  private articleQuery() {
    return this.articles
      .createQueryBuilder('article')
      .innerJoinAndSelect('article.author', 'author')
      .leftJoinAndSelect('article.hiddenByUser', 'hiddenByUser');
  }

  private async getUser(username: string): Promise<User> {
    const user = await this.users.findOneBy({ username });
    if (!user) throw notFound('user');
    return user;
  }

  private async getArticle(slug: string): Promise<Article> {
    const article = await this.articleQuery()
      .where('article.slug = :slug', { slug })
      .getOne();
    if (!article) throw notFound('article');
    return article;
  }
}

function toUserView(user: User): AdminUserView {
  return {
    username: user.username,
    email: user.email,
    role: user.role,
    suspended: user.suspendedAt !== null,
    suspendedAt: user.suspendedAt,
    suspendedReason: user.suspendedReason,
    createdAt: user.createdAt,
  };
}

function toArticleView(article: Article): AdminArticleView {
  return {
    slug: article.slug,
    title: article.title,
    author: article.author.username,
    createdAt: article.createdAt,
    hidden: article.hiddenAt !== null,
    hiddenAt: article.hiddenAt,
    hiddenBy: article.hiddenByUser?.username ?? null,
    hiddenReason: article.hiddenReason,
  };
}
