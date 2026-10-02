import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { hasRole } from '../auth/roles';
import { forbidden, notFound } from '../common/api-error';
import { PaginationQuery } from '../common/pagination.dto';
import { ProfileService, toProfile } from '../profile/profile.service';
import { User } from '../user/user.entity';
import {
  ArticlePreview,
  ArticleView,
  CreateArticleDto,
  ListArticlesQuery,
  UpdateArticleDto,
} from './article.dto';
import { Article, ArticleTag, Favorite, Tag } from './article.entity';
import { slugify, withSuffix } from './slug';
import { normalizeTags } from './tags';

function isDuplicateKey(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

@Injectable()
export class ArticleService {
  constructor(
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectRepository(Favorite)
    private readonly favorites: Repository<Favorite>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly profiles: ProfileService,
  ) {}

  list(query: ListArticlesQuery, viewerId?: number) {
    const qb = this.baseQuery();
    if (query.author !== undefined) {
      qb.andWhere('author.username = :author', { author: query.author });
    }
    if (query.tag !== undefined) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM article_tags at
                 INNER JOIN tags t ON t.id = at.tag_id
                 WHERE at.article_id = article.id AND t.name = :tag)`,
        { tag: query.tag },
      );
    }
    if (query.favorited !== undefined) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM favorites f
                 INNER JOIN users fu ON fu.id = f.user_id
                 WHERE f.article_id = article.id AND fu.username = :favorited)`,
        { favorited: query.favorited },
      );
    }
    return this.page(qb, query, viewerId);
  }

  /** Articles by the users the viewer follows. */
  feed(query: PaginationQuery, viewerId: number) {
    const qb = this.baseQuery().andWhere(
      `EXISTS (SELECT 1 FROM follows fo
               WHERE fo.followed_id = article.author_id AND fo.follower_id = :viewerId)`,
      { viewerId },
    );
    return this.page(qb, query, viewerId);
  }

  async get(slug: string, viewerId?: number): Promise<ArticleView> {
    return this.view(await this.getVisible(slug, viewerId), viewerId);
  }

  async create(dto: CreateArticleDto, authorId: number): Promise<ArticleView> {
    const now = new Date();
    const tags = normalizeTags(dto.tagList ?? []);
    const base = slugify(dto.title);

    const insert = (slug: string) =>
      this.dataSource.transaction(async (manager) => {
        const article = await manager.save(
          manager.create(Article, {
            slug,
            title: dto.title,
            description: dto.description,
            body: dto.body,
            authorId,
            hiddenAt: null,
            hiddenBy: null,
            hiddenReason: null,
            createdAt: now,
            updatedAt: now,
          }),
        );
        await this.setTags(manager, article.id, tags);
        return article;
      });

    const created = await this.withFreeSlug(base, undefined, insert);
    return this.get(created.slug, authorId);
  }

  async update(
    slug: string,
    dto: UpdateArticleDto,
    userId: number,
  ): Promise<ArticleView> {
    const article = await this.getOwn(slug, userId);
    const titleChanged = dto.title !== undefined && dto.title !== article.title;

    if (dto.title !== undefined) article.title = dto.title;
    if (dto.description !== undefined) article.description = dto.description;
    if (dto.body !== undefined) article.body = dto.body;
    article.updatedAt = new Date();

    const save = (newSlug: string) =>
      this.dataSource.transaction(async (manager) => {
        // update(), not save(): the loaded author relation must not be written.
        await manager.update(Article, article.id, {
          slug: newSlug,
          title: article.title,
          description: article.description,
          body: article.body,
          updatedAt: article.updatedAt,
        });
        if (dto.tagList !== undefined) {
          await this.setTags(manager, article.id, normalizeTags(dto.tagList));
        }
        return newSlug;
      });

    // The slug follows the title; it stays as it is when the title does.
    const newSlug = titleChanged
      ? await this.withFreeSlug(slugify(article.title), article.id, save)
      : await save(article.slug);
    return this.get(newSlug, userId);
  }

  async delete(slug: string, userId: number): Promise<void> {
    const article = await this.getOwn(slug, userId);
    // Its tags links, favorites and comments go with it (ON DELETE CASCADE).
    await this.articles.delete(article.id);
  }

  async favorite(slug: string, userId: number): Promise<ArticleView> {
    const article = await this.getVisible(slug, userId);
    // Favoriting twice is not an error; it counts once.
    await this.favorites
      .createQueryBuilder()
      .insert()
      .values({ userId, articleId: article.id, createdAt: new Date() })
      .orIgnore()
      .execute();
    return this.view(article, userId);
  }

  async unfavorite(slug: string, userId: number): Promise<ArticleView> {
    const article = await this.getVisible(slug, userId);
    await this.favorites.delete({ userId, articleId: article.id });
    return this.view(article, userId);
  }

  async getBySlug(slug: string): Promise<Article> {
    const article = await this.articles.findOne({
      where: { slug },
      relations: { author: true },
    });
    if (!article) throw notFound('article');
    return article;
  }

  /**
   * The article as this viewer may see it: a hidden one is a 404 for everyone
   * but its author and moderators.
   */
  async getVisible(slug: string, viewerId?: number): Promise<Article> {
    const article = await this.getBySlug(slug);
    if (
      article.hiddenAt !== null &&
      !(await this.maySeeHidden(article, viewerId))
    ) {
      throw notFound('article');
    }
    return article;
  }

  private async maySeeHidden(
    article: Article,
    viewerId?: number,
  ): Promise<boolean> {
    if (viewerId === undefined) return false;
    if (article.authorId === viewerId) return true;
    const viewer = await this.users.findOneBy({ id: viewerId });
    return viewer !== null && hasRole(viewer.role, 'moderator');
  }

  // The author may edit or delete their article while it is hidden.
  private async getOwn(slug: string, userId: number): Promise<Article> {
    const article = await this.getBySlug(slug);
    if (article.authorId !== userId) throw forbidden('article');
    return article;
  }

  private baseQuery(): SelectQueryBuilder<Article> {
    return (
      this.articles
        .createQueryBuilder('article')
        .innerJoinAndSelect('article.author', 'author')
        // Hidden articles are in no list, not even their author's.
        .where('article.hiddenAt IS NULL')
        .orderBy('article.createdAt', 'DESC')
        .addOrderBy('article.id', 'DESC')
    );
  }

  private async page(
    qb: SelectQueryBuilder<Article>,
    { limit, offset }: PaginationQuery,
    viewerId?: number,
  ) {
    const articlesCount = await qb.getCount();
    const rows = await qb.limit(limit).offset(offset).getMany();
    const articles = (await this.present(rows, viewerId)).map(
      // Lists leave the body out; it is only returned for a single article.
      ({ body, hidden, hiddenReason, ...preview }): ArticlePreview => preview,
    );
    return { articles, articlesCount };
  }

  private async view(
    article: Article,
    viewerId?: number,
  ): Promise<ArticleView> {
    return (await this.present([article], viewerId))[0];
  }

  /** Adds tags, favorite counts and what the viewer favorited or follows. */
  private async present(
    articles: Article[],
    viewerId?: number,
  ): Promise<ArticleView[]> {
    if (articles.length === 0) return [];
    const ids = articles.map((article) => article.id);

    const tagRows = await this.dataSource
      .createQueryBuilder()
      .select('link.articleId', 'articleId')
      .addSelect('tag.name', 'name')
      .from(ArticleTag, 'link')
      .innerJoin(Tag, 'tag', 'tag.id = link.tagId')
      .where('link.articleId IN (:...ids)', { ids })
      .orderBy('link.position', 'ASC')
      .getRawMany<{ articleId: number; name: string }>();

    const countRows = await this.favorites
      .createQueryBuilder('favorite')
      .select('favorite.articleId', 'articleId')
      .addSelect('COUNT(*)', 'count')
      .where('favorite.articleId IN (:...ids)', { ids })
      .groupBy('favorite.articleId')
      .getRawMany<{ articleId: number; count: string }>();

    const favorited =
      viewerId === undefined
        ? []
        : await this.favorites.findBy({ userId: viewerId, articleId: In(ids) });
    const followed = await this.profiles.followedAmong(
      articles.map((article) => article.authorId),
      viewerId,
    );

    const counts = new Map(
      countRows.map((row) => [row.articleId, Number(row.count)]),
    );
    const favoritedIds = new Set(favorited.map((row) => row.articleId));

    return articles.map((article) => ({
      slug: article.slug,
      title: article.title,
      description: article.description,
      body: article.body,
      tagList: tagRows
        .filter((row) => row.articleId === article.id)
        .map((row) => row.name),
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      favorited: favoritedIds.has(article.id),
      favoritesCount: counts.get(article.id) ?? 0,
      hidden: article.hiddenAt !== null,
      hiddenReason: article.hiddenReason,
      author: toProfile(article.author, followed.has(article.authorId)),
    }));
  }

  /** Replaces an article's tags, creating any tag that does not exist yet. */
  private async setTags(
    manager: EntityManager,
    articleId: number,
    names: string[],
  ): Promise<void> {
    await manager.delete(ArticleTag, { articleId });
    if (names.length === 0) return;

    await manager
      .createQueryBuilder()
      .insert()
      .into(Tag)
      .values(names.map((name) => ({ name })))
      .orIgnore()
      .execute();
    const tags = await manager.findBy(Tag, { name: In(names) });
    const idByName = new Map(tags.map((tag) => [tag.name, tag.id]));

    await manager.insert(
      ArticleTag,
      names.map((name, position) => ({
        articleId,
        tagId: idByName.get(name),
        position,
      })),
    );
  }

  /**
   * Runs `write` with a slug no other article uses: the plain one if it is
   * free, otherwise one with a random suffix. If another request takes the
   * slug in between, the unique key rejects the write and it is retried.
   */
  private async withFreeSlug<T>(
    base: string,
    ownArticleId: number | undefined,
    write: (slug: string) => Promise<T>,
  ): Promise<T> {
    const holder = await this.articles.findOneBy({ slug: base });
    const free = !holder || holder.id === ownArticleId;
    try {
      return await write(free ? base : withSuffix(base));
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return write(withSuffix(base));
    }
  }
}
