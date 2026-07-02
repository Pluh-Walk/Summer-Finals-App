import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NotificationsProvider } from '../context/NotificationsContext';
import { colors } from '../constants/theme';
import ChatbotModal from '../components/ChatbotModal';

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700', color: colors.text },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="verify-email" options={{ title: 'Verify Email', headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ title: 'Reset Password', headerBackTitle: 'Back' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="bill/create" options={{ title: 'Create Bill', headerBackTitle: 'Back' }} />
          <Stack.Screen name="bill/[id]" options={{ title: 'Bill Details', headerBackTitle: 'Back' }} />
          <Stack.Screen name="bill/edit/[id]" options={{ title: 'Edit Bill', headerBackTitle: 'Back' }} />
          <Stack.Screen name="bill/add-expense/[id]" options={{ title: 'Add Expense', headerBackTitle: 'Back' }} />
        </Stack>
        <AuthenticatedChatbot />
      </NotificationsProvider>
    </AuthProvider>
  );
}

function AuthenticatedChatbot() {
  const { user } = useAuth();
  if (!user) return null;
  return <ChatbotModal />;
}
