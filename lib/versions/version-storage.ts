import { VersionService } from './version-service';

const versionService = new VersionService();

export async function createFileVersion(
  fileId: string,
  content: string,
  userId: string,
  summary?: string
) {
  return versionService.createVersion(fileId, content, userId, summary);
}

export async function listFileVersions(fileId: string, limit = 20, offset = 0) {
  return versionService.getVersionChain(fileId, limit, offset);
}

export async function getFileVersion(versionId: string) {
  return versionService.getVersion(versionId);
}
