import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileListControls } from '../FileListControls';
import type { FileType } from '@/lib/types/files';

describe('FileListControls', () => {
  const defaultProps = {
    search: '',
    onSearchChange: vi.fn(),
    sort: 'name' as const,
    onSortChange: vi.fn(),
    filter: 'all' as FileType | 'all',
    onFilterChange: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders search input', () => {
    render(<FileListControls {...defaultProps} />);
    const input = screen.getByPlaceholderText(/search files/i) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('');
  });

  it('updates search input value', () => {
    render(<FileListControls {...defaultProps} />);

    const input = screen.getByPlaceholderText(/search files/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });

    expect(input.value).toBe('test');
  });

  it('debounces search change callback (300ms)', () => {
    const onSearchChange = vi.fn();
    render(<FileListControls {...defaultProps} onSearchChange={onSearchChange} />);

    const input = screen.getByPlaceholderText(/search files/i);
    fireEvent.change(input, { target: { value: 'test' } });

    // Should not be called immediately
    expect(onSearchChange).not.toHaveBeenCalled();

    // Fast-forward 300ms
    vi.advanceTimersByTime(300);

    // Now it should be called
    expect(onSearchChange).toHaveBeenCalledWith('test');
    expect(onSearchChange).toHaveBeenCalledTimes(1);
  });

  it('renders filter buttons (All, Liquid, JavaScript, CSS)', () => {
    render(<FileListControls {...defaultProps} />);

    expect(screen.getByRole('button', { name: /^all$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^liquid$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^javascript$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^css$/i })).toBeDefined();
  });

  it('calls onFilterChange when filter button clicked', () => {
    const onFilterChange = vi.fn();
    render(<FileListControls {...defaultProps} onFilterChange={onFilterChange} />);

    const liquidButton = screen.getByRole('button', { name: /^liquid$/i });
    fireEvent.click(liquidButton);

    expect(onFilterChange).toHaveBeenCalledWith('liquid');
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it('highlights active filter with blue background', () => {
    render(<FileListControls {...defaultProps} filter="liquid" />);

    const liquidButton = screen.getByRole('button', { name: /^liquid$/i });
    expect(liquidButton.className).toContain('bg-sky-500');
    expect(liquidButton.className).toContain('text-white');
  });

  it('does not highlight inactive filters', () => {
    render(<FileListControls {...defaultProps} filter="liquid" />);

    const allButton = screen.getByRole('button', { name: /^all$/i });
    expect(allButton.className).toContain('ide-surface-panel');
    expect(allButton.className).not.toContain('bg-sky-500');
  });

  it('renders sort dropdown with options', () => {
    render(<FileListControls {...defaultProps} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeDefined();

    // Check that all sort options are present
    expect(screen.getByRole('option', { name: /sort: name/i })).toBeDefined();
    expect(screen.getByRole('option', { name: /sort: type/i })).toBeDefined();
    expect(screen.getByRole('option', { name: /sort: size/i })).toBeDefined();
    expect(
      screen.getByRole('option', { name: /sort: date modified/i })
    ).toBeDefined();
  });

  it('calls onSortChange when sort option selected', () => {
    const onSortChange = vi.fn();
    render(<FileListControls {...defaultProps} onSortChange={onSortChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'size' } });

    expect(onSortChange).toHaveBeenCalledWith('size');
    expect(onSortChange).toHaveBeenCalledTimes(1);
  });

  it('displays current sort value in dropdown', () => {
    render(<FileListControls {...defaultProps} sort="date" />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('date');
  });

  it('displays current search value in input', () => {
    render(<FileListControls {...defaultProps} search="test query" />);

    const input = screen.getByPlaceholderText(/search files/i) as HTMLInputElement;
    expect(input.value).toBe('test query');
  });

  it('cancels previous debounce timer when typing quickly', () => {
    const onSearchChange = vi.fn();
    render(<FileListControls {...defaultProps} onSearchChange={onSearchChange} />);

    const input = screen.getByPlaceholderText(/search files/i);

    // Type 'a'
    fireEvent.change(input, { target: { value: 'a' } });
    vi.advanceTimersByTime(200);

    // Type 'b' before debounce completes
    fireEvent.change(input, { target: { value: 'ab' } });
    vi.advanceTimersByTime(200);

    // Type 'c' before debounce completes
    fireEvent.change(input, { target: { value: 'abc' } });
    vi.advanceTimersByTime(300);

    // Should only be called once with final value
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('abc');
  });
});
