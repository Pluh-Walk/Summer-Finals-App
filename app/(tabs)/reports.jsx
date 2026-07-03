import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, fontSize, borderRadius, shadow } from '../../constants/theme';

// ── Date helpers ────────────────────────────────────────────────────────────

function getWeekRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Build 7-day bar data (last 7 days including today)
function buildWeekBars(expenses) {
  const now = new Date();
  const bars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    return { label: DAY_LABELS[d.getDay()], date: d, total: 0 };
  });

  expenses.forEach(exp => {
    const d = new Date(exp.created_at);
    const idx = bars.findIndex(b =>
      b.date.getFullYear() === d.getFullYear() &&
      b.date.getMonth() === d.getMonth() &&
      b.date.getDate() === d.getDate()
    );
    if (idx !== -1) bars[idx].total += Number(exp.amount);
  });

  return bars;
}

// Build weekly-grouped bar data for the current month
function buildMonthBars(expenses) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Group into up to 5 weeks
  const weeks = [];
  let weekStart = 1;
  let wNum = 1;
  while (weekStart <= daysInMonth) {
    const weekEnd = Math.min(weekStart + 6, daysInMonth);
    weeks.push({ label: `W${wNum}`, startDay: weekStart, endDay: weekEnd, total: 0 });
    weekStart += 7;
    wNum++;
  }

  expenses.forEach(exp => {
    const d = new Date(exp.created_at);
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const day = d.getDate();
    const w = weeks.find(w => day >= w.startDay && day <= w.endDay);
    if (w) w.total += Number(exp.amount);
  });

  return weeks;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color = colors.primary, gradient }) {
  const inner = (
    <>
      <View style={[statStyles.iconBox, { backgroundColor: gradient ? 'rgba(255,255,255,0.25)' : color + '18' }]}>
        <Ionicons name={icon} size={20} color={gradient ? '#fff' : color} />
      </View>
      <Text style={[statStyles.value, gradient && { color: '#fff' }]}>{value}</Text>
      <Text style={[statStyles.label, gradient && { color: 'rgba(255,255,255,0.85)' }]}>{label}</Text>
    </>
  );

  if (gradient) {
    return (
      <LinearGradient colors={gradient} style={statStyles.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {inner}
      </LinearGradient>
    );
  }

  return <View style={statStyles.card}>{inner}</View>;
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadow.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
});

function BarChart({ bars, currency = '₱' }) {
  const maxVal = Math.max(...bars.map(b => b.total), 1);

  return (
    <View style={chartStyles.container}>
      {bars.map((bar, i) => {
        const heightPct = bar.total > 0 ? Math.max(bar.total / maxVal, 0.05) : 0;
        const barHeight = heightPct * 100;
        const isActive = bar.total > 0;

        return (
          <View key={i} style={chartStyles.barGroup}>
            {bar.total > 0 && (
              <Text style={chartStyles.barValue}>
                {bar.total >= 1000 ? `${(bar.total / 1000).toFixed(1)}k` : bar.total.toFixed(0)}
              </Text>
            )}
            <View style={chartStyles.barTrack}>
              {isActive ? (
                <LinearGradient
                  colors={['#6366F1', '#06B6D4']}
                  style={[chartStyles.bar, { height: barHeight }]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                />
              ) : (
                <View style={[chartStyles.bar, chartStyles.barEmpty, { height: 4 }]} />
              )}
            </View>
            <Text style={chartStyles.barLabel}>{bar.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 130,
    gap: 4,
    paddingHorizontal: spacing.xs,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  barValue: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: '600',
  },
  barTrack: {
    width: '100%',
    height: 100,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: borderRadius.sm,
    minHeight: 4,
  },
  barEmpty: {
    backgroundColor: colors.border,
  },
  barLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});

function BillRow({ bill, currency = '₱' }) {
  return (
    <View style={billRowStyles.row}>
      <View style={billRowStyles.iconBox}>
        <Ionicons name="receipt-outline" size={16} color={colors.primary} />
      </View>
      <Text style={billRowStyles.name} numberOfLines={1}>{bill.name}</Text>
      <Text style={billRowStyles.amount}>{currency}{Number(bill.total).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
    </View>
  );
}

const billRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '500',
  },
  amount: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
  },
});

// ── Main screen ──────────────────────────────────────────────────────────────

const PERIODS = ['Week', 'Month'];
const CURRENCY = '₱';

export default function Reports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('Month');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [paidExpenses, setPaidExpenses] = useState([]);    // expenses the user paid for
  const [myShares, setMyShares] = useState([]);            // expense_splits belonging to user
  const [billsCreated, setBillsCreated] = useState(0);
  const [billsJoined, setBillsJoined] = useState(0);
  const [topBills, setTopBills] = useState([]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user, period])
  );

  async function loadData(isRefresh = false) {
    if (!user) return;
    isRefresh ? setRefreshing(true) : setLoading(true);

    const { start, end } = period === 'Week' ? getWeekRange() : getMonthRange();

    await Promise.all([
      fetchPaidExpenses(start, end),
      fetchMyShares(start, end),
      fetchBillCounts(start, end),
      fetchTopBills(start, end),
    ]);

    isRefresh ? setRefreshing(false) : setLoading(false);
  }

  async function fetchPaidExpenses(start, end) {
    const { data } = await supabase
      .from('expenses')
      .select('id, name, amount, created_at, bill_id')
      .eq('paid_by', user.id)
      .gte('created_at', start.toISOString ? start.toISOString() : start)
      .lte('created_at', end.toISOString ? end.toISOString() : end)
      .order('created_at', { ascending: true });

    setPaidExpenses(data || []);
  }

  async function fetchMyShares(start, end) {
    const { data } = await supabase
      .from('expense_splits')
      .select('share_amount, expense:expenses(id, amount, paid_by, created_at, bill_id)')
      .eq('user_id', user.id)
      .gte('expense.created_at', start.toISOString ? start.toISOString() : start)
      .lte('expense.created_at', end.toISOString ? end.toISOString() : end);

    // Filter out nulls (Supabase may return nulls if the join doesn't match the date range)
    setMyShares((data || []).filter(s => s.expense !== null));
  }

  async function fetchBillCounts(start, end) {
    const startStr = start.toISOString ? start.toISOString() : start;
    const endStr = end.toISOString ? end.toISOString() : end;

    const [{ count: created }, { count: joined }] = await Promise.all([
      supabase
        .from('bills')
        .select('id', { count: 'exact', head: true })
        .eq('host_id', user.id)
        .gte('created_at', startStr)
        .lte('created_at', endStr),
      supabase
        .from('bill_participants')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'accepted')
        .gte('created_at', startStr)
        .lte('created_at', endStr),
    ]);

    setBillsCreated(created || 0);
    setBillsJoined(joined || 0);
  }

  async function fetchTopBills(start, end) {
    const startStr = start.toISOString ? start.toISOString() : start;
    const endStr = end.toISOString ? end.toISOString() : end;

    // Get all expenses user paid in the period, then aggregate by bill
    const { data } = await supabase
      .from('expenses')
      .select('bill_id, amount, bill:bills(name)')
      .eq('paid_by', user.id)
      .gte('created_at', startStr)
      .lte('created_at', endStr);

    if (!data) { setTopBills([]); return; }

    const billMap = {};
    data.forEach(exp => {
      const bid = exp.bill_id;
      if (!billMap[bid]) billMap[bid] = { id: bid, name: exp.bill?.name || 'Unknown', total: 0 };
      billMap[bid].total += Number(exp.amount);
    });

    const sorted = Object.values(billMap).sort((a, b) => b.total - a.total).slice(0, 5);
    setTopBills(sorted);
  }

  // ── Derived stats ────────────────────────────────────────────────────────

  const totalPaid = paidExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // What user owes to others (share in expenses they didn't pay for)
  const totalOwed = myShares
    .filter(s => s.expense?.paid_by !== user.id)
    .reduce((s, e) => s + Number(e.share_amount), 0);

  // What others owe user (total paid minus user's own share in those expenses)
  const myOwnShare = myShares
    .filter(s => s.expense?.paid_by === user.id)
    .reduce((s, e) => s + Number(e.share_amount), 0);
  const totalOwedToMe = Math.max(0, totalPaid - myOwnShare);

  const totalExpenseCount = paidExpenses.length;
  const totalBills = billsCreated + billsJoined;

  const bars = period === 'Week' ? buildWeekBars(paidExpenses) : buildMonthBars(paidExpenses);

  const periodLabel = period === 'Week' ? 'Last 7 Days' : 'This Month';

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadData(true)}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header */}
      <LinearGradient
        colors={['#6366F1', '#06B6D4']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>Reports & Analytics</Text>
        <Text style={styles.headerSubtitle}>{periodLabel}</Text>

        {/* Period toggle */}
        <View style={styles.periodRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* Summary stat cards */}
      <View style={styles.section}>
        <View style={styles.statsRow}>
          <StatCard
            icon="cash-outline"
            label="Total Paid"
            value={`${CURRENCY}${totalPaid.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            gradient={['#6366F1', '#818CF8']}
          />
          <StatCard
            icon="receipt-outline"
            label="Bills Active"
            value={totalBills.toString()}
            color={colors.secondary}
          />
          <StatCard
            icon="list-outline"
            label="Expenses"
            value={totalExpenseCount.toString()}
            color={colors.warning}
          />
        </View>
      </View>

      {/* Balance summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Balance Summary</Text>
        <View style={styles.balanceRow}>
          <View style={[styles.balanceCard, { backgroundColor: colors.successLight }]}>
            <Ionicons name="arrow-down-circle" size={22} color={colors.success} />
            <Text style={styles.balanceLabel}>Others Owe Me</Text>
            <Text style={[styles.balanceAmount, { color: colors.success }]}>
              {CURRENCY}{totalOwedToMe.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={[styles.balanceCard, { backgroundColor: colors.errorLight }]}>
            <Ionicons name="arrow-up-circle" size={22} color={colors.error} />
            <Text style={styles.balanceLabel}>I Owe Others</Text>
            <Text style={[styles.balanceAmount, { color: colors.error }]}>
              {CURRENCY}{totalOwed.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>
      </View>

      {/* Bar chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spending Over Time</Text>
        <View style={styles.card}>
          {paidExpenses.length === 0 ? (
            <View style={styles.emptyChart}>
              <Ionicons name="bar-chart-outline" size={40} color={colors.border} />
              <Text style={styles.emptyText}>No expenses recorded {period === 'Week' ? 'this week' : 'this month'}</Text>
            </View>
          ) : (
            <BarChart bars={bars} currency={CURRENCY} />
          )}
        </View>
      </View>

      {/* Top Bills */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Bills by Expense</Text>
        <View style={styles.card}>
          {topBills.length === 0 ? (
            <View style={styles.emptyList}>
              <Ionicons name="document-text-outline" size={36} color={colors.border} />
              <Text style={styles.emptyText}>No bills recorded {period === 'Week' ? 'this week' : 'this month'}</Text>
            </View>
          ) : (
            topBills.map((bill, i) => (
              <BillRow key={bill.id} bill={bill} currency={CURRENCY} />
            ))
          )}
        </View>
      </View>

      {/* Bills created vs joined */}
      <View style={[styles.section, { marginBottom: spacing.xl }]}>
        <Text style={styles.sectionTitle}>Bill Participation</Text>
        <View style={styles.participationRow}>
          <View style={styles.participationCard}>
            <LinearGradient
              colors={['#6366F1', '#818CF8']}
              style={styles.participationIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
            </LinearGradient>
            <Text style={styles.participationCount}>{billsCreated}</Text>
            <Text style={styles.participationLabel}>Bills Created</Text>
          </View>
          <View style={styles.participationDivider} />
          <View style={styles.participationCard}>
            <LinearGradient
              colors={['#06B6D4', '#0EA5E9']}
              style={styles.participationIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="people-outline" size={20} color="#fff" />
            </LinearGradient>
            <Text style={styles.participationCount}>{billsJoined}</Text>
            <Text style={styles.participationLabel}>Bills Joined</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // Header
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: spacing.md,
  },
  periodRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.full,
    padding: 3,
    alignSelf: 'flex-start',
  },
  periodBtn: {
    paddingHorizontal: spacing.md + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  periodBtnActive: {
    backgroundColor: '#fff',
  },
  periodBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  periodBtnTextActive: {
    color: colors.primary,
  },

  // Sections
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm + 4,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  // Balance
  balanceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  balanceCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  balanceAmount: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },

  // Card wrapper
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadow.md,
  },

  // Empty states
  emptyChart: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyList: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    textAlign: 'center',
  },

  // Participation
  participationRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    padding: spacing.lg,
    alignItems: 'center',
    ...shadow.md,
  },
  participationCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  participationIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  participationCount: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  participationLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  participationDivider: {
    width: 1,
    height: 60,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
});
