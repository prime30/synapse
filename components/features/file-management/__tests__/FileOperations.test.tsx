import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileOperations } from '../FileOperations';
import { FileContextMenu } from '../FileContextMenu';
import { useFileOperations } from '@/hooks/useFileOperations';

// Mock the useFileOperations hook
vi.mock('@/hooks/useFileOperations');

const mockUseFileOperations = vi.mocked(useFileOperations);

describe('FileContextMenu', () => {
  const defaultProps = {
    x: 100,
    y: 200,
    onClose: vi.fn(),
    items: [
      { label: 'Rename', onClick: vi.fn() },
      { label: 'Delete', onClick: vi.fn(), dangerous: true },
      { label: 'Normal Item', onClick: vi.fn() },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders menu items as buttons', () => {
    render(<FileContextMenu {...defaultProps} />);

    expect(screen.getByText('Rename')).toBeDefined();
    expect(screen.getByText('Delete')).toBeDefined();
    expect(screen.getByText('Normal Item')).toBeDefined();
  });

  it('dangerous items get red text (text-red-400)', () => {
    render(<FileContextMenu {...defaultProps} />);

    const deleteButton = screen.getByText('Delete');
    expect(deleteButton.className).toContain('text-red-400');
  });

  it('non-dangerous items get gray text (text-gray-200)', () => {
    render(<FileContextMenu {...defaultProps} />);

    const renameButton = screen.getByText('Rename');
    expect(renameButton.className).toContain('text-gray-200');
  });

  it('calls onClick and onClose when item clicked', () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    render(
      <FileContextMenu
        {...defaultProps}
        onClose={onClose}
        items={[{ label: 'Test', onClick }]}
      />
    );

    const button = screen.getByText('Test');
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<FileContextMenu {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on click outside', () => {
    const onClose = vi.fn();
    const { container } = render(
      <FileContextMenu {...defaultProps} onClose={onClose} />
    );

    // Click outside the menu
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on click inside', () => {
    const onClose = vi.fn();
    render(<FileContextMenu {...defaultProps} onClose={onClose} />);

    const button = screen.getByText('Rename');
    
    // mousedown inside the menu should not trigger the click-outside handler
    // because the handler checks if the target is contained within ref.current
    fireEvent.mouseDown(button);
    
    // onClose should not be called from the click-outside handler
    // (mouseDown on button doesn't trigger button onClick, so onClose won't be called)
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('FileOperations', () => {
  const defaultProps = {
    fileId: 'file-123',
    fileName: 'test.txt',
    fileContent: 'file content',
    children: ({ onContextMenu }: { onContextMenu: (e: React.MouseEvent) => void }) => (
      <div data-testid="child-element" onContextMenu={onContextMenu}>
        Child
      </div>
    ),
  };

  const mockFileOperations = {
    renameFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    duplicateFile: vi.fn().mockResolvedValue({ id: 'file-456' }),
    downloadFile: vi.fn().mockResolvedValue(undefined),
    copyContent: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFileOperations.mockReturnValue(mockFileOperations);
  });

  it('context menu appears on right-click', () => {
    render(<FileOperations {...defaultProps} />);

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    expect(screen.getByText('Rename')).toBeDefined();
    expect(screen.getByText('Duplicate')).toBeDefined();
    expect(screen.getByText('Download')).toBeDefined();
    expect(screen.getByText('Copy Content')).toBeDefined();
    expect(screen.getByText('Delete')).toBeDefined();
  });

  it('context menu has all 5 items (Rename, Duplicate, Download, Copy Content, Delete)', () => {
    render(<FileOperations {...defaultProps} />);

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    expect(screen.getByText('Rename')).toBeDefined();
    expect(screen.getByText('Duplicate')).toBeDefined();
    expect(screen.getByText('Download')).toBeDefined();
    expect(screen.getByText('Copy Content')).toBeDefined();
    expect(screen.getByText('Delete')).toBeDefined();
  });

  it('delete item shows confirmation dialog', async () => {
    render(<FileOperations {...defaultProps} />);

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    // Context menu should close
    await waitFor(() => {
      expect(screen.queryByText('Rename')).toBeNull();
    });

    // Confirmation dialog should appear
    expect(screen.getByText(/Delete test\.txt\?/)).toBeDefined();
    expect(screen.getByText(/This cannot be undone/)).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
    expect(screen.getByText('Delete')).toBeDefined();
  });

  it('delete confirmation calls deleteFile and onDeleteComplete', async () => {
    const onDeleteComplete = vi.fn();
    render(
      <FileOperations {...defaultProps} onDeleteComplete={onDeleteComplete} />
    );

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/Delete test\.txt\?/)).toBeDefined();
    });

    const confirmButton = screen.getByText('Delete');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockFileOperations.deleteFile).toHaveBeenCalledWith('file-123');
      expect(onDeleteComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('delete confirmation cancel closes dialog', async () => {
    render(<FileOperations {...defaultProps} />);

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(/Delete test\.txt\?/)).toBeDefined();
    });

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText(/Delete test\.txt\?/)).toBeNull();
    });

    expect(mockFileOperations.deleteFile).not.toHaveBeenCalled();
  });

  it('rename item shows rename dialog', async () => {
    render(<FileOperations {...defaultProps} />);

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    const renameButton = screen.getByText('Rename');
    fireEvent.click(renameButton);

    await waitFor(() => {
      expect(screen.getByText('Rename file')).toBeDefined();
      expect(screen.getByDisplayValue('test.txt')).toBeDefined();
    });
  });

  it('rename dialog calls renameFile on submit', async () => {
    const onRenameComplete = vi.fn();
    render(
      <FileOperations {...defaultProps} onRenameComplete={onRenameComplete} />
    );

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    const renameButton = screen.getByText('Rename');
    fireEvent.click(renameButton);

    await waitFor(() => {
      expect(screen.getByDisplayValue('test.txt')).toBeDefined();
    });

    const input = screen.getByDisplayValue('test.txt');
    fireEvent.change(input, { target: { value: 'new-name.txt' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockFileOperations.renameFile).toHaveBeenCalledWith(
        'file-123',
        'new-name.txt'
      );
      expect(onRenameComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('duplicate item calls duplicateFile and onDuplicateComplete', async () => {
    const onDuplicateComplete = vi.fn();
    render(
      <FileOperations
        {...defaultProps}
        onDuplicateComplete={onDuplicateComplete}
      />
    );

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    const duplicateButton = screen.getByText('Duplicate');
    fireEvent.click(duplicateButton);

    await waitFor(() => {
      expect(mockFileOperations.duplicateFile).toHaveBeenCalledWith('file-123');
      expect(onDuplicateComplete).toHaveBeenCalledWith('file-456');
    });
  });

  it('download item calls downloadFile', async () => {
    render(<FileOperations {...defaultProps} />);

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    const downloadButton = screen.getByText('Download');
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(mockFileOperations.downloadFile).toHaveBeenCalledWith(
        'file-123',
        'test.txt'
      );
    });
  });

  it('copy content item calls copyContent', async () => {
    render(<FileOperations {...defaultProps} />);

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    const copyButton = screen.getByText('Copy Content');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockFileOperations.copyContent).toHaveBeenCalledWith(
        'file content'
      );
    });
  });

  it('context menu closes on Escape key', async () => {
    render(<FileOperations {...defaultProps} />);

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    expect(screen.getByText('Rename')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Rename')).toBeNull();
    });
  });

  it('context menu closes on click outside', async () => {
    render(<FileOperations {...defaultProps} />);

    const childElement = screen.getByTestId('child-element');
    fireEvent.contextMenu(childElement, { clientX: 100, clientY: 200 });

    expect(screen.getByText('Rename')).toBeDefined();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Rename')).toBeNull();
    });
  });
});
