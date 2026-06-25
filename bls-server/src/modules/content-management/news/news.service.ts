import { ValidationError } from '../../../core/errors';
import { NewsArticleInput, NewsRepository } from './news.repository';

export class NewsService {
  constructor(private readonly repository = new NewsRepository()) {}

  list(pageNum?: number, pageSize?: number, keyword?: string) {
    return this.repository.list(pageNum, pageSize, keyword);
  }

  detail(id: string) {
    return this.repository.detail(id);
  }

  add(input: NewsArticleInput) {
    return this.repository.add(input);
  }

  async edit(id: string, input: NewsArticleInput) {
    await this.repository.edit(id, input);
  }

  async remove(ids: string[]) {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.remove(ids);
  }
}
