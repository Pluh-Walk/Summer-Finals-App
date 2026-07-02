import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../constants/theme';

export default function Archive() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchArchivedBills();
    }, [user])
  );

  async function fetchArchivedBills() {
    if (!user) return;
    setLoading(true);

    const { data: hostBills } = await supabase
      .from('bills')
      .select(`
        *,
        host:profiles!bills_host_id_fkey(id, first_name, last_name, username),
        bill_participants(id, status, user:profiles(id, first_name, last_name, username))
      `)
      .eq('host_id', user.id)
      .eq('status', 'archived')
      .order('created_at', { ascending: false });

    const { data: participantBills } = await supabase
      .from('bill_participants')
      .select(`
        bill:bills(
          *,
          host:profiles!bills_host_id_fkey(id, first_name, last_name, username),
          bill_participants(id, status, user:profiles(id, first_name, last_name, username))
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'accepted');

    const participantList = (participantBills || [])
      .map((p) => p.bill)
      .filter((b) => b && b.status === 'archived');

    const combined = [...(hostBills || []), ...participantList];
    const unique = combined.reduce((acc, bill) => {
      if (!acc.find((b) => b.id === bill.id)) acc.push(bill);
      return acc;
    }, []);

    setBills(unique);
    setLoading(false);
  }

  function renderBillCard({ item }) {
    const isHost = item.host_id === user.id;
    const acceptedCount = (item.bill_participants || []).filter((p) => p.status === 'accepted').length;
    const archivedDate = new Date(item.updated_at || item.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    return (
      <TouchableOpacity
        style={styles.billCard}
        onPress={() => router.push(`/bill/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={styles.archivedBadge}>
          <Ionicons name="archive" size={12} color={colors.textSecondary} />
          <Text style={styles.archivedText}>Archived · {archivedDate}</Text>
        </View>
        <View style={styles.billCardHeader}>
          <View style={styles.billIconBox}>
            <Ionicons name="archive" size={22} color={colors.standard} />
          </View>
          <View style={styles.billInfo}>
            <Text style={styles.billName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.billMetaRow}>
              {isHost
                ? <><Ionicons name="star" size={11} color={colors.premium} /><Text style={styles.billMeta}> You host</Text></>
                : <><Ionicons name="person-outline" size={11} color={colors.textSecondary} /><Text style={styles.billMeta}> {item.host?.first_name || 'Unknown'}</Text></>
              }
              <Text style={styles.billMeta}>  ·  {acceptedCount + 1} people</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={bills}
        keyExtractor={(item) => item.id}
        renderItem={renderBillCard}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchArchivedBills().then(() => setRefreshing(false)); }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={() => (
          <View style={styles.listHeader}>
            <Text style={styles.headerTitle}>Archived Bills</Text>
            <Text style={styles.headerSubtitle}>Bills with settled payments</Text>
          </View>
        )}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <View style={styles.emptyIconBox}>
              <Ionicons name="archive-outline" size={44} color={colors.textLight} />
            </View>
            <Text style={styles.emptyTitle}>No archived bills</Text>
            <Text style={styles.emptySubtitle}>
              Bills appear here after being archived by the host when all payments are settled.
            </Text>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  listContent: { paddingBottom: spacing.xl },
  listHeader: { padding: spacing.md, paddingBottom: spacing.sm },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  billCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    ...shadow.sm,
    opacity: 0.85,
  },
  archivedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: spacing.sm,
  },
  archivedText: { fontSize: fontSize.xs, color: colors.textSecondary },
  billCardHeader: { flexDirection: 'row', alignItems: 'center' },
  billIconBox: {
    width: 44, height: 44, borderRadius: borderRadius.md,
    backgroundColor: colors.standardLight, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  billInfo: { flex: 1 },
  billName: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  billMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  billMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', padding: spacing.xxl },
  emptyIconBox: {
    width: 80, height: 80, borderRadius: borderRadius.xl,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.border,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
