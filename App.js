import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import PharmacyScreen from './src/PharmacyScreen';

export default function App() {
  const [loaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#dbe4e3', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#0d6f66" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PharmacyScreen />
    </SafeAreaProvider>
  );
}
