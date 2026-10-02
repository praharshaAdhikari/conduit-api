import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ArticleTag, Tag } from '../article/article.entity';

@ApiTags('tags')
@Controller('tags')
export class TagController {
  constructor(private readonly dataSource: DataSource) {}

  /** Tags that at least one article uses, most used first. */
  @Get()
  async list() {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('tag.name', 'name')
      .from(Tag, 'tag')
      .innerJoin(ArticleTag, 'link', 'link.tagId = tag.id')
      .groupBy('tag.id')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('tag.name', 'ASC')
      .getRawMany<{ name: string }>();
    return { tags: rows.map((row) => row.name) };
  }
}
