import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { colors, spacing, fontSize, borderRadius, shadow } from '../constants/theme';
import { usePathname } from 'expo-router';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are BillBot, a friendly AI assistant built into BillSplitts — a bill-splitting app. 
Your job is to help users:
- Understand how to split bills fairly (equal or custom splits)
- Calculate how much each person owes or is owed
- Explain debt settlement (who should pay whom and how much)
- Answer questions about using the app (creating bills, adding expenses, inviting participants, etc.)
- Give tips on managing shared expenses among friends, roommates, or travel groups

Keep responses concise, practical, and friendly. Use simple math explanations when needed. 
If users ask anything unrelated to bill splitting or personal finance, politely redirect them.`;

function ChatbotModal() {
  const pathname = usePathname();
  const isProfileTab = pathname === '/profile';
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: '0',
      role: 'assistant',
      text: "Hi! I'm BillBot 👋 Ask me anything about splitting bills, calculating debts, or using BillSplitts.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const historyRef = useRef([]); // [{role:'user'|'assistant', content:'...'}]
  const flatListRef = useRef(null);

  const callGroq = useCallback(async (userText) => {
    historyRef.current.push({ role: 'user', content: userText });
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...historyRef.current,
        ],
      }),
    });
    if (!res.ok) {
      // Roll back the user message from history on failure
      historyRef.current.pop();
      const errBody = await res.json().catch(() => ({}));
      throw Object.assign(new Error(res.status.toString()), { status: res.status, body: errBody });
    }
    const data = await res.json();
    const assistantText = data.choices?.[0]?.message?.content ?? '(no response)';
    historyRef.current.push({ role: 'assistant', content: assistantText });
    return assistantText;
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage = { id: Date.now().toString(), role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

    try {
      let responseText;
      const maxRetries = 3;
      const retryDelays = [10000, 20000, 30000]; // 10s, 20s, 30s
      let lastErr;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          responseText = await callGroq(text);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (err?.status === 429 && attempt < maxRetries) {
            const waitMs = retryDelays[attempt];
            const waitSec = waitMs / 1000;
            setMessages((prev) => {
              const filtered = prev.filter((m) => !m.text.startsWith('⏳'));
              return [
                ...filtered,
                { id: (Date.now() + 1).toString(), role: 'assistant', text: `⏳ Rate limit hit — retrying in ${waitSec} seconds… (attempt ${attempt + 1}/${maxRetries})` },
              ];
            });
            await sleep(waitMs);
            setMessages((prev) => prev.filter((m) => !m.text.startsWith('⏳')));
          } else {
            throw err;
          }
        }
      }
      if (lastErr) throw lastErr;
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 2).toString(), role: 'assistant', text: responseText },
      ]);
    } catch (err) {
      const status = err?.status;
      let displayError = "Sorry, I couldn't connect right now. Please check your internet connection and try again.";
      if (status === 400) displayError = 'Bad request — check your API key in .env (EXPO_PUBLIC_GROQ_API_KEY).';
      else if (status === 401 || status === 403) displayError = 'Authentication failed. Please check your Groq API key in .env.';
      else if (status === 404) displayError = 'Model not found. Please check the Groq model name.';
      else if (status === 429) displayError = 'Rate limit reached. Please wait a moment before sending another message.';
      else if (err?.message) displayError = `Error: ${err.message}`;
      setMessages((prev) => prev.filter((m) => !m.text.startsWith('⏳')));
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 2).toString(), role: 'assistant', text: displayError },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, callGroq]);

  const renderMessage = useCallback(({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
          {item.text}
        </Text>
      </View>
    );
  }, []);

  return (
    <>
      {/* Fixed Floating Button — above Bills tab, hidden on Profile */}
      {!isProfileTab && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.fabIcon}>🤖</Text>
        </TouchableOpacity>
      )}

      {/* Chat Modal */}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerIcon}>🤖</Text>
                <View>
                  <Text style={styles.headerTitle}>BillBot</Text>
                  <Text style={styles.headerSubtitle}>AI Bill Assistant</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messageList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />

            {/* Typing indicator */}
            {loading && (
              <View style={styles.typingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.typingText}>BillBot is thinking…</Text>
              </View>
            )}

            {/* Input */}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask about splitting bills…"
                placeholderTextColor={colors.textLight}
                multiline
                maxLength={500}
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!input.trim() || loading) && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || loading}
                activeOpacity={0.8}
              >
                <Text style={styles.sendIcon}>➤</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Floating action button
  fab: {
    position: 'absolute',
    bottom: 94,        // sits just above the 62px tab bar
    left: 16,          // aligned above the Bills (first) tab
    width: 60,
    height: 60,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    ...shadow.md,
  },
  fabIcon: {
    fontSize: 22,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    height: '80%',
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIcon: {
    fontSize: 28,
    marginRight: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Messages
  messageList: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    marginVertical: 3,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: colors.text,
  },

  // Typing
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  typingText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
  sendIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default ChatbotModal;
