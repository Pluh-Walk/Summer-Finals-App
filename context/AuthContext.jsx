import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) console.warn('fetchProfile error:', error.message);
    setProfile(data ?? null);
    setLoading(false);
  }

  async function signUp({ lastName, firstName, nickname, email, username, password }) {
    // Check nickname uniqueness
    const { data: nicknameCheck } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname.trim())
      .maybeSingle();
    if (nicknameCheck) return { error: { message: 'Nickname is already taken.' } };

    // Check username uniqueness
    const { data: usernameCheck } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle();
    if (usernameCheck) return { error: { message: 'Username is already taken.' } };

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          last_name: lastName.trim(),
          first_name: firstName.trim(),
          nickname: nickname.trim(),
          username: username.trim(),
        },
      },
    });
    return { data, error };
  }

  async function signIn({ username, password }) {
    // Look up email by username
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', username.trim())
      .maybeSingle();

    if (profileError || !profileData) {
      return { error: { message: 'Username not found.' } };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: profileData.email,
      password,
    });
    return { data, error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function verifyOtp({ email, token }) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'signup',
    });
    return { data, error };
  }

  async function resendVerification(email) {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    });
    return { error };
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'billsplitts://reset-password',
    });
    return { error };
  }

  async function sendPasswordResetOtp(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    return { error };
  }

  async function verifyPasswordResetOtp({ email, token }) {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    });
    return { data, error };
  }

  async function setNewPasswordAfterOtp(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) await supabase.auth.signOut();
    return { error };
  }

  async function updateProfile(updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();
    if (!error) setProfile(data);
    return { data, error };
  }

  async function upgradeToPremuim() {
    return updateProfile({ account_type: 'premium' });
  }

  async function changePassword({ oldPassword, newPassword }) {
    // Verify old password by re-authenticating
    const email = profile?.email || user?.email;
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: oldPassword,
    });
    if (signInError) return { error: { message: 'Current password is incorrect.' } };

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signUp, signIn, signOut, resetPassword, sendPasswordResetOtp, verifyPasswordResetOtp, setNewPasswordAfterOtp, updateProfile, upgradeToPremuim, changePassword, fetchProfile, verifyOtp, resendVerification }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
