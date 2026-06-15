import { NotFoundError, ValidationError } from '../../../core/errors';
import { Dept, DeptInput, DeptQuery } from './dept.model';
import { DeptRepository } from './dept.repository';

function buildDeptTree(rows: Dept[]): Dept[] {
  const map = new Map<string, Dept>();
  const roots: Dept[] = [];

  rows.forEach((row) => {
    map.set(row.deptId, { ...row, children: [] });
  });

  map.forEach((dept) => {
    const parent = map.get(dept.parentId);
    if (parent && dept.deptId !== dept.parentId) {
      parent.children?.push(dept);
    } else {
      roots.push(dept);
    }
  });

  return roots;
}

export class DeptService {
  constructor(private readonly repository = new DeptRepository()) {}

  async list(query: DeptQuery): Promise<Dept[]> {
    const rows = await this.repository.list(query);
    return buildDeptTree(rows);
  }

  add(input: DeptInput): Promise<string> {
    if (input.parentId && input.parentId !== '000000') {
      return this.repository.findById(input.parentId).then((parent) => {
        if (!parent) throw new ValidationError('父部门不存在');
        return this.repository.create(input);
      });
    }
    return this.repository.create(input);
  }

  async edit(input: DeptInput & { deptId: string }): Promise<void> {
    const old = await this.repository.findById(input.deptId);
    if (!old) throw new NotFoundError('部门不存在');
    if (input.parentId === input.deptId) throw new ValidationError('父部门不能选择自己');
    if (input.parentId && input.parentId !== '000000') {
      const parent = await this.repository.findById(input.parentId);
      if (!parent) throw new ValidationError('父部门不存在');
    }
    await this.repository.update(input);
  }

  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    for (const id of ids) {
      if (await this.repository.hasChildren(id)) throw new ValidationError('存在子部门，不允许删除');
    }
    await this.repository.remove(ids);
  }
}
