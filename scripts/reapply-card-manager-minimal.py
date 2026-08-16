from pathlib import Path

path = Path('src/components/modals/ManageCardsModal.tsx')
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    if old not in text:
        raise AssertionError(f'Expected text not found: {old[:120]!r}')
    text = text.replace(old, new, 1)


replace_once(
    "  const [searchQuery, setSearchQuery] = useState('');\n",
    "  const [searchQuery, setSearchQuery] = useState('');\n"
    "  const [loadingCards, setLoadingCards] = useState(true);\n"
    "  const [pendingAction, setPendingAction] = useState<string | null>(null);\n",
)

replace_once(
    """  // Load cards for this deck on mount or when deckId changes
  useEffect(() => {
    void useFlashcardStore.getState().loadCards(deckId);
  }, [deckId]);
""",
    """  // Load only this deck's cards. The store clears the previous scope
  // immediately and ignores any late response after a newer deck is requested.
  useEffect(() => {
    let cancelled = false;
    void useFlashcardStore.getState().loadCards(deckId)
      .catch((error: unknown) => {
        if (!cancelled) {
          toast(
            `Cards could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`,
            'error',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCards(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deckId]);
""",
)

replace_once(
    """  const handleCreateCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardFront.trim() || !newCardBack.trim()) return;
    
    await store.createCard(classId, deckId, newCardFront.trim(), newCardBack.trim(), newCardType);
    setNewCardFront('');
    setNewCardBack('');
    
    celebrate({
      particleCount: 15,
      spread: 20,
      origin: { y: 0.85 },
      colors: ['#0a84ff', '#5e5ce6']
    });
  };
""",
    """  const handleCreateCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      pendingAction !== null ||
      !newCardFront.trim() ||
      (newCardType === 'standard' && !newCardBack.trim())
    ) {
      return;
    }

    setPendingAction('create');
    try {
      await store.createCard(
        classId,
        deckId,
        newCardFront.trim(),
        newCardBack.trim(),
        newCardType,
      );
      setNewCardFront('');
      setNewCardBack('');

      celebrate({
        particleCount: 15,
        spread: 20,
        origin: { y: 0.85 },
        colors: ['#7f9c86', '#a7b79f'],
      });
    } catch (error) {
      toast(
        `Card could not be created: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error',
      );
    } finally {
      setPendingAction(null);
    }
  };
""",
)

replace_once(
    """  const handleSaveEdit = async (cardId: number) => {
    if (!editFront.trim() || !editBack.trim()) return;
    await store.updateCard(cardId, editFront.trim(), editBack.trim(), editCardType);
    setEditingCardId(null);
    
    celebrate({
      particleCount: 10,
      spread: 15,
      origin: { y: 0.85 },
      colors: ['#30d158', '#34c759']
    });
  };
""",
    """  const handleSaveEdit = async (cardId: number) => {
    if (
      pendingAction !== null ||
      !editFront.trim() ||
      (editCardType === 'standard' && !editBack.trim())
    ) {
      return;
    }

    setPendingAction(`edit-${cardId}`);
    try {
      await store.updateCard(
        cardId,
        editFront.trim(),
        editBack.trim(),
        editCardType,
      );
      setEditingCardId(null);

      celebrate({
        particleCount: 10,
        spread: 15,
        origin: { y: 0.85 },
        colors: ['#7f9c86', '#a7b79f'],
      });
    } catch (error) {
      toast(
        `Card could not be updated: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error',
      );
    } finally {
      setPendingAction(null);
    }
  };
""",
)

replace_once(
    """                required
              />
            </div>
          </div>

          <button
            type=\"submit\"
            className=\"btn-premium-primary\"
            style={{ alignSelf: 'flex-start', height: '32px', padding: '0 16px', fontSize: '12px' }}
          >
            Add Card
""",
    """                required={newCardType === 'standard'}
              />
            </div>
          </div>

          <button
            type=\"submit\"
            className=\"btn-premium-primary\"
            disabled={pendingAction !== null}
            style={{ alignSelf: 'flex-start', height: '32px', padding: '0 16px', fontSize: '12px' }}
          >
            {pendingAction === 'create' ? 'Adding…' : 'Add Card'}
""",
)

replace_once(
    """          {store.cards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8e8e93', fontSize: '13px' }}>
              This deck has no cards yet. Add a card above to get started!
            </div>
          ) : (
""",
    """          {loadingCards ? (
            <div role=\"status\" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading cards…
            </div>
          ) : store.cards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8e8e93', fontSize: '13px' }}>
              This deck has no cards yet. Add a card above to get started!
            </div>
          ) : (
""",
)

replace_once(
    """                              <button
                                onClick={() => card.id && handleSaveEdit(card.id)}
                                style={{ height: '28px', padding: '0 12px', fontSize: '11px' }}
                                className=\"btn-premium-success\"
                              >
                                <Check size={12} /> Save Changes
""",
    """                              <button
                                type=\"button\"
                                onClick={() => card.id && void handleSaveEdit(card.id)}
                                disabled={pendingAction !== null}
                                style={{ height: '28px', padding: '0 12px', fontSize: '11px' }}
                                className=\"btn-premium-success\"
                              >
                                <Check size={12} /> {pendingAction === `edit-${card.id}` ? 'Saving…' : 'Save Changes'}
""",
)

path.write_text(text)
