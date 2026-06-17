import { getPageParams } from '../../../shared/utils/pagination';
import { LogRepository } from './log.repository';
import { LoginLogQuery, OperationLogQuery, UploadAuditQuery } from './log.model';

export class LogService {
  constructor(private readonly repository = new LogRepository()) {}

  listLoginLogs(query: LoginLogQuery) {
    return this.repository.listLoginLogs(query, getPageParams(query));
  }

  listOperationLogs(query: OperationLogQuery) {
    return this.repository.listOperationLogs(query, getPageParams(query));
  }

  listUploadAudits(query: UploadAuditQuery) {
    return this.repository.listUploadAudits(query, getPageParams(query));
  }
}
