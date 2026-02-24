'use client';

import { useState, useCallback, useRef } from 'react';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export interface AttachedImage {
  file: File;
  preview: string;
}

export interface AttachedFile {
  id: string;
  name: string;
  path: string;
}

export interface UseChatAttachmentsReturn {
  /** Single image attachment (for paste/drop/select) */
  attachedImage: AttachedImage | null;
  /** Files attached from file tree drag-and-drop */
  attachedFiles: AttachedFile[];
  /** Whether an image is currently uploading */
  isUploadingImage: boolean;
  /** Whether the user is dragging files over the drop zone */
  isDraggingOver: boolean;
  /** Ref for the hidden file input element */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  /** Add an image attachment (validates type and size) */
  addImage: (file: File) => void;
  /** Remove the image attachment */
  removeImage: () => void;
  /** Remove an attached file by id */
  removeAttachedFile: (fileId: string) => void;
  /** Add an attached file (from file tree drag) */
  addAttachedFile: (file: AttachedFile) => void;
  /** Handle paste event (extract image from clipboard) */
  handlePaste: (e: React.ClipboardEvent) => void;
  /** Handle drag over (set isDraggingOver) */
  handleDragOver: (e: React.DragEvent) => void;
  /** Handle drag leave (clear isDraggingOver) */
  handleDragLeave: (e: React.DragEvent) => void;
  /** Handle drop (images or synapse-file from file tree) */
  handleDrop: (e: React.DragEvent) => void;
  /** Handle file input change (image selection) */
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Clear all attachments */
  clearAttachments: () => void;
  /** Set uploading state (caller uses when submitting with image) */
  setUploading: (uploading: boolean) => void;
}

/**
 * Manages image and file attachments for chat input: paste, drag-drop,
 * file selection, and synapse-file (file tree) drops.
 */
export function useChatAttachments(): UseChatAttachmentsReturn {
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(
    null
  );
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addImage = useCallback((file: File) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) return;
    if (file.size > MAX_IMAGE_SIZE) return;
    const preview = URL.createObjectURL(file);
    setAttachedImage({ file, preview });
  }, []);

  const removeImage = useCallback(() => {
    setAttachedImage((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return null;
    });
  }, []);

  const addAttachedFile = useCallback((file: AttachedFile) => {
    setAttachedFiles((prev) => {
      if (prev.some((f) => f.id === file.id || f.path === file.path))
        return prev;
      return [...prev, file];
    });
  }, []);

  const removeAttachedFile = useCallback((fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            addImage(file);
            return;
          }
        }
      }
    },
    [addImage]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);

      // Handle file drops from file tree (synapse-file)
      const synapseFile = e.dataTransfer.getData('application/synapse-file');
      if (synapseFile) {
        try {
          const fileData = JSON.parse(synapseFile) as AttachedFile;
          addAttachedFile(fileData);
          return;
        } catch {
          /* ignore parse errors */
        }
      }

      // Handle image drops
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          addImage(files[i]);
          return;
        }
      }
    },
    [addImage, addAttachedFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) addImage(file);
      if (e.target) (e.target as HTMLInputElement).value = '';
    },
    [addImage]
  );

  const clearAttachments = useCallback(() => {
    setAttachedImage((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return null;
    });
    setAttachedFiles([]);
  }, []);

  const setUploading = useCallback((uploading: boolean) => {
    setIsUploadingImage(uploading);
  }, []);

  return {
    attachedImage,
    attachedFiles,
    isUploadingImage,
    isDraggingOver,
    fileInputRef,
    addImage,
    removeImage,
    removeAttachedFile,
    addAttachedFile,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    clearAttachments,
    setUploading,
  };
}
