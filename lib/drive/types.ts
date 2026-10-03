export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const GDOC_MIME = 'application/vnd.google-apps.document';
export const GSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum: string | null;
  version: string | null;
  webViewLink: string;
  parents: string[];
  trashed: boolean;
  canDownload: boolean;
}

export interface DriveChange {
  fileId: string;
  removed: boolean;
  file: DriveFileMeta | null;
}

export interface DriveApi {
  listChildren(folderId: string): Promise<DriveFileMeta[]>;
  getFile(id: string): Promise<DriveFileMeta | null>;
  download(id: string): Promise<Buffer>;
  exportFile(id: string, mimeType: string): Promise<Buffer>;
  getStartPageToken(): Promise<string>;
  listChanges(pageToken: string): Promise<{ changes: DriveChange[]; newStartPageToken: string }>;
}

export class DriveError extends Error {
  constructor(message: string, public status: number, public reason: string | null = null) {
    super(message);
  }
}
