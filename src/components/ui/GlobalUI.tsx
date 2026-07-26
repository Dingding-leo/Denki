import React, { useEffect } from 'react';
import { Toaster } from './Toaster';
import { ConfirmDialogHost } from './ConfirmDialogHost';
import { CommandPalette } from '../CommandPalette';
import { ShortcutsModal } from '../modals/ShortcutsModal';
import { useUIStore } from '../../store/uiStore';

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
};

/**
 * App-wide UI chrome: toasts, confirm dialogs, the ⌘K command palette and the
 * "?" shortcut reference. Mounted once inside the router so the palette can
 * navigate.
 */
export const GlobalUI: React.FC = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { paletteOpen, shortcutsOpen, pendingConfirm, setPaletteOpen, setShortcutsOpen } =
        useUIStore.getState();

      // ⌘K / Ctrl+K toggles the palette everywhere (even while typing)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (pendingConfirm) return;
        setShortcutsOpen(false);
        setPaletteOpen(!paletteOpen);
        return;
      }

      // "?" opens the shortcut reference — only outside text fields
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        if (paletteOpen || pendingConfirm) return;
        e.preventDefault();
        setShortcutsOpen(!shortcutsOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <CommandPalette />
      <ShortcutsModal />
      <ConfirmDialogHost />
      <Toaster />
    </>
  );
};
