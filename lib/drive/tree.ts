import { isTemporaryDriveError } from './retry';
import { DriveError, FOLDER_MIME, type DriveApi, type DriveFileMeta } from './types';

/**
 * Ancestral sem permissão (403) ou inexistente (404) significa "não dá para alcançar a árvore por aqui", não falha de sync.
 * 403 por limite de taxa ou cota é passageiro: propaga, para o ciclo falhar sem marcar o arquivo como fora da pasta.
 */
async function getAncestor(api: DriveApi, id: string): Promise<DriveFileMeta | null> {
  try {
    return await api.getFile(id);
  } catch (e) {
    if (e instanceof DriveError && ((e.status === 403 && !isTemporaryDriveError(e)) || e.status === 404)) return null;
    throw e;
  }
}

export type DriveFileWithPath = DriveFileMeta & { path: string };

/** Busca em largura a partir da pasta raiz; nunca sai da árvore e evita ciclos. */
export async function walkTree(api: DriveApi, rootId: string, rootName: string): Promise<{ files: DriveFileWithPath[]; folderPaths: Record<string, string> }> {
  const folderPaths: Record<string, string> = { [rootId]: rootName };
  const files: DriveFileWithPath[] = [];
  const queue = [rootId];
  const visited = new Set<string>();
  while (queue.length) {
    const folderId = queue.shift()!;
    if (visited.has(folderId)) continue;
    visited.add(folderId);
    for (const child of await api.listChildren(folderId)) {
      if (child.mimeType === FOLDER_MIME) {
        if (!folderPaths[child.id]) folderPaths[child.id] = `${folderPaths[folderId]}/${child.name}`;
        queue.push(child.id);
      } else {
        files.push({ ...child, path: folderPaths[folderId] });
      }
    }
  }
  return { files, folderPaths };
}

/** Decide se um arquivo vindo de changes.list está dentro da pasta monitorada (sobe pelos pais, até 10 níveis). */
export async function isInsideTree(api: DriveApi, file: DriveFileMeta, folderPaths: Record<string, string>, rootId: string): Promise<{ path: string } | null> {
  for (const parent of file.parents) if (folderPaths[parent]) return { path: folderPaths[parent] };
  for (const parent of file.parents) {
    const chain: DriveFileMeta[] = [];
    let current = await getAncestor(api, parent);
    for (let depth = 0; current && depth < 10; depth++) {
      chain.unshift(current);
      const known = current.parents.find((p) => folderPaths[p]);
      if (known) {
        let path = folderPaths[known];
        for (const folder of chain) {
          path = `${path}/${folder.name}`;
          folderPaths[folder.id] = path;
        }
        return { path };
      }
      if (current.id === rootId) return { path: folderPaths[rootId] ?? '' };
      current = current.parents[0] ? await getAncestor(api, current.parents[0]) : null;
    }
  }
  return null;
}
