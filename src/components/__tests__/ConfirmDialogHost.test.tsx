import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../store/uiStore';
import { ConfirmDialogHost } from '../ui/ConfirmDialogHost';

describe('ConfirmDialogHost details', () => {
  beforeEach(() => {
    useUIStore.getState().resolveConfirm(false);
    useUIStore.setState({ pendingConfirm: null });
  });

  it('renders structured preflight details and resolves cancellation', async () => {
    render(<ConfirmDialogHost />);
    let result!: Promise<boolean>;

    act(() => {
      result = useUIStore.getState().confirm({
        title: 'Restore backup?',
        message: 'Review the validated backup before replacing data.',
        details: [
          { label: 'Contents', value: '824 cards · 2,941 reviews' },
          { label: 'Media', value: '12 objects · 8.0 MiB' },
        ],
        danger: true,
      });
    });

    expect(screen.getByText('Contents')).toBeInTheDocument();
    expect(screen.getByText('824 cards · 2,941 reviews')).toBeInTheDocument();
    expect(
      screen.getByRole('alertdialog'),
    ).toHaveAttribute(
      'aria-describedby',
      'confirm-dialog-message confirm-dialog-details',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(result).resolves.toBe(false);
  });
});
