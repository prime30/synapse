import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileUploadModal } from '../FileUploadModal';

describe('FileUploadModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <FileUploadModal
        projectId="proj-1"
        isOpen={false}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with tabs when open', () => {
    render(
      <FileUploadModal
        projectId="proj-1"
        isOpen
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/add file to project/i)).toBeDefined();
    expect(screen.getByText(/copy-paste/i)).toBeDefined();
    expect(screen.getByText(/upload file/i)).toBeDefined();
  });
});
