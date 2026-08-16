from pathlib import Path

path = Path('src/components/modals/ManageCardsModal.tsx')
text = path.read_text()
old = """    return () => {
      cancelled = true;
    };
  }, [deckId]);
"""
new = """    return () => {
      cancelled = true;
      const current = useFlashcardStore.getState();
      if (current.activeDeckId === deckId) {
        useFlashcardStore.setState({ activeDeckId: null, cards: [] });
      }
    };
  }, [deckId]);
"""
if old not in text:
    raise AssertionError('ManageCardsModal load cleanup was not found')
path.write_text(text.replace(old, new, 1))
