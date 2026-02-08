import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileTabs } from '../useFileTabs';

describe('useFileTabs', () => {
  it('opens tab and sets as active', () => {
    const { result } = renderHook(() =>
      useFileTabs({ projectId: 'proj-1' })
    );

    act(() => {
      result.current.openTab('file-1');
    });

    expect(result.current.openTabs).toEqual(['file-1']);
    expect(result.current.activeFileId).toBe('file-1');
  });

  it('does not duplicate tab when opening same file', () => {
    const { result } = renderHook(() =>
      useFileTabs({ projectId: 'proj-1' })
    );

    act(() => {
      result.current.openTab('file-1');
      result.current.openTab('file-1');
    });

    expect(result.current.openTabs).toEqual(['file-1']);
  });

  it('closes tab and activates next', () => {
    const { result } = renderHook(() =>
      useFileTabs({ projectId: 'proj-1' })
    );

    act(() => {
      result.current.openTab('file-1');
      result.current.openTab('file-2');
      result.current.openTab('file-3');
    });

    act(() => {
      result.current.closeTab('file-2');
    });

    expect(result.current.openTabs).toEqual(['file-1', 'file-3']);
    expect(result.current.activeFileId).toBe('file-3');
  });

  it('switchTab changes active file', () => {
    const { result } = renderHook(() =>
      useFileTabs({ projectId: 'proj-1' })
    );

    act(() => {
      result.current.openTab('file-1');
      result.current.openTab('file-2');
    });

    act(() => {
      result.current.switchTab('file-1');
    });

    expect(result.current.activeFileId).toBe('file-1');
  });
});
