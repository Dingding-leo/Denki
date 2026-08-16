from pathlib import Path
import re
import textwrap


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise AssertionError(f"Expected text not found in {path}: {old[:160]!r}")
    write(path, text.replace(old, new, 1))


def replace_all_checked(path: str, old: str, new: str, expected: int) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise AssertionError(f"Expected {expected} matches in {path}, got {count}: {old[:160]!r}")
    write(path, text.replace(old, new))


def sub_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise AssertionError(f"Expected one regex match in {path}, got {count}: {pattern[:160]!r}")
    write(path, updated)


# ---------------------------------------------------------------------------
# Speech: keep hidden cloze answers hidden, read the revealed cloze plus notes,
# and normalize corrupt/out-of-range speech-rate preferences.
# ---------------------------------------------------------------------------
write(
    'src/services/speech.ts',
    textwrap.dedent(
        '''
        import type { Card } from '../db/schema';
        import { renderContent } from './markdown';

        export const SPEECH_SPEED_KEY = 'denki-speech-speed';
        export const SPEECH_SPEED_MIN = 0.5;
        export const SPEECH_SPEED_MAX = 2;
        export const DEFAULT_SPEECH_SPEED = 1;

        export function normalizeSpeechRate(value: unknown): number {
          const parsed = typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? Number.parseFloat(value)
              : Number.NaN;
          if (!Number.isFinite(parsed)) return DEFAULT_SPEECH_SPEED;
          return Math.min(SPEECH_SPEED_MAX, Math.max(SPEECH_SPEED_MIN, parsed));
        }

        export function loadSpeechRate(): number {
          try {
            if (typeof localStorage === 'undefined') return DEFAULT_SPEECH_SPEED;
            return normalizeSpeechRate(localStorage.getItem(SPEECH_SPEED_KEY));
          } catch {
            return DEFAULT_SPEECH_SPEED;
          }
        }

        function resolveClozeForSpeech(source: string, reveal: boolean): string {
          return String(source ?? '').replace(
            /\{\{c\d+::([\s\S]*?)\}\}/g,
            (_match, innerValue: string) => {
              const separatorIndex = innerValue.indexOf('::');
              const answer = separatorIndex >= 0
                ? innerValue.slice(0, separatorIndex)
                : innerValue;
              const hint = separatorIndex >= 0
                ? innerValue.slice(separatorIndex + 2).trim()
                : '';

              if (reveal) return answer;
              return hint ? `blank, hint: ${hint}` : 'blank';
            },
          );
        }

        function renderedContentToText(source: string): string {
          const withoutFencedCode = String(source ?? '').replace(
            /```[\s\S]*?```/g,
            ' code block ',
          );
          const html = renderContent(withoutFencedCode, false, true)
            .replace(/<(?:br\s*\/?|\/(?:p|div|li|h[1-6]|blockquote|pre))>/gi, ' ');

          if (typeof document === 'undefined') {
            return html
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&lt;/gi, '<')
              .replace(/&gt;/gi, '>')
              .replace(/\s+/g, ' ')
              .trim();
          }

          const container = document.createElement('div');
          container.innerHTML = html;
          container.querySelectorAll('pre, audio, video, source').forEach((node) => node.remove());
          return (container.textContent ?? '')
            .replace(/\s+([,.;:!?])/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
        }

        /**
         * Build exactly what the learner should hear for the visible card side.
         * A hidden cloze is spoken as "blank" (and its visible hint, if any),
         * never as the answer. On the back, the revealed sentence is read before
         * the card's explanation so audio matches what is visibly on screen.
         */
        export function getCardSpeechText(card: Card, isFlipped: boolean): string {
          if (card.cardType === 'cloze') {
            const clozeSentence = renderedContentToText(
              resolveClozeForSpeech(card.front, isFlipped),
            );
            if (!isFlipped) return clozeSentence;

            const explanation = renderedContentToText(card.back);
            return [clozeSentence, explanation].filter(Boolean).join('. ');
          }

          return renderedContentToText(isFlipped ? card.back : card.front);
        }
        '''
    ).lstrip(),
)

flashcard_path = 'src/components/Flashcard.tsx'
replace_once(
    flashcard_path,
    "import { renderContent } from '../services/markdown';\n",
    "import { renderContent } from '../services/markdown';\n"
    "import { getCardSpeechText, loadSpeechRate } from '../services/speech';\n",
)
sub_once(
    flashcard_path,
    r"  // Cache the preferred English voice without putting it in React state\.[\s\S]*?const autoSpeechTimerRef = useRef<number \| null>\(null\);",
    textwrap.dedent(
        '''
          // Cache the preferred English voice without putting it in React state. Voice
          // discovery is asynchronous in some browsers; a ref avoids replaying a side
          // when the voice list becomes available.
          useEffect(() => {
            if (!('speechSynthesis' in window)) return;

            const loadVoice = () => {
              const voices = window.speechSynthesis.getVoices();
              selectedVoiceRef.current =
                voices.find((voice) => voice.lang.startsWith('en') && voice.name.includes('Google')) ??
                voices.find((voice) => voice.lang.startsWith('en')) ??
                null;
            };

            loadVoice();
            window.speechSynthesis.addEventListener('voiceschanged', loadVoice);
            return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoice);
          }, []);

          // Reset scratchpad state during render when card changes to avoid cascading renders
          const [prevCardId, setPrevCardId] = useState(card.id);
          if (card.id !== prevCardId) {
            setPrevCardId(card.id);
            setShowScratchpad(false);
          }

          // Trigger code highlighting on flip or card change. Scoped to this card's DOM
          // instead of Prism.highlightAll(), which re-scans the entire document.
          useEffect(() => {
            if (!containerRef.current) return;
            containerRef.current.querySelectorAll('pre code[class*="language-"]').forEach((el) => {
              if (el instanceof HTMLElement) Prism.highlightElement(el);
            });
          }, [card.id, isFlipped]);

          const questionSpeechText = React.useMemo(
            () => getCardSpeechText(card, false),
            [card],
          );
          const answerSpeechText = React.useMemo(
            () => getCardSpeechText(card, true),
            [card],
          );

          const speakText = React.useCallback((textToRead: string) => {
            const cleanText = textToRead.trim();
            if (!cleanText || !('speechSynthesis' in window)) return;

            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = 'en-US';
            const fallbackVoice = window.speechSynthesis
              .getVoices()
              .find((voice) => voice.lang.startsWith('en'));
            utterance.voice = selectedVoiceRef.current ?? fallbackVoice ?? null;
            utterance.rate = loadSpeechRate();
            window.speechSynthesis.speak(utterance);
          }, []);

          const autoSpeechTimerRef = useRef<number | null>(null);
        '''
    ).rstrip(),
    flags=re.S,
)
replace_once(
    flashcard_path,
    "  const textToSpeak = isFlipped ? card.back : card.front;\n",
    "  const textToSpeak = isFlipped ? answerSpeechText : questionSpeechText;\n",
)
replace_once(
    flashcard_path,
    "}, [card.id, card.front, card.back, isFlipped, autoSpeak, speakText]);\n",
    "}, [card.id, isFlipped, autoSpeak, answerSpeechText, questionSpeechText, speakText]);\n",
)
replace_once(
    flashcard_path,
    "    const textToSpeak = isFlipped ? card.back : card.front;\n",
    "    const textToSpeak = isFlipped ? answerSpeechText : questionSpeechText;\n",
)
replace_all_checked(
    flashcard_path,
    "overflowY: 'hidden', minHeight: 0, zIndex: 5, width: '100%'",
    "overflowY: 'auto', minHeight: 0, zIndex: 5, width: '100%', overscrollBehavior: 'contain', paddingRight: '6px'",
    2,
)
replace_once(flashcard_path, 'aria-label="Pronounce text"\n                  title="Pronounce English Text"', 'aria-label="Read question aloud"\n                  title="Read question aloud"')
replace_once(flashcard_path, 'aria-label="Pronounce text"\n                title="Pronounce English Text"', 'aria-label="Read answer aloud"\n                title="Read answer aloud"')

settings_path = 'src/components/modals/SettingsModal.tsx'
replace_once(
    settings_path,
    "} from '../../services/schedulerParams';\n",
    "} from '../../services/schedulerParams';\n"
    "import {\n"
    "  SPEECH_SPEED_KEY,\n"
    "  SPEECH_SPEED_MAX,\n"
    "  SPEECH_SPEED_MIN,\n"
    "  loadSpeechRate,\n"
    "  normalizeSpeechRate,\n"
    "} from '../../services/speech';\n",
)
sub_once(
    settings_path,
    r"const SPEECH_SPEED_KEY = 'denki-speech-speed';[\s\S]*?const sectionStyle: React\.CSSProperties =",
    "const sectionStyle: React.CSSProperties =",
    flags=re.S,
)
replace_once(settings_path, '  const [speechSpeed, setSpeechSpeed] = useState(readSpeechSpeed);\n', '  const [speechSpeed, setSpeechSpeed] = useState(loadSpeechRate);\n')
replace_once(
    settings_path,
    '    const normalizedSpeech = clamp(speechSpeed, SPEECH_SPEED_MIN, SPEECH_SPEED_MAX);\n',
    '    const normalizedSpeech = normalizeSpeechRate(speechSpeed);\n',
)

# ---------------------------------------------------------------------------
# Remove the retired daily-cap implementation completely. The old localStorage
# key remains harmless and Settings removes it on the next preference save.
# ---------------------------------------------------------------------------
study_path = 'src/store/slices/studySlice.ts'
study = read(study_path)
study = study.replace("import type { Card } from '../../db/schema';\n", '', 1)
study = study.replace(
    "import { loadNewCardsPerDay, countNewIntroducedToday, newCardAllowance } from '../../services/studyLimits';\n",
    '',
    1,
)
study, count = re.subn(
    r"const isNewCard[\s\S]*?\n\n// Guards rateCard/undoLastRate",
    "// Guards rateCard/undoLastRate",
    study,
    count=1,
)
assert count == 1
study, count = re.subn(
    r"    // Spaced repetition due card filter \(due <= now\)\n    let filteredCards = deckCards;[\s\S]*?\n    // Every session receives",
    textwrap.dedent(
        '''
            // Normal Study has no usage cap: every new card plus each review due
            // now is eligible. Optional all-card practice bypasses the due filter.
            let filteredCards = deckCards;
            const isCram = forceCram || (deckCards.length > 0 && deckCards.every((card) => card.due === undefined));

            if (!forceCram) {
              filteredCards = deckCards.filter((card) => {
                if (!card.lastReviewed || card.state === 0) return true;
                return new Date(card.due).getTime() <= now.getTime();
              });
            }

            // Every session receives
        '''
    ).rstrip(),
    study,
    count=1,
)
assert count == 1
study, count = re.subn(
    r"    let filteredCards = classCards;\n    const isCram = forceCram;[\s\S]*?\n    // Every session receives",
    textwrap.dedent(
        '''
            let filteredCards = classCards;
            const isCram = forceCram;

            if (!forceCram) {
              filteredCards = classCards.filter((card) => {
                if (!card.lastReviewed || card.state === 0) return true;
                return new Date(card.due).getTime() <= now.getTime();
              });
            }

            // Every session receives
        '''
    ).rstrip(),
    study,
    count=1,
)
assert count == 1
study, count = re.subn(
    r"    let filteredCards = allCards;[\s\S]*?\n    // A fresh daily queue",
    textwrap.dedent(
        '''
            let filteredCards = allCards;
            if (!forceCram) {
              filteredCards = allCards.filter((card) => {
                if (!card.lastReviewed || card.state === 0) return true;
                return new Date(card.due).getTime() <= now.getTime();
              });
            }

            // A fresh mixed queue
        '''
    ).rstrip(),
    study,
    count=1,
)
assert count == 1
study = study.replace('    notifyHeldBack(heldBack);\n', '')

helper_anchor = "function scheduleStatsRefresh(run: () => Promise<void>) {\n  if (statsRefreshTimer) clearTimeout(statsRefreshTimer);\n  statsRefreshTimer = setTimeout(() => {\n    statsRefreshTimer = null;\n    run().catch(console.warn);\n  }, 1000);\n}\n"
helper_replacement = helper_anchor + textwrap.dedent(
    '''

    async function refreshActiveDeckCards(get: () => FlashcardState): Promise<void> {
      const activeDeckId = get().activeDeckId;
      if (!activeDeckId) return;

      try {
        await get().loadCards(activeDeckId);
      } catch (error) {
        // The review transaction is already durable. A non-essential cache refresh
        // must never leave the learner staring at the same card and rating it twice.
        console.warn('Review saved, but the active deck cache could not refresh:', error);
      }
    }
    '''
).rstrip() + '\n'
if helper_anchor not in study:
    raise AssertionError('stats refresh helper anchor not found')
study = study.replace(helper_anchor, helper_replacement, 1)
active_refresh = "      // Refresh database buffers for 'cards' in memory (if managing card view is active)\n      const activeDeckId = get().activeDeckId;\n      if (activeDeckId) {\n        await get().loadCards(activeDeckId);\n      }\n"
if study.count(active_refresh) != 2:
    raise AssertionError(f'Expected two active deck refresh blocks, got {study.count(active_refresh)}')
study = study.replace(active_refresh, "      await refreshActiveDeckCards(get);\n")
study = study.replace(
    "      } catch (err) {\n        console.error('Failed to undo last rating in DB:', err);\n      }\n\n      await refreshActiveDeckCards(get);\n",
    "      } catch (err) {\n        console.error('Failed to undo last rating in DB:', err);\n        toast('Undo failed — the saved review was left unchanged', 'error');\n        return;\n      }\n\n      await refreshActiveDeckCards(get);\n",
    1,
)
write(study_path, study)

stats_path = 'src/store/slices/statsSlice.ts'
stats = read(stats_path)
stats = stats.replace(
    "import {\n  countNewIntroducedToday,\n  loadNewCardsPerDay,\n  newCardAllowance,\n} from '../../services/studyLimits';\n",
    '',
    1,
)
stats, count = re.subn(
    r"async function cappedDeckDueCount[\s\S]*?\n\nasync function computeClassStats",
    textwrap.dedent(
        '''
        async function deckDueCount(deckId: number, now: Date): Promise<number> {
          return db.cards
            .where('[deckId+due]')
            .between([deckId, new Date(0)], [deckId, now])
            .count();
        }

        async function computeClassStats
        '''
    ).rstrip(),
    stats,
    count=1,
)
assert count == 1
stats = stats.replace(
    "async function computeClassStats(\n  classId: number,\n  now: Date,\n  introduced: Map<number, number>,\n  limit: number,\n): Promise<ClassStats> {",
    "async function computeClassStats(\n  classId: number,\n  now: Date,\n): Promise<ClassStats> {",
    1,
)
stats = stats.replace('cappedDeckDueCount(deck.id!, now, introduced, limit)', 'deckDueCount(deck.id!, now)')
stats = stats.replace(
    "async function computeDeckStats(\n  deckId: number,\n  now: Date,\n  introduced: Map<number, number>,\n  limit: number,\n): Promise<DeckStats> {",
    "async function computeDeckStats(\n  deckId: number,\n  now: Date,\n): Promise<DeckStats> {",
    1,
)
stats = stats.replace('cappedDeckDueCount(deckId, now, introduced, limit)', 'deckDueCount(deckId, now)')
stats, count = re.subn(
    r"  loadClassStats: async \(classId\) => \{[\s\S]*?\n  \},\n\n  loadAllClassStats:",
    textwrap.dedent(
        '''
          loadClassStats: async (classId) => {
            const stats = await computeClassStats(classId, new Date());
            set((state) => ({
              classStats: { ...state.classStats, [classId]: stats },
            }));
          },

          loadAllClassStats:
        '''
    ).rstrip(),
    stats,
    count=1,
)
assert count == 1
stats, count = re.subn(
    r"  loadAllClassStats: async \(\) => \{[\s\S]*?\n  \},\n\n  loadDeckStats:",
    textwrap.dedent(
        '''
          loadAllClassStats: async () => {
            const classIds = get().classes
              .map((studyClass) => studyClass.id)
              .filter((id): id is number => id !== undefined);
            if (classIds.length === 0) {
              set({ classStats: {} });
              return;
            }

            const now = new Date();
            const entries = await Promise.all(
              classIds.map(async (classId) => [
                classId,
                await computeClassStats(classId, now),
              ] as const),
            );
            set({ classStats: Object.fromEntries(entries) });
          },

          loadDeckStats:
        '''
    ).rstrip(),
    stats,
    count=1,
)
assert count == 1
stats, count = re.subn(
    r"  loadDeckStats: async \(classId\) => \{[\s\S]*?\n  \},\n\n  loadStats:",
    textwrap.dedent(
        '''
          loadDeckStats: async (classId) => {
            const classDecks = await db.decks.where('classId').equals(classId).toArray();
            const now = new Date();
            const entries = await Promise.all(
              classDecks
                .filter((deck) => deck.id !== undefined)
                .map(async (deck) => [
                  deck.id!,
                  await computeDeckStats(deck.id!, now),
                ] as const),
            );

            set((state) => ({
              deckStats: { ...state.deckStats, ...Object.fromEntries(entries) },
            }));
          },

          loadStats:
        '''
    ).rstrip(),
    stats,
    count=1,
)
assert count == 1
stats, count = re.subn(
    r"    const relevantDecks =[\s\S]*?\n\n    const today = startOfLocalDay\(now\);",
    "    const today = startOfLocalDay(now);",
    stats,
    count=1,
)
assert count == 1
stats, count = re.subn(
    r"\n    if \(limit > 0\) \{[\s\S]*?\n    \}\n\n    const workloadForecast",
    "\n\n    const workloadForecast",
    stats,
    count=1,
)
assert count == 1
write(stats_path, stats)

Path('src/services/studyLimits.ts').unlink()
Path('src/services/__tests__/studyLimits.test.ts').unlink()
write(
    'src/services/__tests__/unlimitedStudy.test.ts',
    textwrap.dedent(
        '''
        import { beforeEach, describe, expect, it } from 'vitest';
        import { db } from '../../db';
        import type { Card } from '../../db/schema';
        import { useFlashcardStore } from '../../store/useFlashcardStore';

        function seedCard(deckId: number, classId: number, front: string): Card {
          return {
            classId,
            deckId,
            front,
            back: `A:${front}`,
            cardType: 'standard',
            createdAt: new Date(),
            state: 0,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            due: new Date(),
          };
        }

        describe('unlimited new-card study', () => {
          beforeEach(async () => {
            window.localStorage.clear();
            useFlashcardStore.setState({ session: null, activeDeckId: null, activeClassId: null });
            await Promise.all([db.cards.clear(), db.reviews.clear(), db.decks.clear(), db.classes.clear()]);
          });

          it('never reads a legacy daily-limit preference', async () => {
            window.localStorage.setItem('denki-new-cards-per-day', '1');
            const classId = await db.classes.add({ name: 'C', description: '', createdAt: new Date() });
            const deckId = await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() });
            for (let index = 0; index < 30; index += 1) {
              await db.cards.add(seedCard(deckId, classId, `Q${index}`));
            }

            await useFlashcardStore.getState().startStudySession(deckId);
            expect(useFlashcardStore.getState().session?.queue).toHaveLength(30);

            await useFlashcardStore.getState().loadDeckStats(classId);
            expect(useFlashcardStore.getState().deckStats[deckId].dueCount).toBe(30);

            await useFlashcardStore.getState().loadStats(null);
            expect(useFlashcardStore.getState().globalStats?.workloadForecast[0].count).toBe(30);
          });
        });
        '''
    ).lstrip(),
)

# Explicit filter selections mean "start this new drill", while an omitted
# filter list (the route mount/reload path) may resume an unfinished drill.
store_path = 'src/store/useFlashcardStore.ts'
replace_once(
    store_path,
    "  startDrillSession: async (deckId, buckets) => {\n"
    "    const current = useFlashcardStore.getState().session;\n",
    "  startDrillSession: async (deckId, buckets) => {\n"
    "    if (buckets !== undefined) {\n"
    "      await startDeckDrill(deckId, buckets);\n"
    "      return;\n"
    "    }\n\n"
    "    const current = useFlashcardStore.getState().session;\n",
)

# Space/Enter on a focused toolbar control must activate that control only, not
# also bubble into the global card-flip shortcut.
page_path = 'src/pages/StudySessionPage.tsx'
replace_once(
    page_path,
    "  const handleReviewKeyDown = useEffectEvent(async (e: KeyboardEvent) => {\n"
    "    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;\n",
    "  const handleReviewKeyDown = useEffectEvent(async (e: KeyboardEvent) => {\n"
    "    const target = e.target instanceof HTMLElement ? e.target : null;\n"
    "    if (target?.matches('input, textarea, select, [contenteditable=\"true\"]')) return;\n"
    "    if (\n"
    "      (e.code === 'Space' || e.code === 'Enter') &&\n"
    "      target?.closest('button, a, [role=\"button\"]')\n"
    "    ) return;\n",
)

# ---------------------------------------------------------------------------
# Regression tests.
# ---------------------------------------------------------------------------
write(
    'src/components/__tests__/FlashcardSpeech.test.tsx',
    textwrap.dedent(
        '''
        import { act, render } from '@testing-library/react';
        import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
        import type { Card, CardType } from '../../db/schema';
        import { SPEECH_SPEED_KEY } from '../../services/speech';
        import { Flashcard } from '../Flashcard';

        class TestUtterance {
          text: string;
          lang = '';
          voice: SpeechSynthesisVoice | null = null;
          rate = 1;

          constructor(text: string) {
            this.text = text;
          }
        }

        const card = (
          id: number,
          front: string,
          back: string,
          cardType: CardType = 'standard',
        ): Card => ({
          id,
          classId: 1,
          deckId: 1,
          front,
          back,
          cardType,
          createdAt: new Date(),
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          due: new Date(),
        });

        describe('Flashcard automatic speech', () => {
          const speak = vi.fn();
          const cancel = vi.fn();
          const voice = {
            default: true,
            lang: 'en-US',
            localService: true,
            name: 'Test English',
            voiceURI: 'test-english',
          } as SpeechSynthesisVoice;

          beforeEach(() => {
            localStorage.clear();
            vi.useFakeTimers();
            speak.mockReset();
            cancel.mockReset();
            vi.stubGlobal('SpeechSynthesisUtterance', TestUtterance);
            Object.defineProperty(window, 'speechSynthesis', {
              configurable: true,
              value: {
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                getVoices: vi.fn(() => [voice]),
                speak,
                cancel,
              } as unknown as SpeechSynthesis,
            });
            vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
          });

          afterEach(() => {
            act(() => vi.runOnlyPendingTimers());
            vi.useRealTimers();
            vi.unstubAllGlobals();
            vi.restoreAllMocks();
          });

          it('reads the next question instead of its answer during the flipped-to-front transition', () => {
            const first = card(1, 'Question one', 'Answer one');
            const second = card(2, 'Question two', 'Answer two');
            const onFlip = vi.fn();

            const view = render(
              <Flashcard key={first.id} card={first} isFlipped={false} onFlip={onFlip} autoSpeak />,
            );
            act(() => vi.runOnlyPendingTimers());

            view.rerender(
              <Flashcard key={first.id} card={first} isFlipped onFlip={onFlip} autoSpeak />,
            );
            act(() => vi.runOnlyPendingTimers());

            view.rerender(
              <Flashcard key={second.id} card={second} isFlipped onFlip={onFlip} autoSpeak />,
            );
            view.rerender(
              <Flashcard key={second.id} card={second} isFlipped={false} onFlip={onFlip} autoSpeak />,
            );
            act(() => vi.runOnlyPendingTimers());

            const spoken = speak.mock.calls.map(([utterance]) => (utterance as TestUtterance).text);
            expect(spoken).toEqual(['Question one', 'Answer one', 'Question two']);
            expect(spoken).not.toContain('Answer two');
          });

          it('never reveals a hidden cloze answer aloud and reads it after the card is flipped', () => {
            const cloze = card(
              1,
              'ATP is produced by the {{c1::mitochondrion::organelle}}.',
              'Known as the powerhouse of the cell.',
              'cloze',
            );
            const onFlip = vi.fn();
            const view = render(
              <Flashcard card={cloze} isFlipped={false} onFlip={onFlip} autoSpeak />,
            );
            act(() => vi.runOnlyPendingTimers());

            const question = (speak.mock.calls[0][0] as TestUtterance).text;
            expect(question.toLowerCase()).toContain('blank');
            expect(question.toLowerCase()).toContain('organelle');
            expect(question.toLowerCase()).not.toContain('mitochondrion');

            view.rerender(<Flashcard card={cloze} isFlipped onFlip={onFlip} autoSpeak />);
            act(() => vi.runOnlyPendingTimers());

            const answer = (speak.mock.calls[1][0] as TestUtterance).text;
            expect(answer).toContain('mitochondrion');
            expect(answer).toContain('powerhouse of the cell');
          });

          it('clamps a corrupt saved speech speed before creating the utterance', () => {
            localStorage.setItem(SPEECH_SPEED_KEY, '99');
            render(<Flashcard card={card(1, 'Question', 'Answer')} isFlipped={false} onFlip={vi.fn()} autoSpeak />);
            act(() => vi.runOnlyPendingTimers());

            expect((speak.mock.calls[0][0] as TestUtterance).rate).toBe(2);
          });

          it('cancels pending automatic speech when the feature is switched off', () => {
            const current = card(1, 'Question', 'Answer');
            const onFlip = vi.fn();
            const view = render(
              <Flashcard card={current} isFlipped={false} onFlip={onFlip} autoSpeak />,
            );

            view.rerender(
              <Flashcard card={current} isFlipped={false} onFlip={onFlip} autoSpeak={false} />,
            );
            act(() => vi.runOnlyPendingTimers());

            expect(speak).not.toHaveBeenCalled();
            expect(cancel).toHaveBeenCalled();
          });
        });
        '''
    ).lstrip(),
)

test_path = 'src/store/slices/__tests__/studySlice.test.ts'
test = read(test_path)
test = test.replace(
    "import { describe, it, expect, beforeEach } from 'vitest';",
    "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';",
    1,
)
test = test.replace(
    "describe('studySlice rateCard / undoLastRate', () => {\n",
    "describe('studySlice rateCard / undoLastRate', () => {\n"
    "  afterEach(() => {\n"
    "    vi.restoreAllMocks();\n"
    "  });\n\n",
    1,
)
insert_before = "\n});\n"
last_index = test.rfind(insert_before)
if last_index < 0:
    raise AssertionError('studySlice describe closing marker not found')
additional_tests = textwrap.dedent(
    '''

      it('advances after a durable review even when the optional active-deck cache refresh fails', async () => {
        const { deckId } = await startWithCards(2);
        const originalLoadCards = useFlashcardStore.getState().loadCards;
        useFlashcardStore.setState({
          activeDeckId: deckId,
          loadCards: vi.fn(async () => {
            throw new Error('cache refresh failed');
          }) as typeof originalLoadCards,
        });

        try {
          await expect(useFlashcardStore.getState().rateCard(3)).resolves.toBeUndefined();
          const session = useFlashcardStore.getState().session!;
          expect(session.currentIndex).toBe(1);
          expect(session.completedCount).toBe(1);
          expect(session.history).toHaveLength(1);
          expect(await db.reviews.count()).toBe(1);
        } finally {
          useFlashcardStore.setState({ loadCards: originalLoadCards, activeDeckId: null });
        }
      });

      it('keeps the in-memory session unchanged when the database rollback for Undo fails', async () => {
        await startWithCards(2);
        await useFlashcardStore.getState().rateCard(3);
        const beforeUndo = useFlashcardStore.getState().session!;
        vi.spyOn(db.cards, 'put').mockRejectedValueOnce(new Error('storage unavailable'));

        await useFlashcardStore.getState().undoLastRate();

        const afterUndo = useFlashcardStore.getState().session!;
        expect(afterUndo).toBe(beforeUndo);
        expect(afterUndo.currentIndex).toBe(1);
        expect(afterUndo.completedCount).toBe(1);
        expect(afterUndo.history).toHaveLength(1);
        expect(await db.reviews.count()).toBe(1);
      });

      it('starts a fresh filtered drill when the learner changes the level selection', async () => {
        const { deckId } = await startWithCards(3);
        const cards = await db.cards.where('deckId').equals(deckId).sortBy('id');
        await Promise.all([
          db.cards.update(cards[0].id!, { lastRating: 1 }),
          db.cards.update(cards[1].id!, { lastRating: 4 }),
          db.cards.update(cards[2].id!, { lastRating: 4 }),
        ]);
        useFlashcardStore.getState().endStudySession();

        await useFlashcardStore.getState().startDrillSession(deckId, [1]);
        expect(useFlashcardStore.getState().session?.queue.map((card) => card.id)).toEqual([
          cards[0].id,
        ]);

        await useFlashcardStore.getState().startDrillSession(deckId, [4]);
        const replacement = useFlashcardStore.getState().session!;
        expect(replacement.drillBuckets).toEqual([4]);
        expect(new Set(replacement.queue.map((card) => card.id))).toEqual(
          new Set([cards[1].id, cards[2].id]),
        );
      });
    '''
).rstrip()
test = test[:last_index] + additional_tests + test[last_index:]
write(test_path, test)

# Ensure no implementation imports the retired service before deleting it.
for path in Path('src').rglob('*'):
    if path.is_file() and path.suffix in {'.ts', '.tsx'}:
        if 'studyLimits' in path.read_text():
            raise AssertionError(f'Retired studyLimits import remains in {path}')
