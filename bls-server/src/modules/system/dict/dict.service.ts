import { NotFoundError, ValidationError } from '../../../core/errors';
import { DictDataInput, DictDataQuery, DictTypeInput, DictTypeQuery } from './dict.model';
import { DictRepository } from './dict.repository';

export class DictService {
  constructor(private readonly repository = new DictRepository()) {}

  listTypes(query: DictTypeQuery) {
    return this.repository.listTypes(query);
  }

  async addType(input: DictTypeInput): Promise<string> {
    const exists = await this.repository.findTypeByCode(input.dictType);
    if (exists) throw new ValidationError('字典类型已存在');
    return this.repository.createType(input);
  }

  async editType(input: DictTypeInput & { dictTypeId: string }): Promise<void> {
    const old = await this.repository.findTypeById(input.dictTypeId);
    if (!old) throw new NotFoundError('字典类型不存在');
    await this.repository.updateType(input);
  }

  async removeTypes(ids: string[]): Promise<void> {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.removeTypes(ids);
  }

  listDataByType(dictType: string) {
    return this.repository.listDataByType(dictType);
  }

  listData(query: DictDataQuery) {
    return this.repository.listData(query);
  }

  async addData(input: DictDataInput): Promise<string> {
    const dictType = await this.repository.findTypeById(input.dictTypeId);
    if (!dictType) throw new NotFoundError('字典类型不存在');
    return this.repository.createData(input);
  }

  async editData(input: DictDataInput & { dictDataId: string }): Promise<void> {
    const dictType = await this.repository.findTypeById(input.dictTypeId);
    if (!dictType) throw new NotFoundError('字典类型不存在');
    await this.repository.updateData(input);
  }

  async removeData(ids: string[]): Promise<void> {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.removeData(ids);
  }
}
