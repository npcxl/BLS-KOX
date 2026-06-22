import { GlobalSearchRepository } from './global-search.repository';
import { syncSearchIndexForDelete, syncSearchIndexForInsert, syncSearchIndexForUpdate } from './global-search-index-sync';

const repo = new GlobalSearchRepository();

export async function onGlobalSearchInsert(table: string, row: Record<string, unknown>) {
  await syncSearchIndexForInsert(repo, table, row);
}

export async function onGlobalSearchUpdate(table: string, row: Record<string, unknown>) {
  await syncSearchIndexForUpdate(repo, table, row);
}

export async function onGlobalSearchDelete(table: string, row: Record<string, unknown>) {
  await syncSearchIndexForDelete(repo, table, row);
}
