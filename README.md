# RightCare — Pharmacy Pre-Consultation (iOS / Expo)

A patient-facing pre-consultation assistant for community pharmacies, built as a
native iPhone app with **React Native + Expo**. The patient enters their details,
describes their symptoms in plain language, answers a short triage questionnaire,
and is routed to either:

- **A pharmacist** — with a QR code (and a shareable PDF record) they present at
  the counter so their answers load into the pharmacist's system, or
- **A GP** — when a red-flag answer means the condition is outside what a
  pharmacist can prescribe for.

Ported from the Claude Design prototype `Pharmacy Pre-Consultation.dc.html`: the
proprietary `DCLogic` template runtime became a React Native screen, HTML/CSS
became native components, the CDN QR widget became `react-native-qrcode-svg`, and
the browser print/download became `expo-print` + `expo-sharing` (share a PDF).

## Stack

- Expo SDK 52 (React Native 0.76, New Architecture enabled)
- `expo-linear-gradient` · `react-native-svg` · `react-native-qrcode-svg`
- `@react-native-masked-view/masked-view` (gradient hero text)
- `expo-print` + `expo-sharing` (PDF record)
- `@expo-google-fonts/manrope` (Manrope typeface)

## Run

```bash
npm install
npx expo start          # then press i (iOS simulator) or scan the QR in Expo Go
npx expo start --ios    # boot straight into the iOS simulator
```

### Build a standalone app (EAS)

`expo-print` and `expo-sharing` are native modules, so the record-download flow
needs a dev/standalone build (not Expo Go) — or just run in the iOS simulator.

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile development   # dev client
eas build --platform ios --profile production    # store build
```

For a purely local native build: `npx expo prebuild -p ios && npx expo run:ios`.

## Structure

- `App.js` — root; loads the Manrope fonts, then renders the screen.
- `src/PharmacyScreen.js` — the full state machine (onboarding → hero → chat),
  triage rules, theming (light/dark) and the pharmacist / GP outcomes.
- `src/theme.js` — scenario data, the light/dark theme, and font-weight helper.
- `src/icons.js` — the SVG logo / avatar marks.

## Behaviour notes

Three props on `<PharmacyScreen>` carry over from the design:

- `typingDelay` (default `550` ms) — bot "typing" pause.
- `showPrices` (default `true`) — show prices on the brand/generic choice.
- `darkMode` (default `false`) — start in dark theme (there's also an in-app toggle).

Triage red flags route to a GP: children under 2, pregnancy/breastfeeding for
flagged conditions (e.g. UTI), red-flag symptoms (wheezing, kidney-infection
signs, "worst-ever" headache, cold sores near the eyes), and symptoms lasting
more than a week for conditions with a duration limit.

Not for emergencies — the UI directs urgent cases to call 000. This is a
prototype, not medical advice or a prescription.

## Verification

`npx expo export --platform ios` bundles clean (896 modules, Hermes bytecode) and
`npx expo-doctor` passes all 18 checks. Verified against Node 24 (nvm).
