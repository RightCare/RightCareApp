import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Animated, Easing, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import MaskedView from '@react-native-masked-view/masked-view';
import QRCode from 'react-native-qrcode-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';

import { theme, SCENARIOS, GRAD, GP_GRAD, f } from './theme';
import { PharmIcon, PlusIcon } from './icons';
import { saveConsult, matchScenarioRemote, triageChat } from './supabase';

const IOS = Platform.OS === 'ios';

// ── Small presentational helpers ──────────────────────────────
function Grad({ colors = GRAD, style, children, start = { x: 0, y: 0 }, end = { x: 1, y: 1 } }) {
  return <LinearGradient colors={colors} start={start} end={end} style={style}>{children}</LinearGradient>;
}

// Filled gradient button (teal by default, amber for GP).
function GradButton({ onPress, colors = GRAD, style, textStyle, children }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={style}>
      <Grad colors={colors} style={{ borderRadius: (style && style.borderRadius) || 12, alignItems: 'center', justifyContent: 'center', paddingVertical: (style && style.paddingVertical) || 14, paddingHorizontal: (style && style.paddingHorizontal) || 22 }}>
        <Text style={textStyle}>{children}</Text>
      </Grad>
    </TouchableOpacity>
  );
}

// Animated three-dot "typing" indicator.
function TypingDots() {
  const dots = [React.useRef(new Animated.Value(0.25)).current, React.useRef(new Animated.Value(0.25)).current, React.useRef(new Animated.Value(0.25)).current];
  React.useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(v, { toValue: 1, duration: 300, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: 500, easing: Easing.ease, useNativeDriver: true }),
          Animated.delay((2 - i) * 200),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#0f766e', opacity: v }} />
      ))}
    </View>
  );
}

export default class PharmacyScreen extends React.Component {
  static defaultProps = { typingDelay: 550, showPrices: true, darkMode: false };

  state = {
    phase: 'onboarding', onbError: false, messages: [], typing: false,
    ui: null, qa: {}, qErr: false, outcome: null, dark: false, sex: '',
    saved: null, // access_code once the consult is persisted to Supabase
    dobDate: null, showDobPicker: false,
  };

  SCENARIOS = SCENARIOS;

  componentDidMount() {
    if (this.props.darkMode) this.setState({ dark: true });
  }

  componentDidUpdate() {
    if (this.chatEl) this.chatEl.scrollToEnd({ animated: true });
  }

  theme(dark) { return theme(dark); }
  toggleDark = () => this.setState((s) => ({ dark: !s.dark }));

  delay() { const d = this.props.typingDelay; return (d === undefined || d === null) ? 550 : d; }

  say(texts, then) {
    const arr = Array.isArray(texts) ? texts : [texts];
    const next = (i) => {
      if (i >= arr.length) { this.setState({ typing: false }); if (then) then(); return; }
      this.setState({ typing: true });
      setTimeout(() => {
        this.setState(
          (s) => ({ messages: [...s.messages, { who: 'bot', text: arr[i] }], typing: false }),
          () => setTimeout(() => next(i + 1), 120),
        );
      }, this.delay());
    };
    next(0);
  }

  user(text) { this.setState((s) => ({ messages: [...s.messages, { who: 'user', text }] })); }
  ans(q, a) { this.record.answers.push({ q, a }); }

  onName = (txt) => { this.nameVal = txt; };
  setSex = (v) => { this.setState({ sex: v, onbError: false }); };

  formatDob(date) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + date.getFullYear();
  }

  dobBounds() {
    const now = new Date();
    return {
      max: now,
      min: new Date(now.getFullYear() - 120, now.getMonth(), now.getDate()),
      // Sensible default so the wheel doesn't open on "today" for a DOB field.
      fallback: new Date(now.getFullYear() - 30, 0, 1),
    };
  }

  openDobPicker = () => {
    this.tempDobDate = this.state.dobDate || this.dobBounds().fallback;
    this.setState({ showDobPicker: true, onbError: false });
  };

  setDob = (date) => {
    this.dobVal = this.formatDob(date);
    this.setState({ dobDate: date });
  };

  onDobChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      this.setState({ showDobPicker: false });
      if (event.type === 'dismissed' || !selectedDate) return;
      this.setDob(selectedDate);
      return;
    }
    if (selectedDate) this.tempDobDate = selectedDate;
  };

  confirmDobPicker = () => {
    this.setDob(this.tempDobDate || this.state.dobDate || this.dobBounds().fallback);
    this.setState({ showDobPicker: false });
  };

  cancelDobPicker = () => this.setState({ showDobPicker: false });

  ageFromDob(dob) {
    const m = (dob || '').match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    const bd = new Date(y, mo - 1, d);
    if (isNaN(bd.getTime()) || bd.getMonth() !== mo - 1) return null;
    const now = new Date();
    let a = now.getFullYear() - y;
    if (now.getMonth() < mo - 1 || (now.getMonth() === mo - 1 && now.getDate() < d)) a--;
    return (a >= 0 && a <= 120) ? a : null;
  }

  onDetailsContinue = () => {
    const name = (this.nameVal || '').trim();
    const dob = (this.dobVal || '').trim();
    const sex = this.state.sex;
    if (!name || !dob || !sex) { this.setState({ onbError: true }); return; }
    const age = this.ageFromDob(dob);
    this.record = {
      name, dob, sex, age, answers: [],
      id: 'PC-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      date: new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }),
    };
    this.setState({ phase: 'hero', onbError: false });
  };

  backToOnboarding = () => this.setState({ phase: 'onboarding' });

  onQuery = (txt) => { this.queryVal = txt; };
  heroRef = (el) => { this.heroEl = el; };
  submitQuery = () => {
    const q = (this.queryVal || '').trim();
    if (!q) return;
    this.openChat(q);
  };

  // Local keyword fallback — used only if the Gemini-backed remote matcher
  // is unreachable or times out, so the app still works offline.
  matchScenario(q) {
    const t = q.toLowerCase();
    for (const k of Object.keys(this.SCENARIOS)) {
      if (this.SCENARIOS[k].kw.some((w) => t.includes(w))) return k;
    }
    return null;
  }

  // Resolves which pharmacist-curated scenario (if any) fits the query.
  // Tries the Gemini classifier first; undefined means the call failed or
  // timed out, in which case we fall back to local keyword matching rather
  // than treating it the same as an explicit "no match".
  async resolveScenario(query) {
    const remote = await matchScenarioRemote(query);
    if (remote !== undefined) return remote;
    return this.matchScenario(query);
  }

  openChat(query) {
    this.record.answers = [];
    delete this.record.query; delete this.record.medication; delete this.record.outcome; delete this.record.referralReason; delete this.record.accessCode;
    this.record.query = query;
    this.convo = [{ role: 'user', text: query }]; // running triage transcript
    this.askCount = 0;
    this.setState({ phase: 'chat', messages: [], ui: null, qa: {}, qErr: false, outcome: null, saved: null, typing: true }, () => {
      this.user(query);
      this.runTriage();
    });
  }

  // Send the running conversation to the triage brain and act on its next move.
  runTriage() {
    this.setState({ ui: null, typing: true });
    triageChat(this.convo).then((res) => {
      if (!res) { this.triageFallback(); return; }
      const msg = res.message;
      if (res.action === 'suggest' && res.conditionKey && this.SCENARIOS[res.conditionKey]) {
        this.matchedKey = res.conditionKey;
        this.convo.push({ role: 'assistant', text: msg });
        this.say(msg, () => this.setState({ ui: { kind: 'confirm' } }));
      } else if (res.action === 'escalate') {
        this.convo.push({ role: 'assistant', text: msg });
        this.escalateToGP(msg);
      } else {
        // 'ask' — keep the conversation going, with a safety cap so it can't
        // loop forever; after a few rounds we fall back to the manual picker.
        this.askCount = (this.askCount || 0) + 1;
        this.convo.push({ role: 'assistant', text: msg });
        this.say(msg, () => this.setState({ ui: { kind: this.askCount > 4 ? 'pick' : 'triage' } }));
      }
    });
  }

  // Remote conversation unavailable — fall back to the one-shot matcher on the
  // most recent thing the patient said, so they still get routed.
  triageFallback() {
    const lastUser = [...this.convo].reverse().find((t) => t.role === 'user');
    this.resolveScenario(lastUser ? lastUser.text : this.record.query).then((matchedKey) => {
      if (matchedKey) {
        this.matchedKey = matchedKey;
        this.say('Thanks. It sounds like this is about ' + this.SCENARIOS[matchedKey].label.toLowerCase() + '. Is that right?', () => this.setState({ ui: { kind: 'confirm' } }));
      } else {
        this.say('Thanks for that. To make sure I ask the right questions, which of these is closest?', () => this.setState({ ui: { kind: 'pick' } }));
      }
    });
  }

  // Red flag / out-of-scope: record it and route to the GP-referral outcome.
  escalateToGP(message) {
    this.ans('Reason for visit', this.record.query);
    this.ans('Assistant note', message);
    this.gpReason = message;
    this.record.outcome = 'GP referral';
    this.record.referralReason = message;
    this.persistConsult();
    this.say(message, () => this.setState({ outcome: 'gp', ui: null }));
  }

  startPick() { this.say('No problem — which of these is closest to what’s going on?', () => this.setState({ ui: { kind: 'pick' } })); }
  confirmYesTap = () => { this.user('Yes, that’s right'); this.openQuestionnaire(this.matchedKey); };
  confirmNoTap = () => { this.user('No, something else'); this.startPick(); };

  qGroups() {
    const sc = this.sc;
    const groups = [
      { id: 'who', label: 'Who is the medicine for?', options: [{ label: 'Myself' }, { label: 'Someone else' }] },
    ];
    if (this.record && this.record.sex === 'Female') {
      groups.push({ id: 'preg', label: 'Are you currently pregnant or breastfeeding?', options: [{ label: 'No' }, { label: 'Yes' }] });
    }
    groups.push(
      { id: 'symptom', label: sc.q, options: sc.symptoms.map((s) => ({ label: s.label })) },
      { id: 'duration', label: 'How long have the symptoms lasted?', options: [{ label: 'Less than 24 hours' }, { label: '1–3 days' }, { label: '4–7 days' }, { label: 'More than a week' }] },
      { id: 'tried', label: 'Have you tried any other medicines or treatments?', options: [{ label: 'No' }, { label: 'Yes — didn’t help' }, { label: 'Yes — helped a little' }] },
      { id: 'conditions', label: 'Do you have any other health conditions?', options: [{ label: 'No' }, { label: 'Yes' }] },
      { id: 'medicines', label: 'Do you take any other regular medicines?', options: [{ label: 'No' }, { label: 'Yes' }] },
    );
    return groups;
  }

  openQuestionnaire(key) {
    this.sc = this.SCENARIOS[key];
    this.setState({ qa: {}, qErr: false });
    this.say('Great — please answer these few questions, then submit.', () => this.setState({ ui: { kind: 'questionnaire' } }));
  }

  setQA = (id, label) => { this.setState((s) => ({ qa: { ...s.qa, [id]: label }, qErr: false })); };

  submitQuestionnaire = () => {
    const qa = this.state.qa || {};
    const groups = this.qGroups();
    if (groups.some((g) => !qa[g.id])) { this.setState({ qErr: true }); return; }
    this.record.answers = [{ q: 'Reason for visit', a: this.sc.label }];
    this.ans('Medicine is for', qa.who);
    if (qa.preg !== undefined) this.ans('Pregnant or breastfeeding', qa.preg);
    this.ans('Symptoms', qa.symptom);
    this.ans('Duration', qa.duration);
    this.ans('Other treatments tried', qa.tried);
    this.ans('Other health conditions', qa.conditions);
    this.ans('Other regular medicines', qa.medicines);
    let gp = null;
    const age = this.record.age;
    if (age != null && age < 2) gp = 'Children under 2 need a doctor’s assessment before any medicine.';
    else if (this.record.sex === 'Female' && qa.preg === 'Yes' && this.sc.pregRed) gp = 'This condition during pregnancy or breastfeeding needs a GP.';
    if (!gp) { const sym = this.sc.symptoms.find((x) => x.label === qa.symptom); if (sym && sym.red) gp = sym.red; }
    if (!gp && qa.duration === 'More than a week' && this.sc.longRed) gp = this.sc.longRed;
    this.setState({ ui: null });
    this.user('Submitted my answers');
    if (gp) this.toGP(gp); else this.assess();
  };

  assess() {
    const sc = this.sc;
    this.say([
      'Thanks — checking your answers…',
      'Good news: this is something a pharmacist can prescribe for. Recommended: ' + sc.product + '.',
      'Would you like the brand version or the generic? Same active ingredient — the pharmacist will confirm it’s right for you.',
    ], () => this.setState({ ui: { kind: 'brand' } }));
  }

  pickMed(plain, label) {
    this.user(label);
    this.record.medication = plain;
    this.record.outcome = 'Pharmacist consultation — ' + this.sc.product;
    this.ans('Medication choice', plain);
    this.persistConsult();
    this.say('Done. Here’s your QR code — show it at the pharmacy counter.', () => this.setState({ outcome: 'pharm', ui: null }));
  }

  // Save the completed consult to Supabase. Fire-and-forget: if it fails the
  // on-device outcome still renders (QR falls back to the local payload).
  persistConsult() {
    saveConsult(this.record).then((res) => {
      if (res && res.access_code) {
        this.record.accessCode = res.access_code;
        this.setState({ saved: res.access_code });
      }
    });
  }

  toGP(reason) {
    this.gpReason = reason;
    this.record.outcome = 'GP referral';
    this.record.referralReason = reason;
    this.persistConsult();
    this.say([
      'Thanks for letting me know.',
      'Based on that answer, this needs a doctor rather than a pharmacist. I’ve prepared a summary you can take to your GP.',
    ], () => this.setState({ outcome: 'gp', ui: null }));
  }

  barRef = (el) => { this.barEl = el; };
  onBarInput = (txt) => { this.chatInput = txt; };
  clearBar() { this.chatInput = ''; if (this.barEl) this.barEl.clear(); }

  handleSend = () => {
    const t = (this.chatInput || '').trim();
    if (!t) return;
    const k = this.state.ui && this.state.ui.kind;
    this.clearBar();
    if (k === 'triage') {
      this.user(t);
      this.convo.push({ role: 'user', text: t });
      this.runTriage();
      return;
    }
    if (k === 'confirm') {
      this.user(t);
      if (/^\s*y/i.test(t)) this.openQuestionnaire(this.matchedKey);
      else if (/^\s*n/i.test(t)) this.startPick();
      else this.say('No problem — tap Yes or No above, or tell me which condition fits best.');
      return;
    }
    if (k === 'pick') {
      this.user(t);
      this.setState({ typing: true });
      this.resolveScenario(t).then((m) => {
        if (m) this.openQuestionnaire(m);
        else this.say('I want to get this right — please pick the closest option above.');
      });
      return;
    }
    if (k === 'brand') {
      this.user(t);
      if (/generic/i.test(t)) this.pickMed(this.sc.genericPlain, this.sc.genericPlain);
      else if (/brand/i.test(t) || t.toLowerCase().includes(this.sc.brandPlain.toLowerCase().split(' ')[0])) this.pickMed(this.sc.brandPlain, this.sc.brandPlain);
      else this.say('Would you like the brand or the generic version?');
      return;
    }
    this.user(t);
    this.ans('Additional note', t);
    this.say('Thanks — I’ve added that to your record for the pharmacist.');
  };

  qrPayload() {
    const r = this.record;
    // Once persisted, the QR carries only a server-verifiable reference — the
    // pharmacist's scanner fetches the authoritative record from the backend,
    // rather than trusting data embedded in the code.
    if (r.accessCode) {
      return { v: 2, ref: r.id, code: r.accessCode };
    }
    // Fallback for an unsynced consult (offline / Supabase not configured).
    return { v: 1, id: r.id, name: r.name, dob: r.dob, date: r.date, outcome: r.outcome, medication: r.medication || null, answers: r.answers };
  }

  downloadRecord = async () => {
    const r = this.record;
    const rows = [['Name', r.name], ['Date of birth', r.dob], ['Date', r.date], ['Consult ID', r.id], ['Outcome', r.outcome]]
      .concat(r.referralReason ? [['Referral reason', r.referralReason]] : [])
      .concat(r.answers.map((a) => [a.q, a.a]))
      .map((p) => '<tr><td style="padding:6px 16px 6px 0;color:#5d7a77;vertical-align:top;white-space:nowrap;">' + p[0] + '</td><td style="padding:6px 0;">' + p[1] + '</td></tr>').join('');
    const html = '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pre-Consultation Record ' + r.id + '</title></head><body style="font-family:Helvetica,Arial,sans-serif;color:#17302e;padding:40px;max-width:640px;">' +
      '<h1 style="font-size:20px;border-bottom:2px solid #0f766e;padding-bottom:8px;">RightCare — Pre-Consultation Record</h1>' +
      '<table style="font-size:14px;border-collapse:collapse;margin-top:16px;">' + rows + '</table>' +
      '<p style="font-size:11px;color:#8aa3a0;margin-top:32px;">Generated by the pharmacy pre-consultation assistant. Not a prescription. Keep for your records or show your GP.</p>' +
      '</body></html>';
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch (e) {
      // no-op: user cancelled or sharing unavailable
    }
  };

  restart = () => {
    this.queryVal = '';
    this.clearBar();
    if (this.heroEl) this.heroEl.clear();
    if (this.record) delete this.record.accessCode;
    this.setState({ phase: 'hero', messages: [], ui: null, qa: {}, qErr: false, outcome: null, saved: null });
  };

  chatRef = (el) => { this.chatEl = el; };

  // ── Render ──────────────────────────────────────────────────
  render() {
    const s = this.state;
    const t = this.theme(s.dark);
    const r = this.record || { answers: [] };
    const kind = s.ui && s.ui.kind;

    const firstName = (r.name || '').trim().split(/\s+/)[0] || 'there';
    const patientLine = r.name ? (r.name + ' · DOB ' + r.dob) : '';
    const ageSex = [
      r.age != null ? { q: 'Age', a: r.age + ' yrs' } : null,
      r.sex ? { q: 'Sex', a: r.sex } : null,
    ].filter(Boolean);
    const summaryRows = [{ q: 'Name', a: r.name || '' }, { q: 'Date of birth', a: r.dob || '' }].concat(ageSex).concat(r.answers || []);
    const scenarioKeys = Object.keys(this.SCENARIOS);
    const sp = this.props.showPrices !== false;
    const darkLabel = s.dark ? '☀ Light' : '● Dark';

    const barPlaceholder = kind === 'triage' ? 'Type your reply…'
      : kind === 'confirm' ? 'Type yes or no…'
        : kind === 'pick' ? 'Describe it in your own words…'
          : kind === 'brand' ? 'Type brand or generic…'
            : 'Add anything else…';
    const showBar = s.phase === 'chat' && kind !== 'questionnaire';

    const panelShadow = { shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: t.shadowOpacity, shadowRadius: 22, elevation: 8 };
    const tealShadow = { shadowColor: '#0d6f66', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 14, elevation: 6 };

    let inlineOptions = null;
    if (kind === 'confirm') inlineOptions = [{ label: 'Yes, that’s right', act: this.confirmYesTap }, { label: 'No, something else', act: this.confirmNoTap }];
    else if (kind === 'pick') inlineOptions = scenarioKeys.map((k) => ({ label: this.SCENARIOS[k].label, act: () => { this.user(this.SCENARIOS[k].label); this.openQuestionnaire(k); } }));
    else if (kind === 'brand') inlineOptions = [
      { label: sp ? this.sc.brand : this.sc.brandPlain, act: () => this.pickMed(this.sc.brandPlain, sp ? this.sc.brand : this.sc.brandPlain) },
      { label: sp ? this.sc.generic : this.sc.genericPlain, act: () => this.pickMed(this.sc.genericPlain, sp ? this.sc.generic : this.sc.genericPlain) },
    ];

    const Chip = ({ label, onPress, style }) => (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: t.chipBorder, backgroundColor: t.chipBg }, style]}>
        <Text style={{ fontSize: 12, fontFamily: f(700), color: t.chipColor }}>{label}</Text>
      </TouchableOpacity>
    );

    const label = (txt) => <Text style={{ fontSize: 10.5, fontFamily: f(800), textTransform: 'uppercase', letterSpacing: 0.7, color: t.muted }}>{txt}</Text>;
    const input = (props) => (
      <TextInput
        placeholderTextColor={t.sub}
        style={{ padding: 12, paddingHorizontal: 14, borderRadius: 12, fontSize: 15, fontFamily: f(500), borderWidth: 1, borderColor: t.inputBorder, color: t.text, backgroundColor: t.inputBg }}
        {...props}
      />
    );

    const summaryTable = (rows, mutedColor, borderColor) => (
      <View style={{ gap: 5 }}>
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: borderColor }}>
            <Text style={{ width: 120, fontSize: 12.5, fontFamily: f(600), color: mutedColor }}>{row.q}</Text>
            <Text style={{ flex: 1, fontSize: 12.5, fontFamily: f(500), color: t.text }}>{row.a}</Text>
          </View>
        ))}
      </View>
    );

    return (
      <View style={{ flex: 1, backgroundColor: t.screenBg[0] }}>
        <LinearGradient colors={t.screenBg} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: -70, left: -80, width: 280, height: 280, borderRadius: 140, opacity: 0.45, backgroundColor: t.glowA }} />
        <View pointerEvents="none" style={{ position: 'absolute', bottom: -110, right: -70, width: 300, height: 300, borderRadius: 150, opacity: 0.4, backgroundColor: t.glowB }} />

        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={IOS ? 'padding' : undefined}>

            {s.phase !== 'chat' && (
              <TouchableOpacity onPress={this.toggleDark} activeOpacity={0.8} style={{ position: 'absolute', top: 8, right: 14, zIndex: 30, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: t.chipBorder, backgroundColor: t.chipBg }}>
                <Text style={{ fontSize: 11, fontFamily: f(800), color: t.chipColor }}>{darkLabel}</Text>
              </TouchableOpacity>
            )}

            {/* ── Onboarding ─────────────────────────── */}
            {s.phase === 'onboarding' && (
              <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 18 }} keyboardShouldPersistTaps="handled">
                <View style={[{ borderRadius: 22, padding: 24, gap: 16, backgroundColor: t.panel, borderWidth: 1, borderColor: t.panelBorder }, panelShadow]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                    <Grad style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><PharmIcon /></Grad>
                    <View style={{ gap: 2 }}>
                      <Text style={{ fontSize: 15, fontFamily: f(800), color: t.text }}>RightCare</Text>
                      <Text style={{ fontSize: 11, fontFamily: f(600), color: t.muted }}>Step 1 of 2 · Your details</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 21, fontFamily: f(800), color: t.text }}>Let's set up your visit</Text>
                  <Text style={{ fontSize: 12.5, fontFamily: f(500), lineHeight: 18, color: t.muted, marginTop: -8 }}>These details go on your record and the QR code the pharmacist scans.</Text>
                  <View style={{ gap: 5 }}>{label('Full name')}{input({ onChangeText: this.onName, placeholder: 'e.g. Alex Nguyen', autoCapitalize: 'words' })}</View>
                  <View style={{ gap: 5 }}>
                    {label('Date of birth')}
                    <TouchableOpacity onPress={this.openDobPicker} activeOpacity={0.8} style={{ padding: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg }}>
                      <Text style={{ fontSize: 15, fontFamily: f(500), color: s.dobDate ? t.text : t.sub }}>
                        {s.dobDate ? this.formatDob(s.dobDate) : 'DD/MM/YYYY'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ gap: 6 }}>
                    {label('Sex')}
                    <View style={{ flexDirection: 'row', gap: 7 }}>
                      {['Female', 'Male', 'Other'].map((v) => {
                        const sel = s.sex === v;
                        return sel ? (
                          <TouchableOpacity key={v} onPress={() => this.setSex(v)} activeOpacity={0.85} style={{ flex: 1 }}>
                            <Grad style={{ borderRadius: 12, paddingVertical: 11, alignItems: 'center' }}><Text style={{ fontSize: 13, fontFamily: f(700), color: '#fff' }}>{v}</Text></Grad>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity key={v} onPress={() => this.setSex(v)} activeOpacity={0.8} style={{ flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: t.chipBorder, backgroundColor: t.inputBg }}>
                            <Text style={{ fontSize: 13, fontFamily: f(700), color: t.chipColor }}>{v}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  {s.onbError && <Text style={{ fontSize: 12, fontFamily: f(600), color: '#e5644a', marginTop: -6 }}>Please enter your name, date of birth and sex.</Text>}
                  <GradButton onPress={this.onDetailsContinue} style={[{ borderRadius: 12 }, tealShadow]} textStyle={{ fontSize: 15, fontFamily: f(800), color: '#fff' }}>Continue</GradButton>
                  <Text style={{ fontSize: 10.5, textAlign: 'center', fontFamily: f(500), color: t.sub }}>Not for emergencies — if urgent, call 000.</Text>
                </View>
              </ScrollView>
            )}

            {/* ── Date of birth picker ──────────────────── */}
            {s.showDobPicker && (IOS ? (
              <Modal transparent animationType="slide" visible onRequestClose={this.cancelDobPicker}>
                <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                  <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={this.cancelDobPicker} />
                  <View style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, gap: 10, backgroundColor: t.screenBg[0], borderWidth: 1, borderColor: t.panelBorder }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <TouchableOpacity onPress={this.cancelDobPicker}><Text style={{ fontSize: 14, fontFamily: f(700), color: t.muted }}>Cancel</Text></TouchableOpacity>
                      <Text style={{ fontSize: 13, fontFamily: f(800), color: t.text }}>Date of birth</Text>
                      <TouchableOpacity onPress={this.confirmDobPicker}><Text style={{ fontSize: 14, fontFamily: f(800), color: t.accent }}>Done</Text></TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={this.tempDobDate || s.dobDate || this.dobBounds().fallback}
                      mode="date"
                      display="spinner"
                      maximumDate={this.dobBounds().max}
                      minimumDate={this.dobBounds().min}
                      onChange={this.onDobChange}
                      textColor={t.text}
                      style={{ alignSelf: 'center' }}
                    />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker
                value={s.dobDate || this.dobBounds().fallback}
                mode="date"
                display="default"
                maximumDate={this.dobBounds().max}
                minimumDate={this.dobBounds().min}
                onChange={this.onDobChange}
              />
            ))}

            {/* ── Hero ───────────────────────────────── */}
            {s.phase === 'hero' && (
              <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22 }} keyboardShouldPersistTaps="handled">
                <Text style={{ fontSize: 13, fontFamily: f(700), color: t.accent, marginBottom: 10 }}>Hi {firstName},</Text>
                <MaskedView style={{ height: 78, width: '100%' }} maskElement={<Text style={{ fontSize: 30, fontFamily: f(800), letterSpacing: -0.9, lineHeight: 34, textAlign: 'center' }}>What brings you in today?</Text>}>
                  <LinearGradient colors={t.heroText} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.4 }} style={{ flex: 1 }} />
                </MaskedView>
                <Text style={{ fontSize: 13.5, fontFamily: f(500), textAlign: 'center', lineHeight: 20, color: t.muted, marginTop: 12 }}>Describe your symptoms in your own words. I'll ask a few quick questions, then hand you to the pharmacist — or your GP if that's safer.</Text>
                <View style={[{ width: '100%', marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, paddingLeft: 16, padding: 6, backgroundColor: t.panel, borderWidth: 1, borderColor: t.panelBorder }, panelShadow]}>
                  <TextInput ref={this.heroRef} onChangeText={this.onQuery} onSubmitEditing={this.submitQuery} returnKeyType="send" placeholder="e.g. sneezing, itchy eyes…" placeholderTextColor={t.sub} style={{ flex: 1, fontSize: 15, fontFamily: f(500), paddingVertical: 10, color: t.text }} />
                  <TouchableOpacity onPress={this.submitQuery} activeOpacity={0.85}>
                    <Grad style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 17 }}>↑</Text></Grad>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 }}>
                  {scenarioKeys.map((k) => <Chip key={k} label={this.SCENARIOS[k].label} onPress={() => this.openChat(this.SCENARIOS[k].label, k)} />)}
                </View>
                <View style={{ flexDirection: 'row', marginTop: 22 }}>
                  <Text style={{ fontSize: 10.5, fontFamily: f(500), color: t.sub }}>{patientLine} · </Text>
                  <Text onPress={this.backToOnboarding} style={{ fontSize: 10.5, fontFamily: f(600), color: t.accent }}>edit</Text>
                </View>
              </ScrollView>
            )}

            {/* ── Chat ───────────────────────────────── */}
            {s.phase === 'chat' && (
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}>
                  <Grad style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}><PharmIcon size={22} /></Grad>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: f(800), color: t.text }}>RightCare</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: f(500), color: t.muted }}>{patientLine}</Text>
                  </View>
                  <TouchableOpacity onPress={this.toggleDark} activeOpacity={0.8} style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: t.chipBorder, backgroundColor: t.chipBg }}>
                    <Text style={{ fontSize: 10, fontFamily: f(800), color: t.chipColor }}>{darkLabel}</Text>
                  </TouchableOpacity>
                  <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.panel, borderWidth: 1, borderColor: t.panelBorder }}>
                    <Text style={{ fontSize: 10, fontFamily: f(800), color: '#e5644a' }}>SOS 000</Text>
                  </View>
                </View>

                <ScrollView ref={this.chatRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }} keyboardShouldPersistTaps="handled">
                  {s.messages.map((m, i) => {
                    const isBot = m.who === 'bot';
                    return (
                      <View key={i} style={{ flexDirection: 'row', gap: 8, justifyContent: isBot ? 'flex-start' : 'flex-end' }}>
                        {isBot && <Grad style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}><PlusIcon /></Grad>}
                        {isBot ? (
                          <View style={{ maxWidth: '78%', paddingVertical: 10, paddingHorizontal: 13, borderRadius: 15, backgroundColor: t.panel, borderWidth: 1, borderColor: t.panelBorder }}>
                            <Text style={{ fontSize: 13.5, lineHeight: 20, fontFamily: f(500), color: t.text }}>{m.text}</Text>
                          </View>
                        ) : (
                          <Grad style={{ maxWidth: '78%', borderRadius: 15 }}>
                            <Text style={{ fontSize: 13.5, lineHeight: 20, fontFamily: f(500), color: '#fff', paddingVertical: 10, paddingHorizontal: 13 }}>{m.text}</Text>
                          </Grad>
                        )}
                      </View>
                    );
                  })}

                  {s.typing && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Grad style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}><PlusIcon /></Grad>
                      <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 15, backgroundColor: t.panel, borderWidth: 1, borderColor: t.panelBorder }}><TypingDots /></View>
                    </View>
                  )}

                  {inlineOptions && (
                    <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginLeft: 34 }}>
                      {inlineOptions.map((c, i) => (
                        <Chip key={i} label={c.label} onPress={c.act} style={{ paddingVertical: 10, paddingHorizontal: 15, borderRadius: 999 }} />
                      ))}
                    </View>
                  )}

                  {kind === 'questionnaire' && this.sc && (
                    <View style={[{ borderRadius: 18, padding: 20, gap: 18, marginTop: 2, backgroundColor: t.panel, borderWidth: 1, borderColor: t.panelBorder }, panelShadow]}>
                      <View style={{ gap: 3 }}>
                        <Text style={{ fontSize: 10.5, fontFamily: f(800), textTransform: 'uppercase', letterSpacing: 0.9, color: t.accent }}>Questionnaire · {this.sc.label}</Text>
                        <Text style={{ fontSize: 17, fontFamily: f(800), color: t.text }}>A few quick questions</Text>
                        <Text style={{ fontSize: 12, fontFamily: f(500), color: t.muted }}>Tap an answer for each, then submit.</Text>
                      </View>
                      {this.qGroups().map((g) => (
                        <View key={g.id} style={{ gap: 8 }}>
                          <Text style={{ fontSize: 13, fontFamily: f(700), lineHeight: 18, color: t.text }}>{g.label}</Text>
                          <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
                            {g.options.map((o) => {
                              const sel = s.qa[g.id] === o.label;
                              return sel ? (
                                <TouchableOpacity key={o.label} onPress={() => this.setQA(g.id, o.label)} activeOpacity={0.85}>
                                  <Grad style={{ borderRadius: 11, paddingVertical: 9, paddingHorizontal: 13 }}><Text style={{ fontSize: 12.5, fontFamily: f(700), color: '#fff' }}>{o.label}</Text></Grad>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity key={o.label} onPress={() => this.setQA(g.id, o.label)} activeOpacity={0.8} style={{ paddingVertical: 9, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: t.chipBorder, backgroundColor: t.inputBg }}>
                                  <Text style={{ fontSize: 12.5, fontFamily: f(700), color: t.chipColor }}>{o.label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}
                      {s.qErr && <Text style={{ fontSize: 12, fontFamily: f(700), color: '#e5644a' }}>Please answer every question before submitting.</Text>}
                      <GradButton onPress={this.submitQuestionnaire} style={[{ borderRadius: 12 }, tealShadow]} textStyle={{ fontSize: 14, fontFamily: f(800), color: '#fff' }}>Submit answers</GradButton>
                    </View>
                  )}

                  {s.outcome === 'pharm' && (
                    <View style={[{ borderRadius: 18, padding: 20, gap: 14, marginTop: 6, backgroundColor: t.panel, borderWidth: 1, borderColor: t.panelBorder }, panelShadow]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Grad style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 15, fontFamily: f(700) }}>✓</Text></Grad>
                        <Text style={{ fontSize: 16, fontFamily: f(800), color: t.accent }}>A pharmacist can help</Text>
                      </View>
                      <Text style={{ fontSize: 12.5, lineHeight: 19, fontFamily: f(500), color: t.muted }}>Show this QR code at the counter — the pharmacist scans it and your answers load into their system.</Text>
                      <View style={{ alignItems: 'center', gap: 8 }}>
                        <View style={{ padding: 11, borderRadius: 13, backgroundColor: '#fff' }}>
                          <QRCode value={JSON.stringify(this.qrPayload())} size={150} ecl="M" />
                        </View>
                        <Text style={{ fontSize: 10.5, fontFamily: f(600), color: t.muted }}>Consult ID {r.id}</Text>
                      </View>
                      <View style={{ gap: 7 }}>
                        <Text style={{ fontSize: 10.5, fontFamily: f(800), textTransform: 'uppercase', letterSpacing: 0.8, color: t.muted }}>Your summary</Text>
                        {summaryTable(summaryRows, t.muted, t.rowBorder)}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <GradButton onPress={this.downloadRecord} style={[{ flex: 1, borderRadius: 11 }, tealShadow]} textStyle={{ fontSize: 12.5, fontFamily: f(700), color: '#fff' }}>Download record</GradButton>
                        <TouchableOpacity onPress={this.restart} activeOpacity={0.8} style={{ paddingVertical: 11, paddingHorizontal: 16, borderRadius: 11, borderWidth: 1, borderColor: t.chipBorder, backgroundColor: t.chipBg, justifyContent: 'center' }}>
                          <Text style={{ fontSize: 12.5, fontFamily: f(700), color: t.chipColor }}>Restart</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {s.outcome === 'gp' && (
                    <LinearGradient colors={t.gpPanel} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[{ borderRadius: 18, padding: 20, gap: 14, marginTop: 6, borderWidth: 1, borderColor: t.gpBorder }, panelShadow]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <Grad colors={GP_GRAD} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 15, fontFamily: f(700) }}>!</Text></Grad>
                        <Text style={{ fontSize: 16, fontFamily: f(800), color: t.gpAccent }}>Please see a GP</Text>
                      </View>
                      <Text style={{ fontSize: 12.5, lineHeight: 19, fontFamily: f(500), color: t.gpMuted }}><Text style={{ fontFamily: f(800) }}>Why:</Text> {this.gpReason || ''} This is outside what a pharmacist can prescribe. If symptoms are severe or worsening quickly, call 000.</Text>
                      <View style={{ gap: 7 }}>
                        <Text style={{ fontSize: 10.5, fontFamily: f(800), textTransform: 'uppercase', letterSpacing: 0.8, color: t.gpMuted }}>Summary — take this to your GP</Text>
                        {summaryTable(summaryRows, t.gpMuted, t.gpRowBorder)}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <GradButton onPress={this.downloadRecord} colors={GP_GRAD} style={{ flex: 1, borderRadius: 11 }} textStyle={{ fontSize: 12.5, fontFamily: f(700), color: '#fff' }}>Download for GP</GradButton>
                        <TouchableOpacity onPress={this.restart} activeOpacity={0.8} style={{ paddingVertical: 11, paddingHorizontal: 16, borderRadius: 11, borderWidth: 1, borderColor: t.gpChipBorder, backgroundColor: t.gpChipBg, justifyContent: 'center' }}>
                          <Text style={{ fontSize: 12.5, fontFamily: f(700), color: t.gpAccent }}>Restart</Text>
                        </TouchableOpacity>
                      </View>
                    </LinearGradient>
                  )}
                </ScrollView>

                {showBar && (
                  <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingLeft: 16, padding: 5, backgroundColor: t.panel, borderWidth: 1, borderColor: t.panelBorder }}>
                      <TextInput ref={this.barRef} onChangeText={this.onBarInput} onSubmitEditing={this.handleSend} returnKeyType="send" placeholder={barPlaceholder} placeholderTextColor={t.sub} style={{ flex: 1, fontSize: 14, fontFamily: f(500), paddingVertical: 9, color: t.text }} />
                      <TouchableOpacity onPress={this.handleSend} activeOpacity={0.85}>
                        <Grad style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 15 }}>↑</Text></Grad>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
        <StatusBar style={s.dark ? 'light' : 'dark'} />
      </View>
    );
  }
}
