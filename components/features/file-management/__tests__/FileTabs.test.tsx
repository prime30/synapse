import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileTabs } from '../FileTabs';

describe('FileTabs', () => {
  const defaultProps = {
    openTabs: ['file-1', 'file-2'],
    activeFileId: 'file-1',
    unsavedFileIds: new Set<string>(),
    fileMetaMap: new Map([
      ['file-1', { id: 'file-1', name: 'product.liquid' }],
      ['file-2', { id: 'file-2', name: 'theme.js' }],
    ]),
    onTabSelect: () => {},
    onTabClose: () => {},
    onAddFile: () => {},
    onNextTab: () => {},
    onPrevTab: () => {},
  };

  it('renders open tabs', () => {
    render(<FileTabs {...defaultProps} />);
    expect(screen.getByText(/product/)).toBeDefined();
    expect(screen.getByText(/theme/)).toBeDefined();
  });

  it('renders add button', () => {
    render(<FileTabs {...defaultProps} />);
    expect(screen.getByRole('button', { name: /add file/i })).toBeDefined();
  });
});
