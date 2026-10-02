import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column()
  slug: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'mediumtext' })
  body: string;

  @Column({ name: 'author_id', unsigned: true })
  authorId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}

@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column()
  name: string;
}

@Entity('article_tags')
export class ArticleTag {
  @PrimaryColumn({ name: 'article_id', unsigned: true })
  articleId: number;

  @PrimaryColumn({ name: 'tag_id', unsigned: true })
  tagId: number;

  @Column({ unsigned: true })
  position: number;
}

@Entity('favorites')
export class Favorite {
  @PrimaryColumn({ name: 'user_id', unsigned: true })
  userId: number;

  @PrimaryColumn({ name: 'article_id', unsigned: true })
  articleId: number;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
