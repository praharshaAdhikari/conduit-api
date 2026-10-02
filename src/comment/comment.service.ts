import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleService } from '../article/article.service';
import { forbidden, notFound } from '../common/api-error';
import { ProfileService, toProfile } from '../profile/profile.service';
import { CommentView, CreateCommentDto } from './comment.dto';
import { Comment } from './comment.entity';

@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    private readonly articles: ArticleService,
    private readonly profiles: ProfileService,
  ) {}

  /** An article's comments, newest first. */
  async list(slug: string, viewerId?: number): Promise<CommentView[]> {
    const article = await this.articles.getVisible(slug, viewerId);
    const comments = await this.comments.find({
      where: { articleId: article.id },
      relations: { author: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    const followed = await this.profiles.followedAmong(
      comments.map((comment) => comment.authorId),
      viewerId,
    );
    return comments.map((comment) =>
      this.toView(comment, followed.has(comment.authorId)),
    );
  }

  async add(
    slug: string,
    dto: CreateCommentDto,
    authorId: number,
  ): Promise<CommentView> {
    const article = await this.articles.getVisible(slug, authorId);
    const now = new Date();
    const { id } = await this.comments.save(
      this.comments.create({
        body: dto.body,
        articleId: article.id,
        authorId,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const comment = await this.comments.findOneOrFail({
      where: { id },
      relations: { author: true },
    });
    // Nobody follows themselves, so the author of a new comment is not followed.
    return this.toView(comment, false);
  }

  /** Only the comment's author can delete it. */
  async delete(slug: string, commentId: number, userId: number): Promise<void> {
    const article = await this.articles.getVisible(slug, userId);
    const comment = Number.isInteger(commentId)
      ? await this.comments.findOneBy({ id: commentId, articleId: article.id })
      : null;
    if (!comment) throw notFound('comment');
    if (comment.authorId !== userId) throw forbidden('comment');
    await this.comments.delete(comment.id);
  }

  private toView(comment: Comment, following: boolean): CommentView {
    return {
      id: comment.id,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      body: comment.body,
      author: toProfile(comment.author, following),
    };
  }
}
