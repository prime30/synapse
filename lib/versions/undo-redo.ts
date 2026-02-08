import type { FileVersion } from "@/lib/types/version";
import { createClient } from "@/lib/supabase/server";

export class UndoRedoManager {
  async undo(
    fileId: string,
    currentVersionNumber: number
  ): Promise<FileVersion> {
    const targetVersion = currentVersionNumber - 1;

    if (targetVersion < 1) {
      throw new Error("No more undo available");
    }

    const version = await this.getVersionByNumber(fileId, targetVersion);

    if (!version) {
      throw new Error("No more undo available");
    }

    return version;
  }

  async redo(
    fileId: string,
    currentVersionNumber: number
  ): Promise<FileVersion> {
    const targetVersion = currentVersionNumber + 1;

    const version = await this.getVersionByNumber(fileId, targetVersion);

    if (!version) {
      throw new Error("No more redo available");
    }

    return version;
  }

  async canUndo(
    fileId: string,
    currentVersionNumber: number
  ): Promise<boolean> {
    if (currentVersionNumber <= 1) {
      return false;
    }

    const version = await this.getVersionByNumber(
      fileId,
      currentVersionNumber - 1
    );
    return version !== null;
  }

  async canRedo(
    fileId: string,
    currentVersionNumber: number
  ): Promise<boolean> {
    const version = await this.getVersionByNumber(
      fileId,
      currentVersionNumber + 1
    );
    return version !== null;
  }

  private async getVersionByNumber(
    fileId: string,
    versionNumber: number
  ): Promise<FileVersion | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("file_versions")
      .select("*")
      .eq("file_id", fileId)
      .eq("version_number", versionNumber)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get version: ${error.message}`);
    }

    return (data as FileVersion) ?? null;
  }
}
