import React, { useRef, useState } from 'react';
import { Upload, HelpCircle, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import confetti from 'canvas-confetti';

interface AnkiImporterProps {
  classId: number;
  onComplete?: () => void;
}

// Define global extensions for type safety when loading dynamically
declare global {
  interface Window {
    JSZip: any;
    initSqlJs: any;
  }
}

export const AnkiImporter: React.FC<AnkiImporterProps> = ({ classId, onComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createDeck = useFlashcardStore(state => state.createDeck);
  const bulkCreateCards = useFlashcardStore(state => state.bulkCreateCards);
  
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [status, setStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    decksCreated?: number;
    cardsImported?: number;
  }>({ type: 'idle', message: '' });

  // Dynamically load an external script if not already present
  const loadScript = (id: string, src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  };

  // Load required Anki libraries from CDN
  const loadAnkiLibraries = async () => {
    setProgressMsg('Loading decompression libraries...');
    await loadScript('jszip-cdn', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    
    setProgressMsg('Loading SQLite WebAssembly compiler...');
    await loadScript('sqljs-cdn', 'https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/sql-wasm.js');
  };

  // Get MIME type based on file extension
  const getMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'svg': return 'image/svg+xml';
      case 'webp': return 'image/webp';
      case 'mp3': return 'audio/mp3';
      case 'wav': return 'audio/wav';
      case 'ogg': return 'audio/ogg';
      default: return 'application/octet-stream';
    }
  };

  // Convert array buffer to base64 data url
  const arrayBufferToBase64DataUrl = (buffer: ArrayBuffer, filename: string): string => {
    const mimeType = getMimeType(filename);
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = window.btoa(binary);
    return `data:${mimeType};base64,${base64}`;
  };

  // Inline regex-based media replacing helper
  const replaceMediaInString = (str: string, mediaLookup: Record<string, string>): string => {
    if (!str) return '';
    let result = str;
    
    Object.entries(mediaLookup).forEach(([filename, dataUrl]) => {
      // Escape regex special chars
      const escapedName = filename.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      
      // Replace image source: src="filename" or src='filename' or src=filename
      const srcRegex = new RegExp(`src=["']?${escapedName}["']?`, 'gi');
      result = result.replace(srcRegex, `src="${dataUrl}"`);
      
      // Markdown link: ![caption](filename)
      const mdRegex = new RegExp(`\\(${escapedName}\\)`, 'g');
      result = result.replace(mdRegex, `(${dataUrl})`);
      
      // Anki Sound reference: [sound:filename]
      const soundRegex = new RegExp(`\\[sound:${escapedName}\\]`, 'gi');
      if (filename.endsWith('.mp3') || filename.endsWith('.wav') || filename.endsWith('.ogg')) {
        result = result.replace(soundRegex, `<audio controls src="${dataUrl}" style="margin: 8px 0; max-width: 100%; display: block;"></audio>`);
      } else {
        result = result.replace(soundRegex, `<img src="${dataUrl}" style="max-width: 100%; display: block; margin: 8px 0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />`);
      }
    });

    return result;
  };

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.apkg')) {
      setStatus({
        type: 'error',
        message: 'Invalid file format. Please upload a valid Anki package (.apkg) file.',
      });
      return;
    }

    setLoading(true);
    setStatus({ type: 'idle', message: '' });

    try {
      // 1. Load external packages from CDN
      await loadAnkiLibraries();

      setProgressMsg('Decompressing Anki archive...');
      const zip = await window.JSZip.loadAsync(file);

      // 2. Parse the internal media mapping
      setProgressMsg('Parsing media asset files...');
      let mediaLookup: Record<string, string> = {};
      const mediaFile = zip.file('media');
      if (mediaFile) {
        const mediaText = await mediaFile.async('text');
        try {
          const mediaMap = JSON.parse(mediaText) as Record<string, string>; // e.g. {"0": "myimage.png", "1": "audio.mp3"}
          
          // Read all numbered files from the zip and convert them to Base64
          const totalAssets = Object.keys(mediaMap).length;
          let loadedAssets = 0;
          
          for (const [zipKey, originalName] of Object.entries(mediaMap)) {
            loadedAssets++;
            setProgressMsg(`Encoding media asset ${loadedAssets}/${totalAssets}: ${originalName}`);
            const assetFile = zip.file(zipKey);
            if (assetFile) {
              const buffer = await assetFile.async('arraybuffer');
              mediaLookup[originalName] = arrayBufferToBase64DataUrl(buffer, originalName);
            }
          }
        } catch (e) {
          console.warn('Failed to parse media mapping from apkg', e);
        }
      }

      // 3. Find collection database
      setProgressMsg('Extracting card collections...');
      const dbFile = zip.file('collection.anki21') || zip.file('collection.anki2');
      if (!dbFile) {
        throw new Error('Anki package does not contain collection.anki2 or collection.anki21 database file.');
      }
      const dbBuffer = await dbFile.async('uint8array');

      // 4. Initialize SQL.js WebAssembly compiler
      setProgressMsg('Compiling SQLite engine...');
      const SQL = await window.initSqlJs({
        locateFile: (filename: string) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/${filename}`
      });

      setProgressMsg('Loading SQLite collection...');
      const ankiDb = new SQL.Database(dbBuffer);

      // 5. Parse Decks
      setProgressMsg('Syncing deck layouts...');
      const decksMap: Record<string, string> = {};
      
      // Try decks table first (Anki 2.1.20+)
      try {
        const hasDecksTable = ankiDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'");
        if (hasDecksTable.length > 0) {
          const decksRes = ankiDb.exec("SELECT id, name FROM decks");
          if (decksRes.length > 0 && decksRes[0].values) {
            decksRes[0].values.forEach(([id, name]: any) => {
              decksMap[String(id)] = String(name);
            });
          }
        }
      } catch (err) {
        console.warn('Decks table not queryable, will fallback', err);
      }

      // Fallback: col table json decks field
      if (Object.keys(decksMap).length === 0) {
        try {
          const colRes = ankiDb.exec("SELECT decks FROM col");
          if (colRes.length > 0 && colRes[0].values) {
            const decksJson = String(colRes[0].values[0][0]);
            const parsedDecks = JSON.parse(decksJson);
            for (const key in parsedDecks) {
              decksMap[key] = parsedDecks[key].name;
            }
          }
        } catch (err) {
          throw new Error('Could not find deck configuration in the collection database.');
        }
      }

      // Map Anki Decks to newly created Denki Decks
      const deckMapping: Record<string, number> = {};
      let decksCreated = 0;
      for (const [ankiId, name] of Object.entries(decksMap)) {
        // Strip out the custom Anki double-colon namespaces (e.g. "Default::Subdeck" -> "Subdeck")
        const cleanName = name.split('::').pop() || name;
        if (cleanName.toLowerCase() === 'default' && Object.keys(decksMap).length > 1) {
          // Skip empty default decks if others exist
          continue;
        }
        setProgressMsg(`Creating deck: ${cleanName}`);
        const newDeckId = await createDeck(classId, cleanName, `Imported from Anki Deck "${name}"`);
        deckMapping[ankiId] = newDeckId;
        decksCreated++;
      }

      // If no decks were mapped, create a single fallback deck
      if (Object.keys(deckMapping).length === 0) {
        const newDeckId = await createDeck(classId, 'Anki Import', 'Imported Anki Flashcards');
        deckMapping['default'] = newDeckId;
        decksCreated = 1;
      }

      // 6. Query and Import Cards
      setProgressMsg('Extracting flashcards...');
      const cardsQuery = `
        SELECT cards.did, notes.flds
        FROM cards
        JOIN notes ON cards.nid = notes.id
      `;
      const cardsRes = ankiDb.exec(cardsQuery);
      
      let cardsImported = 0;
      if (cardsRes.length > 0 && cardsRes[0].values) {
        const rows = cardsRes[0].values;
        setProgressMsg(`Importing ${rows.length} cards in bulk transaction...`);
        
        const cardsToInsert: any[] = [];
        
        rows.forEach(([did, flds]: any) => {
          // Split fields by Anki's \x1f Unit Separator
          const fields = String(flds).split('\x1f');
          const frontRaw = fields[0] || '';
          const backRaw = fields[1] || fields.slice(1).join('<br>') || ''; // Join other fields if any
          
          if (!frontRaw) return;

          // Replace image and sound paths with inline Base64 data URLs
          const front = replaceMediaInString(frontRaw, mediaLookup);
          const back = replaceMediaInString(backRaw, mediaLookup);

          // Map deck ID or fallback to the first created deck
          let targetDeckId = deckMapping[String(did)];
          if (!targetDeckId) {
            targetDeckId = Object.values(deckMapping)[0] || 0;
          }

          const isCloze = front.includes('{{c') && front.includes('::');
          
          cardsToInsert.push({
            classId,
            deckId: targetDeckId,
            front,
            back,
            cardType: isCloze ? 'cloze' : 'standard',
          });
          cardsImported++;
        });

        if (cardsToInsert.length > 0) {
          await bulkCreateCards(cardsToInsert);
        }
      }

      setLoading(false);
      setStatus({
        type: 'success',
        message: `Successfully imported ${cardsImported} flashcards across ${decksCreated} decks!`,
        decksCreated,
        cardsImported,
      });

      // Celebrate with confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.7 },
        colors: ['#818cf8', '#6366f1', '#3b82f6', '#10b981'],
      });

      if (onComplete) {
        setTimeout(onComplete, 2200);
      }

    } catch (err: any) {
      console.error(err);
      setLoading(false);
      setStatus({
        type: 'error',
        message: err.message || 'An error occurred while loading or parsing the Anki .apkg file.',
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        style={{
          border: isDragging ? '2px dashed #818cf8' : '2px dashed rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          padding: '45px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragging ? 'rgba(129, 140, 248, 0.05)' : 'rgba(255, 255, 255, 0.01)',
          transition: 'all 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".apkg"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {loading ? (
          <RefreshCw size={36} className="animate-spin" style={{ color: '#818cf8', animation: 'spin 1.5s linear infinite' }} />
        ) : (
          <Upload size={36} style={{ color: isDragging ? '#818cf8' : '#a5b4fc' }} />
        )}

        <div>
          <p style={{ fontWeight: 600, fontSize: '15px', color: '#f3f4f6', marginBottom: '4px' }}>
            {loading ? progressMsg : 'Drag and drop your Anki .apkg deck file here'}
          </p>
          <p style={{ fontSize: '13px', color: '#9ca3af' }}>
            {loading ? 'Please wait, compiling database...' : 'or click to browse from your device'}
          </p>
        </div>

        <div style={{
          fontSize: '11px',
          color: '#818cf8',
          background: 'rgba(129, 140, 248, 0.07)',
          padding: '5px 12px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          border: '1px solid rgba(129, 140, 248, 0.15)',
        }}>
          <HelpCircle size={12} /> Supports Anki images, sounds, Cloze, and nested subdecks!
        </div>
      </div>

      {status.type !== 'idle' && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '16px',
          borderRadius: '10px',
          background: status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${status.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
        }}>
          {status.type === 'success' ? (
            <CheckCircle size={20} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
          ) : (
            <AlertCircle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
          )}

          <div style={{ flex: 1 }}>
            <p style={{
              fontWeight: 600,
              fontSize: '14px',
              color: status.type === 'success' ? '#6ee7b7' : '#fca5a5',
              marginBottom: '2px',
            }}>
              {status.type === 'success' ? 'Anki Package Synced!' : 'Import Failed'}
            </p>
            <p style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.4 }}>
              {status.message}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
