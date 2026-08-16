from pathlib import Path

path = Path('scripts/apply-study-integrity.py')
text = path.read_text()
text = text.replace(
    r'r"  loadAllClassStats: async \(\) => \{[\s\S]*?\n  \},\n\n  loadDeckStats:"',
    r'r"loadAllClassStats: async \(\) => \{[\s\S]*?\n  \},\n\n  loadDeckStats:"',
)
text = text.replace(
    r'r"  loadDeckStats: async \(classId\) => \{[\s\S]*?\n  \},\n\n  loadStats:"',
    r'r"loadDeckStats: async \(classId\) => \{[\s\S]*?\n  \},\n\n  loadStats:"',
)
path.write_text(text)
