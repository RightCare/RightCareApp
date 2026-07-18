// Shared data, theming and font helpers for the RightCare screen.
// Colours carried over verbatim from the Claude Design prototype; the CSS
// gradient/border strings were converted to React-Native-friendly shapes
// (colour arrays for expo-linear-gradient, plain colours for borders).

export const GRAD = ['#12a394', '#0d6f66']; // primary teal action gradient
export const GP_GRAD = ['#e2892f', '#b45309']; // amber GP-referral gradient

const FONT = {
  400: 'Manrope_400Regular',
  500: 'Manrope_500Medium',
  600: 'Manrope_600SemiBold',
  700: 'Manrope_700Bold',
  800: 'Manrope_800ExtraBold',
};
export const f = (w) => FONT[w] || FONT[400];

export const SCENARIOS = {
  hayfever: {
    label: 'Hay fever / allergies', q: 'Which best describes your main symptoms?',
    kw: ['hay fever', 'hayfever', 'allerg', 'sneez', 'itchy eye', 'runny nose', 'pollen', 'blocked nose', 'congest', 'watery eye'],
    symptoms: [
      { label: 'Sneezing, runny nose, itchy eyes' },
      { label: 'Blocked nose mainly' },
      { label: 'Wheezing or chest tightness', red: 'Wheezing or chest tightness can indicate asthma and needs a doctor’s assessment.' },
    ],
    product: 'Fexofenadine 180mg (antihistamine)', brand: 'Telfast 180mg — $21.99', generic: 'Generic fexofenadine — $12.49',
    brandPlain: 'Telfast 180mg', genericPlain: 'Generic fexofenadine',
  },
  uti: {
    label: 'Urinary symptoms (UTI)', q: 'Which best describes your symptoms?', pregRed: true,
    kw: ['uti', 'urinary', 'urine', 'bladder', 'burning when', 'sting when', 'pee', 'wee', 'urinat', 'cystitis'],
    symptoms: [
      { label: 'Burning or stinging when urinating' },
      { label: 'Frequent urge, small amounts' },
      { label: 'Fever, chills or back pain', red: 'Fever or back pain with urinary symptoms can indicate a kidney infection, which needs a GP.' },
    ],
    longRed: 'Urinary symptoms lasting more than a week need a GP review.',
    product: 'Trimethoprim 300mg (3-day course)', brand: 'Alprim 300mg — $19.99', generic: 'Generic trimethoprim — $11.99',
    brandPlain: 'Alprim 300mg', genericPlain: 'Generic trimethoprim',
  },
  headache: {
    label: 'Headache / migraine', q: 'Which best describes your headache?',
    kw: ['headache', 'migraine', 'head hurt', 'head pain', 'tension head', 'sore head'],
    symptoms: [
      { label: 'Mild-to-moderate tension headache' },
      { label: 'Migraine, similar to ones I’ve had before' },
      { label: 'Sudden, severe — worst I’ve ever had', red: 'A sudden, severe “worst ever” headache needs urgent medical assessment.' },
    ],
    longRed: 'A headache persisting more than a week needs a GP review.',
    product: 'Ibuprofen 200mg + paracetamol 500mg', brand: 'Nuromol — $14.99', generic: 'Generic ibuprofen/paracetamol — $8.49',
    brandPlain: 'Nuromol', genericPlain: 'Generic ibuprofen/paracetamol',
  },
  coldsore: {
    label: 'Cold sore', q: 'Which best describes it?',
    kw: ['cold sore', 'coldsore', 'lip blister', 'lip sore', 'herpes', 'fever blister', 'tingle lip'],
    symptoms: [
      { label: 'Tingling or an early blister on the lip' },
      { label: 'Crusted sore, healing slowly' },
      { label: 'Sores spreading near the eyes', red: 'Cold sores near the eyes can affect vision and need a doctor promptly.' },
    ],
    product: 'Aciclovir 5% cream', brand: 'Zovirax cream — $16.99', generic: 'Generic aciclovir cream — $9.99',
    brandPlain: 'Zovirax cream', genericPlain: 'Generic aciclovir cream',
  },
};

export function theme(dark) {
  return dark
    ? {
        screenBg: ['#123330', '#0d2725', '#0a1e1c'],
        glowA: 'rgba(18,163,148,0.40)', glowB: 'rgba(26,134,184,0.35)',
        panel: 'rgba(255,255,255,0.07)', panelBorder: 'rgba(255,255,255,0.14)',
        text: '#eaf5f3', muted: '#9dc4bf', sub: '#7fa6a1', accent: '#5eead4',
        heroText: ['#eafff9', '#5eead4', '#7dd3fc'],
        inputBg: 'rgba(255,255,255,0.08)', inputBorder: 'rgba(255,255,255,0.18)',
        chipBg: 'rgba(255,255,255,0.08)', chipBorder: 'rgba(255,255,255,0.22)', chipColor: '#7fe0d1',
        rowBorder: 'rgba(255,255,255,0.10)',
        gpPanel: ['rgba(255,190,120,0.14)', 'rgba(255,180,100,0.06)'], gpBorder: 'rgba(255,190,120,0.28)',
        gpAccent: '#ffcb8a', gpMuted: '#d8b98a', gpRowBorder: 'rgba(255,190,120,0.16)',
        gpChipBg: 'rgba(255,190,120,0.10)', gpChipBorder: 'rgba(255,190,120,0.30)',
        shadowOpacity: 0.45,
      }
    : {
        screenBg: ['#d3efe9', '#e7f3f1', '#eef4f6'],
        glowA: '#7ad6c8', glowB: '#8fd0e8',
        panel: 'rgba(255,255,255,0.58)', panelBorder: 'rgba(255,255,255,0.70)',
        text: '#0c2b28', muted: '#3d6b66', sub: '#5d817c', accent: '#0d6f66',
        heroText: ['#0c3b36', '#12a394', '#1a86b8'],
        inputBg: 'rgba(255,255,255,0.70)', inputBorder: 'rgba(15,118,110,0.22)',
        chipBg: 'rgba(255,255,255,0.55)', chipBorder: 'rgba(15,118,110,0.24)', chipColor: '#0d6f66',
        rowBorder: 'rgba(15,118,110,0.10)',
        gpPanel: ['rgba(255,250,240,0.85)', 'rgba(255,247,232,0.58)'], gpBorder: 'rgba(255,255,255,0.80)',
        gpAccent: '#92400e', gpMuted: '#6b5326', gpRowBorder: 'rgba(180,83,9,0.12)',
        gpChipBg: 'rgba(255,255,255,0.60)', gpChipBorder: 'rgba(180,83,9,0.25)',
        shadowOpacity: 0.18,
      };
}
